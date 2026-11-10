import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const pdfPath = process.argv[2]
const pageNum = Number(process.argv[3] || '1')
if (!pdfPath) {
  console.error('Usage: node scripts/debug_pdf_page_dump.mjs /path/to/file.pdf [page]')
  process.exit(1)
}

const data = new Uint8Array(await fs.readFile(pdfPath))
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', pathToFileURL(process.cwd() + '/')).toString()
const doc = await pdfjs.getDocument({ data }).promise
const page = await doc.getPage(pageNum)
const content = await page.getTextContent()

const items = content.items
  .map((it) => ({ str: String(it.str ?? ''), x: it.transform[4], y: it.transform[5] }))
  .filter((it) => it.str.trim().length > 0)

console.log('pages:', doc.numPages, 'page:', pageNum, 'items:', items.length)
console.log('first items:')
console.log(items.slice(0, 120))

const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
const lines = []
let current = []
let currentY = null
const tol = 3.5
for (const it of sorted) {
  if (currentY == null) {
    currentY = it.y
    current = [it]
    continue
  }
  if (Math.abs(it.y - currentY) <= tol) current.push(it)
  else {
    lines.push(current)
    currentY = it.y
    current = [it]
  }
}
if (current.length) lines.push(current)
for (const g of lines) g.sort((a, b) => a.x - b.x)

console.log('\nlines preview:')
for (let i = 0; i < Math.min(80, lines.length); i++) {
  const s = lines[i].map((x) => x.str).join(' ').replace(/\s+/g, ' ').trim()
  if (!s) continue
  console.log(String(i + 1).padStart(2), s)
}
