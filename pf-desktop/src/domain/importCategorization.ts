import type { BillCategory, Transaction } from './models'
import type { AppSettings, ImportCategoryRule } from './settings'

export function applyImportCategoryRules(transactions: Transaction[], settings: AppSettings): { transactions: Transaction[]; appliedCount: number } {
  const rulesRaw = Array.isArray(settings.importCategoryRules) ? settings.importCategoryRules : []
  const rules = rulesRaw
    .map((r) => ({
      id: String((r as any)?.id ?? '').trim(),
      match: String((r as any)?.match ?? '').trim(),
      field: (String((r as any)?.field ?? 'any').trim() as any) as ImportCategoryRule['field'],
      appliesTo: (String((r as any)?.appliesTo ?? 'expense').trim() as any) as ImportCategoryRule['appliesTo'],
      category: (String((r as any)?.category ?? 'other').trim() as any) as BillCategory,
      customCategoryName: ((r as any)?.customCategoryName ?? null) as any,
    }))
    .filter((r) => r.id.length > 0 && r.match.length > 0)

  if (rules.length === 0) return { transactions, appliedCount: 0 }

  let appliedCount = 0
  const out = transactions.map((t) => {
    const alreadyCategorized = (t.category ?? 'other') !== 'other' || Boolean(String(t.customCategoryName ?? '').trim())
    if (alreadyCategorized) return t

    for (const r of rules) {
      if (r.appliesTo !== 'any' && t.kind !== r.appliesTo) continue
      const matchLower = r.match.toLowerCase()
      if (!matchLower) continue
      const payee = String(t.payee ?? '')
      const notes = String(t.notes ?? '')
      const hay =
        r.field === 'payee'
          ? payee.toLowerCase()
          : r.field === 'notes'
            ? notes.toLowerCase()
            : `${payee} ${notes}`.toLowerCase()
      if (!hay.includes(matchLower)) continue

      appliedCount += 1
      const custom = String(r.customCategoryName ?? '').trim()
      if (custom) return { ...t, category: 'other' as const, customCategoryName: custom }
      return { ...t, category: r.category as BillCategory, customCategoryName: null }
    }

    return t
  })

  return { transactions: out, appliedCount }
}
