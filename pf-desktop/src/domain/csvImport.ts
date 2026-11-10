import type { Transaction, TransactionKind, UUID } from './models'

export interface CsvRow {
  date?: Date
  amount?: number
  description?: string
  memo?: string
  account?: string
}

export function parseCsvRows(content: string): CsvRow[] {
  const records = parseCSV(content).filter((fields) => fields.some((f) => f.trim().length > 0))
  if (records.length === 0) return []

  // Find the header row by looking for a row that contains common header keywords like 'date' and 'amount'
  let headerIndex = 0
  for (let i = 0; i < Math.min(records.length, 50); i++) {
    const rowStr = records[i]!.join(' ').toLowerCase()
    const norm = rowStr.replace(/[_-]+/g, ' ')
    const hasDate = norm.includes('date') || norm.includes('dato')
    const hasAmount =
      norm.includes('amount') ||
      norm.includes('value') ||
      norm.includes('beløp') ||
      norm.includes('belp') ||
      norm.includes('paid in') ||
      norm.includes('paid out') ||
      norm.includes('money in') ||
      norm.includes('money out') ||
      norm.includes('inn') ||
      norm.includes('ut')
    if (hasDate && hasAmount) {
      headerIndex = i
      break
    }
  }

  const header = records[headerIndex]!
  const headers = header.map((h) => h.trim().toLowerCase())
  const map = headerMap(headers)
  
  // If we couldn't even map date and amount, fallback to heuristics
  if (map.dateIndex === undefined || map.amountIndex === undefined) {
    // We could try to guess columns based on content, but for now we just proceed and see if parseDate works
  }

  const rows: CsvRow[] = []
  for (const fields of records.slice(headerIndex + 1)) {
    const row: CsvRow = {}
    // Try header mapped indices first
    if (map.dateIndex !== undefined) row.date = parseDate(field(fields, map.dateIndex))
    if (map.amountIndex !== undefined) row.amount = parseDecimal(field(fields, map.amountIndex))
    if (row.amount == null && (map.amountInIndex !== undefined || map.amountOutIndex !== undefined)) {
      const rawIn = parseDecimal(field(fields, map.amountInIndex))
      const rawOut = parseDecimal(field(fields, map.amountOutIndex))
      if (rawIn != null && rawIn !== 0) row.amount = Math.abs(rawIn)
      else if (rawOut != null && rawOut !== 0) row.amount = -Math.abs(rawOut)
    }
    if (map.descriptionIndex !== undefined) row.description = field(fields, map.descriptionIndex)
    if (map.memoIndex !== undefined) row.memo = field(fields, map.memoIndex)
    if (map.accountIndex !== undefined) row.account = field(fields, map.accountIndex)

    // Fallback: heuristic guessing if mapping failed
    if (!row.date || row.amount == null) {
      for (const f of fields) {
        if (!row.date) {
          const d = parseDate(f)
          if (d) row.date = d
        }
        if (row.amount == null) {
          const a = parseDecimal(f)
          if (a != null && Number.isFinite(a) && String(a) !== f.trim()) {
             // ensure it's not just a year or id
             // but parseDecimal is quite lenient, so this is risky. 
             // We'll just rely on map or nothing for now.
          }
        }
      }
    }

    rows.push(row)
  }
  return rows
}

export function rowsToTransactions(
  rows: CsvRow[],
  currencyCode: string,
  accountIdResolver: (rawAccount: string | undefined) => UUID | null,
): Transaction[] {
  const tx: Transaction[] = []
  for (const row of rows) {
    if (!row.date || row.amount == null) continue
    const kind: TransactionKind = row.amount < 0 ? 'expense' : 'income'
    const absAmount = row.amount < 0 ? -row.amount : row.amount
    tx.push({
      id: crypto.randomUUID(),
      kind,
      date: row.date,
      amount: { currencyCode, value: absAmount },
      accountId: accountIdResolver(row.account),
      toAccountId: null,
      category: kind === 'expense' ? 'other' : null,
      customCategoryName: null,
      payee: row.description ?? null,
      notes: row.memo ?? null,
      tags: ['bank-csv'],
      relatedBillId: null,
      relatedIncomeId: null,
    })
  }
  return tx
}

interface HeaderMap {
  dateIndex?: number
  amountIndex?: number
  amountInIndex?: number
  amountOutIndex?: number
  descriptionIndex?: number
  memoIndex?: number
  accountIndex?: number
}

function headerMap(headers: string[]): HeaderMap {
  const normalize = (s: string): string => s.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const normalizedHeaders = headers.map(normalize)
  const idx = (names: string[]): number | undefined => {
    for (const n of names) {
      const nn = normalize(n)
      let i = normalizedHeaders.findIndex((h) => h === nn)
      if (i < 0) i = normalizedHeaders.findIndex((h) => h.includes(nn))
      if (i >= 0) return i
    }
    return undefined
  }
  return {
    dateIndex: idx([
      'date',
      'posted date',
      'transaction date',
      'utført dato',
      'utf�rt dato',
      'bokført dato',
      'bokf�rt dato',
      'rentedato',
      'dato',
    ]),
    amountIndex: idx(['amount', 'transaction amount', 'value', 'beløp', 'bel�p']),
    amountInIndex: idx(['amount in', 'paid in', 'money in', 'beløp inn', 'bel�p inn']),
    amountOutIndex: idx(['amount out', 'paid out', 'money out', 'beløp ut', 'bel�p ut']),
    descriptionIndex: idx(['description', 'name', 'payee', 'merchant', 'beskrivelse']),
    memoIndex: idx(['memo', 'notes', 'category', 'melding', 'kid', 'fakt']),
    accountIndex: idx(['account', 'account name', 'fra konto', 'til konto']),
  }
}

function field(fields: string[], index: number | undefined): string | undefined {
  if (index == null) return undefined
  if (index < 0 || index >= fields.length) return undefined
  const v = fields[index].trim()
  return v.length ? v : undefined
}

export function parseDecimal(input?: string): number | undefined {
  if (!input) return undefined
  let s = input.trim()
  if (!s) return undefined

  let isNegative = false
  if (s.startsWith('(') && s.endsWith(')')) {
    isNegative = true
    s = s.slice(1, -1)
  }

  s = s.replace(/−/g, '-')
  s = s.replace(/[ \u00A0]/g, '')
  for (const sym of ['$', '€', '£', 'NOK', 'SEK', 'DKK', 'USD', 'EUR', 'GBP']) {
    const re = new RegExp(sym, 'ig')
    s = s.replace(re, '')
  }

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '')
      s = s.replace(/,/g, '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (lastComma >= 0) {
    s = s.replace(/,/g, '.')
  }

  if (s.startsWith('+')) s = s.slice(1)
  const n = Number(s)
  if (!Number.isFinite(n)) return undefined
  return isNegative ? -n : n
}

export function parseDate(input?: string): Date | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined

  const monthMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/)
  if (monthMatch) {
    const d = Number(monthMatch[1])
    const mRaw = monthMatch[2]!.toLowerCase()
    let y = Number(monthMatch[3])
    if (y < 100) y += 2000
    const months: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    }
    const m = months[mRaw]
    if (m != null && Number.isFinite(d) && d >= 1 && d <= 31) return new Date(y, m, d)
  }

  // 1. Try explicit DMY or MDY slash formats first to avoid JS Date fallback mixing them up
  const normalized = trimmed.replace(/\./g, '/')
  
  // Strict ISO or YYYY/MM/DD
  const isoMatch = normalized.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
  }

  // DD/MM/YYYY or MM/DD/YYYY (UK/Europe preference: assume DD/MM/YYYY unless month > 12)
  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slashMatch) {
    let a = Number(slashMatch[1])
    let b = Number(slashMatch[2])
    let y = Number(slashMatch[3])
    if (y < 100) y += 2000
    
    // If first number is > 12, it MUST be DD/MM/YYYY
    if (a > 12) {
      return new Date(y, b - 1, a)
    }
    // If second number is > 12, it MUST be MM/DD/YYYY
    if (b > 12) {
      return new Date(y, a - 1, b)
    }
    // Otherwise, it's ambiguous (e.g. 05/06/2026). 
    // In Europe/UK (like Monzo/Barclays), it's DD/MM/YYYY. We'll default to DD/MM/YYYY.
    return new Date(y, b - 1, a)
  }

  // 2. Fallback to native JS parsing (handles "12 Jan 2026", etc)
  const iso = new Date(trimmed)
  if (Number.isFinite(iso.getTime())) return iso

  return undefined
}

function detectDelimiter(content: string): string {
  const candidates = [',', ';', '\t', '|']
  const counts = new Map<string, number>()
  for (const c of candidates) counts.set(c, 0)

  let inQuotes = false
  let linesSeen = 0
  for (let i = 0; i < content.length && linesSeen < 30; i++) {
    const ch = content[i]!
    if (ch === '"') {
      const next = content[i + 1]
      if (inQuotes && next === '"') {
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes) {
      if (ch === '\n') linesSeen += 1
      for (const c of candidates) {
        if (ch === c) counts.set(c, (counts.get(c) ?? 0) + 1)
      }
    }
  }

  let best = ','
  let bestCount = counts.get(best) ?? 0
  for (const c of candidates) {
    const n = counts.get(c) ?? 0
    if (n > bestCount) {
      best = c
      bestCount = n
    }
  }
  return bestCount > 0 ? best : ','
}

function parseCSV(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const delimiter = detectDelimiter(content)

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!
    if (ch === '"') {
      const next = content[i + 1]
      if (inQuotes && next === '"') {
        field += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && (ch === delimiter || ch === '\n' || ch === '\r')) {
      row.push(field)
      field = ''
      if (ch === '\n') {
        rows.push(row)
        row = []
      } else if (ch === '\r') {
        const next = content[i + 1]
        if (next === '\n') i++
        rows.push(row)
        row = []
      }
      continue
    }
    field += ch
  }
  row.push(field)
  if (row.length > 1 || row[0]?.trim()) rows.push(row)
  return rows
}
