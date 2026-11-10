import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '../../app/appStore'
import { currency } from '../../domain/finance'
import { calculateMonthSummary, calculateYearSummary } from '../../domain/reports'
import { isTauriRuntime } from '../../storage/tauriJsonStore'
import { normalizePeopleSettings, visibleTransactions } from '../../domain/people'
import type { BillCategory, Invoice, InvoiceAttachment } from '../../domain/models'
import { expenseCategoryFromSummaryCategory, expenseCategoryFromTransaction, getBudgetAmountForCategory, getBudgetAmountForCustomCategory, normalizeCategoryLabel } from '../../domain/settings'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Sector,
} from 'recharts'

const COLORS = [
  '#0a84ff',
  '#30d158',
  '#ff9f0a',
  '#ff453a',
  '#bf5af2',
  '#5e5ce6',
  '#ff375f',
  '#64d2ff',
  '#ffdb58',
  '#00c7be',
]

export function ReportsView() {
  const { state, dispatch } = useAppStore()
  const personTransactions = useMemo(() => visibleTransactions(state.transactions, state.settings), [state.settings, state.transactions])
  const peopleSettings = useMemo(() => normalizePeopleSettings(state.settings as any), [state.settings])
  const PieAny: any = Pie
  const mode: 'reports' | 'budget' = state.ui.section === 'budget' ? 'budget' : 'reports'
  const [autoRange, setAutoRange] = useState(true)
  const [yearStr, setYearStr] = useState(() => {
    return String(new Date().getFullYear())
  })
  const [startMonthStr, setStartMonthStr] = useState('0')
  const [fromDateStr, setFromDateStr] = useState('')
  const [toDateStr, setToDateStr] = useState('')
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null)
  const [activeIncomeSlice, setActiveIncomeSlice] = useState<number | null>(null)
  const [activeExpenseSlice, setActiveExpenseSlice] = useState<number | null>(null)
  const [showIncomePie, setShowIncomePie] = useState(true)
  const [showExpensePie, setShowExpensePie] = useState(true)
  const [savingPdf, setSavingPdf] = useState(false)
  const [budgetMonth, setBudgetMonth] = useState(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  })
  const [newBudgetCategory, setNewBudgetCategory] = useState('')

  useEffect(() => {
    if (mode !== 'reports') return
    const dates: Date[] = []
    for (const t of personTransactions) dates.push(t.date)
    for (const b of state.bills) {
      for (const p of b.payments ?? []) dates.push(p.date)
    }
    for (const i of state.incomes) {
      for (const r of i.receipts ?? []) dates.push(r.date)
    }

    const earliest = dates.reduce<Date | null>((acc, d) => {
      if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return acc
      if (!acc) return d
      return d.getTime() < acc.getTime() ? d : acc
    }, null)

    const start = earliest ? new Date(earliest.getFullYear(), earliest.getMonth(), 1) : new Date(new Date().getFullYear(), 0, 1)
    setYearStr(String(start.getFullYear()))
    setStartMonthStr(String(start.getMonth()))
    setSelectedMonthIndex(null)
    setActiveIncomeSlice(null)
    setActiveExpenseSlice(null)
    setAutoRange(true)
  }, [mode, state.ui.section])

  const selectedYear = useMemo(() => {
    const y = Number(yearStr)
    return Number.isFinite(y) ? y : new Date().getFullYear()
  }, [yearStr])

  const selectedStartMonth = useMemo(() => {
    const m = Number(startMonthStr)
    return Number.isFinite(m) ? m : 0
  }, [startMonthStr])

  useEffect(() => {
    setSelectedMonthIndex(null)
  }, [selectedYear, selectedStartMonth, fromDateStr, toDateStr])

  function parseDay(value: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim())
    if (!m) return null
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }

  const rangeFrom = useMemo(() => parseDay(fromDateStr), [fromDateStr])
  const rangeTo = useMemo(() => parseDay(toDateStr), [toDateStr])
  const customRange = Boolean(rangeFrom || rangeTo)

  const rangedTransactions = useMemo(() => {
    if (!customRange) return personTransactions
    const from = rangeFrom ? new Date(rangeFrom.getFullYear(), rangeFrom.getMonth(), rangeFrom.getDate()).getTime() : null
    const to = rangeTo ? new Date(rangeTo.getFullYear(), rangeTo.getMonth(), rangeTo.getDate(), 23, 59, 59, 999).getTime() : null
    return personTransactions.filter((t) => {
      const d = t.date
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false
      const ts = d.getTime()
      if (from !== null && ts < from) return false
      if (to !== null && ts > to) return false
      return true
    })
  }, [personTransactions, customRange, rangeFrom, rangeTo])

  const yearSummary = useMemo(() => {
    const now = new Date()
    const startDate = rangeFrom ?? new Date(selectedYear, selectedStartMonth, 1)
    const endDate = customRange ? (rangeTo ?? now) : (autoRange ? now : null)
    return calculateYearSummary({
      year: startDate.getFullYear(),
      startMonth: startDate.getMonth(),
      endYear: endDate ? endDate.getFullYear() : undefined,
      endMonth: endDate ? endDate.getMonth() : undefined,
      bills: state.bills,
      incomes: state.incomes,
      transactions: rangedTransactions,
    })
  }, [autoRange, customRange, rangeFrom, rangeTo, rangedTransactions, selectedYear, selectedStartMonth, state.bills, state.incomes])

  const selectedMonthSummary = useMemo(() => {
    if (selectedMonthIndex === null) return null
    return calculateMonthSummary({
      month: new Date(selectedYear, selectedStartMonth + selectedMonthIndex, 1),
      bills: state.bills,
      incomes: state.incomes,
      transactions: rangedTransactions,
    })
  }, [rangedTransactions, selectedYear, selectedStartMonth, selectedMonthIndex, state.bills, state.incomes])

  const chartData = useMemo(() => {
    if (yearSummary) {
      return yearSummary.months.map((m) => ({
        name: m.monthName,
        index: m.arrayIndex,
        Income: m.income,
        Expenses: m.bills,
        Net: m.net,
      }))
    }
    return []
  }, [yearSummary])

  const pieData = useMemo(() => {
    const details = selectedMonthIndex !== null ? selectedMonthSummary?.billDetails : yearSummary?.billDetails
    if (!details) return []
    const map = new Map<string, { name: string; value: number }>()
    for (const b of details) {
      const cat = expenseCategoryFromSummaryCategory(b.category)
      const cur = map.get(cat.key) ?? { name: cat.label, value: 0 }
      map.set(cat.key, { name: cur.name, value: cur.value + b.amount })
    }
    return Array.from(map.values())
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [selectedMonthIndex, selectedMonthSummary, yearSummary])

  const incomePieData = useMemo(() => {
    const details = selectedMonthIndex !== null ? selectedMonthSummary?.incomeDetails : yearSummary?.incomeDetails
    if (!details) return []
    const map = new Map<string, number>()
    for (const i of details) {
      const name = (i.name || 'Income').trim() || 'Income'
      map.set(name, (map.get(name) ?? 0) + i.amount)
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [selectedMonthIndex, selectedMonthSummary, yearSummary])

  const incomePieTotal = useMemo(() => incomePieData.reduce((acc, x) => acc + x.value, 0), [incomePieData])
  const expensePieTotal = useMemo(() => pieData.reduce((acc, x) => acc + x.value, 0), [pieData])

  function parseMonthValue(value: string): Date {
    const v = String(value ?? '').trim()
    const m = v.match(/^(\d{4})-(\d{2})$/)
    if (!m) return new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const y = Number(m[1])
    const mi = Number(m[2]) - 1
    if (!Number.isFinite(y) || !Number.isFinite(mi)) return new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    return new Date(y, Math.min(11, Math.max(0, mi)), 1)
  }

  function sameMonth(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
  }

  const budgetMonthDate = useMemo(() => parseMonthValue(budgetMonth), [budgetMonth])

  const budgetSpentByCategory = useMemo(() => {
    const map = new Map<string, { label: string; spent: number }>()
    for (const t of personTransactions) {
      if (t.kind !== 'expense') continue
      if (!sameMonth(t.date, budgetMonthDate)) continue
      const cat = expenseCategoryFromTransaction(t)
      const cur = map.get(cat.key) ?? { label: cat.label, spent: 0 }
      map.set(cat.key, { label: cur.label, spent: cur.spent + t.amount.value })
    }
    return map
  }, [budgetMonthDate, personTransactions])

  const budgetRows = useMemo(() => {
    const builtin: BillCategory[] = ['housing', 'utilities', 'subscriptions', 'insurance', 'taxes', 'transport', 'other']
    const customLabels = Array.isArray(state.settings.budgetCategories) ? state.settings.budgetCategories : []
    const rows: Array<{ key: string; label: string; assigned: number; spent: number; available: number; kind: 'builtin' | 'custom' }> = []

    for (const c of builtin) {
      const key = `builtin:${c}`
      const assigned = getBudgetAmountForCategory(state.settings, key)
      const spent = budgetSpentByCategory.get(key)?.spent ?? 0
      rows.push({ key, label: c.charAt(0).toUpperCase() + c.slice(1), assigned, spent, available: assigned - spent, kind: 'builtin' })
    }

    for (const raw of customLabels) {
      const label = normalizeCategoryLabel(raw)
      if (!label) continue
      const key = `custom:${label}`
      const assigned = getBudgetAmountForCustomCategory(state.settings, label)
      const spent = budgetSpentByCategory.get(`custom:${label.toLowerCase()}`)?.spent ?? 0
      rows.push({ key, label, assigned, spent, available: assigned - spent, kind: 'custom' })
    }

    return rows
  }, [budgetSpentByCategory, state.settings])

  function updateMonthlyBudgets(nextBudgets: Record<string, number>) {
    dispatch({ type: 'settings/update', patch: { monthlyBudgets: nextBudgets } })
  }

  function updateBudgetCategories(next: string[]) {
    dispatch({ type: 'settings/update', patch: { budgetCategories: next } })
  }

  function setBudgetAmount(key: string, value: number) {
    const budgets = { ...(state.settings.monthlyBudgets ?? {}) }
    budgets[key] = Number.isFinite(value) ? value : 0
    updateMonthlyBudgets(budgets)
  }

  function addCustomBudgetCategory() {
    const label = normalizeCategoryLabel(newBudgetCategory)
    if (!label) return
    const existing = Array.isArray(state.settings.budgetCategories) ? state.settings.budgetCategories : []
    const lower = label.toLowerCase()
    if (existing.some((x) => normalizeCategoryLabel(x).toLowerCase() === lower)) {
      setNewBudgetCategory('')
      return
    }
    updateBudgetCategories([...existing, label].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
    const budgets = { ...(state.settings.monthlyBudgets ?? {}) }
    const k = `custom:${label}`
    if (budgets[k] == null) budgets[k] = 0
    updateMonthlyBudgets(budgets)
    setNewBudgetCategory('')
  }

  function removeCustomBudgetCategory(label: string) {
    const existing = Array.isArray(state.settings.budgetCategories) ? state.settings.budgetCategories : []
    updateBudgetCategories(existing.filter((x) => normalizeCategoryLabel(x).toLowerCase() !== normalizeCategoryLabel(label).toLowerCase()))
  }

  function periodLabel(): string {
    if (customRange) {
      const fmtDay = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '…')
      return `${fmtDay(rangeFrom)} → ${fmtDay(rangeTo)}`
    }
    if (selectedMonthIndex !== null) {
      const label = yearSummary?.months[selectedMonthIndex]?.monthName ?? ''
      return label ? label : 'Selected month'
    }
    if (!yearSummary) return 'Total'
    const start = new Date(yearSummary.startYear, yearSummary.startMonth, 1)
    const end = new Date(yearSummary.startYear, yearSummary.startMonth + (yearSummary.months?.length ?? 12), 1)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return `${fmt(start)} → ${fmt(end)}`
  }

  function pieToSvg(params: {
    title: string
    totalLabel: string
    data: Array<{ name: string; value: number }>
    colors: string[]
    size: number
  }): string {
    const size = params.size
    const r = size / 2 - 6
    const cx = size / 2
    const cy = size / 2
    const total = params.data.reduce((acc, x) => acc + x.value, 0)
    if (total <= 0) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"></svg>`
    }
    let a0 = -Math.PI / 2
    const paths: string[] = []
    for (let i = 0; i < params.data.length; i++) {
      const v = params.data[i]!.value
      const da = (v / total) * Math.PI * 2
      const a1 = a0 + da
      const x1 = cx + r * Math.cos(a0)
      const y1 = cy + r * Math.sin(a0)
      const x2 = cx + r * Math.cos(a1)
      const y2 = cy + r * Math.sin(a1)
      const large = da > Math.PI ? 1 : 0
      const fill = params.colors[i % params.colors.length]!
      paths.push(`<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${fill}"/>`)
      a0 = a1
    }
    const title = escapeXml(params.title)
    const totalLabel = escapeXml(params.totalLabel)
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`,
      `<rect x="0" y="0" width="${size}" height="${size}" fill="white"/>`,
      ...paths,
      `<circle cx="${cx}" cy="${cy}" r="${Math.max(0, r * 0.58)}" fill="white"/>`,
      `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#111">${title}</text>`,
      `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#111">${totalLabel}</text>`,
      `</svg>`,
    ].join('')
  }

  function escapeXml(input: string): string {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  async function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load SVG image'))
      })
      img.src = url
      await loaded
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not available')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function savePiePdf(kind: 'income' | 'expense') {
    if (savingPdf) return
    try {
      setSavingPdf(true)
      const displayCurrency = state.settings.displayCurrencyCode
      const fmt = (n: number) => currency(n, displayCurrency)
      const data = kind === 'income' ? incomePieData : pieData
      const total = kind === 'income' ? incomePieTotal : expensePieTotal
      if (!yearSummary || data.length === 0 || total <= 0) {
        window.alert('Nothing to print for the selected period.')
        return
      }
      const title = kind === 'income' ? 'Income Report' : 'Expenses Report'
      const period = periodLabel()

      const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const doc = new JsPDF({ unit: 'pt', format: 'a4' })

      doc.setFontSize(18)
      doc.text(title, 42, 48)

      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(period, 42, 64)
      doc.text(`Total: ${fmt(total)}`, 42, 78)

      const svg = pieToSvg({
        title: kind === 'income' ? 'Income' : 'Expenses',
        totalLabel: fmt(total),
        data: data.slice(0, 12),
        colors: COLORS,
        size: 260,
      })
      const png = await svgToPngDataUrl(svg, 260, 260)
      doc.addImage(png, 'PNG', 42, 102, 240, 240)

      const rows = data.map((x, idx) => {
        const pct = total > 0 ? (x.value / total) * 100 : 0
        const color = COLORS[idx % COLORS.length]!
        return [color, x.name, fmt(x.value), `${pct.toFixed(1)}%`]
      })

      autoTable(doc, {
        startY: 102,
        margin: { left: 300, right: 42 },
        head: [['', 'Name', 'Amount', '%']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [66, 66, 66] },
        columnStyles: { 0: { cellWidth: 16 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        styles: { fontSize: 9, cellPadding: 4 },
        didParseCell: (hook: any) => {
          if (hook.section !== 'body') return
          if (hook.column.index !== 0) return
          const hex = String(hook.cell.raw ?? '')
          const m = hex.match(/^#?([0-9a-f]{6})$/i)
          if (!m) return
          const n = parseInt(m[1]!, 16)
          const r = (n >> 16) & 255
          const g = (n >> 8) & 255
          const b = n & 255
          hook.cell.text = ['']
          hook.cell.styles.fillColor = [r, g, b]
        },
        didDrawPage: () => {
          const pageNumber = doc.getNumberOfPages()
          doc.setFontSize(9)
          doc.setTextColor(120, 120, 120)
          doc.text(`Kivana • ${new Date().toLocaleString()} • Page ${pageNumber}`, 42, doc.internal.pageSize.getHeight() - 28)
          doc.setTextColor(0, 0, 0)
        },
      })

      if (isTauriRuntime()) {
        const safe = `${title}-${period}`
          .replace(/[^\w\d]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60)
          .toLowerCase()
        const defaultFileName = `${safe || 'report'}-${new Date().toISOString().slice(0, 10)}.pdf`
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const filePath = await save({
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          defaultPath: defaultFileName,
        })
        if (!filePath) return
        const pdfArrayBuffer = doc.output('arraybuffer')
        const pdfBytes = Array.from(new Uint8Array(pdfArrayBuffer))
        await invoke('export_pdf', { destinationPath: filePath, pdfContent: pdfBytes })
        try {
          const invoiceId = crypto.randomUUID()
          const attachmentId = crypto.randomUUID()
          const saved = (await invoke('save_invoice_attachment', {
            invoiceId,
            attachmentId,
            sourcePath: filePath,
            displayName: defaultFileName,
          })) as { stored_relative_path: string; display_name: string }
          const att: InvoiceAttachment = {
            id: attachmentId,
            displayName: saved.display_name,
            storedRelativePath: saved.stored_relative_path,
            createdAt: new Date(),
          }
          const inv: Invoice = {
            id: invoiceId,
            title: `${title} • ${period}`,
            createdAt: new Date(),
            personId: peopleSettings.peopleEnabled ? peopleSettings.activePersonId : null,
            order: Date.now(),
            invoiceDate: new Date(),
            vendor: null,
            client: null,
            total: null,
            attachments: [att],
          }
          dispatch({ type: 'invoices/add', invoice: inv })
        } catch {
        }
        window.alert('PDF saved.')
      } else {
        doc.save(`${title}-${new Date().toISOString().slice(0, 10)}.pdf`)
      }
    } catch (e) {
      console.error(e)
      window.alert('Failed to generate PDF.')
    } finally {
      setSavingPdf(false)
    }
  }

  const renderActiveSlice: any = (props: any) => {
    const RADIAN = Math.PI / 180
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } = props
    const sin = Math.sin(-RADIAN * midAngle)
    const cos = Math.cos(-RADIAN * midAngle)
    const sx = cx + (outerRadius + 6) * cos
    const sy = cy + (outerRadius + 6) * sin
    const mx = cx + (outerRadius + 18) * cos
    const my = cy + (outerRadius + 18) * sin
    const ex = mx + (cos >= 0 ? 1 : -1) * 14
    const ey = my
    const textAnchor = cos >= 0 ? 'start' : 'end'
    const label = `${payload?.name ?? ''} • ${currency(value, state.settings.displayCurrencyCode)} • ${(((percent || 0) * 100) as number).toFixed(1)}%`

    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={outerRadius + 10}
          outerRadius={outerRadius + 12}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          fillOpacity={0.35}
        />
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
        <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
        <text x={ex + (cos >= 0 ? 6 : -6)} y={ey} textAnchor={textAnchor} fill="var(--text-h)" fontSize={12} dominantBaseline="central">
          {label}
        </text>
      </g>
    )
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 10, borderRadius: 8, fontSize: 13, boxShadow: 'var(--shadow)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-h)' }}>{label}</p>
          {payload.map((entry: any) => (
            <p key={entry.name} style={{ color: entry.color, margin: '2px 0' }}>
              {entry.name}: {currency(entry.value, state.settings.displayCurrencyCode)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  function renderYearly() {
    if (!yearSummary) return null

    const displayIncome = selectedMonthIndex !== null ? selectedMonthSummary?.income || 0 : yearSummary.income
    const displayBills = selectedMonthIndex !== null ? selectedMonthSummary?.bills || 0 : yearSummary.bills
    const displayNet = selectedMonthIndex !== null ? selectedMonthSummary?.net || 0 : yearSummary.net

    return (
      <>
        <div className="grid" style={{ marginTop: 12 }}>
          <div className="card">
            <div className="cardLabel">{selectedMonthIndex !== null ? `${yearSummary.months[selectedMonthIndex]?.monthName} Income` : 'Total Income'}</div>
            <div className="cardValue">{currency(displayIncome, state.settings.displayCurrencyCode)}</div>
          </div>
          <div className="card">
            <div className="cardLabel">{selectedMonthIndex !== null ? `${yearSummary.months[selectedMonthIndex]?.monthName} Expenses` : 'Total Expenses'}</div>
            <div className="cardValue">{currency(displayBills, state.settings.displayCurrencyCode)}</div>
          </div>
          <div className="card">
            <div className="cardLabel">{selectedMonthIndex !== null ? `${yearSummary.months[selectedMonthIndex]?.monthName} Net` : 'Total Net'}</div>
            <div className="cardValue">{currency(displayNet, state.settings.displayCurrencyCode)}</div>
          </div>
        </div>

        <div className="groupBox" style={{ marginTop: 16 }}>
          <div className="groupTitle">Cash Flow</div>
          {selectedMonthIndex !== null ? (
            <div className="note" style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span>Selected month: {yearSummary.months[selectedMonthIndex]?.monthName}</span>
              <button type="button" onClick={() => setSelectedMonthIndex(null)} style={{ padding: '4px 10px', fontSize: 12 }}>
                Clear
              </button>
            </div>
          ) : (
            <div className="note" style={{ marginTop: 6 }}>
              Click a month to focus the pies and totals.
            </div>
          )}
          <div style={{ width: '100%', height: 160, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-2)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} dy={6} />
                <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} width={42} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--hover-2)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Bar
                  dataKey="Income"
                  fill="#30d158"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  style={{ cursor: 'pointer' }}
                  onClick={(data: any) => {
                    const idx = data?.payload?.index
                    if (typeof idx !== 'number') return
                    setSelectedMonthIndex((cur) => (cur === idx ? null : idx))
                  }}
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={selectedMonthIndex === index ? '#34c759' : '#30d158'} fillOpacity={selectedMonthIndex === null || selectedMonthIndex === index ? 1 : 0.4} />
                  ))}
                </Bar>
                <Bar
                  dataKey="Expenses"
                  fill="#ff453a"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  style={{ cursor: 'pointer' }}
                  onClick={(data: any) => {
                    const idx = data?.payload?.index
                    if (typeof idx !== 'number') return
                    setSelectedMonthIndex((cur) => (cur === idx ? null : idx))
                  }}
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={selectedMonthIndex === index ? '#ff3b30' : '#ff453a'} fillOpacity={selectedMonthIndex === null || selectedMonthIndex === index ? 1 : 0.4} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {pieData.length > 0 || incomePieData.length > 0 ? (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
            {showIncomePie && incomePieData.length > 0 ? (
              <div className="groupBox" style={{ flex: '1 1 360px' }}>
                <div className="groupTitle">
                  {selectedMonthIndex !== null ? `Income by Source (${yearSummary.months[selectedMonthIndex]?.monthName})` : 'Income by Source (Total)'}
                </div>
                <div className="note" style={{ marginTop: 6 }}>
                  Total: {currency(incomePieTotal, state.settings.displayCurrencyCode)} • Sources: {incomePieData.length}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', marginTop: 10 }}>
                  <div style={{ flex: '0 0 320px', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <PieAny
                          data={incomePieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          paddingAngle={2}
                          stroke="var(--surface)"
                          strokeWidth={1}
                          activeIndex={activeIncomeSlice ?? undefined}
                          activeShape={renderActiveSlice}
                          onMouseEnter={(_: any, idx: number) => setActiveIncomeSlice(idx)}
                          onMouseLeave={() => setActiveIncomeSlice(null)}
                        >
                          {incomePieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} style={{ outline: 'none' }} />
                          ))}
                        </PieAny>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: '1 1 auto', minWidth: 200, maxHeight: 280, overflowY: 'auto', paddingRight: 6 }}>
                    {incomePieData.map((x, idx) => {
                      const pct = incomePieTotal > 0 ? (x.value / incomePieTotal) * 100 : 0
                      const active = activeIncomeSlice === idx
                      return (
                        <button
                          key={x.name}
                          type="button"
                          onMouseEnter={() => setActiveIncomeSlice(idx)}
                          onMouseLeave={() => setActiveIncomeSlice(null)}
                          onClick={() => setActiveIncomeSlice((cur) => (cur === idx ? null : idx))}
                          style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: active ? '1px solid var(--border)' : '1px solid transparent',
                            background: active ? 'var(--hover-2)' : 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            color: 'inherit',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[idx % COLORS.length], flex: '0 0 auto' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                          </span>
                          <span style={{ flex: '0 0 auto', opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
                            {pct.toFixed(1)}% • {currency(x.value, state.settings.displayCurrencyCode)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {showExpensePie && pieData.length > 0 ? (
              <div className="groupBox" style={{ flex: '1 1 360px' }}>
                <div className="groupTitle">
                  {selectedMonthIndex !== null ? `Expenses by Category (${yearSummary.months[selectedMonthIndex]?.monthName})` : 'Expenses by Category (Total)'}
                </div>
                <div className="note" style={{ marginTop: 6 }}>
                  Total: {currency(expensePieTotal, state.settings.displayCurrencyCode)} • Categories: {pieData.length}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', marginTop: 10 }}>
                  <div style={{ flex: '0 0 320px', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <PieAny
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          paddingAngle={2}
                          stroke="var(--surface)"
                          strokeWidth={1}
                          activeIndex={activeExpenseSlice ?? undefined}
                          activeShape={renderActiveSlice}
                          onMouseEnter={(_: any, idx: number) => setActiveExpenseSlice(idx)}
                          onMouseLeave={() => setActiveExpenseSlice(null)}
                        >
                          {pieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} style={{ outline: 'none' }} />
                          ))}
                        </PieAny>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: '1 1 auto', minWidth: 200, maxHeight: 280, overflowY: 'auto', paddingRight: 6 }}>
                    {pieData.map((x, idx) => {
                      const pct = expensePieTotal > 0 ? (x.value / expensePieTotal) * 100 : 0
                      const active = activeExpenseSlice === idx
                      return (
                        <button
                          key={x.name}
                          type="button"
                          onMouseEnter={() => setActiveExpenseSlice(idx)}
                          onMouseLeave={() => setActiveExpenseSlice(null)}
                          onClick={() => setActiveExpenseSlice((cur) => (cur === idx ? null : idx))}
                          style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: active ? '1px solid var(--border)' : '1px solid transparent',
                            background: active ? 'var(--hover-2)' : 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                            color: 'inherit',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[idx % COLORS.length], flex: '0 0 auto' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                          </span>
                          <span style={{ flex: '0 0 auto', opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
                            {pct.toFixed(1)}% • {currency(x.value, state.settings.displayCurrencyCode)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : null}
            </div>
          </>
        ) : null}
      </>
    )
  }

  function renderBudget() {
    const totals = budgetRows.reduce(
      (acc, r) => ({ assigned: acc.assigned + r.assigned, spent: acc.spent + r.spent, available: acc.available + r.available }),
      { assigned: 0, spent: 0, available: 0 },
    )

    const overallPct = totals.assigned > 0 ? Math.min(1, Math.max(0, totals.spent / totals.assigned)) : totals.spent > 0 ? 1 : 0
    const overallTone: 'pos' | 'neg' | 'neutral' = totals.available > 0 ? 'pos' : totals.available < 0 ? 'neg' : 'neutral'

    return (
      <div className="groupBox" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="groupTitle" style={{ marginBottom: 6 }}>
              Budget
            </div>
            <div className="note" style={{ marginTop: 0 }}>
              Set how much you plan to spend per category. Spent comes from expense transactions. Left = Budget − Spent.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill" data-tone="neutral">
              Budget {currency(totals.assigned, state.settings.displayCurrencyCode)}
            </span>
            <span className="pill" data-tone="neutral">
              Spent {currency(totals.spent, state.settings.displayCurrencyCode)}
            </span>
            <span className="pill" data-tone={overallTone}>
              Left {currency(totals.available, state.settings.displayCurrencyCode)}
            </span>
          </div>
        </div>

        <div className="progressRow" style={{ marginTop: 10 }}>
          <div className="progressBar">
            <div
              className="progressFill"
              style={{
                width: `${Math.round(overallPct * 100)}%`,
                background: totals.spent > totals.assigned && totals.assigned > 0 ? 'var(--red)' : 'var(--accent)',
              }}
            />
          </div>
          <div className="progressValue">{Math.round(overallPct * 100)}%</div>
        </div>

        <div className="list" style={{ marginTop: 12 }}>
          <div
            className="note"
            style={{
              marginTop: 0,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 140px 140px 140px',
              gap: 10,
              padding: '8px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              fontWeight: 800,
            }}
          >
            <div>Category</div>
            <div style={{ textAlign: 'right' }}>Budget</div>
            <div style={{ textAlign: 'right' }}>Spent</div>
            <div style={{ textAlign: 'right' }}>Left</div>
          </div>

          {budgetRows.map((r) => {
            const pct = r.assigned > 0 ? Math.min(1, Math.max(0, r.spent / r.assigned)) : r.spent > 0 ? 1 : 0
            const tone: 'pos' | 'neg' | 'neutral' = r.available > 0 ? 'pos' : r.available < 0 ? 'neg' : 'neutral'
            const fill = r.spent > r.assigned && r.assigned > 0 ? 'var(--red)' : 'var(--accent)'
            return (
              <div key={r.key} className="note" style={{ marginTop: 0, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px 140px 140px', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 800, color: 'var(--text-h)' }}>
                        {r.label}
                      </div>
                      {r.kind === 'custom' ? (
                        <button type="button" onClick={() => removeCustomBudgetCategory(r.label)} style={{ padding: '2px 8px' }}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="progressRow" style={{ marginTop: 8 }}>
                      <div className="progressBar">
                        <div className="progressFill" style={{ width: `${Math.round(pct * 100)}%`, background: fill }} />
                      </div>
                      <div className="progressValue">{Math.round(pct * 100)}%</div>
                    </div>
                  </div>
                  <input
                    type="number"
                    value={Number.isFinite(r.assigned) ? r.assigned : 0}
                    onChange={(e) => setBudgetAmount(r.key, Number(e.target.value))}
                    style={{ width: 130, justifySelf: 'end' }}
                  />
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{currency(r.spent, state.settings.displayCurrencyCode)}</div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="pill" data-tone={tone}>
                      {currency(r.available, state.settings.displayCurrencyCode)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={newBudgetCategory}
            onChange={(e) => setNewBudgetCategory(e.target.value)}
            placeholder="Add custom category (e.g. Groceries)"
            style={{ width: 300 }}
          />
          <button type="button" onClick={addCustomBudgetCategory} disabled={!normalizeCategoryLabel(newBudgetCategory)}>
            Add category
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="rowActions">
          {mode === 'budget' ? (
            <label className="field" style={{ margin: 0 }}>
              <div className="fieldLabel">Month</div>
              <input type="month" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)} style={{ width: 150, height: 32 }} />
            </label>
          ) : (
            <>
              <button type="button" onClick={() => void savePiePdf('expense')} disabled={savingPdf || expensePieTotal <= 0}>
                Print Expenses PDF
              </button>
              <button type="button" onClick={() => void savePiePdf('income')} disabled={savingPdf || incomePieTotal <= 0}>
                Print Income PDF
              </button>
              <label className="field" style={{ margin: 0 }}>
                <div className="fieldLabel">From</div>
                <input
                  type="date"
                  value={fromDateStr}
                  onChange={(e) => {
                    setFromDateStr(e.target.value)
                    setAutoRange(false)
                  }}
                  style={{ width: 150, height: 32 }}
                />
              </label>
              <label className="field" style={{ margin: 0, marginRight: 16 }}>
                <div className="fieldLabel">To</div>
                <input
                  type="date"
                  value={toDateStr}
                  onChange={(e) => {
                    setToDateStr(e.target.value)
                    setAutoRange(false)
                  }}
                  style={{ width: 150, height: 32 }}
                />
              </label>
              <label className="field" style={{ margin: 0, marginRight: 16 }}>
                <div className="fieldLabel">Start Month</div>
                <select
                  value={startMonthStr}
                  onChange={(e) => {
                    setStartMonthStr(e.target.value)
                    setAutoRange(false)
                  }}
                  style={{ width: 120, height: 32 }}
                >
                  <option value="0">January</option>
                  <option value="1">February</option>
                  <option value="2">March</option>
                  <option value="3">April</option>
                  <option value="4">May</option>
                  <option value="5">June</option>
                  <option value="6">July</option>
                  <option value="7">August</option>
                  <option value="8">September</option>
                  <option value="9">October</option>
                  <option value="10">November</option>
                  <option value="11">December</option>
                </select>
              </label>
              <label className="field" style={{ margin: 0 }}>
                <div className="fieldLabel">Year</div>
                <input
                  type="number"
                  value={yearStr}
                  onChange={(e) => {
                    setYearStr(e.target.value)
                    setAutoRange(false)
                  }}
                  style={{ width: 100, height: 32 }}
                  min={1900}
                  max={2100}
                />
              </label>
              <label className="check" style={{ margin: 0, marginLeft: 16 }}>
                <input type="checkbox" checked={showIncomePie} onChange={(e) => setShowIncomePie(e.target.checked)} />
                Income pie
              </label>
              <label className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={showExpensePie} onChange={(e) => setShowExpensePie(e.target.checked)} />
                Expenses pie
              </label>
            </>
          )}

        </div>
      </div>

      {mode === 'budget' ? renderBudget() : renderYearly()}
    </>
  )
}
