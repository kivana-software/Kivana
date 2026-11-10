import type { Transaction } from './models'
import type { AppSettings } from './settings'
import { applyImportCategoryRules } from './importCategorization'
import { normalizeCategoryLabel } from './settings'

export type ImportPipelineResult = {
  transactions: Transaction[]
  autoCategorizedCount: number
  duplicateKeysInFile: string[]
  duplicateKeysExisting: string[]
}

export function transactionDupeKey(t: Transaction): string {
  const y = t.date.getFullYear()
  const m = String(t.date.getMonth() + 1).padStart(2, '0')
  const d = String(t.date.getDate()).padStart(2, '0')
  const day = `${y}-${m}-${d}`
  const cents = Math.round(Number(t.amount.value) * 100)
  return `${t.kind}|${day}|${t.amount.currencyCode}|${cents}`
}

function uniqueTags(tags: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of tags) {
    const t = String(raw || '').trim()
    if (!t) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function analyzeDuplicates(existing: Transaction[], imported: Transaction[]): { duplicateKeysInFile: string[]; duplicateKeysExisting: string[] } {
  const existingKeys = new Set<string>()
  for (const t of existing) existingKeys.add(transactionDupeKey(t))

  const counts = new Map<string, number>()
  for (const t of imported) {
    const k = transactionDupeKey(t)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  const duplicateKeysInFile: string[] = []
  const duplicateKeysExisting: string[] = []
  for (const [k, c] of counts) {
    if (c > 1) duplicateKeysInFile.push(k)
    if (existingKeys.has(k)) duplicateKeysExisting.push(k)
  }
  return { duplicateKeysInFile, duplicateKeysExisting }
}

export function runImportPipeline(params: { existing: Transaction[]; imported: Transaction[]; settings: AppSettings; sourceTag: string }): ImportPipelineResult {
  const normalized = params.imported.map((t) => {
    const payee = normalizeCategoryLabel(t.payee ?? '')
    const notes = normalizeCategoryLabel(t.notes ?? '')
    const custom = normalizeCategoryLabel(t.customCategoryName ?? '')
    const tags = uniqueTags([...(t.tags ?? []), params.sourceTag, 'import:v1'])
    return {
      ...t,
      payee: payee ? payee : null,
      notes: notes ? notes : null,
      customCategoryName: custom ? custom : null,
      tags,
    }
  })

  const categorized = applyImportCategoryRules(normalized, params.settings)
  const dupe = analyzeDuplicates(params.existing, categorized.transactions)
  return {
    transactions: categorized.transactions,
    autoCategorizedCount: categorized.appliedCount,
    duplicateKeysInFile: dupe.duplicateKeysInFile,
    duplicateKeysExisting: dupe.duplicateKeysExisting,
  }
}

