import type { LoadedDatasets } from './localJsonStore'
import { DATA_FILES, DATA_FOLDER_NAME } from './localJsonStore'
import { type Account, type Bill, type Payment, type Transaction, iso8601NoMillis, parseISO8601 } from '../domain/models'
import type { AppSettings } from '../domain/settings'

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core')
  return mod.invoke<T>(cmd, args)
}

function safeParseJSON(text: string): unknown {
  return JSON.parse(text) as unknown
}

function safeStringifyJSON(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export async function appDataDir(): Promise<string> {
  return invoke<string>('app_data_dir')
}

export async function loadAllFromTauriFiles(fallbackSettings: AppSettings): Promise<LoadedDatasets> {
  return {
    settings: await loadSettingsFromTauriFiles(fallbackSettings),
    bills: await loadArrayFromTauriFiles('bills', decodeBill),
    accounts: await loadArrayFromTauriFiles('accounts', decodeAccount),
    transactions: await loadTransactionsFromTauriFiles(),
  }
}

export async function saveAllToTauriFiles(data: LoadedDatasets): Promise<void> {
  await saveSettingsToTauriFiles(data.settings)
  await saveArrayToTauriFiles('bills', data.bills, encodeBill)
  await saveArrayToTauriFiles('accounts', data.accounts, encodeAccount)
  await saveTransactionsToTauriFiles(data.transactions)
}

async function readText(name: string): Promise<string | null> {
  const text = await invoke<string | null>('read_data_file', { name })
  return text
}

async function writeText(name: string, text: string): Promise<void> {
  await invoke<void>('write_data_file', { name, content: text })
}

async function preserveCorrupt(name: string): Promise<void> {
  await invoke<void>('preserve_corrupt_file', { name })
}

async function loadSettingsFromTauriFiles(fallback: AppSettings): Promise<AppSettings> {
  const name = DATA_FILES.settings
  const raw = await readText(name)
  if (!raw) return fallback
  try {
    const v = safeParseJSON(raw)
    if (v && typeof v === 'object') return { ...fallback, ...(v as any) } as AppSettings
    return fallback
  } catch {
    await preserveCorrupt(name)
    return fallback
  }
}

async function saveSettingsToTauriFiles(settings: AppSettings): Promise<void> {
  const name = DATA_FILES.settings
  await writeText(name, safeStringifyJSON(settings))
}

type DataFileKey = Exclude<keyof typeof DATA_FILES, 'settings'>

async function loadArrayFromTauriFiles<T>(file: DataFileKey, decode: (x: unknown) => T): Promise<T[]> {
  const name = DATA_FILES[file]
  const raw = await readText(name)
  if (!raw) return []
  try {
    const v = safeParseJSON(raw)
    if (!Array.isArray(v)) return []
    return v.map(decode)
  } catch {
    await preserveCorrupt(name)
    return []
  }
}

async function saveArrayToTauriFiles<T>(file: DataFileKey, items: T[], encode: (x: T) => unknown): Promise<void> {
  const name = DATA_FILES[file]
  await writeText(name, safeStringifyJSON(items.map(encode)))
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

async function parseEncodedTransactionsRawFromTauriFiles(): Promise<unknown> {
  const raw = await readText(DATA_FILES.transactions)
  if (!raw) return null
  try {
    return safeParseJSON(raw)
  } catch {
    await preserveCorrupt(DATA_FILES.transactions)
    return null
  }
}

async function loadTransactionsFromTauriFiles(): Promise<Transaction[]> {
  const raw = await parseEncodedTransactionsRawFromTauriFiles()
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(decodeTransaction)

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

async function saveTransactionsToTauriFiles(transactions: Transaction[]): Promise<void> {
  await writeText(DATA_FILES.transactions, safeStringifyJSON(transactions.map(encodeTransaction)))
}

export const tauriDataFolderHint = DATA_FOLDER_NAME
