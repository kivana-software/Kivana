import fs from 'node:fs/promises'

const pdfPath = process.argv[2]
if (!pdfPath) {
  console.error('Usage: node scripts/debug_pdf_extract.mjs /path/to/file.pdf')
  process.exit(1)
}

const data = new Uint8Array(await fs.readFile(pdfPath))
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()

const doc = await pdfjs.getDocument({ data }).promise

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

function groupByY(items, tolerance = 3.5) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const groups = []
  let current = []
  let currentY = null
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

function findHeaderX(line, predicate) {
  let best = null
  for (const it of line) {
    const n = norm(it.str)
    if (!n) continue
    if (!predicate(n)) continue
    if (best == null || it.x < best) best = it.x
  }
  return best
}

function parseInOutTablePage(items) {
  const lines = groupByY(items, 3.5)
  const headerLineIndex = lines.findIndex((line) => {
    const s = norm(line.map((x) => x.str).join(' '))
    const hasDate = s.includes('date') || s.includes('data')
    const hasDesc = s.includes('description') || s.includes('transaction') || s.includes('aprasymas')
    const hasOut = s.includes('money out') || s.includes('paid out') || (s.includes('out') && s.includes('money'))
    const hasIn = s.includes('money in') || s.includes('paid in') || (s.includes('in') && s.includes('money'))
    const hasBal = s.includes('balance') || s.includes('likutis') || s.includes('balansas')
    return hasDate && hasDesc && hasOut && hasIn && hasBal
  })
  if (headerLineIndex < 0) return null

  const headerLine = lines[headerLineIndex]
  const xDate = findHeaderX(headerLine, (s) => s === 'date' || s === 'data')
  const xDesc = findHeaderX(headerLine, (s) => s === 'transaction' || s === 'description' || s === 'aprasymas' || s.includes('description'))
  const xOut = findHeaderX(headerLine, (s) => s.includes('money out') || s.includes('paid out') || s === 'out')
  const xIn = findHeaderX(headerLine, (s) => s.includes('money in') || s.includes('paid in') || s === 'in')
  const xBal = findHeaderX(headerLine, (s) => s.includes('balance') || s.includes('likutis') || s.includes('balansas'))
  if ([xDate, xDesc, xOut, xIn, xBal].some((v) => v == null)) return null

  const cols = [
    { key: 'date', x: xDate },
    { key: 'desc', x: xDesc },
    { key: 'out', x: xOut },
    { key: 'in', x: xIn },
    { key: 'bal', x: xBal },
  ].sort((a, b) => a.x - b.x)
  const boundaries = []
  for (let i = 0; i < cols.length - 1; i++) boundaries.push((cols[i].x + cols[i + 1].x) / 2)
  const assign = (x) => {
    for (let i = 0; i < boundaries.length; i++) if (x < boundaries[i]) return cols[i].key
    return cols[cols.length - 1].key
  }

  const out = []
  for (let li = headerLineIndex + 1; li < lines.length; li++) {
    const line = lines[li]
    const by = { date: [], desc: [], out: [], in: [], bal: [] }
    for (const it of line) by[assign(it.x)].push(it)
    const date = by.date.map((x) => x.str).join(' ').trim()
    const desc = by.desc.map((x) => x.str).join(' ').trim()
    const mout = by.out.map((x) => x.str).join('').trim()
    const min = by.in.map((x) => x.str).join('').trim()
    if (date || desc || mout || min) out.push({ date, desc, mout, min })
  }
  return out
}

const page = await doc.getPage(1)
const content = await page.getTextContent()
const items = content.items
  .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }))
  .filter((it) => norm(it.str).length > 0)

const rows = parseInOutTablePage(items)
console.log({ page: 1, detected: Boolean(rows), rows: rows ? rows.length : 0 })
if (rows) console.log(rows.slice(0, 20))
