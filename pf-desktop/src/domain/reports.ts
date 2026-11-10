import type { Bill, Income, Transaction } from './models'
import { billIsPaidFor } from './models'

export interface SummaryItem {
  id: string
  name: string
  amount: number
  date: Date
  isPaid: boolean
  billId?: string | null
  incomeId?: string | null
  category?: string
}

export interface MonthSummary {
  income: number
  bills: number
  net: number
  incomeDetails: SummaryItem[]
  billDetails: SummaryItem[]
}

export function calculateMonthSummary(params: { month: Date; bills: Bill[]; incomes: Income[]; transactions?: Transaction[] }): MonthSummary {
  const month = params.month
  const bills = params.bills
  const incomes = params.incomes
  const transactions = params.transactions ?? []

  let incomeTotal = 0
  let billTotal = 0
  const incomeDetails: SummaryItem[] = []
  const billDetails: SummaryItem[] = []

  const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  for (const inc of incomes) {
    for (const p of inc.receipts ?? []) {
      if (sameMonth(p.date, month)) {
        incomeTotal += p.amount.value
        incomeDetails.push({
          id: crypto.randomUUID(),
          name: inc.name,
          amount: p.amount.value,
          date: p.date,
          isPaid: true,
          incomeId: inc.id,
        })
      }
    }
    if (sameMonth(inc.nextPayDate, month)) {
      const already = (inc.receipts ?? []).some((p) => sameDay(p.date, inc.nextPayDate))
      if (!already) {
        incomeTotal += inc.amount.value
        incomeDetails.push({
          id: crypto.randomUUID(),
          name: inc.name,
          amount: inc.amount.value,
          date: inc.nextPayDate,
          isPaid: false,
          incomeId: inc.id,
        })
      }
    }
  }

  for (const bill of bills) {
    for (const p of bill.payments ?? []) {
      if (sameMonth(p.date, month)) {
        billTotal += p.amount.value
        billDetails.push({
          id: crypto.randomUUID(),
          name: bill.name,
          amount: p.amount.value,
          date: p.date,
          isPaid: true,
          billId: bill.id,
          category: bill.customCategoryName?.trim() || bill.category,
        })
      }
    }
    if (sameMonth(bill.nextDueDate, month) && !billIsPaidFor(bill, bill.nextDueDate)) {
      billTotal += bill.amount.value
      billDetails.push({
        id: crypto.randomUUID(),
        name: bill.name,
        amount: bill.amount.value,
        date: bill.nextDueDate,
        isPaid: false,
        billId: bill.id,
        category: bill.customCategoryName?.trim() || bill.category,
      })
    }
  }

  for (const t of transactions) {
    if (!sameMonth(t.date, month)) continue
    
    if (t.kind === 'income' && !t.relatedIncomeId) {
      incomeTotal += t.amount.value
      incomeDetails.push({
        id: t.id,
        name: t.payee?.trim() || t.customCategoryName?.trim() || 'Imported Income',
        amount: t.amount.value,
        date: t.date,
        isPaid: true,
        category: t.customCategoryName?.trim() || t.category || 'income',
      })
    } else if (t.kind === 'expense' && !t.relatedBillId) {
      billTotal += t.amount.value
      billDetails.push({
        id: t.id,
        name: t.payee?.trim() || t.customCategoryName?.trim() || t.category || 'Imported Expense',
        amount: t.amount.value,
        date: t.date,
        isPaid: true,
        category: t.customCategoryName?.trim() || t.category || 'expense',
      })
    }
  }

  incomeDetails.sort((a, b) => a.date.getTime() - b.date.getTime())
  billDetails.sort((a, b) => a.date.getTime() - b.date.getTime())

  return {
    income: incomeTotal,
    bills: billTotal,
    net: incomeTotal - billTotal,
    incomeDetails,
    billDetails,
  }
}

export interface YearMonthSummary {
  monthIndex: number
  arrayIndex: number
  year: number
  monthName: string
  income: number
  bills: number
  net: number
}

export interface YearSummary {
  startYear: number
  startMonth: number
  income: number
  bills: number
  net: number
  months: YearMonthSummary[]
  incomeDetails: SummaryItem[]
  billDetails: SummaryItem[]
}

export function calculateYearSummary(params: {
  year: number
  startMonth?: number
  endYear?: number
  endMonth?: number
  bills: Bill[]
  incomes: Income[]
  transactions?: Transaction[]
}): YearSummary {
  const { year, startMonth = 0, endYear, endMonth, bills, incomes, transactions = [] } = params

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const months: YearMonthSummary[] = []

  const allIncomeDetails: SummaryItem[] = []
  const allBillDetails: SummaryItem[] = []

  const start = new Date(year, startMonth, 1)
  const end = typeof endYear === 'number' && typeof endMonth === 'number' ? new Date(endYear, endMonth, 1) : null
  const monthCountRaw = end ? (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1 : 12
  const monthCount = Math.min(Math.max(1, monthCountRaw), 240)
  const showYearSuffix = end ? end.getFullYear() !== start.getFullYear() : startMonth !== 0

  for (let i = 0; i < monthCount; i++) {
    const mDate = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const mYear = mDate.getFullYear()
    const mMonth = mDate.getMonth()
    
    const mName = showYearSuffix ? `${monthNames[mMonth]} '${mYear.toString().slice(2)}` : monthNames[mMonth]!
    
    const mSum = calculateMonthSummary({ month: mDate, bills, incomes, transactions })
    
    months.push({
      monthIndex: mMonth,
      arrayIndex: i,
      year: mYear,
      monthName: mName,
      income: mSum.income,
      bills: mSum.bills,
      net: mSum.net,
    })

    for (const d of mSum.incomeDetails) {
      allIncomeDetails.push(d)
    }
    for (const d of mSum.billDetails) {
      allBillDetails.push(d)
    }
  }

  const totalIncome = months.reduce((acc, m) => acc + m.income, 0)
  const totalBills = months.reduce((acc, m) => acc + m.bills, 0)

  return {
    startYear: start.getFullYear(),
    startMonth: start.getMonth(),
    income: totalIncome,
    bills: totalBills,
    net: totalIncome - totalBills,
    months,
    incomeDetails: allIncomeDetails,
    billDetails: allBillDetails,
  }
}
