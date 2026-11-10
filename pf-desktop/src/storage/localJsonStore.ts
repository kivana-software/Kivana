import {
  type Account,
  type Bill,
  type BillAttachment,
  type Invoice,
  type InvoiceAttachment,
  type Debt,
  type Goal,
  type Income,
  type Payment,
  type Reminder,
  type Transaction,
  type UUID,
  iso8601NoMillis,
  parseISO8601,
} from '../domain/models'
import type { AppSettings } from '../domain/settings'
import { normalizePeopleSettings } from '../domain/people'

export const DATA_FOLDER_NAME = 'Kivana'

export const DATA_FILES = {
  bills: 'bills.json',
  incomes: 'incomes.json',
  accounts: 'accounts.json',
  transactions: 'transactions.json',
  reminders: 'reminders.json',
  invoices: 'invoices.json',
  goals: 'goals.json',
  debts: 'debts.json',
  settings: 'settings.json',
} as const

type DataFileKey = keyof typeof DATA_FILES

function storageKey(fileName: string): string {
  return `${DATA_FOLDER_NAME}/${fileName}`
}

function safeParseJSON(text: string): unknown {
  return JSON.parse(text) as unknown
}

function safeStringifyJSON(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export interface LoadedDatasets {
  settings: AppSettings
  bills: Bill[]
  incomes: Income[]
  accounts: Account[]
  transactions: Transaction[]
  reminders: Reminder[]
  invoices: Invoice[]
  goals: Goal[]
  debts: Debt[]
}

export function loadAllFromLocalStorage(fallbackSettings: AppSettings): LoadedDatasets {
  const settings = normalizePeopleSettings(loadSettingsFromLocalStorage(fallbackSettings))
  const txLoaded = loadTransactionsForSettingsFromLocalStorage(settings)
  const settingsWithCounts: AppSettings = {
    ...settings,
    peopleTransactionCounts: { ...settings.peopleTransactionCounts, ...txLoaded.counts },
  }
  return {
    settings: settingsWithCounts,
    bills: loadArrayFromLocalStorage('bills', decodeBill),
    incomes: loadArrayFromLocalStorage('incomes', decodeIncome),
    accounts: loadArrayFromLocalStorage('accounts', decodeAccount),
    transactions: txLoaded.transactions,
    reminders: loadArrayFromLocalStorage('reminders', decodeReminder),
    invoices: loadArrayFromLocalStorage('invoices', decodeInvoice),
    goals: loadArrayFromLocalStorage('goals', decodeGoal),
    debts: loadArrayFromLocalStorage('debts', decodeDebt),
  }
}

export function saveAllToLocalStorage(data: LoadedDatasets): void {
  const settings = normalizePeopleSettings(data.settings)
  const settingsWithCounts: AppSettings = {
    ...settings,
    peopleTransactionCounts: { ...settings.peopleTransactionCounts, [settings.activePersonId]: data.transactions.length },
  }
  saveSettingsToLocalStorage(settingsWithCounts)
  saveArrayToLocalStorage('bills', data.bills, encodeBill)
  saveArrayToLocalStorage('incomes', data.incomes, encodeIncome)
  saveArrayToLocalStorage('accounts', data.accounts, encodeAccount)
  saveTransactionsForSettingsToLocalStorage(settingsWithCounts, data.transactions)
  saveArrayToLocalStorage('reminders', data.reminders, encodeReminder)
  saveArrayToLocalStorage('invoices', data.invoices, encodeInvoice)
  saveArrayToLocalStorage('goals', data.goals, encodeGoal)
  saveArrayToLocalStorage('debts', data.debts, encodeDebt)
}

export function loadSettingsFromLocalStorage(fallback: AppSettings): AppSettings {
  const key = storageKey(DATA_FILES.settings)
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    const v = safeParseJSON(raw)
    if (v && typeof v === 'object') {
      return { ...fallback, ...(v as any) } as AppSettings
    }
    return fallback
  } catch {
    preserveCorruptItem(key)
    return fallback
  }
}

export function saveSettingsToLocalStorage(settings: AppSettings): void {
  const key = storageKey(DATA_FILES.settings)
  localStorage.setItem(key, safeStringifyJSON(settings))
}

function loadArrayFromLocalStorage<T>(file: DataFileKey, decode: (x: unknown) => T): T[] {
  const key = storageKey(DATA_FILES[file])
  const raw = localStorage.getItem(key)
  if (!raw) return []
  try {
    const v = safeParseJSON(raw)
    if (!Array.isArray(v)) return []
    return v.map(decode)
  } catch {
    preserveCorruptItem(key)
    return []
  }
}

function saveArrayToLocalStorage<T>(file: DataFileKey, items: T[], encode: (x: T) => unknown): void {
  const key = storageKey(DATA_FILES[file])
  localStorage.setItem(key, safeStringifyJSON(items.map(encode)))
}

function preserveCorruptItem(key: string): void {
  try {
    const now = iso8601NoMillis(new Date()).replace(/[:]/g, '-')
    const backupKey = `${key}.corrupt-${now}`
    const raw = localStorage.getItem(key)
    if (raw != null) localStorage.setItem(backupKey, raw)
  } catch {
  }
}

type EncodedPayment = Omit<Payment, 'date'> & { date: string }
type EncodedBillAttachment = Omit<BillAttachment, 'createdAt'> & { createdAt: string }
type EncodedBill = Omit<Bill, 'nextDueDate' | 'payments' | 'snoozeUntil' | 'attachments'> & {
  nextDueDate: string
  payments: EncodedPayment[]
  snoozeUntil?: string | null
  attachments: EncodedBillAttachment[]
}
type EncodedInvoiceAttachment = Omit<InvoiceAttachment, 'createdAt'> & { createdAt: string }
type EncodedInvoice = Omit<Invoice, 'createdAt' | 'invoiceDate' | 'attachments'> & {
  createdAt: string
  invoiceDate?: string | null
  attachments: EncodedInvoiceAttachment[]
}
type EncodedIncome = Omit<Income, 'nextPayDate' | 'receipts'> & { nextPayDate: string; receipts: EncodedPayment[] }
type EncodedTransaction = Omit<Transaction, 'date'> & { date: string }
type EncodedReminder = Omit<Reminder, 'when' | 'createdAt' | 'completedAt'> & {
  when: string
  createdAt: string
  completedAt?: string | null
}
type EncodedGoal = Omit<Goal, 'targetDate' | 'autoMonthlyNextDate'> & { targetDate?: string | null; autoMonthlyNextDate?: string | null }
type EncodedTransactionsEnvelope = { version: 2; byPerson: Record<string, EncodedTransaction[]> }

function encodePayment(p: Payment): EncodedPayment {
  return { ...p, date: iso8601NoMillis(p.date) }
}
function decodePayment(x: unknown): Payment {
  const o = x as EncodedPayment
  return { ...o, date: parseISO8601(o.date) }
}

function encodeBillAttachment(a: BillAttachment): EncodedBillAttachment {
  return { ...a, createdAt: iso8601NoMillis(a.createdAt) }
}
function decodeBillAttachment(x: unknown): BillAttachment {
  const o = x as EncodedBillAttachment
  return { ...o, createdAt: parseISO8601(o.createdAt) }
}

function encodeInvoiceAttachment(a: InvoiceAttachment): EncodedInvoiceAttachment {
  return { ...a, createdAt: iso8601NoMillis(a.createdAt) }
}
function decodeInvoiceAttachment(x: unknown): InvoiceAttachment {
  const o = x as EncodedInvoiceAttachment
  return { ...o, createdAt: parseISO8601(o.createdAt) }
}

function encodeBill(b: Bill): EncodedBill {
  return {
    ...b,
    nextDueDate: iso8601NoMillis(b.nextDueDate),
    payments: b.payments.map(encodePayment),
    snoozeUntil: b.snoozeUntil ? iso8601NoMillis(b.snoozeUntil) : b.snoozeUntil,
    attachments: b.attachments.map(encodeBillAttachment),
  }
}
function decodeBill(x: unknown): Bill {
  const o = x as EncodedBill
  return {
    ...o,
    nextDueDate: parseISO8601(o.nextDueDate),
    payments: (o.payments ?? []).map(decodePayment),
    snoozeUntil: o.snoozeUntil ? parseISO8601(o.snoozeUntil) : null,
    attachments: (o.attachments ?? []).map(decodeBillAttachment),
  }
}

function encodeInvoice(i: Invoice): EncodedInvoice {
  return {
    ...i,
    createdAt: iso8601NoMillis(i.createdAt),
    invoiceDate: i.invoiceDate ? iso8601NoMillis(i.invoiceDate) : i.invoiceDate ?? null,
    attachments: (i.attachments ?? []).map(encodeInvoiceAttachment),
  }
}
function decodeInvoice(x: unknown): Invoice {
  const o = x as EncodedInvoice
  return {
    ...o,
    createdAt: parseISO8601(o.createdAt),
    invoiceDate: o.invoiceDate ? parseISO8601(o.invoiceDate) : null,
    attachments: (o.attachments ?? []).map(decodeInvoiceAttachment),
  }
}

function encodeIncome(i: Income): EncodedIncome {
  return {
    ...i,
    nextPayDate: iso8601NoMillis(i.nextPayDate),
    receipts: i.receipts.map(encodePayment),
  }
}
function decodeIncome(x: unknown): Income {
  const o = x as EncodedIncome
  return {
    ...o,
    nextPayDate: parseISO8601(o.nextPayDate),
    receipts: (o.receipts ?? []).map(decodePayment),
  }
}

function encodeAccount(a: Account): Account {
  return a
}
function decodeAccount(x: unknown): Account {
  return x as Account
}

function encodeTransaction(t: Transaction): EncodedTransaction {
  return { ...t, date: iso8601NoMillis(t.date) }
}
function decodeTransaction(x: unknown): Transaction {
  const o = x as EncodedTransaction
  return { ...o, date: parseISO8601(o.date), tags: o.tags ?? [] }
}

function encodeReminder(r: Reminder): EncodedReminder {
  return {
    ...r,
    when: iso8601NoMillis(r.when),
    createdAt: iso8601NoMillis(r.createdAt),
    completedAt: r.completedAt ? iso8601NoMillis(r.completedAt) : r.completedAt ?? null,
  }
}
function decodeReminder(x: unknown): Reminder {
  const o = x as EncodedReminder
  const listRaw = (o as any).remindMinutesBeforeList
  const list =
    Array.isArray(listRaw) && listRaw.length > 0 ? listRaw.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : null
  const single = (o as any).remindMinutesBefore == null ? null : Number((o as any).remindMinutesBefore)
  return {
    ...o,
    title: String((o as any).title ?? '').trim(),
    when: parseISO8601(o.when),
    createdAt: parseISO8601(o.createdAt),
    completedAt: o.completedAt ? parseISO8601(o.completedAt) : null,
    allDay: Boolean((o as any).allDay),
    recurrence: (o as any).recurrence === 'weekly' || (o as any).recurrence === 'monthly' || (o as any).recurrence === 'yearly' ? (o as any).recurrence : 'once',
    priority:
      (o as any).priority === 'low' || (o as any).priority === 'high' || (o as any).priority === 'critical' ? (o as any).priority : 'medium',
    remindMinutesBefore: single == null || !Number.isFinite(single) ? null : single,
    remindMinutesBeforeList: list,
  }
}

function parseEncodedTransactionsRawFromLocalStorage(): unknown {
  const key = storageKey(DATA_FILES.transactions)
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return safeParseJSON(raw)
  } catch {
    preserveCorruptItem(key)
    return null
  }
}

function decodeAllByPerson(raw: unknown): { byPerson: Record<string, Transaction[]>; counts: Record<string, number> } {
  if (Array.isArray(raw)) {
    const list = raw.map(decodeTransaction)
    return { byPerson: { legacy: list }, counts: { legacy: list.length } }
  }
  const env = raw as EncodedTransactionsEnvelope
  const obj = env?.byPerson && typeof env.byPerson === 'object' ? env.byPerson : {}
  const byPerson: Record<string, Transaction[]> = {}
  const counts: Record<string, number> = {}
  for (const [pid, arr] of Object.entries(obj)) {
    if (!Array.isArray(arr)) continue
    const list = arr.map(decodeTransaction)
    byPerson[pid] = list
    counts[pid] = list.length
  }
  return { byPerson, counts }
}

export function loadTransactionsForSettingsFromLocalStorage(settings: AppSettings): { transactions: Transaction[]; counts: Record<string, number> } {
  const normalized = normalizePeopleSettings(settings)
  return loadTransactionsForPersonFromLocalStorage(normalized, normalized.activePersonId)
}

export function loadTransactionsForPersonFromLocalStorage(
  settings: AppSettings,
  personId: string,
): { transactions: Transaction[]; counts: Record<string, number> } {
  const normalized = normalizePeopleSettings(settings)
  const raw = parseEncodedTransactionsRawFromLocalStorage()
  const decoded = decodeAllByPerson(raw)
  if (!normalized.peopleEnabled) {
    const all = Object.values(decoded.byPerson).flat()
    return { transactions: all, counts: decoded.counts }
  }
  const pid = String(personId ?? '').trim()
  const active = pid || normalized.activePersonId
  const activeList = decoded.byPerson[active]
  if (activeList) return { transactions: activeList.map((t) => ({ ...t, personId: t.personId || active })), counts: decoded.counts }
  const legacy = decoded.byPerson.legacy ?? []
  if (legacy.length > 0 && active === normalized.activePersonId) {
    const fixed = legacy.map((t) => ({ ...t, personId: t.personId || active }))
    const counts: Record<string, number> = {}
    for (const t of fixed) {
      const pid = String(t.personId ?? '').trim() || active
      counts[pid] = (counts[pid] ?? 0) + 1
    }
    const activeTx = fixed.filter((t) => String(t.personId ?? '').trim() === active)
    return { transactions: activeTx, counts }
  }
  return { transactions: [], counts: decoded.counts }
}

export function deletePersonTransactionsFromLocalStorage(personId: string): void {
  const pid = String(personId ?? '').trim()
  if (!pid) return
  const key = storageKey(DATA_FILES.transactions)
  const raw = parseEncodedTransactionsRawFromLocalStorage()
  if (!raw || Array.isArray(raw)) return
  const env = raw as EncodedTransactionsEnvelope
  const byPerson = env?.byPerson && typeof env.byPerson === 'object' ? { ...(env.byPerson as any) } : null
  if (!byPerson) return
  if (!(pid in byPerson)) return
  delete byPerson[pid]
  const payload: EncodedTransactionsEnvelope = { version: 2, byPerson }
  localStorage.setItem(key, safeStringifyJSON(payload))
}

export function saveTransactionsForPersonToLocalStorage(settings: AppSettings, personId: string, transactions: Transaction[]): void {
  const normalized = normalizePeopleSettings(settings)
  const pid = String(personId ?? '').trim()
  if (!pid) return
  const key = storageKey(DATA_FILES.transactions)
  if (!normalized.peopleEnabled) {
    localStorage.setItem(key, safeStringifyJSON(transactions.map(encodeTransaction)))
    return
  }
  const raw = parseEncodedTransactionsRawFromLocalStorage()
  const env = raw && !Array.isArray(raw) ? (raw as EncodedTransactionsEnvelope) : null
  const byPerson: Record<string, EncodedTransaction[]> =
    env?.byPerson && typeof env.byPerson === 'object' ? ({ ...(env.byPerson as any) } as any) : {}
  byPerson[pid] = transactions.map((t) => encodeTransaction({ ...t, personId: t.personId || pid }))
  const payload: EncodedTransactionsEnvelope = { version: 2, byPerson }
  localStorage.setItem(key, safeStringifyJSON(payload))
}

export function moveTransactionIdsBetweenPeopleInLocalStorage(
  fromPersonId: string,
  toPersonId: string,
  ids: UUID[],
): { counts: Record<string, number> } {
  const from = String(fromPersonId ?? '').trim()
  const to = String(toPersonId ?? '').trim()
  if (!from || !to || from === to || ids.length === 0) return { counts: {} }
  const key = storageKey(DATA_FILES.transactions)
  const existing = decodeAllByPerson(parseEncodedTransactionsRawFromLocalStorage())
  const merged: Record<string, Transaction[]> = {}
  for (const [pid, tx] of Object.entries(existing.byPerson)) {
    if (pid === 'legacy') continue
    merged[pid] = tx
  }
  const legacy = existing.byPerson.legacy ?? []
  if (legacy.length > 0) {
    for (const t of legacy) {
      const pid = String(t.personId ?? '').trim() || from
      const list = merged[pid] ?? []
      list.push({ ...t, personId: pid })
      merged[pid] = list
    }
  }
  const idSet = new Set<string>(ids)
  const fromList = merged[from] ?? []
  const kept: Transaction[] = []
  const moved: Transaction[] = []
  for (const t of fromList) {
    if (idSet.has(t.id)) moved.push({ ...t, personId: to })
    else kept.push(t)
  }
  merged[from] = kept
  merged[to] = [...(merged[to] ?? []), ...moved]
  const byPerson: Record<string, EncodedTransaction[]> = {}
  const counts: Record<string, number> = {}
  for (const [pid, tx] of Object.entries(merged)) {
    const seen = new Set<string>()
    const uniq: Transaction[] = []
    for (const t of tx) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      uniq.push(t)
    }
    byPerson[pid] = uniq.map((t) => encodeTransaction({ ...t, personId: t.personId || pid }))
    counts[pid] = uniq.length
  }
  const payload: EncodedTransactionsEnvelope = { version: 2, byPerson }
  localStorage.setItem(key, safeStringifyJSON(payload))
  return { counts }
}

function saveTransactionsForSettingsToLocalStorage(settings: AppSettings, activeTransactions: Transaction[]): void {
  const normalized = normalizePeopleSettings(settings)
  const key = storageKey(DATA_FILES.transactions)
  if (!normalized.peopleEnabled) {
    const merged: Record<string, Transaction[]> = {}
    for (const t of activeTransactions) {
      const pid = String(t.personId ?? '').trim() || normalized.activePersonId
      const list = merged[pid] ?? []
      list.push({ ...t, personId: pid })
      merged[pid] = list
    }
    const byPerson: Record<string, EncodedTransaction[]> = {}
    for (const [pid, tx] of Object.entries(merged)) {
      const seen = new Set<string>()
      const uniq: Transaction[] = []
      for (const t of tx) {
        if (seen.has(t.id)) continue
        seen.add(t.id)
        uniq.push(t)
      }
      byPerson[pid] = uniq.map((t) => encodeTransaction({ ...t, personId: t.personId || pid }))
    }
    const payload: EncodedTransactionsEnvelope = { version: 2, byPerson }
    localStorage.setItem(key, safeStringifyJSON(payload))
    return
  }
  const existing = decodeAllByPerson(parseEncodedTransactionsRawFromLocalStorage())
  const merged: Record<string, Transaction[]> = {}
  for (const [pid, tx] of Object.entries(existing.byPerson)) {
    if (pid === 'legacy') continue
    merged[pid] = tx
  }
  const legacy = existing.byPerson.legacy ?? []
  if (legacy.length > 0) {
    for (const t of legacy) {
      const pid = String(t.personId ?? '').trim() || normalized.activePersonId
      const list = merged[pid] ?? []
      list.push({ ...t, personId: pid })
      merged[pid] = list
    }
  }
  merged[normalized.activePersonId] = activeTransactions.map((t) => ({
    ...t,
    personId: t.personId || normalized.activePersonId,
  }))
  const byPerson: Record<string, EncodedTransaction[]> = {}
  for (const [pid, tx] of Object.entries(merged)) {
    const seen = new Set<string>()
    const uniq: Transaction[] = []
    for (const t of tx) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      uniq.push(t)
    }
    byPerson[pid] = uniq.map((t) => encodeTransaction({ ...t, personId: t.personId || pid }))
  }
  const payload: EncodedTransactionsEnvelope = { version: 2, byPerson }
  localStorage.setItem(key, safeStringifyJSON(payload))
}

function encodeGoal(g: Goal): EncodedGoal {
  return {
    ...g,
    targetDate: g.targetDate ? iso8601NoMillis(g.targetDate) : g.targetDate ?? null,
    autoMonthlyNextDate: g.autoMonthlyNextDate ? iso8601NoMillis(g.autoMonthlyNextDate) : g.autoMonthlyNextDate ?? null,
  }
}
function decodeGoal(x: unknown): Goal {
  const o = x as EncodedGoal
  return {
    ...o,
    targetDate: o.targetDate ? parseISO8601(o.targetDate) : null,
    autoMonthlyNextDate: o.autoMonthlyNextDate ? parseISO8601(o.autoMonthlyNextDate) : null,
  }
}

function encodeDebt(d: Debt): Debt {
  return d
}
function decodeDebt(x: unknown): Debt {
  return x as Debt
}
