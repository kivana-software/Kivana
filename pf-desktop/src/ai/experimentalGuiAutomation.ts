export const AI_TRANSACTIONS_AUTOMATION_EVENT = 'ai:transactions-automation'

export type TransactionsAutomationRequest = {
  kind?: 'income' | 'expense' | 'transfer'
  payee?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  taxRatePct?: number
  taxBase?: 'income' | 'expense' | 'net'
  selectAll?: boolean
  printPdf?: boolean
  useExistingSelection?: boolean
}

function normalizeDate(value: string): string | null {
  const v = value.trim()
  const m = v.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/)
  if (!m) return null
  const yyyy = m[1]
  const mm = m[2]
  const dd = m[3]
  return `${yyyy}-${mm}-${dd}`
}

function parsePercent(text: string): number | null {
  const m = text.match(/(\d{1,3}(?:[.,]\d+)?)\s*(?:%|\bpercent\b|\bpct\b)/i)
  if (!m) return null
  const n = Number(String(m[1]).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return n
}

function extractQuoted(text: string): string | null {
  const m = text.match(/"([^"]+)"|'([^']+)'/)
  const v = (m?.[1] ?? m?.[2] ?? '').trim()
  return v ? v : null
}

function extractParenthesized(text: string): string | null {
  const m = text.match(/\(([^)]+)\)/)
  const v = (m?.[1] ?? '').trim()
  return v ? v : null
}

export function parseTransactionsAutomationCommand(input: string): TransactionsAutomationRequest | null {
  const raw = input.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()

  const looksLikeTx =
    lower.includes('transaction') ||
    lower.includes('income') ||
    lower.includes('expense') ||
    lower.includes('withdraw') ||
    lower.includes('cash') ||
    lower.includes('payee') ||
    lower.includes('tax') ||
    lower.includes('print') ||
    lower.includes('select all') ||
    lower.includes('mark all') ||
    lower.startsWith('select ') ||
    lower.startsWith('take ') ||
    lower.startsWith('find ') ||
    lower.startsWith('show ')
  if (!looksLikeTx) return null

  const req: TransactionsAutomationRequest = {}

  if (/\bincome\b/.test(lower)) req.kind = 'income'
  else if (/\bexpense(s)?\b/.test(lower)) req.kind = 'expense'
  else if (/\btransfer(s)?\b/.test(lower)) req.kind = 'transfer'

  const taxPct = parsePercent(lower)
  if (taxPct != null && /\btax\b/.test(lower)) {
    req.taxRatePct = taxPct
    if (req.kind === 'income') req.taxBase = 'income'
    else if (req.kind === 'expense') req.taxBase = 'expense'
    else req.taxBase = 'net'
  }

  if (lower.includes('print') && (lower.includes('pdf') || lower.includes('save pdf'))) req.printPdf = true
  if (
    lower.includes('mark them all') ||
    lower.includes('select all') ||
    lower.includes('mark all') ||
    lower.includes('take all') ||
    lower.includes('select them') ||
    lower.includes('select these') ||
    lower.includes('mark them') ||
    lower.includes('mark these')
  ) {
    req.selectAll = true
  }
  if (
    lower.includes('what i selected') ||
    lower.includes('what i have selected') ||
    lower.includes('current selection') ||
    lower.includes('selected items') ||
    lower.includes('selected transactions')
  ) {
    req.useExistingSelection = true
  }

  const payeeFromSyntax = extractQuoted(raw) ?? extractParenthesized(raw)
  if (payeeFromSyntax && /\bfrom\b/.test(lower)) {
    req.payee = payeeFromSyntax
    if (!req.search) req.search = payeeFromSyntax
  }
  if (!req.payee) {
    const m = raw.match(/\b(?:income|expenses?|transactions?)\s+from\s+(.+?)(?:\s+from\b|\s+to\b|\s+until\b|\s+add\b|\s+tax\b|\s+mark\b|\s+print\b|$)/i)
    if (m) {
      const name = m[1].trim()
      if (name) {
        req.payee = name
        if (!req.search) req.search = name
      }
    }
  }

  const fromMatch = raw.match(/\b(?:from|since)\s+([0-9]{4}[.\-/][0-9]{2}[.\-/][0-9]{2})/i)
  const toMatch = raw.match(/\b(?:to|until)\s+([0-9]{4}[.\-/][0-9]{2}[.\-/][0-9]{2})/i)
  const from = fromMatch ? normalizeDate(fromMatch[1]) : null
  const to = toMatch ? normalizeDate(toMatch[1]) : null
  if (from) req.dateFrom = from
  if (to) req.dateTo = to

  const findMatch = raw.match(/\bfind\s+all\s+(.+?)(?:\s+from\b|\s+to\b|\s+until\b|$)/i)
  if (findMatch) {
    const q = findMatch[1].trim()
    if (q && !['income', 'incomes', 'expense', 'expenses', 'transaction', 'transactions'].includes(q.toLowerCase())) {
      req.search = q
    }
    if (!req.kind && q.toLowerCase().includes('cash') && q.toLowerCase().includes('withdraw')) req.kind = 'expense'
  } else if (lower.includes('cash') && lower.includes('withdraw')) {
    req.search = 'cash'
    if (!req.kind) req.kind = 'expense'
  }

  if (
    !req.kind &&
    !req.payee &&
    !req.search &&
    !req.dateFrom &&
    !req.dateTo &&
    req.taxRatePct == null &&
    !req.selectAll &&
    !req.printPdf
  ) {
    return null
  }

  return req
}

export function dispatchTransactionsAutomation(req: TransactionsAutomationRequest): void {
  window.dispatchEvent(new CustomEvent(AI_TRANSACTIONS_AUTOMATION_EVENT, { detail: req }))
}
