import type { Transaction, UUID } from './models'
import { parseCsvRows, parseDate, parseDecimal, rowsToTransactions } from './csvImport'
import type { CsvRow } from './csvImport'

type PdfTextItem = { str: string; hasEOL?: boolean; transform: number[] }

export type PdfImportFormat = 'auto' | 'monzo' | 'revolut-lt' | 'metro' | 'inout-table' | 'generic'

export type PdfImportOptions = {
  format?: PdfImportFormat
}

export async function convertPdfToCsvString(file: File, options?: PdfImportOptions): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const format: PdfImportFormat = options?.format ?? 'auto'
  
  type StatementPeriod = { start: Date; end: Date }
  let period: StatementPeriod | null = null
  let inferredYear: number | null = null
  let inferredStatementMonth: number | null = null

  function monthIndexFromAbbrev(input: string): number | null {
    const m = input.trim().slice(0, 3).toLowerCase()
    const map: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    }
    return map[m] ?? null
  }

  function parsePeriodFromText(text: string): StatementPeriod | null {
    const rangePatterns = [
      /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s*-\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/,
      /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s*(?:to|until|through)\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i,
      /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:to|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
    ]
    let m: RegExpMatchArray | null = null
    let slash = false
    for (const re of rangePatterns) {
      m = text.match(re)
      if (m) {
        slash = re === rangePatterns[2]
        break
      }
    }
    if (!m) return null
    const d1 = Number(m[1])
    const y1 = Number(m[3])
    const d2 = Number(m[4])
    const y2 = Number(m[6])
    const mo1 = slash ? Number(m[2]) - 1 : monthIndexFromAbbrev(m[2])
    const mo2 = slash ? Number(m[5]) - 1 : monthIndexFromAbbrev(m[5])
    if (mo1 == null || mo2 == null) return null
    if (!Number.isFinite(d1) || !Number.isFinite(y1) || !Number.isFinite(d2) || !Number.isFinite(y2)) return null
    const start = new Date(y1, mo1, d1)
    const end = new Date(y2, mo2, d2)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null
    return { start, end }
  }

  function inferYearFromText(text: string): number | null {
    const slash = text.match(/\b\d{1,2}\/\d{1,2}\/(\d{4})\b/)
    if (slash) {
      const y = Number(slash[1])
      if (Number.isFinite(y)) return y
    }
    const monthYear = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/i)
    if (monthYear) {
      const y = Number(monthYear[1])
      if (Number.isFinite(y)) return y
    }
    return null
  }

  function inferStatementAnchorFromText(text: string): { year: number; month: number } | null {
    const patterns = [
      /\byour balances on\s+\d{1,2}\s+([A-Za-z]{3,})\s+(\d{4})\b/i,
      /\bstatement\s+\d{1,2}\s+([A-Za-z]{3,})\s+(\d{4})\b/i,
      /\b(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\b/i,
    ]
    for (const re of patterns) {
      const m = text.match(re)
      if (!m) continue
      const monthToken = m[m.length - 2]!
      const yearToken = m[m.length - 1]!
      const mo = monthIndexFromAbbrev(monthToken)
      const y = Number(yearToken)
      if (mo == null || !Number.isFinite(y)) continue
      return { year: y, month: mo }
    }
    return null
  }

  function inferIsoDateFromDayMonth(input: string): string | null {
    const m = input.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{2,4}))?$/)
    if (!m) return null
    const day = Number(m[1])
    const mo = monthIndexFromAbbrev(m[2])
    const yRaw = m[3] ? Number(m[3]) : null
    if (!Number.isFinite(day) || mo == null) return null
    if (yRaw != null && Number.isFinite(yRaw)) {
      const y = yRaw < 100 ? 2000 + yRaw : yRaw
      const d = new Date(y, mo, day)
      if (!Number.isFinite(d.getTime())) return null
      return d.toISOString().slice(0, 10)
    }

    if (period) {
      const start = new Date(period.start)
      const end = new Date(period.end)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      const candidates = [period.start.getFullYear(), period.end.getFullYear(), period.start.getFullYear() + 1]
      for (const y of candidates) {
        const d = new Date(y, mo, day)
        if (d.getTime() >= start.getTime() && d.getTime() <= end.getTime()) {
          return d.toISOString().slice(0, 10)
        }
      }
      const fallback = new Date(period.start.getFullYear(), mo, day)
      if (Number.isFinite(fallback.getTime())) return fallback.toISOString().slice(0, 10)
    }

    if (inferredYear != null && Number.isFinite(inferredYear)) {
      const y = inferredStatementMonth != null && mo > inferredStatementMonth ? inferredYear - 1 : inferredYear
      const d = new Date(y, mo, day)
      if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10)
    }
    return null
  }

  function isLikelyMoney(input: string): boolean {
    const s = input.trim()
    if (!s) return false
    if (/[€£$]/.test(s)) return true
    if (/\(\s*[-−+]?\d/.test(s) && /\)/.test(s)) return true
    if (/[-−+]/.test(s) && /[.,]\d{2}\b/.test(s)) return true
    if (/[.,]\d{2}\b/.test(s)) return true
    return false
  }

  function asIsoDate(input: string): string | null {
    const dm = inferIsoDateFromDayMonth(input)
    if (dm) return dm
    const d = parseDate(input)
    if (!d) return null
    return d.toISOString().slice(0, 10)
  }

  function asIsoDateDmySlash(input: string): string | null {
    const m = String(input || '')
      .trim()
      .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!m) return null
    const day = Number(m[1])
    const month = Number(m[2])
    const year = Number(m[3])
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null
    if (day < 1 || day > 31 || month < 1 || month > 12) return null
    const d = new Date(Date.UTC(year, month - 1, day))
    if (!Number.isFinite(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }

  function normalizeHeaderToken(input: string): string {
    let s = String(input || '').trim().toLowerCase()
    if (!s) return ''
    const map: Record<string, string> = {
      ą: 'a',
      č: 'c',
      ę: 'e',
      ė: 'e',
      į: 'i',
      š: 's',
      ų: 'u',
      ū: 'u',
      ž: 'z',
    }
    s = s.replace(/[ąčęėįšųūž]/g, (m) => map[m] ?? m)
    s = s.replace(/\s+/g, ' ')
    return s
  }

  function headerHasAny(s: string, needles: string[]): boolean {
    for (const n of needles) if (s.includes(n)) return true
    return false
  }

  function findHeaderIndex(headerNorm: string[], needles: string[]): number {
    for (let i = 0; i < headerNorm.length; i++) {
      if (headerHasAny(headerNorm[i] ?? '', needles)) return i
    }
    for (let i = 0; i < headerNorm.length - 1; i++) {
      const joined = ((headerNorm[i] ?? '') + ' ' + (headerNorm[i + 1] ?? '')).trim()
      if (headerHasAny(joined, needles)) return i
    }
    for (let i = 1; i < headerNorm.length; i++) {
      const joined = ((headerNorm[i - 1] ?? '') + ' ' + (headerNorm[i] ?? '')).trim()
      if (headerHasAny(joined, needles)) return i - 1
    }
    return -1
  }

  type PositionedText = { str: string; x: number; y: number; h: number }

  function isMainDescriptionLine(input: string): boolean {
    const raw = String(input || '').trim()
    if (!raw) return false
    const s = normalizeHeaderToken(raw)
    if (!s) return false
    const headerWords = new Set([
      'date',
      'data',
      'description',
      'transaction',
      'transactions',
      'your transactions',
      'type',
      'money in',
      'money out',
      'paid in',
      'paid out',
      'balance',
      'likutis',
      'balansas',
    ])
    if (headerWords.has(s)) return false
    if (s.startsWith('kam:')) return false
    if (s.startsWith('kortele')) return false
    if (s.startsWith('kortel')) return false
    if (s.startsWith('nuroda')) return false
    if (s.startsWith('is:')) return false
    if (s.startsWith('i:')) return false
    if (s.includes('kortele:')) return false
    if (s.startsWith('reference:')) return false
    if (s.includes('this relates to a previous transaction')) return false
    return true
  }

  function groupByY(items: PositionedText[], tolerance: number): PositionedText[][] {
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
    const groups: PositionedText[][] = []
    let current: PositionedText[] = []
    let currentY: number | null = null
    for (const it of sorted) {
      if (currentY == null) {
        currentY = it.y
        current = [it]
        continue
      }
      if (Math.abs(it.y - currentY) <= tolerance) {
        current.push(it)
      } else {
        groups.push(current)
        currentY = it.y
        current = [it]
      }
    }
    if (current.length) groups.push(current)
    for (const g of groups) g.sort((a, b) => a.x - b.x)
    return groups
  }

  function mergeCharSpacedItems(items: PositionedText[]): PositionedText[] {
    if (items.length === 0) return items
    const singleChars = items.filter((it) => it.str.trim().length === 1).length
    const singleRatio = singleChars / items.length
    if (singleRatio < 0.55) return items

    const lines = groupByY(items, 2.2)
    const out: PositionedText[] = []

    for (const line of lines) {
      let runText = ''
      let runStartX = 0
      let runEndX = 0
      let runY = 0
      let runH = 0

      const flushRun = () => {
        const t = runText.trim()
        if (!t) return
        out.push({ str: t, x: runStartX, y: runY, h: runH || 0 })
      }

      for (let i = 0; i < line.length; i++) {
        const it = line[i]!
        const token = String(it.str ?? '')
        const text = token.trim()
        if (!text) continue

        const prevEndX = runEndX
        const gap = runText ? it.x - prevEndX : 0
        const canJoin = runText.length > 0 && gap <= 4.8

        if (!canJoin) {
          flushRun()
          runText = text
          runStartX = it.x
          runEndX = it.x + Math.max(1, text.length * 3)
          runY = it.y
          runH = it.h
        } else {
          runText += text
          runEndX = it.x + Math.max(1, text.length * 3)
          runY = it.y
          runH = Math.max(runH, it.h)
        }
      }
      flushRun()
      runText = ''
    }
    return out.length > 0 ? out : items
  }

  function findHeaderX(lineItems: PositionedText[], predicate: (norm: string) => boolean): number | null {
    let best: number | null = null
    for (const it of lineItems) {
      const norm = normalizeHeaderToken(it.str)
      if (!norm) continue
      if (!predicate(norm)) continue
      if (best == null || it.x < best) best = it.x
    }
    return best
  }

  function parseRevolutLtPage(items: PositionedText[]): string[][] | null {
    const lines = groupByY(items, 3.5)
    const headerLineIndex = lines.findIndex((line) => {
      const s = normalizeHeaderToken(line.map((x) => x.str).join(' '))
      const hasDate = s.includes('data') || s.includes('date')
      const hasDesc = s.includes('aprasymas') || s.includes('description')
      const hasOut = s.includes('issiusti') || s.includes('money out')
      const hasIn = s.includes('gauti') || s.includes('money in')
      const hasBal = s.includes('likutis') || s.includes('balance') || s.includes('balansas')
      return hasDate && hasDesc && hasBal && (hasOut || hasIn)
    })
    if (headerLineIndex < 0) return null

    const headerLine = lines[headerLineIndex]!
    const xDate = findHeaderX(headerLine, (s) => s === 'data' || s === 'date')
    const xDesc = findHeaderX(headerLine, (s) => s === 'aprasymas' || s.includes('description'))
    const xOut = findHeaderX(headerLine, (s) => s.includes('issiusti') || s.includes('money out') || s.includes('paid out') || s.includes('debit'))
    const xIn = findHeaderX(headerLine, (s) => s.includes('gauti') || s.includes('money in') || s.includes('paid in') || s.includes('credit'))
    const xBal = findHeaderX(headerLine, (s) => s.includes('likutis') || s.includes('balance') || s.includes('balansas'))
    if (xDate == null || xDesc == null || xOut == null || xIn == null || xBal == null) return null

    const cols = [
      { key: 'date', x: xDate },
      { key: 'desc', x: xDesc },
      { key: 'out', x: xOut },
      { key: 'in', x: xIn },
      { key: 'bal', x: xBal },
    ].sort((a, b) => a.x - b.x)
    const boundaries: number[] = []
    for (let i = 0; i < cols.length - 1; i++) boundaries.push((cols[i]!.x + cols[i + 1]!.x) / 2)

    const assignCol = (x: number) => {
      for (let i = 0; i < boundaries.length; i++) {
        if (x < boundaries[i]!) return cols[i]!.key
      }
      return cols[cols.length - 1]!.key
    }

    const rows: string[][] = []
    let carryDateIso: string | null = null
    let currentDesc: string | null = null

    for (let li = headerLineIndex + 1; li < lines.length; li++) {
      const line = lines[li]!
      const by: Record<string, PositionedText[]> = { date: [], desc: [], out: [], in: [], bal: [] }
      for (const it of line) {
        const k = assignCol(it.x)
        by[k]!.push(it)
      }
      for (const k of Object.keys(by)) by[k]!.sort((a, b) => a.x - b.x)

      const dateRaw = by.date.map((x) => x.str).join(' ').trim()
      const dateIso = dateRaw ? asIsoDate(dateRaw) : null
      if (dateIso) carryDateIso = dateIso

      const descLine = by.desc.map((x) => x.str).join(' ').trim()
      if (descLine && isMainDescriptionLine(descLine)) currentDesc = descLine

      const outRaw = by.out.map((x) => x.str).join('').trim()
      const inRaw = by.in.map((x) => x.str).join('').trim()

      const nOut = parseDecimal(outRaw)
      const nIn = parseDecimal(inRaw)
      const hasOut = nOut != null && nOut !== 0
      const hasIn = nIn != null && nIn !== 0
      if (!hasOut && !hasIn) continue
      if (!carryDateIso) continue

      const moneyOut = hasOut ? String(Math.abs(nOut!)) : ''
      const moneyIn = hasIn ? String(Math.abs(nIn!)) : ''
      const first = (currentDesc ?? descLine).trim() || 'Transaction'
      rows.push([carryDateIso, first, '', moneyOut, moneyIn, ''])
      currentDesc = null
    }

    return rows.length ? rows : null
  }

  function parseMetroBankPage(items: PositionedText[]): string[][] | null {
    const lines = groupByY(items, 3.5)
    const headerLineIndex = lines.findIndex((line) => {
      const s = normalizeHeaderToken(line.map((x) => x.str).join(' '))
      const hasDate = s.includes('date')
      const hasTxn = s.includes('transaction')
      const hasOut = s.includes('money out') || (s.includes('out') && s.includes('money'))
      const hasIn = s.includes('money in') || (s.includes('in') && s.includes('money'))
      const hasBal = s.includes('balance')
      return hasDate && hasTxn && hasOut && hasIn && hasBal
    })
    if (headerLineIndex < 0) return null

    const headerLine = lines[headerLineIndex]!
    const xDate = findHeaderX(headerLine, (s) => s === 'date')
    const xTxn = findHeaderX(headerLine, (s) => s === 'transaction')
    const xOut = findHeaderX(headerLine, (s) => s.includes('money out'))
    const xIn = findHeaderX(headerLine, (s) => s.includes('money in'))
    const xBal = findHeaderX(headerLine, (s) => s.includes('balance'))
    if (xDate == null || xTxn == null || xOut == null || xIn == null || xBal == null) return null

    const cols = [
      { key: 'date', x: xDate },
      { key: 'desc', x: xTxn },
      { key: 'out', x: xOut },
      { key: 'in', x: xIn },
      { key: 'bal', x: xBal },
    ].sort((a, b) => a.x - b.x)
    const boundaries: number[] = []
    for (let i = 0; i < cols.length - 1; i++) boundaries.push((cols[i]!.x + cols[i + 1]!.x) / 2)

    const assignCol = (x: number) => {
      for (let i = 0; i < boundaries.length; i++) {
        if (x < boundaries[i]!) return cols[i]!.key
      }
      return cols[cols.length - 1]!.key
    }

    const rows: string[][] = []
    let carryDateIso: string | null = null
    let currentMain: string | null = null
    let currentNotes: string[] = []

    const flush = (outRaw: string, inRaw: string) => {
      const nOut = parseDecimal(outRaw)
      const nIn = parseDecimal(inRaw)
      const hasOut = nOut != null && nOut !== 0
      const hasIn = nIn != null && nIn !== 0
      if (!hasOut && !hasIn) return
      if (!carryDateIso) return
      const moneyOut = hasOut ? String(Math.abs(nOut!)) : ''
      const moneyIn = hasIn ? String(Math.abs(nIn!)) : ''
      const desc = (currentMain ?? '').trim()
      const notes = currentNotes.join(' ').trim()
      const first = desc || notes || 'Transaction'
      rows.push([carryDateIso, first, notes && first !== notes ? notes : '', moneyOut, moneyIn, ''])
      currentMain = null
      currentNotes = []
    }

    for (let li = headerLineIndex + 1; li < lines.length; li++) {
      const line = lines[li]!
      const by: Record<string, PositionedText[]> = { date: [], desc: [], out: [], in: [], bal: [] }
      for (const it of line) {
        const k = assignCol(it.x)
        by[k]!.push(it)
      }
      for (const k of Object.keys(by)) by[k]!.sort((a, b) => a.x - b.x)

      const dateRaw = by.date.map((x) => x.str).join(' ').trim()
      const dateIso = dateRaw ? asIsoDate(dateRaw) : null
      if (dateIso) carryDateIso = dateIso

      const descLine = by.desc.map((x) => x.str).join(' ').trim()
      const normDesc = normalizeHeaderToken(descLine)
      if (normDesc.includes('balance brought forward')) continue

      if (descLine) {
        if (!currentMain && isMainDescriptionLine(descLine)) currentMain = descLine
        else currentNotes.push(descLine)
      }

      const outRaw = by.out.map((x) => x.str).join('').trim()
      const inRaw = by.in.map((x) => x.str).join('').trim()

      const nOut = parseDecimal(outRaw)
      const nIn = parseDecimal(inRaw)
      const hasMoney = (nOut != null && nOut !== 0) || (nIn != null && nIn !== 0)
      if (hasMoney) flush(outRaw, inRaw)
    }

    return rows.length ? rows : null
  }

  function parseInOutTablePage(items: PositionedText[]): string[][] | null {
    const prepared0 = mergeCharSpacedItems(items)
    const hasRightPanelNoise = prepared0.some((it) => {
      const s = normalizeHeaderToken(it.str)
      return s.includes('average credit') || s.includes('average debit') || s.includes('receiving an') || s.includes('international payment')
    })
    const prepared = hasRightPanelNoise ? prepared0.filter((it) => it.x < 470) : prepared0
    const lines = groupByY(prepared, 3.5)
    const headerLineIndex = lines.findIndex((line) => {
      const s = normalizeHeaderToken(line.map((x) => x.str).join(' '))
      const hasDate = s.includes('date') || s.includes('data')
      const hasDesc = s.includes('description') || s.includes('transaction') || s.includes('aprasymas')
      const hasOut = s.includes('money out') || s.includes('paid out') || /\bout\b/.test(s)
      const hasIn = s.includes('money in') || s.includes('paid in') || /\bin\b/.test(s)
      const hasBal = s.includes('balance') || s.includes('likutis') || s.includes('balansas')
      return hasDate && hasDesc && hasOut && hasIn && hasBal
    })
    if (headerLineIndex < 0) return null

    const headerLine = lines[headerLineIndex]!
    const xDate = findHeaderX(headerLine, (s) => s === 'date' || s === 'data')
    const xDesc = findHeaderX(headerLine, (s) => s === 'transaction' || s === 'description' || s === 'aprasymas' || s.includes('description'))
    const xType = findHeaderX(headerLine, (s) => s === 'type')
    const xOut = findHeaderX(headerLine, (s) => s.includes('money out') || s.includes('paid out') || s === 'out' || /\bout\b/.test(s))
    const xIn = findHeaderX(headerLine, (s) => s.includes('money in') || s.includes('paid in') || s === 'in' || /\bin\b/.test(s))
    const xBal = findHeaderX(headerLine, (s) => s.includes('balance') || s.includes('likutis') || s.includes('balansas'))
    if (xDate == null || xDesc == null || xOut == null || xIn == null || xBal == null) return null

    const cols = [
      { key: 'date', x: xDate },
      { key: 'desc', x: xDesc },
      ...(xType != null ? [{ key: 'type' as const, x: xType }] : []),
      { key: 'out', x: xOut },
      { key: 'in', x: xIn },
      { key: 'bal', x: xBal },
    ].sort((a, b) => a.x - b.x)
    const boundaries: number[] = []
    for (let i = 0; i < cols.length - 1; i++) boundaries.push((cols[i]!.x + cols[i + 1]!.x) / 2)

    const outIdx = cols.findIndex((c) => c.key === 'out')
    const inIdx = cols.findIndex((c) => c.key === 'in')
    if (outIdx >= 0 && inIdx === outIdx + 1) {
      boundaries[outIdx] = cols[inIdx]!.x - 8
    }

    const assignCol = (x: number) => {
      for (let i = 0; i < boundaries.length; i++) {
        if (x < boundaries[i]!) return cols[i]!.key
      }
      return cols[cols.length - 1]!.key
    }

    const rows: string[][] = []
    let carryDateIso: string | null = null
    let currentMain: string | null = null
    let currentNotes: string[] = []

    const appendNotesToLastRow = (parts: string[]) => {
      const text = parts.map((p) => p.trim()).filter((p) => p.length > 0).join(' ').trim()
      if (!text) return
      const last = rows[rows.length - 1]
      if (!last) return
      const existing = String(last[2] ?? '').trim()
      last[2] = existing ? `${existing} ${text}`.trim() : text
    }

    const flush = (outRaw: string, inRaw: string) => {
      const nOut = parseDecimal(outRaw)
      const nIn = parseDecimal(inRaw)
      const hasOut = nOut != null && nOut !== 0
      const hasIn = nIn != null && nIn !== 0
      if (!hasOut && !hasIn) return
      if (!carryDateIso) return
      const moneyOut = hasOut ? String(Math.abs(nOut!)) : ''
      const moneyIn = hasIn ? String(Math.abs(nIn!)) : ''
      const desc = (currentMain ?? '').trim()
      const notes = currentNotes.join(' ').trim()
      const first = desc || notes || 'Transaction'
      rows.push([carryDateIso, first, notes && first !== notes ? notes : '', moneyOut, moneyIn, ''])
      currentMain = null
      currentNotes = []
    }

    const isHeaderRow = (dateRaw: string, descRaw: string, typeRaw: string, outRaw: string, inRaw: string) => {
      const d = normalizeHeaderToken(dateRaw)
      const de = normalizeHeaderToken(descRaw)
      const t = normalizeHeaderToken(typeRaw)
      const o = normalizeHeaderToken(outRaw)
      const i = normalizeHeaderToken(inRaw)
      if (d === 'date' && de === 'description') return true
      if (d === 'date' && de === 'transaction') return true
      if (de === 'description' && (t === 'type' || o.includes('money out') || i.includes('money in'))) return true
      if (o.includes('money in') || i.includes('money out')) return true
      return false
    }

    const cleanCell = (s: string) => {
      let v = String(s || '').trim()
      v = v.replace(/^\\.+\\s*/, '').replace(/\\s*\\.+$/, '').trim()
      v = v.replace(/\\s+/g, ' ').trim()
      return v
    }

    for (let li = headerLineIndex + 1; li < lines.length; li++) {
      const line = lines[li]!
      const by: Record<string, PositionedText[]> = { date: [], desc: [], type: [], out: [], in: [], bal: [] }
      for (const it of line) {
        const k = assignCol(it.x)
        by[k]!.push(it)
      }
      for (const k of Object.keys(by)) by[k]!.sort((a, b) => a.x - b.x)

      const dateRaw = cleanCell(by.date.map((x) => x.str).join(' '))
      const dateCandidate = dateRaw.replace(/^(\d{1,2})([A-Za-z]{3,})$/, '$1 $2')
      const looksLikeDate = /(\d{1,2}\s*[A-Za-z]{3,}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2})/.test(dateCandidate)
      const dateIso = looksLikeDate ? asIsoDate(dateCandidate) : null
      if (dateIso) carryDateIso = dateIso

      const descLine = cleanCell(by.desc.map((x) => x.str).join(' '))
      const typeLine = cleanCell(by.type.map((x) => x.str).join(' '))
      const normDesc = normalizeHeaderToken(descLine)
      if (normDesc.includes('balance brought forward')) continue
      if (normDesc.includes('balance from statement')) continue
      if (isHeaderRow(dateRaw, descLine, typeLine, by.out.map((x) => x.str).join(' '), by.in.map((x) => x.str).join(' '))) continue

      const outRaw = cleanCell(by.out.map((x) => x.str).join(''))
      const inRaw = cleanCell(by.in.map((x) => x.str).join(''))
      const hasMoney = (parseDecimal(outRaw) != null && parseDecimal(outRaw) !== 0) || (parseDecimal(inRaw) != null && parseDecimal(inRaw) !== 0)
      const hasDateOnThisLine = Boolean(dateIso)

      // Revolut/UK-style statements often put "tiny" extra lines under the main row (From:, Fee:, etc)
      // with no date and no money values. Those should attach to the previous transaction, not start a new one.
      if (!hasMoney && !hasDateOnThisLine && !currentMain && currentNotes.length === 0 && rows.length > 0 && descLine) {
        appendNotesToLastRow([descLine, typeLine])
        continue
      }

      if (descLine) {
        if (!currentMain) currentMain = descLine
        else currentNotes.push(descLine)
      }
      if (typeLine) currentNotes.push(typeLine)

      if (hasMoney) flush(outRaw, inRaw)
    }

    return rows.length ? rows : null
  }

  function parseMonzoBankPage(items: PositionedText[]): string[][] | null {
    const lines = groupByY(items, 3.5)
    const headerLineIndex = lines.findIndex((line) => {
      const s = normalizeHeaderToken(line.map((x) => x.str).join(' '))
      const hasDate = s.includes('date')
      const hasDesc = s.includes('description')
      const hasAmount = s.includes('amount')
      const hasBal = s.includes('balance')
      return hasDate && hasDesc && hasAmount && hasBal && !s.includes('money out') && !s.includes('paid out')
    })
    if (headerLineIndex < 0) return null

    const headerLine = lines[headerLineIndex]!
    const xDate = findHeaderX(headerLine, (s) => s === 'date')
    const xDesc = findHeaderX(headerLine, (s) => s === 'description')
    const xAmount = findHeaderX(headerLine, (s) => s.includes('amount'))
    const xBal = findHeaderX(headerLine, (s) => s.includes('balance'))
    if (xDate == null || xDesc == null || xAmount == null || xBal == null) return null

    const cols = [
      { key: 'date', x: xDate },
      { key: 'desc', x: xDesc },
      { key: 'amount', x: xAmount },
      { key: 'bal', x: xBal },
    ].sort((a, b) => a.x - b.x)
    const boundaries: number[] = []
    for (let i = 0; i < cols.length - 1; i++) boundaries.push((cols[i]!.x + cols[i + 1]!.x) / 2)

    const assignCol = (x: number) => {
      for (let i = 0; i < boundaries.length; i++) {
        if (x < boundaries[i]!) return cols[i]!.key
      }
      return cols[cols.length - 1]!.key
    }

    const cleanCell = (s: string) => {
      let v = String(s || '').trim()
      v = v.replace(/^\.+\s*/, '').replace(/\s*\.+$/, '').trim()
      v = v.replace(/\s+/g, ' ').trim()
      return v
    }

    const isHeaderRow = (dateRaw: string, descRaw: string, amtRaw: string) => {
      const d = normalizeHeaderToken(dateRaw)
      const de = normalizeHeaderToken(descRaw)
      const a = normalizeHeaderToken(amtRaw)
      if (d === 'date' && de === 'description') return true
      if (a.includes('amount') && de === 'description') return true
      return false
    }

    const out: string[][] = []
    let lastDateIso: string | null = null
    type PendingTx = { dateIso: string; descLines: string[] }
    let pending: PendingTx | null = null
    type PendingAmount = { dateIso: string; amtRaw: string; descLines: string[] }
    let pendingAmount: PendingAmount | null = null

    const isSectionHeadingLine = (input: string) => {
      const norm = normalizeHeaderToken(input)
      if (!norm) return true
      if (norm === 'transactions') return true
      if (norm === 'your transactions') return true
      return false
    }

    const appendNoteToLast = (note: string) => {
      const n = note.trim()
      if (!n) return
      const last = out[out.length - 1]
      if (!last) return
      const existing = String(last[2] ?? '').trim()
      if (!existing) {
        last[2] = n
        return
      }
      const joined = `${existing} ${n}`.trim()
      last[2] = joined
    }

    const isSmallDetailLine = (input: string) => {
      const norm = normalizeHeaderToken(input)
      if (!norm) return true
      if (norm.startsWith('reference:')) return true
      if (norm.includes('this relates to a previous transaction')) return true
      if (norm.startsWith('ref')) return true
      if (norm.startsWith('mf')) return true
      if (norm.startsWith('kid')) return true
      if (norm.startsWith('card')) return true
      if (norm.startsWith('kam:')) return true
      if (norm.startsWith('nuroda')) return true
      return false
    }

    const finalizePendingWithAmount = (dateIso: string, amtRaw: string, extraDesc: string) => {
      const nAmt = parseDecimal(amtRaw)
      if (nAmt == null || nAmt === 0) return
      const desc = cleanCell(extraDesc)
      const descLines = pending ? [...pending.descLines] : []
      if (desc) descLines.push(desc)
      const combinedDesc = cleanCell(descLines.filter((x) => x.length > 0).filter((x) => !isSectionHeadingLine(x)).join(' '))
      pushTx(dateIso, combinedDesc, amtRaw, [])
    }

    const flushPendingAmount = () => {
      if (!pendingAmount) return
      const combinedDesc = cleanCell(
        pendingAmount.descLines
          .map((x) => cleanCell(x))
          .filter((x) => x.length > 0)
          .filter((x) => !isSectionHeadingLine(x))
          .join(' '),
      )
      pushTx(pendingAmount.dateIso, combinedDesc, pendingAmount.amtRaw, [])
      pendingAmount = null
    }

    const pushTx = (dateIso: string, descLine: string, amtRaw: string, extraNotes: string[]) => {
      const nAmt = parseDecimal(amtRaw)
      if (nAmt == null || nAmt === 0) return
      const isOut = amtRaw.includes('-') || amtRaw.includes('−') || nAmt < 0
      const val = Math.abs(nAmt)
      const moneyOut = isOut ? String(val) : ''
      const moneyIn = !isOut ? String(val) : ''

      const cleaned = [descLine, ...extraNotes]
        .map((x) => cleanCell(x))
        .filter((x) => x.length > 0)
        .filter((x) => !isSectionHeadingLine(x))
      const mainLines = cleaned.filter((x) => isMainDescriptionLine(x))
      const main = mainLines.length > 0 ? mainLines.join(' ') : cleaned[0] ?? ''
      const notes = cleaned
        .filter((x) => !mainLines.includes(x))
        .join(' ')
        .trim()

      const first = main.trim() || notes || 'Transaction'
      out.push([dateIso, first, notes && first !== notes ? notes : '', moneyOut, moneyIn, ''])
    }

    for (let li = headerLineIndex + 1; li < lines.length; li++) {
      const line = lines[li]!
      const by: Record<string, PositionedText[]> = { date: [], desc: [], amount: [], bal: [] }
      for (const it of line) {
        const k = assignCol(it.x)
        by[k]!.push(it)
      }
      for (const k of Object.keys(by)) by[k]!.sort((a, b) => a.x - b.x)

      const dateRaw = cleanCell(by.date.map((x) => x.str).join(' '))
      const dateIso = dateRaw ? (asIsoDateDmySlash(dateRaw) ?? asIsoDate(dateRaw)) : null
      if (dateIso) lastDateIso = dateIso

      const descLineRaw = cleanCell(by.desc.map((x) => x.str).join(' '))
      const amtRaw = cleanCell(by.amount.map((x) => x.str).join(''))

      if (isHeaderRow(dateRaw, descLineRaw, amtRaw)) continue

      const nAmt = parseDecimal(amtRaw)
      const hasAmount = nAmt != null && nAmt !== 0

      const effectiveDate: string | null = dateIso ?? lastDateIso ?? null

      const dateExtras = cleanCell(
        by.date
          .map((x) => cleanCell(x.str))
          .filter((s) => s.length > 0)
          .filter((s) => asIsoDateDmySlash(s) == null && asIsoDate(s) == null)
          .join(' '),
      )

      const balanceExtras = cleanCell(
        by.bal
          .map((x) => cleanCell(x.str))
          .filter((s) => s.length > 0)
          .filter((s) => parseDecimal(s) == null)
          .join(' '),
      )

      const amountExtras = cleanCell(
        by.amount
          .map((x) => cleanCell(x.str))
          .filter((s) => s.length > 0)
          .filter((s) => parseDecimal(s) == null)
          .join(' '),
      )

      let descLine = cleanCell([descLineRaw, dateExtras, amountExtras, balanceExtras].filter((x) => x.length > 0).join(' '))
      if (!descLine && hasAmount) {
        const allText = cleanCell(
          [...by.desc, ...by.date, ...by.amount, ...by.bal]
            .map((x) => cleanCell(x.str))
            .filter((s) => s.length > 0)
            .filter((s) => parseDecimal(s) == null)
            .filter((s) => asIsoDateDmySlash(s) == null && asIsoDate(s) == null)
            .join(' '),
        )
        descLine = allText
      }

      if (descLine && isSectionHeadingLine(descLine)) {
        pending = null
        pendingAmount = null
        continue
      }

      if (hasAmount && effectiveDate) {
        flushPendingAmount()
        if (pending && pending.dateIso === effectiveDate) {
          finalizePendingWithAmount(effectiveDate, amtRaw, descLine)
          pending = null
        } else {
          if (descLine) {
            pushTx(effectiveDate, descLine, amtRaw, [])
          } else {
            pendingAmount = { dateIso: effectiveDate, amtRaw, descLines: [] }
          }
        }
        continue
      }

      if (!descLine) continue

      if (pendingAmount && effectiveDate && pendingAmount.dateIso === effectiveDate) {
        pendingAmount.descLines.push(descLine)
        continue
      }

      if (isSmallDetailLine(descLine)) {
        if (pending) pending.descLines.push(descLine)
        else appendNoteToLast(descLine)
        continue
      }

      if (!dateIso && effectiveDate && out.length > 0) {
        appendNoteToLast(descLine)
        continue
      }

      // Start/continue a pending transaction description until we see its amount.
      if (!effectiveDate) continue
      if (dateIso) {
        // New row started; don't blend with previous pending.
        pending = { dateIso: effectiveDate, descLines: [descLine] }
      } else if (!pending) {
        pending = { dateIso: effectiveDate, descLines: [descLine] }
      } else {
        pending.descLines.push(descLine)
      }
    }

    flushPendingAmount()
    return out.length ? out : null
  }

  function findHeaderIndexSplit(headerNorm: string[], leftNeedles: string[], rightNeedles: string[]): number {
    for (let i = 0; i < headerNorm.length - 1; i++) {
      const a = headerNorm[i] ?? ''
      const b = headerNorm[i + 1] ?? ''
      if (headerHasAny(a, leftNeedles) && headerHasAny(b, rightNeedles)) return i
    }
    return -1
  }

  function buildTransactionsCsvFromMappedRows(mappedRows: string[][]): string[][] {
    const rows = mappedRows.filter((r) => r.some((c) => c.trim().length > 0))
    if (rows.length === 0) return []
    const width = Math.max(...rows.map((r) => r.length))
    const sample = rows.slice(0, 250)

    const scores = Array.from({ length: width }, () => ({ date: 0, money: 0, text: 0 }))
    for (const r of sample) {
      for (let i = 0; i < width; i++) {
        const v = (r[i] ?? '').trim()
        if (!v) continue
        if (asIsoDate(v)) scores[i]!.date += 1
        if (isLikelyMoney(v) && parseDecimal(v) != null) scores[i]!.money += 1
        if (/[A-Za-z]/.test(v) && v.length >= 3) scores[i]!.text += 1
      }
    }

    const pickBest = (key: 'date' | 'money' | 'text', exclude: Set<number>) => {
      let best = -1
      let bestScore = -1
      for (let i = 0; i < width; i++) {
        if (exclude.has(i)) continue
        const sc = scores[i]![key]
        if (sc > bestScore) {
          bestScore = sc
          best = i
        }
      }
      return bestScore > 0 ? best : -1
    }

    const used = new Set<number>()
    const dateCol = pickBest('date', used)
    if (dateCol >= 0) used.add(dateCol)

    const moneyColsAll: number[] = []
    for (let i = 0; i < width; i++) {
      if (scores[i]!.money > 0) moneyColsAll.push(i)
    }

    const descCol = pickBest('text', used)

    if (dateCol < 0 || descCol < 0) return []
    if (moneyColsAll.length === 0) return []

    const moneyStats = new Map<number, { fill: number; count: number }>()
    for (const i of moneyColsAll) moneyStats.set(i, { fill: 0, count: 0 })

    for (const r of rows) {
      for (const i of moneyColsAll) {
        const v = (r[i] ?? '').trim()
        if (!v) continue
        const n = parseDecimal(v)
        if (n == null) continue
        const s = moneyStats.get(i)
        if (!s) continue
        s.count += 1
      }
    }

    for (const i of moneyColsAll) {
      const s = moneyStats.get(i)!
      s.fill = rows.length ? s.count / rows.length : 0
    }

    let balCol = -1
    if (moneyColsAll.length >= 2) {
      let bestFill = -1
      let bestIdx = -1
      for (const i of moneyColsAll) {
        const f = moneyStats.get(i)!.fill
        if (f > bestFill || (f === bestFill && i > bestIdx)) {
          bestFill = f
          bestIdx = i
        }
      }
      if (bestFill >= 0.6) balCol = bestIdx
    }

    type Entry = {
      dateIso: string
      dateObj: Date
      desc: string
      byCol: Map<number, string>
      bal: number | null
      balRaw: string
    }

    const entries: Entry[] = []
    for (const r of rows) {
      const dateRaw = (r[dateCol] ?? '').trim()
      const descRaw = (r[descCol] ?? '').trim()
      const iso = dateRaw ? asIsoDate(dateRaw) : null
      if (!iso) continue
      const d = new Date(iso + 'T00:00:00Z')
      if (!Number.isFinite(d.getTime())) continue
      const byCol = new Map<number, string>()
      for (const i of moneyColsAll) {
        const v = (r[i] ?? '').trim()
        if (v) byCol.set(i, v)
      }
      const balRaw = balCol >= 0 ? (r[balCol] ?? '').trim() : ''
      const bal = balCol >= 0 ? (parseDecimal(balRaw) ?? null) : null
      entries.push({ dateIso: iso, dateObj: d, desc: descRaw, byCol, bal, balRaw })
    }

    if (entries.length === 0) return []

    entries.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())

    const tol = 0.05
    const debitScore = new Map<number, number>()
    const creditScore = new Map<number, number>()
    for (const i of moneyColsAll) {
      if (i === balCol) continue
      debitScore.set(i, 0)
      creditScore.set(i, 0)
    }

    if (balCol >= 0) {
      for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1]!
        const cur = entries[i]!
        if (prev.bal == null || cur.bal == null) continue
        const delta = cur.bal - prev.bal
        if (Math.abs(delta) < tol) continue
        for (const col of moneyColsAll) {
          if (col === balCol) continue
          const raw = cur.byCol.get(col) ?? ''
          const n = raw ? parseDecimal(raw) : null
          if (n == null) continue
          const v = Math.abs(n)
          if (delta < 0) {
            if (Math.abs(v - Math.abs(delta)) <= tol) {
              debitScore.set(col, (debitScore.get(col) ?? 0) + 1)
            }
          } else if (delta > 0) {
            if (Math.abs(v - Math.abs(delta)) <= tol) {
              creditScore.set(col, (creditScore.get(col) ?? 0) + 1)
            }
          }
        }
      }
    }

    const remaining = moneyColsAll.filter((c) => c !== balCol)

    const pickBestCol = (m: Map<number, number>, exclude: Set<number>) => {
      let best = -1
      let bestScore = -1
      for (const [k, v] of m.entries()) {
        if (exclude.has(k)) continue
        if (v > bestScore) {
          bestScore = v
          best = k
        }
      }
      return bestScore > 0 ? best : -1
    }

    const usedMoney = new Set<number>()
    let outCol = pickBestCol(debitScore, usedMoney)
    if (outCol >= 0) usedMoney.add(outCol)
    let inCol = pickBestCol(creditScore, usedMoney)
    if (inCol >= 0) usedMoney.add(inCol)

    if (outCol < 0 && inCol < 0) {
      const sorted = remaining
        .map((c) => ({ c, fill: moneyStats.get(c)!.fill }))
        .sort((a, b) => a.fill - b.fill || a.c - b.c)
        .map((x) => x.c)
      outCol = sorted[0] ?? -1
      inCol = sorted[1] ?? -1
    } else if (outCol < 0 && remaining.length > 0) {
      outCol = remaining[0]!
      if (outCol === inCol) outCol = remaining.find((c) => c !== inCol) ?? outCol
    } else if (inCol < 0 && remaining.length > 0) {
      inCol = remaining.find((c) => c !== outCol) ?? -1
    }

    if (outCol < 0) return []

    const out: string[][] = [['Date', 'Description', 'Notes', 'Money out', 'Money in', 'Balance']]

    const balanceByDate = new Map<string, number>()
    if (balCol >= 0) {
      for (const e of entries) {
        if (e.bal != null) balanceByDate.set(e.dateIso + '|' + e.desc, e.bal)
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!
      const prev = i > 0 ? entries[i - 1]! : null
      const delta = prev?.bal != null && e.bal != null ? e.bal - prev.bal : null

      const outRaw = outCol >= 0 ? (e.byCol.get(outCol) ?? '').trim() : ''
      const inRaw = inCol >= 0 ? (e.byCol.get(inCol) ?? '').trim() : ''
      const balRaw = e.balRaw

      let moneyOut = ''
      let moneyIn = ''

      const nOut = outRaw ? parseDecimal(outRaw) : null
      const nIn = inRaw ? parseDecimal(inRaw) : null

      if (inCol >= 0 && (nOut != null || nIn != null)) {
        if (nOut != null && nOut !== 0) moneyOut = String(Math.abs(nOut))
        if (nIn != null && nIn !== 0) moneyIn = String(Math.abs(nIn))
        if (!moneyOut && !moneyIn && delta != null) {
          const v = nOut != null ? Math.abs(nOut) : nIn != null ? Math.abs(nIn) : 0
          if (v) {
            if (delta < 0) moneyOut = String(v)
            else if (delta > 0) moneyIn = String(v)
          }
        }
      } else {
        const n = nOut
        if (n == null || n === 0) continue
        const v = Math.abs(n)
        if (delta != null) {
          if (delta < 0) moneyOut = String(v)
          else if (delta > 0) moneyIn = String(v)
          else continue
        } else if (n < 0) {
          moneyOut = String(v)
        } else {
          moneyIn = String(v)
        }
      }

      if (!moneyOut && !moneyIn) continue

      const first = e.desc || 'Transaction'
      out.push([e.dateIso, first, '', moneyOut, moneyIn, balRaw])
    }

    return out.length > 1 ? out : []
  }

  let csvRows: string[][] = []
  let barclaysHeaderAdded = false

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    
    // Filter and normalize items
    const items = (content.items as PdfTextItem[]).filter(it => it.str.trim().length > 0)
    if (items.length === 0) continue

    const positioned: PositionedText[] = items.map((it) => ({
      str: it.str,
      x: it.transform[4] ?? 0,
      y: it.transform[5] ?? 0,
      h: Math.abs(it.transform[3] ?? 0),
    }))

    const addWithHeader = (rows: string[][]) => {
      if (!barclaysHeaderAdded) {
        csvRows.push(['Date', 'Description', 'Notes', 'Money out', 'Money in', 'Balance'])
        barclaysHeaderAdded = true
      }
      csvRows.push(...rows)
    }

    const tryParser = (rows: string[][] | null) => {
      if (!rows || rows.length === 0) return false
      addWithHeader(rows)
      return true
    }

    if (format === 'inout-table' || format === 'auto') {
      const inOutTable = parseInOutTablePage(positioned)
      if (tryParser(inOutTable)) continue
    }

    if (format === 'metro' || format === 'auto') {
      const metro = parseMetroBankPage(positioned)
      if (tryParser(metro)) continue
    }

    if (format === 'revolut-lt' || format === 'auto') {
      const revolut = parseRevolutLtPage(positioned)
      if (tryParser(revolut)) continue
    }

    if (format === 'monzo' || format === 'auto') {
      const monzo = parseMonzoBankPage(positioned)
      if (tryParser(monzo)) continue
    }

    const pageText = items.map((it) => it.str).join(' ')
    if (!period) {
      const found = parsePeriodFromText(pageText)
      if (found) period = found
    }
    if (!inferredYear) {
      const y = inferYearFromText(pageText)
      if (y) inferredYear = y
    }
    if (inferredStatementMonth == null) {
      const anchor = inferStatementAnchorFromText(pageText)
      if (anchor) {
        inferredYear = inferredYear ?? anchor.year
        inferredStatementMonth = anchor.month
      }
    }

    // Group items by Y coordinate (rounded to nearest 4 pixels to account for slight misalignment)
    // In PDF coordinates, Y = transform[5]. We sort descending because Y increases upwards.
    items.sort((a, b) => b.transform[5] - a.transform[5])
    
    const rows: PdfTextItem[][] = []
    let currentRow: PdfTextItem[] = []
    let currentY = items[0].transform[5]

    for (const item of items) {
      if (Math.abs(item.transform[5] - currentY) <= 4) {
        currentRow.push(item)
      } else {
        rows.push(currentRow)
        currentRow = [item]
        currentY = item.transform[5]
      }
    }
    if (currentRow.length > 0) rows.push(currentRow)

    // Collect all X coordinates across the page to determine columns
    const xs = items.map(it => it.transform[4]).sort((a, b) => a - b)
    const columns: number[] = []
    let currentCluster: number[] = []
    const xTolerance = 15 // pixels

    for (const x of xs) {
      if (currentCluster.length === 0) {
        currentCluster.push(x)
      } else {
        const avg = currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length
        if (Math.abs(x - avg) <= xTolerance) {
          currentCluster.push(x)
        } else {
          columns.push(currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length)
          currentCluster = [x]
        }
      }
    }
    if (currentCluster.length > 0) {
      columns.push(currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length)
    }

    const mappedRows: string[][] = []
    // Now for each row, map items to columns
    for (const rowItems of rows) {
      const rowStrings = new Array(columns.length).fill('')
      
      for (const item of rowItems) {
        const x = item.transform[4]
        // Find closest column
        let closestIdx = 0
        let minDiff = Infinity
        for (let i = 0; i < columns.length; i++) {
          const diff = Math.abs(x - columns[i])
          if (diff < minDiff) {
            minDiff = diff
            closestIdx = i
          }
        }
        
        // Append text if column already has text
        if (rowStrings[closestIdx]) {
          rowStrings[closestIdx] += ' ' + item.str.trim()
        } else {
          rowStrings[closestIdx] = item.str.trim()
        }
      }
      
      // Trim all columns and filter out completely empty rows
      const trimmed = rowStrings.map(s => s.trim())
      if (trimmed.some(s => s.length > 0)) {
        mappedRows.push(trimmed)
      }
    }

    const headerRowIndex = mappedRows.findIndex((r) => {
      const s = normalizeHeaderToken(r.join(' '))
      const hasDate = headerHasAny(s, ['date', 'transaction date', 'posted date', 'data', 'operacijos data'])
      const hasDesc = headerHasAny(s, ['description', 'details', 'merchant', 'name', 'payee', 'aprasymas', 'pavadinimas', 'mokejimo paskirtis', 'paskirtis'])
      const hasOut = headerHasAny(s, ['money out', 'paid out', 'debit', 'issiusti pinigai', 'issiusti', 'is siusti'])
      const hasIn = headerHasAny(s, ['money in', 'paid in', 'credit', 'gauti pinigai', 'gauti'])
      return hasDate && hasDesc && (hasOut || hasIn)
    })

    if (headerRowIndex >= 0) {
      const header = mappedRows[headerRowIndex]
      const headerNorm = header.map((c) => normalizeHeaderToken(c))
      const dateCol = findHeaderIndex(headerNorm, ['date', 'data', 'operacijos data'])
      const descCol = findHeaderIndex(headerNorm, [
        'description',
        'details',
        'merchant',
        'name',
        'payee',
        'aprasymas',
        'pavadinimas',
        'mokejimo paskirtis',
        'paskirtis',
      ])
      const outCol = (() => {
        const direct = findHeaderIndex(headerNorm, ['money out', 'paid out', 'debit', 'issiusti pinigai', 'issiusti', 'is siusti'])
        if (direct >= 0) return direct
        return findHeaderIndexSplit(headerNorm, ['issiusti', 'is siusti'], ['pinigai'])
      })()
      const inCol = (() => {
        const direct = findHeaderIndex(headerNorm, ['money in', 'paid in', 'credit', 'gauti pinigai', 'gauti'])
        if (direct >= 0) return direct
        return findHeaderIndexSplit(headerNorm, ['gauti'], ['pinigai'])
      })()
      const balCol = findHeaderIndex(headerNorm, ['balance', 'likutis', 'balansas'])

      const hasTwoMoneyCols = dateCol >= 0 && descCol >= 0 && outCol >= 0 && inCol >= 0

      if (hasTwoMoneyCols) {
        if (!barclaysHeaderAdded) {
          csvRows.push(['Date', 'Description', 'Notes', 'Money out', 'Money in', 'Balance'])
          barclaysHeaderAdded = true
        }

        const scan = mappedRows.slice(headerRowIndex + 1, headerRowIndex + 1 + 250)
        const isNonZeroMoney = (v: string) => {
          const n = parseDecimal(v)
          return n != null && n !== 0
        }
        const scoreMoneyCol = (idx: number) => {
          let c = 0
          for (const r of scan) if (isNonZeroMoney(r[idx] ?? '')) c += 1
          return c
        }
        const bestMoneyCol = (center: number, forbidden: Set<number>) => {
          let best = -1
          let bestScore = -1
          let bestDist = Number.POSITIVE_INFINITY
          const start = Math.max(0, center - 2)
          const end = Math.min(header.length - 1, center + 2)
          for (let i = start; i <= end; i++) {
            if (forbidden.has(i)) continue
            const sc = scoreMoneyCol(i)
            if (sc <= 0) continue
            const dist = Math.abs(i - center)
            if (sc > bestScore || (sc === bestScore && dist < bestDist)) {
              bestScore = sc
              best = i
              bestDist = dist
            }
          }
          return best
        }

        const forbiddenBase = new Set<number>()
        forbiddenBase.add(dateCol)
        forbiddenBase.add(descCol)

        const fillRatio = (idx: number) => (scan.length ? scoreMoneyCol(idx) / scan.length : 0)
        const candidateMoneyCols: number[] = []
        for (let i = 0; i < header.length; i++) {
          if (forbiddenBase.has(i)) continue
          if (scoreMoneyCol(i) > 0) candidateMoneyCols.push(i)
        }
        const balColActual = (() => {
          let best = -1
          let bestScore = -1
          for (const i of candidateMoneyCols) {
            const sc = scoreMoneyCol(i)
            if (sc > bestScore || (sc === bestScore && i > best)) {
              bestScore = sc
              best = i
            }
          }
          if (best >= 0 && fillRatio(best) >= 0.6) return best
          return balCol >= 0 ? balCol : best
        })()

        const forbiddenMoney = new Set(forbiddenBase)
        if (balColActual >= 0) forbiddenMoney.add(balColActual)

        let outColActual = bestMoneyCol(outCol, forbiddenMoney)
        const forbiddenIn = new Set(forbiddenMoney)
        if (outColActual >= 0) forbiddenIn.add(outColActual)
        let inColActual = bestMoneyCol(inCol, forbiddenIn)

        if (outColActual < 0 || inColActual < 0 || outColActual === inColActual || outColActual > inColActual) {
          const byX = candidateMoneyCols.filter((i) => i !== balColActual).sort((a, b) => a - b)
          const lastTwo = byX.slice(-2)
          outColActual = lastTwo[0] ?? -1
          inColActual = lastTwo[1] ?? -1
        }

        if (outColActual < 0 || inColActual < 0) {
          // Fall back to generic parser if we can't confidently detect money columns
          const generic = buildTransactionsCsvFromMappedRows(mappedRows)
          if (generic.length > 0) {
            csvRows.push(...generic)
          } else {
            csvRows.push(...mappedRows)
          }
          continue
        }

        const stopTextAt = Math.min(outColActual, inColActual, balCol >= 0 ? balCol : Number.POSITIVE_INFINITY)
        const descStart = Math.min(descCol, stopTextAt === Number.POSITIVE_INFINITY ? descCol : stopTextAt)

        const betweenDescAndStop = (r: string[]) => {
          const stop = stopTextAt === Number.POSITIVE_INFINITY ? r.length : stopTextAt
          const slice = r
            .slice(descStart, stop)
            .map((x) => x.trim())
            .filter((x) => x.length > 0)
          return slice.join(' ').trim()
        }

        let carryDateIso: string | null = null
        let pendingDesc: string[] = []

        const flushPending = (dateIso: string, outRaw: string, inRaw: string) => {
          const nOut = parseDecimal(outRaw)
          const nIn = parseDecimal(inRaw)
          const moneyOut = nOut != null && nOut !== 0 ? String(Math.abs(nOut)) : ''
          const moneyIn = nIn != null && nIn !== 0 ? String(Math.abs(nIn)) : ''
          if (!moneyOut && !moneyIn) return
          const first = pendingDesc.join(' ').trim() || 'Transaction'
          csvRows.push([dateIso, first, '', moneyOut, moneyIn, ''])
          pendingDesc = []
        }

        const pickMoneyNear = (r: string[], center: number, forbidden: Set<number>) => {
          const maxOffset = 3
          let best: { v: string; dist: number } | null = null
          for (let off = 0; off <= maxOffset; off++) {
            for (const idx of [center - off, center + off]) {
              if (idx < 0 || idx >= r.length) continue
              if (forbidden.has(idx)) continue
              const v = (r[idx] ?? '').trim()
              if (!isNonZeroMoney(v)) continue
              const dist = Math.abs(idx - center)
              if (!best || dist < best.dist) best = { v, dist }
            }
          }
          return best?.v ?? (r[center] ?? '').trim()
        }

        const forbiddenOut = new Set<number>()
        forbiddenOut.add(inColActual)
        if (balColActual >= 0) forbiddenOut.add(balColActual)
        const forbiddenIn2 = new Set<number>()
        forbiddenIn2.add(outColActual)
        if (balColActual >= 0) forbiddenIn2.add(balColActual)

        for (const r of mappedRows.slice(headerRowIndex + 1)) {
          const dateRaw = (r[dateCol] ?? '').trim()
          const dateIso = dateRaw ? asIsoDate(dateRaw) : null
          if (dateIso) carryDateIso = dateIso

          const outRaw = pickMoneyNear(r, outColActual, forbiddenOut)
          const inRaw = pickMoneyNear(r, inColActual, forbiddenIn2)
          const descRaw = betweenDescAndStop(r)

          if (descRaw) pendingDesc.push(descRaw)

          const nOut = parseDecimal(outRaw)
          const nIn = parseDecimal(inRaw)
          const hasAmount = (nOut != null && nOut !== 0) || (nIn != null && nIn !== 0)
          if (!hasAmount) continue
          if (!carryDateIso) continue
          flushPending(carryDateIso, outRaw, inRaw)
        }
        pendingDesc = []
        continue
      }
    }

    if (format === 'generic' || format === 'auto') {
      const generic = buildTransactionsCsvFromMappedRows(mappedRows)
      if (generic.length > 0) {
        addWithHeader(generic.slice(1))
      }
    }
  }

  // Convert array of arrays to CSV string
  const header = ['Date', 'Description', 'Notes', 'Money out', 'Money in', 'Balance']
  const isHeaderRow = (row: string[]) => {
    const a = (row[0] ?? '').trim().toLowerCase()
    const b = (row[1] ?? '').trim().toLowerCase()
    return a === 'date' && b === 'description'
  }

  const cleaned: string[][] = []
  for (const row of csvRows) {
    if (!row || row.length === 0) continue
    if (isHeaderRow(row)) continue
    const joined = row.join(' ').trim().toLowerCase()
    if (!joined) continue
    if (joined === 'your transactions') continue
    cleaned.push(row)
  }

  const finalRows = [header, ...cleaned]
  return finalRows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

export async function parsePdfRows(file: File): Promise<CsvRow[]> {
  const csvString = await convertPdfToCsvString(file)
  return parseCsvRows(csvString)
}

export async function parsePdfRowsWithOptions(file: File, options?: PdfImportOptions): Promise<CsvRow[]> {
  const csvString = await convertPdfToCsvString(file, options)
  return parseCsvRows(csvString)
}

export function pdfRowsToTransactions(
  rows: CsvRow[],
  fallbackCurrencyCode: string,
  accountIdResolver: (rawAccount: string | undefined) => UUID | null,
): Transaction[] {
  // Use the exact same logic as CSV since we converted PDF to CSV!
  const txs = rowsToTransactions(rows, fallbackCurrencyCode, accountIdResolver)
  // Just update the tag to be bank-pdf
  for (const t of txs) {
    t.tags = ['bank-pdf']
  }
  return txs
}
