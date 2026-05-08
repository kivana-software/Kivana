import type { LoadedDatasets } from './localJsonStore'
import type { Account, Bill, Payment, Transaction } from '../domain/models'
import { iso8601NoMillis, parseISO8601 } from '../domain/models'
import { defaultSettings, type AppSettings } from '../domain/settings'

export interface DataBackup {
  version: number
  exportedAt: string
  settings: AppSettings
  bills: EncodedBill[]
  accounts: Account[]
  transactions: EncodedTransaction[]
}

type EncodedPayment = Omit<Payment, 'date'> & { date: string }
type EncodedBill = Omit<Bill, 'nextDueDate' | 'payments' | 'snoozeUntil'> & {
  nextDueDate: string
  payments: EncodedPayment[]
  snoozeUntil?: string | null
}
type EncodedTransaction = Omit<Transaction, 'date'> & { date: string }

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

function encodeTransaction(t: Transaction): EncodedTransaction {
  return { ...t, date: iso8601NoMillis(t.date) }
}

function decodeTransaction(x: unknown): Transaction {
  const o = x as EncodedTransaction
  return { ...o, date: parseISO8601(o.date), tags: o.tags ?? [] }
}

export function encodeBackup(datasets: LoadedDatasets): string {
  const payload: DataBackup = {
    version: 5,
    exportedAt: iso8601NoMillis(new Date()),
    settings: datasets.settings,
    bills: datasets.bills.map(encodeBill),
    accounts: datasets.accounts,
    transactions: datasets.transactions.map(encodeTransaction),
  }
  return JSON.stringify(payload, null, 2)
}

export function decodeBackupToDatasets(jsonText: string): { version: number; datasets: LoadedDatasets } {
  const raw = JSON.parse(jsonText) as any
  const version = Number(raw?.version ?? 0)
  const base = { ...defaultSettings(), ...(raw?.settings ?? {}) } as AppSettings

  const bills: Bill[] = Array.isArray(raw?.bills) ? raw.bills.map(decodeBill) : []
  const accounts: Account[] = Array.isArray(raw?.accounts) ? (raw.accounts as Account[]) : []
  const transactions: Transaction[] = Array.isArray(raw?.transactions) ? raw.transactions.map(decodeTransaction) : []

  return {
    version,
    datasets: {
      settings: base,
      bills,
      accounts,
      transactions,
    },
  }
}
