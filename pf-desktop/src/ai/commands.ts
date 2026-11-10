import type { BillCategory, TransactionKind } from '../domain/models'

const BILL_CATEGORIES: BillCategory[] = ['housing', 'utilities', 'subscriptions', 'insurance', 'taxes', 'transport', 'other']

function isBillCategory(x: unknown): x is BillCategory {
  return typeof x === 'string' && (BILL_CATEGORIES as string[]).includes(x)
}

export type AICommand =
  | {
      type: 'createTransaction'
      payload: {
        kind: TransactionKind
        amount: number
        currencyCode?: string
        payee?: string
        notes?: string
        category?: BillCategory
        customCategoryName?: string
      }
    }
  | { type: 'createBill'; payload: { name: string; amount: number; currencyCode?: string; dueDate?: string; category?: BillCategory; customCategoryName?: string } }
  | { type: 'createIncome'; payload: { name: string; amount: number; currencyCode?: string; nextPayDate?: string } }
  | { type: 'webSearch'; payload: { query: string } }
  | { type: 'unknown'; payload: { message: string } }

export interface AIParseResult {
  command: AICommand
  raw: string
}

export function normalizeParsedCommand(x: unknown): AICommand {
  if (!x || typeof x !== 'object') return { type: 'unknown', payload: { message: 'Invalid AI output.' } }
  const o = x as any
  const t = String(o.type ?? '')
  if (t === 'createTransaction') {
    const p = o.payload ?? {}
    const kind = (p.kind === 'income' || p.kind === 'expense' || p.kind === 'transfer') ? p.kind : 'expense'
    const amount = Number(p.amount ?? NaN)
    if (!Number.isFinite(amount)) return { type: 'unknown', payload: { message: 'Missing amount.' } }
    return {
      type: 'createTransaction',
      payload: {
        kind,
        amount,
        currencyCode: typeof p.currencyCode === 'string' ? p.currencyCode : undefined,
        payee: typeof p.payee === 'string' ? p.payee : undefined,
        notes: typeof p.notes === 'string' ? p.notes : undefined,
        category: isBillCategory(p.category) ? p.category : undefined,
        customCategoryName: typeof p.customCategoryName === 'string' ? p.customCategoryName.trim() || undefined : undefined,
      },
    }
  }
  if (t === 'createBill') {
    const p = o.payload ?? {}
    const amount = Number(p.amount ?? NaN)
    if (!Number.isFinite(amount)) return { type: 'unknown', payload: { message: 'Missing amount.' } }
    const name = String(p.name ?? '').trim()
    if (!name) return { type: 'unknown', payload: { message: 'Missing bill name.' } }
    return {
      type: 'createBill',
      payload: {
        name,
        amount,
        currencyCode: typeof p.currencyCode === 'string' ? p.currencyCode : undefined,
        dueDate: typeof p.dueDate === 'string' ? p.dueDate : undefined,
        category: isBillCategory(p.category) ? p.category : undefined,
        customCategoryName: typeof p.customCategoryName === 'string' ? p.customCategoryName.trim() || undefined : undefined,
      },
    }
  }
  if (t === 'createIncome') {
    const p = o.payload ?? {}
    const amount = Number(p.amount ?? NaN)
    if (!Number.isFinite(amount)) return { type: 'unknown', payload: { message: 'Missing amount.' } }
    const name = String(p.name ?? '').trim()
    if (!name) return { type: 'unknown', payload: { message: 'Missing income name.' } }
    return {
      type: 'createIncome',
      payload: {
        name,
        amount,
        currencyCode: typeof p.currencyCode === 'string' ? p.currencyCode : undefined,
        nextPayDate: typeof p.nextPayDate === 'string' ? p.nextPayDate : undefined,
      },
    }
  }
  if (t === 'webSearch') {
    const p = o.payload ?? {}
    const query = String(p.query ?? '').trim()
    if (!query) return { type: 'unknown', payload: { message: 'Missing search query.' } }
    return { type: 'webSearch', payload: { query } }
  }
  return { type: 'unknown', payload: { message: 'Unsupported command.' } }
}
