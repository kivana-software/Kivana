import { type Account, type Bill, type Payment, type Transaction, iso8601NoMillis, parseISO8601 } from '../domain/models'
import type { AppSettings } from '../domain/settings'

export const DATA_FOLDER_NAME = 'KivanaBasic'

export const DATA_FILES = {
  bills: 'bills.json',
  accounts: 'accounts.json',
  transactions: 'transactions.json',
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
  accounts: Account[]
  transactions: Transaction[]
}

export function loadAllFromLocalStorage(fallbackSettings: AppSettings): LoadedDatasets {
  return {
    settings: loadSettingsFromLocalStorage(fallbackSettings),
    bills: loadArrayFromLocalStorage('bills', decodeBill),
    accounts: loadArrayFromLocalStorage('accounts', decodeAccount),
    transactions: loadTransactionsFromLocalStorage(),
  }
}

export function saveAllToLocalStorage(data: LoadedDatasets): void {
  saveSettingsToLocalStorage(data.settings)
  saveArrayToLocalStorage('bills', data.bills, encodeBill)
  saveArrayToLocalStorage('accounts', data.accounts, encodeAccount)
  saveTransactionsToLocalStorage(data.transactions)
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
type EncodedBill = Omit<Bill, 'nextDueDate' | 'payments' | 'snoozeUntil'> & {
  nextDueDate: string
  payments: EncodedPayment[]
  snoozeUntil?: string | null
}
type EncodedTransaction = Omit<Transaction, 'date'> & { date: string }
type EncodedTransactionsEnvelope = { version: 2; byPerson: Record<string, EncodedTransaction[]> }

function encodePayment(p: Payment): EncodedPayment {
  return { ...p, date: iso8601NoMillis(p.date) }
}

function decodePayment(x: unknown): Payment {
  const o = x as EncodedPayment
  return { ...o, date: parseISO8601(o.date) }
}

function encodeBill(b: Bill): EncodedBill {
  return {
    ...b,
    nextDueDate: iso8601NoMillis(b.nextDueDate),
    payments: (b.payments ?? []).map(encodePayment),
    snoozeUntil: b.snoozeUntil ? iso8601NoMillis(b.snoozeUntil) : b.snoozeUntil,
  }
}

function decodeBill(x: unknown): Bill {
  const o = x as EncodedBill
  return {
    ...o,
    nextDueDate: parseISO8601(o.nextDueDate),
    payments: (o.payments ?? []).map(decodePayment),
    snoozeUntil: o.snoozeUntil ? parseISO8601(o.snoozeUntil) : null,
    customCategoryName: null,
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

function loadTransactionsFromLocalStorage(): Transaction[] {
  const raw = parseEncodedTransactionsRawFromLocalStorage()
  if (!raw) return []

  if (Array.isArray(raw)) {
    return raw.map(decodeTransaction)
  }

  const env = raw as EncodedTransactionsEnvelope
  const byPerson = env?.byPerson && typeof env.byPerson === 'object' ? (env.byPerson as Record<string, unknown>) : null
  if (!byPerson) return []
  const flattened: Transaction[] = []
  for (const arr of Object.values(byPerson)) {
    if (!Array.isArray(arr)) continue
    flattened.push(...arr.map(decodeTransaction))
  }
  return flattened
}

function saveTransactionsToLocalStorage(transactions: Transaction[]): void {
  const key = storageKey(DATA_FILES.transactions)
  localStorage.setItem(key, safeStringifyJSON(transactions.map(encodeTransaction)))
}
