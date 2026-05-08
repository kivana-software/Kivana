export type UUID = string

export type CurrencyCode = string

export type ISO8601String = string

export type Recurrence = 'once' | 'weekly' | 'monthly' | 'yearly'

export type BillCategory = 'housing' | 'utilities' | 'subscriptions' | 'insurance' | 'taxes' | 'transport' | 'other'

export type AccountKind = 'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'other'

export type TransactionKind = 'expense' | 'income' | 'transfer'

export interface DecimalAmount {
  currencyCode: CurrencyCode
  value: number
}

export interface Payment {
  id: UUID
  date: Date
  amount: DecimalAmount
}

export interface Bill {
  id: UUID
  name: string
  amount: DecimalAmount
  category: BillCategory
  customCategoryName?: string | null
  recurrence: Recurrence
  nextDueDate: Date
  notes?: string | null
  payments: Payment[]
  paidAutomatically: boolean
  hiddenUntilEdited: boolean
  snoozeUntil?: Date | null
  snoozeCount: number
}

export interface Account {
  id: UUID
  name: string
  kind: AccountKind
  currencyCode: CurrencyCode
  openingBalance: number
  institution?: string | null
  notes?: string | null
  archived: boolean
}

export interface Transaction {
  id: UUID
  kind: TransactionKind
  date: Date
  amount: DecimalAmount
  accountId?: UUID | null
  toAccountId?: UUID | null
  category?: BillCategory | null
  customCategoryName?: string | null
  payee?: string | null
  notes?: string | null
  tags: string[]
  relatedBillId?: UUID | null
}

export function iso8601NoMillis(date: Date): ISO8601String {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function parseISO8601(input: string): Date {
  const d = new Date(input)
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`Invalid ISO8601 date: ${input}`)
  }
  return d
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function advanceRecurrence(recurrence: Recurrence, from: Date, count = 1): Date {
  if (recurrence === 'once') return new Date(from)
  const d = new Date(from)
  switch (recurrence) {
    case 'weekly':
      d.setDate(d.getDate() + 7 * count)
      return d
    case 'monthly':
      d.setMonth(d.getMonth() + count)
      return d
    case 'yearly':
      d.setFullYear(d.getFullYear() + count)
      return d
  }
}

export function billIsPaidFor(bill: Bill, dueDate: Date): boolean {
  if (bill.recurrence === 'once') {
    return bill.payments.length > 0
  }
  const target = startOfDay(dueDate)
  const prevDue = startOfDay(advanceRecurrence(bill.recurrence, dueDate, -1))
  return bill.payments.some((p) => {
    const pd = startOfDay(p.date)
    return pd.getTime() > prevDue.getTime() && pd.getTime() <= target.getTime()
  })
}

export function billIsOverdue(bill: Bill, now: Date = new Date()): boolean {
  return now.getTime() > bill.nextDueDate.getTime() && !billIsPaidFor(bill, bill.nextDueDate)
}

export function billIsSnoozedActive(bill: Bill, now: Date = new Date()): boolean {
  if (!bill.snoozeUntil) return false
  return bill.snoozeUntil.getTime() > now.getTime()
}

export function billMarkPaid(bill: Bill, on: Date = new Date(), amount?: DecimalAmount): Bill {
  if (bill.recurrence === 'once' && bill.payments.length > 0) return bill
  const payment: Payment = {
    id: crypto.randomUUID(),
    date: on,
    amount: amount ?? bill.amount,
  }
  return {
    ...bill,
    payments: [...bill.payments, payment],
    nextDueDate: advanceRecurrence(bill.recurrence, bill.nextDueDate),
  }
}

export function billSetSnooze(bill: Bill, until: Date): Bill {
  return {
    ...bill,
    snoozeUntil: until,
    snoozeCount: bill.snoozeCount + 1,
  }
}

export function billClearSnooze(bill: Bill): Bill {
  return {
    ...bill,
    snoozeUntil: null,
  }
}

export function processAutoPayments(bills: Bill[], upTo: Date = new Date()): Bill[] {
  const startOf = (d: Date) => startOfDay(d).getTime()
  const upToDay = startOf(upTo)
  let changed = false

  const next = bills.map((bill) => {
    if (!bill.paidAutomatically) return bill
    let b = bill
    const dueDay = startOf(b.nextDueDate)
    if (dueDay > upToDay) return b
    if (billIsPaidFor(b, b.nextDueDate)) return b

    if (b.recurrence === 'once') {
      const updated = billMarkPaid(b, b.nextDueDate)
      if (updated !== b) changed = true
      return updated
    }

    let guardrail = 0
    while (startOf(b.nextDueDate) <= upToDay && !billIsPaidFor(b, b.nextDueDate)) {
      const before = b.nextDueDate.getTime()
      b = billMarkPaid(b, b.nextDueDate)
      if (b.nextDueDate.getTime() === before) break
      guardrail += 1
      if (guardrail > 400) break
      changed = true
    }
    return b
  })

  return changed ? next : bills
}
