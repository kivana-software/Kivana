import type { BillCategory } from './models'

export type LanguageCode = 'en' | 'es' | 'de' | 'fr' | 'it' | 'no' | 'pl' | 'pt' | 'nl' | 'sv' | 'da' | 'ru' | 'lt'

export interface AppSettings {
  language: LanguageCode
  displayCurrencyCode: string
  enableMenuAnimations: boolean
}

export function defaultSettings(): AppSettings {
  return {
    language: 'en',
    displayCurrencyCode: 'GBP',
    enableMenuAnimations: false,
  }
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

export function expenseCategoryDisplayName(params: { category?: BillCategory | null; customCategoryName?: string | null }): string {
  const custom = normalizeCategoryLabel(params.customCategoryName ?? '')
  if (custom) return custom
  const cat = params.category ?? 'other'
  return capitalize(cat)
}
