import type { AppSettings } from './settings'
import type { Invoice, Transaction } from './models'

export function normalizePeopleSettings(settings: AppSettings): AppSettings {
  const list = Array.isArray(settings.people) ? settings.people : []
  const normalized = list
    .map((p) => ({
      id: String((p as any)?.id ?? '').trim(),
      name: String((p as any)?.name ?? '').trim(),
      phone: ((p as any)?.phone ?? null) as any,
      email: ((p as any)?.email ?? null) as any,
      address: ((p as any)?.address ?? null) as any,
      notes: ((p as any)?.notes ?? null) as any,
      amountOwed: ((p as any)?.amountOwed ?? null) as any,
    }))
    .filter((p) => p.id.length > 0)

  for (const p of normalized) {
    if (p.phone != null) p.phone = String(p.phone)
    if (p.email != null) p.email = String(p.email)
    if (p.address != null) p.address = String(p.address)
    if (p.notes != null) p.notes = String(p.notes)
    if (p.amountOwed != null) {
      const n = Number(p.amountOwed)
      p.amountOwed = Number.isFinite(n) ? n : null
    }
  }

  const people =
    normalized.length > 0 ? normalized : [{ id: 'person-1', name: 'Person 1', phone: null, email: null, address: null, notes: null, amountOwed: null }]
  const active = people.some((p) => p.id === settings.activePersonId) ? settings.activePersonId : people[0]!.id
  const nextCounts: Record<string, number> = { ...(settings.peopleTransactionCounts ?? {}) }
  for (const p of people) {
    if (!Number.isFinite(nextCounts[p.id])) nextCounts[p.id] = 0
  }
  return { ...settings, people, activePersonId: active, peopleTransactionCounts: nextCounts }
}

export function assignMissingTransactionPersonIds(transactions: Transaction[], settings: AppSettings): Transaction[] {
  const s = normalizePeopleSettings(settings)
  if (!s.peopleEnabled) return transactions
  const pid = s.activePersonId
  let changed = false
  const next = transactions.map((t) => {
    if (t.personId) return t
    changed = true
    return { ...t, personId: pid }
  })
  return changed ? next : transactions
}

export function visibleTransactions(transactions: Transaction[], settings: AppSettings): Transaction[] {
  const s = normalizePeopleSettings(settings)
  if (!s.peopleEnabled) return transactions
  return transactions.filter((t) => (t.personId || s.activePersonId) === s.activePersonId)
}

export function nextPersonName(people: { id: string; name: string }[]): string {
  const base = 'Person '
  const used = new Set<number>()
  for (const p of people) {
    const m = String(p.name || '').trim().match(/^Person\s+(\d+)$/i)
    if (m) used.add(Number(m[1]))
  }
  for (let i = 1; i < 1000; i++) {
    if (!used.has(i)) return `${base}${i}`
  }
  return `${base}${people.length + 1}`
}

export function withActivePersonCount(settings: AppSettings, count: number): AppSettings {
  const s = normalizePeopleSettings(settings)
  return {
    ...s,
    peopleTransactionCounts: { ...s.peopleTransactionCounts, [s.activePersonId]: Math.max(0, Math.trunc(count)) },
  }
}

export function assignMissingInvoicePersonIds(invoices: Invoice[], settings: AppSettings): Invoice[] {
  const s = normalizePeopleSettings(settings)
  if (!s.peopleEnabled) return invoices
  const pid = s.activePersonId
  let changed = false
  const next = invoices.map((i) => {
    if (i.personId) return i
    changed = true
    return { ...i, personId: pid }
  })
  return changed ? next : invoices
}

export function visibleInvoices(invoices: Invoice[], settings: AppSettings): Invoice[] {
  const s = normalizePeopleSettings(settings)
  if (!s.peopleEnabled) return invoices
  return invoices.filter((i) => (i.personId || s.activePersonId) === s.activePersonId)
}
