export function toDateInputValue(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map((x) => Number(x))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date()
  return new Date(y, m - 1, d)
}

export function formatBackupAge(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return 'Never'
  const diff = Math.max(0, Date.now() - ms)
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}
