import type { Bill, BillCategory, Transaction } from './models'

export type AIProvider = 'local' | 'external'

export type TextSize = 'small' | 'normal' | 'large'

export type Theme = 'system' | 'light' | 'dark'

export type AccentColor =
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'mint'
  | 'teal'
  | 'cyan'
  | 'indigo'
  | 'gray'

export type JurisdictionCode = 'UK' | 'NO'

export type LanguageCode = 'en' | 'no' | 'de' | 'pl' | 'es' | 'fr'

export const AI_FEATURE_ENABLED = false

export interface WidgetLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

export type WidgetType = 
  | 'kpis'
  | 'pieChart'
  | 'goals'
  | 'billsDue'
  | 'budget'

export interface AppSettings {
  language: LanguageCode
  displayCurrencyCode: string
  defaultJurisdiction: JurisdictionCode
  enableNotifications: boolean
  reminderDays: number
  startOnLogin: boolean
  shareAnonymousData: boolean
  enableMenuAnimations: boolean
  customBillCategories: string[]
  customIncomeCategories: string[]
  budgetCategories: string[]
  iCloudEnabled: boolean
  calendarSyncEnabled: boolean
  calendarSyncCalendarName: string
  calendarSyncMonthsAhead: number
  calendarSyncLeadDays: number
  backendBaseURL: string
  aiBaseURL: string
  aiModel: string
  aiProvider: AIProvider
  aiExternalEndpoint: string
  textSize: TextSize
  theme: Theme
  accentColor: AccentColor
  monthlyBudgets: Record<string, number>
  availableBalance: number
  preferManualForecastBalance: boolean
  hideAccountBalances: boolean
  lastBackupAtMs: number | null
  autoBackupEnabled: boolean
  autoBackupEveryDays: number
  autoBackupKeepCount: number
  autoBackupLastRunAtMs: number | null
  savedBackups: { path: string; savedAtMs: number }[]
  peopleEnabled: boolean
  people: { id: string; name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; amountOwed?: number | null }[]
  activePersonId: string
  peopleTransactionCounts: Record<string, number>
  importCategoryRules: ImportCategoryRule[]
  aiExternalAPIKey?: string | null
  dashboardWidgets: WidgetLayoutItem[]
}

export type ImportCategoryRule = {
  id: string
  match: string
  field: 'payee' | 'notes' | 'any'
  appliesTo: 'expense' | 'income' | 'transfer' | 'any'
  category: BillCategory
  customCategoryName?: string | null
}

export function defaultSettings(): AppSettings {
  return {
    language: 'en',
    displayCurrencyCode: 'GBP',
    defaultJurisdiction: 'UK',
    enableNotifications: true,
    reminderDays: 7,
    startOnLogin: false,
    shareAnonymousData: true,
    enableMenuAnimations: false,
    customBillCategories: [],
    customIncomeCategories: [],
    budgetCategories: [],
    iCloudEnabled: true,
    calendarSyncEnabled: true,
    calendarSyncCalendarName: 'Bills',
    calendarSyncMonthsAhead: 3,
    calendarSyncLeadDays: 3,
    backendBaseURL: '',
    aiBaseURL: 'http://localhost:11434',
    aiModel: 'qwen3.5:4b',
    aiProvider: 'local',
    aiExternalEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
    textSize: 'normal',
    theme: 'system',
    accentColor: 'blue',
    monthlyBudgets: {},
    availableBalance: 0,
    preferManualForecastBalance: false,
    hideAccountBalances: false,
    lastBackupAtMs: null,
    autoBackupEnabled: false,
    autoBackupEveryDays: 7,
    autoBackupKeepCount: 5,
    autoBackupLastRunAtMs: null,
    savedBackups: [],
    peopleEnabled: false,
    people: [{ id: 'person-1', name: 'Person 1', phone: null, email: null, address: null, notes: null, amountOwed: null }],
    activePersonId: 'person-1',
    peopleTransactionCounts: {},
    importCategoryRules: [],
    aiExternalAPIKey: null,
    dashboardWidgets: [
      { i: 'kpis', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
      { i: 'pieChart', x: 0, y: 2, w: 4, h: 4, minW: 4, minH: 3 },
      { i: 'billsDue', x: 4, y: 2, w: 4, h: 4, minW: 4, minH: 3 },
      { i: 'budget', x: 8, y: 2, w: 4, h: 4, minW: 4, minH: 3 },
      { i: 'goals', x: 0, y: 6, w: 4, h: 4, minW: 4, minH: 3 },
    ],
  }
}

export function budgetKeyBuiltin(category: BillCategory): string {
  return `builtin:${category}`
}

export function budgetKeyCustom(label: string): string {
  return `custom:${label}`
}

export function budgetDisplayName(key: string): string {
  if (key.startsWith('builtin:')) return capitalize(key.slice('builtin:'.length))
  if (key.startsWith('custom:')) return key.slice('custom:'.length)
  return key
}

export function budgetKeyForBill(bill: Bill): string {
  const label = bill.customCategoryName?.trim()
  if (label) return budgetKeyCustom(label)
  return budgetKeyBuiltin(bill.category)
}

export function migratedBudgets(settings: AppSettings): AppSettings {
  const migrated: Record<string, number> = {}
  for (const [k, v] of Object.entries(settings.monthlyBudgets ?? {})) {
    if (k.startsWith('builtin:') || k.startsWith('custom:')) {
      migrated[k] = v
      continue
    }
    if (isBillCategory(k)) {
      migrated[budgetKeyBuiltin(k)] = v
      continue
    }
    migrated[budgetKeyCustom(k)] = v
  }
  return { ...settings, monthlyBudgets: migrated }
}

export function migratedBudgetCategories(settings: AppSettings): AppSettings {
  if ((settings.budgetCategories?.length ?? 0) > 0) return settings
  const inferred = Object.keys(settings.monthlyBudgets ?? {})
    .filter((k) => k.startsWith('custom:'))
    .map((k) => k.slice('custom:'.length).trim())
    .filter((x) => x.length > 0)
  if (inferred.length === 0) return settings
  const unique = Array.from(new Set(inferred)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return { ...settings, budgetCategories: unique }
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function isBillCategory(x: string): x is BillCategory {
  return (
    x === 'housing' ||
    x === 'utilities' ||
    x === 'subscriptions' ||
    x === 'insurance' ||
    x === 'taxes' ||
    x === 'transport' ||
    x === 'other'
  )
}

export function normalizeCategoryLabel(label: string): string {
  return String(label ?? '').replace(/\s+/g, ' ').trim()
}

export function expenseCategoryKey(params: { category?: BillCategory | null; customCategoryName?: string | null }): string {
  const custom = normalizeCategoryLabel(params.customCategoryName ?? '')
  if (custom) return `custom:${custom.toLowerCase()}`
  const cat = params.category ?? 'other'
  return `builtin:${cat}`
}

export function expenseCategoryDisplayName(params: { category?: BillCategory | null; customCategoryName?: string | null }): string {
  const custom = normalizeCategoryLabel(params.customCategoryName ?? '')
  if (custom) return custom
  const cat = params.category ?? 'other'
  return capitalize(cat)
}

export function expenseCategoryFromSummaryCategory(raw: string | null | undefined): { key: string; label: string } {
  const s = normalizeCategoryLabel(raw ?? '')
  if (!s) return { key: 'builtin:other', label: 'Other' }
  if (isBillCategory(s)) return { key: `builtin:${s}`, label: capitalize(s) }
  if (s.toLowerCase() === 'expense' || s.toLowerCase() === 'expenses') return { key: 'builtin:other', label: 'Other' }
  return { key: `custom:${s.toLowerCase()}`, label: s }
}

export function expenseCategoryFromTransaction(t: Transaction): { key: string; label: string } {
  if (t.kind !== 'expense') return { key: 'builtin:other', label: 'Other' }
  const custom = normalizeCategoryLabel(t.customCategoryName ?? '')
  if (custom) return { key: `custom:${custom.toLowerCase()}`, label: custom }
  const cat = (t.category ?? 'other') as any
  if (typeof cat === 'string' && isBillCategory(cat)) return { key: `builtin:${cat}`, label: capitalize(cat) }
  return { key: 'builtin:other', label: 'Other' }
}

export function getBudgetAmountForCategory(settings: AppSettings, key: string): number {
  const raw = Number((settings.monthlyBudgets ?? {})[key] ?? 0)
  if (Number.isFinite(raw)) return raw
  return 0
}

export function getBudgetAmountForCustomCategory(settings: AppSettings, customLabel: string): number {
  const label = normalizeCategoryLabel(customLabel)
  if (!label) return 0
  const direct = getBudgetAmountForCategory(settings, `custom:${label}`)
  if (direct !== 0) return direct
  const target = label.toLowerCase()
  const budgets = settings.monthlyBudgets ?? {}
  for (const [k, v] of Object.entries(budgets)) {
    if (!k.startsWith('custom:')) continue
    const stored = normalizeCategoryLabel(k.slice('custom:'.length))
    if (stored.toLowerCase() !== target) continue
    const n = Number(v ?? 0)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}
