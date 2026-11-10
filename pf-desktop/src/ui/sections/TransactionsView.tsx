import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../../app/appStore'
import type { BillCategory, Invoice, InvoiceAttachment, Transaction, TransactionKind, UUID } from '../../domain/models'
import { currency } from '../../domain/finance'
import { fromDateInputValue, toDateInputValue } from '../date'
import { parseCsvRows, rowsToTransactions } from '../../domain/csvImport'
import {
  type PdfImportFormat,
  parsePdfRowsWithOptions,
  pdfRowsToTransactions,
} from '../../domain/pdfImport'
import { runImportPipeline, transactionDupeKey } from '../../domain/importPipeline'
import { useContextMenu } from '../ContextMenu'
import { MenuSelect } from '../MenuSelect'
import { TransactionKindIcon } from '../icons'
import { isTauriRuntime, loadTransactionsForPersonFromTauriFiles, moveTransactionIdsBetweenPeopleInTauriFiles } from '../../storage/tauriJsonStore'
import { loadTransactionsForPersonFromLocalStorage, moveTransactionIdsBetweenPeopleInLocalStorage } from '../../storage/localJsonStore'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { AI_TRANSACTIONS_AUTOMATION_EVENT, type TransactionsAutomationRequest } from '../../ai/experimentalGuiAutomation'
import { normalizePeopleSettings, visibleTransactions } from '../../domain/people'
import { AI_FEATURE_ENABLED } from '../../domain/settings'

const FILES_IMPORT_PDF_EVENT = 'files:import_pdf_to_transactions'

export function TransactionsView() {
  const { state, dispatch, persistNow } = useAppStore()
  const selectedId = state.ui.selectedTransactionId
  const personTransactions = useMemo(() => visibleTransactions(state.transactions, state.settings), [state.settings, state.transactions])
  const peopleSettings = useMemo(() => normalizePeopleSettings(state.settings as any), [state.settings])
  const activePerson = useMemo(() => {
    return peopleSettings.people.find((p) => p.id === peopleSettings.activePersonId) ?? null
  }, [peopleSettings.activePersonId, peopleSettings.people])
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [deleteAllTyped, setDeleteAllTyped] = useState('')
  const [importDuplicateModal, setImportDuplicateModal] = useState<{
    source: 'CSV' | 'PDF'
    tx: Transaction[]
    autoCount: number
    duplicateKeysInFile: string[]
    duplicateKeysExisting: string[]
  } | null>(null)
  const [search, setSearch] = useState('')
  const [accountFilterId, setAccountFilterId] = useState<UUID | 'all'>('all')
  const [kindFilter, setKindFilter] = useState<TransactionKind | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'imported' | 'manual'>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'last30' | 'last90' | 'thisMonth' | 'range'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [payeeFilter, setPayeeFilter] = useState<string | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sort, setSort] = useState<'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc' | 'netDesc' | 'netAsc' | 'nameAsc' | 'nameDesc'>('dateDesc')
  const [viewMode, setViewMode] = useState<'standard' | 'detailed'>('detailed')
  const showEditor = viewMode === 'detailed'
  const showFilters = viewMode === 'detailed'
  const [selectedIds, setSelectedIds] = useState<Set<UUID>>(() => new Set())
  const [bulkMovePersonId, setBulkMovePersonId] = useState<string>('')
  const [allowLargeUnfilteredList, setAllowLargeUnfilteredList] = useState(false)
  const [taxRatePct, setTaxRatePct] = useState<number>(0)
  const [taxBase, setTaxBase] = useState<'income' | 'expense' | 'net'>('income')
  const [cisAlreadyDeducted, setCisAlreadyDeducted] = useState(false)
  const [taxOverrideEnabled, setTaxOverrideEnabled] = useState(false)
  const [taxOverrideAmount, setTaxOverrideAmount] = useState<number>(0)
  const [selectionReportTitle, setSelectionReportTitle] = useState('Selected Transactions')
  const [bulkCategory, setBulkCategory] = useState<BillCategory>('other')
  const [bulkCategoryPreset, setBulkCategoryPreset] = useState<string>('cat:other')
  const [bulkCustomCategoryName, setBulkCustomCategoryName] = useState('')
  const [showCategorizeWizard, setShowCategorizeWizard] = useState(false)
  const [wizardGroups, setWizardGroups] = useState<Array<{ payeeKey: string; ids: UUID[]; count: number }>>([])
  const [wizardIndex, setWizardIndex] = useState(0)
  const [wizardCategory, setWizardCategory] = useState<BillCategory>('other')
  const [wizardCustomName, setWizardCustomName] = useState('')
  const [importingPdf, setImportingPdf] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importBusyText, setImportBusyText] = useState('Working on import…')
  const pdfFormat: PdfImportFormat = 'auto'
  const listRef = useRef<HTMLDivElement | null>(null)
  const [virtualScrollTop, setVirtualScrollTop] = useState(0)
  const [virtualViewportHeight, setVirtualViewportHeight] = useState(800)
  const [virtualListStart, setVirtualListStart] = useState(0)
  const virtualRowHeight = 66
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const viewModeAnchorRef = useRef<HTMLDivElement | null>(null)
  const toolbarWrapRef = useRef<HTMLDivElement | null>(null)
  const selectionAnchorRef = useRef<HTMLButtonElement | null>(null)
  const selectionPopoverRef = useRef<HTMLDivElement | null>(null)
  const [selectionPopoverStyle, setSelectionPopoverStyle] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null)
  const [selectionPopoverDocked, setSelectionPopoverDocked] = useState(true)
  const [selectionPopoverFloatingPos, setSelectionPopoverFloatingPos] = useState<{ left: number; top: number } | null>(null)

  const lastVoiceRevealIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedId) return
    const t = personTransactions.find((x) => x.id === selectedId) ?? null
    if (!t) return
    if (!(t.tags ?? []).includes('voice')) return
    if (lastVoiceRevealIdRef.current === selectedId) return
    lastVoiceRevealIdRef.current = selectedId

    setViewMode('detailed')
    setSearch('')
    setAccountFilterId('all')
    setKindFilter('all')
    setSourceFilter('all')
    setDateFilter('all')
    setDateFrom('')
    setDateTo('')
    setPayeeFilter('all')
    setCategoryFilter('all')
    setSort('dateDesc')
    setAllowLargeUnfilteredList(true)
    setSelectedIds(new Set())
    const el = listRef.current
    if (el) {
      try {
        el.scrollTop = 0
      } catch {
      }
    }
  }, [personTransactions, selectedId])

  useEffect(() => {
    function handler(e: Event) {
      const ev = e as CustomEvent
      const entity = String((ev as any)?.detail?.entity ?? '').trim()
      if (!entity) return
      if (entity !== 'transaction') return
      setViewMode('detailed')
      setSearch('')
      clearFilters()
      clearSelection()
      if (personTransactions.length > 0) setAllowLargeUnfilteredList(true)
      const el = listRef.current
      if (el) {
        try {
          el.scrollTop = 0
        } catch {
        }
      }
    }
    window.addEventListener('automation:reveal', handler as any)
    return () => window.removeEventListener('automation:reveal', handler as any)
  }, [personTransactions.length])
  const [selectionPopoverRepositionToken, setSelectionPopoverRepositionToken] = useState(0)
  const selectionPopoverDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startLeft: number
    startTop: number
    width: number
    height: number
  } | null>(null)
  const txSplitRef = useRef<HTMLDivElement | null>(null)
  const txDetailSlotRef = useRef<HTMLDivElement | null>(null)
  const [txDetailFixedStyle, setTxDetailFixedStyle] = useState<CSSProperties | null>(null)
  const enableTaxPdf = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TAX_PDF === '1'
  const enableGuiAutomation =
    AI_FEATURE_ENABLED && ((import.meta.env.DEV && import.meta.env.VITE_ENABLE_AI_GUI !== '0') || import.meta.env.VITE_ENABLE_AI_GUI === '1')

  useEffect(() => {
    if (!peopleSettings.peopleEnabled) {
      if (bulkMovePersonId) setBulkMovePersonId('')
      return
    }
    const options = peopleSettings.people.filter((p) => p.id !== peopleSettings.activePersonId)
    if (options.length === 0) {
      if (bulkMovePersonId) setBulkMovePersonId('')
      return
    }
    if (!bulkMovePersonId || !options.some((p) => p.id === bulkMovePersonId)) {
      setBulkMovePersonId(options[0]!.id)
    }
  }, [bulkMovePersonId, peopleSettings.activePersonId, peopleSettings.people, peopleSettings.peopleEnabled])

  useEffect(() => {
    if (!showEditor) {
      setTxDetailFixedStyle(null)
      return
    }
    const compute = () => {
      const topbar = document.querySelector('.topbar') as HTMLElement | null
      const wrap = toolbarWrapRef.current
      const wrapBottom = wrap ? wrap.getBoundingClientRect().bottom : 0
      const stickTop = Math.max(72, (topbar?.offsetHeight ?? 0) + 12, wrapBottom + 12)
      setTxDetailFixedStyle({
        position: 'fixed',
        top: stickTop,
        right: 18,
        width: 340,
        maxHeight: Math.max(160, window.innerHeight - stickTop - 12),
        overflow: 'auto',
        zIndex: 35,
      })
    }

    compute()
    window.addEventListener('resize', compute)
    const scrollEl = document.querySelector('.content') as HTMLElement | null
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        compute()
      })
    }
    scrollEl?.addEventListener('scroll', onScroll, { passive: true } as any)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => compute()) : null
    if (ro) {
      const wrap = toolbarWrapRef.current
      const topbarEl = document.querySelector('.topbar') as HTMLElement | null
      if (wrap) ro.observe(wrap)
      if (topbarEl) ro.observe(topbarEl)
    }
    return () => {
      window.removeEventListener('resize', compute)
      if (raf) window.cancelAnimationFrame(raf)
      scrollEl?.removeEventListener('scroll', onScroll as any)
      ro?.disconnect()
    }
  }, [showEditor, viewMode])

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

  function commitImportTransactions(imported: Transaction[], autoCount: number) {
    if (imported.length === 0) return
    for (const t of imported) {
      dispatch({ type: 'transactions/add', transaction: t })
    }
    if (autoCount) {
      window.alert(`Import complete. Imported ${imported.length} transactions. Auto-categorized ${autoCount}.`)
    } else {
      window.alert(`Import complete. Imported ${imported.length} transactions.`)
    }
  }

  async function beginImportBusy(text: string) {
    setImportBusyText(text)
    setImportBusy(true)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }

  function updateImportBusy(text: string) {
    setImportBusyText(text)
  }

  function endImportBusy() {
    setImportBusy(false)
  }

  function payeeGroupKey(raw: string | null | undefined): string {
    const s = (raw ?? '').trim()
    if (!s) return ''
    const parts = s.split(',').map((x) => x.trim()).filter((x) => x.length > 0)
    const head = parts[0] ?? s
    const cleaned = head.replace(/\s+/g, ' ').trim()
    return cleaned.toUpperCase()
  }

  function titleCase(s: string): string {
    return s
      .toLowerCase()
      .split(' ')
      .filter((x) => x.length > 0)
      .map((w) => (w.length === 1 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
      .join(' ')
  }

  function suggestCustomCategoryNameFromPayeeKey(payeeKey: string): string {
    let s = payeeKey.trim()
    s = s.replace(/^CARD\s+PURCHASE\s+/i, '')
    s = s.replace(/^CARD\s+PAYMENT\s+/i, '')
    s = s.replace(/^BILL\s+PAYMENT\s+/i, '')
    s = s.replace(/^DIRECT\s+DEBIT\s+/i, '')
    s = s.replace(/^POS\s+/i, '')
    s = s.replace(/\s+\bON\s+\d+\b$/i, '')
    s = s.replace(/\bGB\b/gi, '').replace(/\s+/g, ' ').trim()
    if (!s) s = payeeKey.trim()
    return titleCase(s)
  }

  function shiftDateValue(value: string, deltaYears: number, deltaMonths: number): string {
    const base = value ? fromDateInputValue(value) : new Date()
    const nextMonthAnchor = new Date(base.getFullYear() + deltaYears, base.getMonth() + deltaMonths, 1)
    const lastDay = new Date(nextMonthAnchor.getFullYear(), nextMonthAnchor.getMonth() + 1, 0).getDate()
    const day = Math.min(base.getDate(), lastDay)
    return toDateInputValue(new Date(nextMonthAnchor.getFullYear(), nextMonthAnchor.getMonth(), day))
  }

  useEffect(() => {
    const scrollEl = document.querySelector('.content') as HTMLElement | null
    if (!scrollEl) return

    let raf = 0
    const update = () => {
      setVirtualScrollTop(scrollEl.scrollTop)
      setVirtualViewportHeight(scrollEl.clientHeight)
      const list = listRef.current
      if (!list) return
      const listRect = list.getBoundingClientRect()
      const scrollRect = scrollEl.getBoundingClientRect()
      setVirtualListStart(listRect.top - scrollRect.top + scrollEl.scrollTop)
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        update()
      })
    }

    update()
    scrollEl.addEventListener('scroll', onScroll, { passive: true } as any)
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      scrollEl.removeEventListener('scroll', onScroll as any)
      window.removeEventListener('resize', onScroll)
    }
  }, [showEditor])

  const payeeGroups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of personTransactions) {
      const k = payeeGroupKey(t.payee)
      if (!k) continue
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const rows = [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.key.localeCompare(b.key)))
      .slice(0, 60)
    return rows
  }, [personTransactions])

  const customExpenseCategoryNames = useMemo(() => {
    const set = new Set<string>()
    for (const t of personTransactions) {
      if (t.kind !== 'expense') continue
      const v = (t.customCategoryName ?? '').trim()
      if (v) set.add(v)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [personTransactions])

  const payeeExpenseCategorization = useMemo(() => {
    const countsByPayee = new Map<string, Map<string, number>>()
    for (const t of personTransactions) {
      if (t.kind !== 'expense') continue
      const key = payeeGroupKey(t.payee)
      if (!key) continue
      const custom = (t.customCategoryName ?? '').trim()
      const preset = custom ? `custom:${custom}` : t.category ? `cat:${t.category}` : ''
      if (!preset) continue
      if (preset === 'cat:other') continue
      let m = countsByPayee.get(key)
      if (!m) {
        m = new Map()
        countsByPayee.set(key, m)
      }
      m.set(preset, (m.get(preset) ?? 0) + 1)
    }
    const out = new Map<string, string>()
    for (const [key, m] of countsByPayee) {
      let best = ''
      let bestCount = 0
      for (const [preset, c] of m) {
        if (c > bestCount) {
          best = preset
          bestCount = c
        }
      }
      if (best) out.set(key, best)
    }
    return out
  }, [personTransactions])

  const largeListThreshold = 2000
  const hasAnyFilters = useMemo(() => {
    if (accountFilterId !== 'all') return true
    if (kindFilter !== 'all') return true
    if (sourceFilter !== 'all') return true
    if (dateFilter !== 'all') {
      if (dateFilter !== 'range') return true
      if (dateFrom || dateTo) return true
    }
    if (payeeFilter !== 'all') return true
    if (categoryFilter !== 'all') return true
    if (sort !== 'dateDesc') return true
    if (search.trim()) return true
    return false
  }, [accountFilterId, categoryFilter, dateFilter, dateFrom, dateTo, kindFilter, payeeFilter, search, sort, sourceFilter])

  const isListGated =
    !allowLargeUnfilteredList && !hasAnyFilters && !selectedId && selectedIds.size === 0 && personTransactions.length > largeListThreshold

  const filtered = useMemo(() => {
    if (isListGated) return []
    let items = personTransactions
    if (accountFilterId !== 'all') {
      items = items.filter((t) => t.accountId === accountFilterId || t.toAccountId === accountFilterId)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      items = items.filter((t) => {
        const hay = [
          t.payee ?? '',
          t.notes ?? '',
          t.customCategoryName ?? '',
          ...(t.tags ?? []),
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }
    if (kindFilter !== 'all') items = items.filter((t) => t.kind === kindFilter)
    if (sourceFilter !== 'all') {
      const isImported = (t: Transaction) => (t.tags ?? []).includes('bank-csv') || (t.tags ?? []).includes('bank-pdf')
      if (sourceFilter === 'imported') items = items.filter(isImported)
      if (sourceFilter === 'manual') items = items.filter((t) => !isImported(t))
    }
    if (payeeFilter !== 'all') {
      items = items.filter((t) => payeeGroupKey(t.payee) === payeeFilter)
    }
    if (categoryFilter !== 'all') {
      const raw = categoryFilter
      if (raw.startsWith('cat:')) {
        const cat = raw.slice('cat:'.length) as BillCategory
        if (cat === 'other') {
          items = items.filter((t) => t.kind === 'expense' && t.category === cat && !(t.customCategoryName ?? '').trim())
        } else {
          items = items.filter((t) => t.kind === 'expense' && t.category === cat)
        }
      } else if (raw.startsWith('custom:')) {
        const name = raw.slice('custom:'.length).trim().toLowerCase()
        items = items.filter((t) => t.kind === 'expense' && (t.customCategoryName ?? '').trim().toLowerCase() === name)
      }
    }
    if (dateFilter !== 'all') {
      const now = new Date()
      if (dateFilter === 'last30') {
        const past = new Date(now)
        past.setDate(past.getDate() - 30)
        items = items.filter((t) => t.date >= past)
      } else if (dateFilter === 'last90') {
        const past = new Date(now)
        past.setDate(past.getDate() - 90)
        items = items.filter((t) => t.date >= past)
      } else if (dateFilter === 'thisMonth') {
        items = items.filter((t) => t.date.getFullYear() === now.getFullYear() && t.date.getMonth() === now.getMonth())
      } else if (dateFilter === 'range') {
        const from = dateFrom ? fromDateInputValue(dateFrom) : null
        const to = dateTo ? fromDateInputValue(dateTo) : null
        const toExclusive = to
          ? (() => {
              const d = new Date(to)
              d.setDate(d.getDate() + 1)
              return d
            })()
          : null
        items = items.filter((t) => {
          if (from && t.date < from) return false
          if (toExclusive && t.date >= toExclusive) return false
          return true
        })
      }
    }
    const signedValue = (t: Transaction): number => {
      if (t.kind === 'income') return t.amount.value
      if (t.kind === 'expense') return -t.amount.value
      return 0
    }
    const signedAmount = (t: Transaction): number => {
      if (t.kind === 'income') return t.amount.value
      if (t.kind === 'expense') return -t.amount.value
      return t.amount.value
    }
    const titleForSort = (t: Transaction): string => {
      const s = (t.payee && t.payee.trim()) ? t.payee : t.kind === 'income' ? 'Income' : t.kind === 'expense' ? 'Expense' : 'Transfer'
      return s.toLowerCase()
    }
    switch (sort) {
      case 'dateDesc':
        return [...items].sort((a, b) => b.date.getTime() - a.date.getTime())
      case 'dateAsc':
        return [...items].sort((a, b) => a.date.getTime() - b.date.getTime())
      case 'amountDesc':
        return [...items].sort((a, b) => b.amount.value - a.amount.value)
      case 'amountAsc':
        return [...items].sort((a, b) => a.amount.value - b.amount.value)
      case 'netDesc':
        return [...items].sort((a, b) => signedValue(b) - signedValue(a))
      case 'netAsc':
        return [...items].sort((a, b) => signedValue(a) - signedValue(b))
      case 'nameAsc':
        return [...items].sort((a, b) => {
          const c = titleForSort(a).localeCompare(titleForSort(b))
          return c !== 0 ? c : b.date.getTime() - a.date.getTime()
        })
      case 'nameDesc':
        return [...items].sort((a, b) => {
          const c = titleForSort(b).localeCompare(titleForSort(a))
          return c !== 0 ? c : b.date.getTime() - a.date.getTime()
        })
      default:
        return [...items].sort((a, b) => signedAmount(b) - signedAmount(a))
    }
  }, [accountFilterId, categoryFilter, dateFilter, dateFrom, dateTo, isListGated, kindFilter, payeeFilter, personTransactions, search, sort, sourceFilter])

  const virtualWindow = useMemo(() => {
    const total = filtered.length
    const rowH = virtualRowHeight
    const viewH = Number.isFinite(virtualViewportHeight) && virtualViewportHeight > 0 ? virtualViewportHeight : 800
    const startPx = Math.max(0, virtualScrollTop - virtualListStart)
    const overscan = 12
    const start = Math.max(0, Math.floor(startPx / rowH) - overscan)
    const count = Math.ceil(viewH / rowH) + overscan * 2 + 1
    const end = Math.min(total, start + count)
    const topPad = start * rowH
    const bottomPad = Math.max(0, (total - end) * rowH)
    return { start, end, topPad, bottomPad }
  }, [filtered.length, virtualListStart, virtualRowHeight, virtualScrollTop, virtualViewportHeight])

  const uncategorizedExpenseGroups = useMemo(() => {
    const byKey = new Map<string, { payeeKey: string; ids: UUID[]; count: number }>()
    for (const t of filtered) {
      if (t.kind !== 'expense') continue
      const isUncategorized = (t.category ?? 'other') === 'other' && !(t.customCategoryName ?? '').trim()
      if (!isUncategorized) continue
      const key = payeeGroupKey(t.payee)
      if (!key) continue
      const row = byKey.get(key) ?? { payeeKey: key, ids: [], count: 0 }
      row.ids.push(t.id)
      row.count += 1
      byKey.set(key, row)
    }
    return [...byKey.values()]
      .filter((g) => g.count >= 2)
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.payeeKey.localeCompare(b.payeeKey)))
  }, [filtered])

  const categorizeWizardEligibleCount = useMemo(() => {
    return uncategorizedExpenseGroups.reduce((acc, g) => acc + g.count, 0)
  }, [uncategorizedExpenseGroups])

  useEffect(() => {
    if (!showCategorizeWizard) return
    const g = wizardGroups[wizardIndex]
    if (!g) return
    setWizardCategory('other')
    setWizardCustomName(suggestCustomCategoryNameFromPayeeKey(g.payeeKey))
  }, [showCategorizeWizard, wizardGroups, wizardIndex])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return state.transactions.find((t) => t.id === selectedId) ?? null
  }, [selectedId, state.transactions])

  const selectedTx = useMemo(() => {
    if (selectedIds.size === 0) return []
    const byId = new Map<string, Transaction>()
    for (const t of state.transactions) byId.set(t.id, t)
    const out: Transaction[] = []
    for (const id of selectedIds) {
      const t = byId.get(id)
      if (t) out.push(t)
    }
    out.sort((a, b) => a.date.getTime() - b.date.getTime())
    return out
  }, [selectedIds, state.transactions])

  function calcSelectionTotalsFor(params: {
    tx: Transaction[]
    taxBase: 'income' | 'expense' | 'net'
    taxRatePct: number
    cisAlreadyDeducted: boolean
    taxOverrideEnabled: boolean
    taxOverrideAmount: number
  }) {
    let income = 0
    let expense = 0
    for (const t of params.tx) {
      if (t.kind === 'income') income += t.amount.value
      else if (t.kind === 'expense') expense += t.amount.value
    }
    const net = income - expense
    const base = params.taxBase === 'income' ? income : params.taxBase === 'expense' ? expense : net
    const rate = Number.isFinite(params.taxRatePct) ? params.taxRatePct : 0
    const cisMode = params.cisAlreadyDeducted && params.taxBase === 'income' && rate > 0 && rate < 100
    const computedTax = cisMode ? Math.max(0, base) * (rate / (100 - rate)) : Math.max(0, base) * (rate / 100)
    const tax = params.taxOverrideEnabled ? Math.max(0, params.taxOverrideAmount || 0) : computedTax
    const totalWithTax = base + tax
    return { income, expense, net, base, computedTax, tax, totalWithTax }
  }

  const selectionTotals = useMemo(() => {
    return calcSelectionTotalsFor({ tx: selectedTx, taxBase, taxRatePct, cisAlreadyDeducted, taxOverrideEnabled, taxOverrideAmount })
  }, [selectedTx, taxBase, cisAlreadyDeducted, taxOverrideAmount, taxOverrideEnabled, taxRatePct])

  const hasMixedTypes = useMemo(() => {
    if (selectedTx.length === 0) return false
    let hasInc = false
    let hasExp = false
    for (const t of selectedTx) {
      if (t.kind === 'income') hasInc = true
      if (t.kind === 'expense') hasExp = true
    }
    return hasInc && hasExp
  }, [selectedTx])

  const selectedTypeCounts = useMemo(() => {
    let expense = 0
    let income = 0
    let transfer = 0
    for (const t of selectedTx) {
      if (t.kind === 'expense') expense += 1
      else if (t.kind === 'income') income += 1
      else transfer += 1
    }
    return { expense, income, transfer }
  }, [selectedTx])

  function createTransaction() {
    const defaultAccount = state.accounts.find((a) => !a.archived)?.id ?? null
    const t: Transaction = {
      id: crypto.randomUUID(),
      kind: 'expense',
      date: new Date(),
      amount: { currencyCode: state.settings.displayCurrencyCode, value: 0 },
      accountId: defaultAccount,
      toAccountId: null,
      category: 'other',
      customCategoryName: null,
      payee: null,
      notes: null,
      tags: [],
      relatedBillId: null,
      relatedIncomeId: null,
    }
    dispatch({ type: 'transactions/add', transaction: t })
  }

  function deleteSelectionTransactions() {
    if (selectedIds.size === 0) return
    const n = selectedIds.size
    if (!window.confirm(n === 1 ? 'Delete selected transaction?' : `Delete ${n} selected transactions?`)) return
    dispatch({ type: 'transactions/bulkDelete', ids: Array.from(selectedIds.values()) })
    setSelectedIds(new Set())
  }

  async function moveSelectionToPerson() {
    if (!peopleSettings.peopleEnabled) return
    if (selectedIds.size === 0) return
    const from = peopleSettings.activePersonId
    const to = String(bulkMovePersonId ?? '').trim()
    if (!to || to === from) return
    const ids = Array.from(selectedIds.values())
    const target = peopleSettings.people.find((p) => p.id === to)
    const ok = window.confirm(`Move ${ids.length} transaction${ids.length === 1 ? '' : 's'} to ${target?.name ?? 'that person'}?`)
    if (!ok) return
    try {
      await persistNow()
      const moved =
        isTauriRuntime()
          ? await moveTransactionIdsBetweenPeopleInTauriFiles(from, to, ids)
          : moveTransactionIdsBetweenPeopleInLocalStorage(from, to, ids)
      const loaded = isTauriRuntime()
        ? await loadTransactionsForPersonFromTauriFiles(state.settings, from)
        : loadTransactionsForPersonFromLocalStorage(state.settings, from)
      dispatch({
        type: 'settings/update',
        patch: {
          peopleTransactionCounts: {
            ...state.settings.peopleTransactionCounts,
            ...moved.counts,
            ...loaded.counts,
            [from]: loaded.transactions.length,
          },
        },
      })
      dispatch({ type: 'transactions/replaceLoaded', transactions: loaded.transactions })
      setSelectedIds(new Set())
      dispatch({ type: 'ui/selectTransaction', id: null })
      await persistNow()
    } catch (e) {
      window.alert(`Could not move transactions.\n\n${String((e as any)?.message ?? e)}`)
    }
  }

  function deleteAllTransactions() {
    const n = state.transactions.length
    if (n === 0) return
    setDeleteAllTyped('')
    setDeleteAllOpen(true)
  }

  function updateSelected(patch: Partial<Transaction>) {
    if (!selected) return
    let next: Transaction = { ...selected, ...patch }
    if (next.kind !== 'transfer') next = { ...next, toAccountId: null }
    if (next.kind !== 'expense') next = { ...next, category: null, customCategoryName: null }
    dispatch({ type: 'transactions/update', transaction: next })
  }

  function toggleSelection(id: UUID) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filtered.map((t) => t.id)))
  }

  function applyExpensePreset(t: Transaction, preset: string): Transaction {
    if (t.kind !== 'expense') return t
    if (preset.startsWith('custom:')) {
      const name = preset.slice('custom:'.length).trim()
      return { ...t, category: 'other', customCategoryName: name ? name : null }
    }
    if (preset.startsWith('cat:')) {
      const cat = preset.slice('cat:'.length) as any
      return { ...t, category: cat, customCategoryName: null }
    }
    return t
  }

  const autoCategorizeShownCount = useMemo(() => {
    let n = 0
    for (const t of filtered) {
      if (t.kind !== 'expense') continue
      const isUncategorized = (t.category ?? 'other') === 'other' && !(t.customCategoryName ?? '').trim()
      if (!isUncategorized) continue
      const key = payeeGroupKey(t.payee)
      if (!key) continue
      const preset = payeeExpenseCategorization.get(key)
      if (!preset) continue
      n += 1
    }
    return n
  }, [filtered, payeeExpenseCategorization])

  function autoCategorizeShown() {
    const updates: Transaction[] = []
    for (const t of filtered) {
      if (t.kind !== 'expense') continue
      const isUncategorized = (t.category ?? 'other') === 'other' && !(t.customCategoryName ?? '').trim()
      if (!isUncategorized) continue
      const key = payeeGroupKey(t.payee)
      if (!key) continue
      const preset = payeeExpenseCategorization.get(key)
      if (!preset) continue
      const next = applyExpensePreset(t, preset)
      if (next !== t) updates.push(next)
    }
    if (updates.length === 0) {
      window.alert('Nothing to auto-categorize in the current view.')
      return
    }
    dispatch({ type: 'transactions/bulkUpdate', transactions: updates })
    window.alert(`Auto-categorized ${updates.length} transactions based on previous categorization.`)
  }

  function openCategorizeWizard() {
    if (uncategorizedExpenseGroups.length === 0) {
      window.alert('No repeated uncategorized expenses found in the current view.')
      return
    }
    setWizardGroups(uncategorizedExpenseGroups)
    setWizardIndex(0)
    setShowCategorizeWizard(true)
  }

  function closeCategorizeWizard() {
    setShowCategorizeWizard(false)
    setWizardGroups([])
    setWizardIndex(0)
  }

  function wizardSkip() {
    if (wizardIndex >= wizardGroups.length - 1) {
      closeCategorizeWizard()
    } else {
      setWizardIndex((i) => i + 1)
    }
  }

  function wizardApplyAndNext() {
    const g = wizardGroups[wizardIndex]
    if (!g) return
    const custom = wizardCustomName.trim()
    if (wizardCategory === 'other' && !custom) {
      window.alert('Enter a category name or choose a base category.')
      return
    }
    const finalCategory: BillCategory = custom ? 'other' : wizardCategory
    const finalCustom = custom ? custom : null
    const byId = new Map<string, Transaction>()
    for (const t of state.transactions) byId.set(t.id, t)
    const updates: Transaction[] = []
    for (const id of g.ids) {
      const t = byId.get(id)
      if (!t) continue
      if (t.kind !== 'expense') continue
      const isUncategorized = (t.category ?? 'other') === 'other' && !(t.customCategoryName ?? '').trim()
      if (!isUncategorized) continue
      updates.push({
        ...t,
        category: finalCategory,
        customCategoryName: finalCustom,
      })
    }
    if (updates.length > 0) {
      dispatch({ type: 'transactions/bulkUpdate', transactions: updates })
    }
    if (wizardIndex >= wizardGroups.length - 1) {
      closeCategorizeWizard()
    } else {
      setWizardIndex((i) => i + 1)
    }
  }

  function wizardQuickApplyAndNext(customName: string) {
    const g = wizardGroups[wizardIndex]
    if (!g) return
    const custom = String(customName ?? '').trim()
    if (!custom) return
    const finalCategory: BillCategory = 'other'
    const finalCustom = custom
    const byId = new Map<string, Transaction>()
    for (const t of state.transactions) byId.set(t.id, t)
    const updates: Transaction[] = []
    for (const id of g.ids) {
      const t = byId.get(id)
      if (!t) continue
      if (t.kind !== 'expense') continue
      const isUncategorized = (t.category ?? 'other') === 'other' && !(t.customCategoryName ?? '').trim()
      if (!isUncategorized) continue
      updates.push({
        ...t,
        category: finalCategory,
        customCategoryName: finalCustom,
      })
    }
    if (updates.length > 0) {
      dispatch({ type: 'transactions/bulkUpdate', transactions: updates })
    }
    setWizardCategory('other')
    setWizardCustomName(finalCustom)
    if (wizardIndex >= wizardGroups.length - 1) {
      closeCategorizeWizard()
    } else {
      setWizardIndex((i) => i + 1)
    }
  }

  function applyBulkCategoryToSelection() {
    if (selectedIds.size === 0) return
    const byId = new Map<string, Transaction>()
    for (const t of state.transactions) byId.set(t.id, t)
    const custom = bulkCustomCategoryName.trim()
    const updates: Transaction[] = []
    let skipped = 0
    for (const id of selectedIds) {
      const t = byId.get(id)
      if (!t) continue
      if (t.kind !== 'expense') {
        skipped += 1
        continue
      }
      updates.push({
        ...t,
        category: bulkCategory,
        customCategoryName: custom ? custom : null,
      })
    }
    if (updates.length === 0) {
      window.alert('No expense transactions selected.')
      return
    }
    dispatch({ type: 'transactions/bulkUpdate', transactions: updates })
    setSelectedIds(new Set())
    if (skipped > 0) {
      window.alert(`Updated ${updates.length} expense transactions. Skipped ${skipped} non-expense transactions.`)
    } else {
      window.alert(`Updated ${updates.length} expense transactions.`)
    }
  }

  async function printSelectionFor(params: {
    tx: Transaction[]
    taxBase: 'income' | 'expense' | 'net'
    taxRatePct: number
    cisAlreadyDeducted: boolean
    taxOverrideEnabled: boolean
    taxOverrideAmount: number
    title?: string
  }) {
    if (params.tx.length === 0) return
    if (!enableTaxPdf) return
    const displayCurrency = state.settings.displayCurrencyCode
    const fmt = (n: number) => currency(n, displayCurrency)
    const cisMode = params.cisAlreadyDeducted && params.taxBase === 'income'
    const baseLabel = cisMode ? 'Income (Net)' : params.taxBase === 'income' ? 'Income' : params.taxBase === 'expense' ? 'Expenses' : 'Net'
    const taxLabel = cisMode ? 'CIS' : 'Tax'
    const totalLabel = cisMode ? 'Gross' : 'Total + Tax'
    const totals = calcSelectionTotalsFor(params)
    const title = (params.title ?? selectionReportTitle).trim() || 'Selected Transactions'

    const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
    const doc = new JsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFontSize(18)
    doc.text(title, 42, 48)

    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`Count: ${params.tx.length}`, 42, 64)

    doc.setDrawColor(200, 200, 200)
    doc.setFillColor(250, 250, 250)
    doc.roundedRect(42, 76, pageWidth - 84, 62, 6, 6, 'FD')

    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)

    const col1X = 56
    const val1X = 206
    const col2X = 270
    const val2X = 420

    doc.setFont('helvetica', 'normal')
    doc.text('Income:', col1X, 98)
    doc.text('Expenses:', col1X, 116)
    doc.text('Net:', col1X, 134)

    doc.setFont('helvetica', 'bold')
    doc.text(fmt(totals.income), val1X, 98, { align: 'right' })
    doc.text(fmt(totals.expense), val1X, 116, { align: 'right' })
    doc.text(fmt(totals.net), val1X, 134, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.text(`Tax base (${baseLabel}):`, col2X, 98)
    doc.text(`${taxLabel}:`, col2X, 116)
    doc.text(`${totalLabel}:`, col2X, 134)

    doc.setFont('helvetica', 'bold')
    doc.text(fmt(totals.base), val2X, 98, { align: 'right' })
    doc.text(fmt(totals.tax), val2X, 116, { align: 'right' })
    doc.text(fmt(totals.totalWithTax), val2X, 134, { align: 'right' })

    const tableData = params.tx.map((t) => {
      const account = t.accountId ? accountNameById.get(t.accountId) ?? '' : ''
      const amt = t.kind === 'expense' ? -t.amount.value : t.amount.value
      return [toDateInputValue(t.date), t.payee ?? '', account, fmt(amt), t.notes ?? '']
    })

    autoTable(doc, {
      startY: 156,
      head: [['Date', 'Payee', 'Account', 'Amount', 'Notes']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      columnStyles: { 3: { halign: 'right' } },
      styles: { fontSize: 9 },
      didDrawPage: () => {
        const pageNumber = doc.getNumberOfPages()
        doc.setFontSize(9)
        doc.setTextColor(120, 120, 120)
        doc.text(`Kivana • ${new Date().toLocaleString()} • Page ${pageNumber}`, 42, doc.internal.pageSize.getHeight() - 28)
        doc.setTextColor(0, 0, 0)
      },
    })

    if (isTauriRuntime()) {
      const safeTitle = title.replace(/[^\w\d]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'transactions'
      const defaultFileName = `${safeTitle}-${new Date().toISOString().slice(0, 10)}.pdf`
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
          title,
          createdAt: new Date(),
          invoiceDate: new Date(),
          vendor: null,
          client: null,
          total: null,
          attachments: [att],
        }
        dispatch({ type: 'invoices/add', invoice: inv })
      } catch {
      }
      window.alert('PDF saved successfully!')
    } else {
      doc.save(`transactions-summary-${new Date().toISOString().slice(0, 10)}.pdf`)
    }
  }

  async function printSelection() {
    await printSelectionFor({
      tx: selectedTx,
      taxBase,
      taxRatePct,
      cisAlreadyDeducted,
      taxOverrideEnabled,
      taxOverrideAmount,
      title: selectionReportTitle,
    })
  }

  useEffect(() => {
    if (!enableGuiAutomation) return
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<TransactionsAutomationRequest>
      const req = e.detail
      if (!req) return

      setViewMode('detailed')
      if (req.kind != null) setKindFilter(req.kind)
      if (req.payee != null) {
        const key = payeeGroupKey(req.payee)
        const hasExact = payeeGroups.some((p) => p.key === key)
        if (hasExact) {
          setPayeeFilter(key)
          if (req.search && req.search.trim().toLowerCase() === req.payee.trim().toLowerCase()) {
            setSearch('')
          } else if (req.search) {
            setSearch(req.search)
          }
        } else {
          setPayeeFilter('all')
          if (req.search && req.search.trim().toLowerCase() === req.payee.trim().toLowerCase()) {
            setSearch(req.payee)
          } else {
            setSearch(req.search ? `${req.search} ${req.payee}` : req.payee)
          }
        }
      } else if (req.search != null) {
        setSearch(req.search)
      }
      if (req.dateFrom != null || req.dateTo != null) {
        setDateFilter('range')
        setDateFrom(req.dateFrom ?? '')
        setDateTo(req.dateTo ?? '')
      }
      if (req.taxRatePct != null) {
        setTaxOverrideEnabled(false)
        setTaxRatePct(req.taxRatePct)
      }
      if (req.taxBase != null) setTaxBase(req.taxBase)

      const from = req.dateFrom ? fromDateInputValue(req.dateFrom) : null
      const to = req.dateTo ? fromDateInputValue(req.dateTo) : null
      const toExclusive = to
        ? (() => {
            const d = new Date(to)
            d.setDate(d.getDate() + 1)
            return d
          })()
        : null
      const hasExactPayee = req.payee ? payeeGroups.some((p) => p.key === payeeGroupKey(req.payee)) : false
      const effectivePayeeKey = req.payee && hasExactPayee ? payeeGroupKey(req.payee) : null
      
      // Clean up duplicate search terms if they perfectly match the payee
      let effectiveSearch = ''
      if (req.search) {
        if (req.payee && req.search.trim().toLowerCase() === req.payee.trim().toLowerCase()) {
          effectiveSearch = hasExactPayee ? '' : req.payee
        } else {
          effectiveSearch = req.payee && !hasExactPayee
            ? `${req.search} ${req.payee}`
            : req.search
        }
      } else {
        effectiveSearch = req.payee && !hasExactPayee ? req.payee : ''
      }
      
      const q = effectiveSearch.trim().toLowerCase()

      const hasCriteria = Boolean(req.kind || q || effectivePayeeKey || req.dateFrom || req.dateTo)
      const matches =
        req.useExistingSelection || (!req.selectAll && req.printPdf && !hasCriteria)
          ? selectedTx
          : state.transactions.filter((t) => {
              if (req.kind && t.kind !== req.kind) return false
              if (q) {
                const hay = [t.payee ?? '', t.notes ?? '', t.customCategoryName ?? '', ...(t.tags ?? [])].join(' ').toLowerCase()
                if (!hay.includes(q)) return false
              }
              if (effectivePayeeKey && payeeGroupKey(t.payee) !== effectivePayeeKey) return false
              if (from && t.date < from) return false
              if (toExclusive && t.date >= toExclusive) return false
              return true
            })

      if (req.selectAll) setSelectedIds(new Set(matches.map((t) => t.id)))
      if (req.printPdf) {
        void printSelectionFor({
          tx: matches,
          taxBase: req.taxBase ?? taxBase,
          taxRatePct: req.taxRatePct ?? taxRatePct,
          cisAlreadyDeducted,
          taxOverrideEnabled: req.taxRatePct != null ? false : taxOverrideEnabled,
          taxOverrideAmount,
        })
      }
    }
    window.addEventListener(AI_TRANSACTIONS_AUTOMATION_EVENT, handler)
    return () => {
      window.removeEventListener(AI_TRANSACTIONS_AUTOMATION_EVENT, handler)
    }
  }, [cisAlreadyDeducted, enableGuiAutomation, payeeGroups, selectedTx, state.transactions, taxBase, taxOverrideAmount, taxOverrideEnabled, taxRatePct])

  useEffect(() => {
    function handler(e: Event) {
      const ev = e as CustomEvent
      const name = String((ev as any)?.detail?.name ?? '').trim() || 'statement.pdf'
      const bytesBase64 = String((ev as any)?.detail?.bytesBase64 ?? '').trim()
      const mime = String((ev as any)?.detail?.mime ?? 'application/pdf').trim()
      if (!bytesBase64) return
      const bin = atob(bytesBase64)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      const file = new File([out], name, { type: mime || 'application/pdf' })
      void onPickPdf(file)
    }
    window.addEventListener(FILES_IMPORT_PDF_EVENT, handler as any)
    return () => window.removeEventListener(FILES_IMPORT_PDF_EVENT, handler as any)
  }, [state.accounts, state.settings, state.transactions])

  useEffect(() => {
    if (selectedIds.size === 0) {
      setSelectionPopoverStyle(null)
      setSelectionPopoverDocked(true)
      setSelectionPopoverFloatingPos(null)
      return
    }

    if (!selectionPopoverDocked) return

    const compute = () => {
      const anchor = selectionAnchorRef.current
      const wrap = toolbarWrapRef.current
      if (!anchor || !wrap) return
      const a = anchor.getBoundingClientRect()
      const w = wrap.getBoundingClientRect()
      const pad = 10
      const maxWidth = Math.max(320, w.width - pad * 2)
      const width = Math.min(620, maxWidth)
      let left = a.right - width
      left = Math.max(w.left + pad, Math.min(left, w.right - pad - width))
      let top = a.bottom + 8
      let maxHeight = w.bottom - pad - top
      if (maxHeight < 160) {
        top = w.top + pad
        maxHeight = w.height - pad * 2
      }
      setSelectionPopoverStyle({ left, top, width, maxHeight })
    }

    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [selectedIds.size, selectionPopoverDocked, selectionPopoverRepositionToken, viewMode])

  useEffect(() => {
    if (selectedIds.size === 0) return
    if (selectionPopoverDocked) return
    if (!selectionPopoverFloatingPos) return

    const compute = () => {
      const el = selectionPopoverRef.current
      const width = selectionPopoverStyle?.width ?? el?.getBoundingClientRect().width ?? 520
      const height = el?.getBoundingClientRect().height ?? 320
      const pad = 10
      const maxLeft = Math.max(pad, window.innerWidth - pad - width)
      const maxTop = Math.max(pad, window.innerHeight - pad - height)
      const left = Math.max(pad, Math.min(selectionPopoverFloatingPos.left, maxLeft))
      const top = Math.max(pad, Math.min(selectionPopoverFloatingPos.top, maxTop))
      const maxHeight = Math.max(160, window.innerHeight - pad - top)
      setSelectionPopoverStyle({ left, top, width, maxHeight })
    }

    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [selectedIds.size, selectionPopoverDocked, selectionPopoverFloatingPos, selectionPopoverStyle?.width])

  function startSelectionPopoverDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const t = e.target as HTMLElement | null
    if (t?.closest('button, a, input, select, textarea')) return
    const pop = selectionPopoverRef.current
    if (!pop) return
    const r = pop.getBoundingClientRect()
    const startLeft = selectionPopoverStyle?.left ?? r.left
    const startTop = selectionPopoverStyle?.top ?? r.top
    selectionPopoverDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft,
      startTop,
      width: r.width,
      height: r.height,
    }
    setSelectionPopoverDocked(false)
    setSelectionPopoverFloatingPos({ left: startLeft, top: startTop })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      const d = selectionPopoverDragRef.current
      if (!d || ev.pointerId !== d.pointerId) return
      const pad = 10
      const maxLeft = Math.max(pad, window.innerWidth - pad - d.width)
      const maxTop = Math.max(pad, window.innerHeight - pad - d.height)
      const left = Math.max(pad, Math.min(d.startLeft + (ev.clientX - d.startX), maxLeft))
      const top = Math.max(pad, Math.min(d.startTop + (ev.clientY - d.startY), maxTop))
      setSelectionPopoverFloatingPos({ left, top })
    }

    const onUp = (ev: PointerEvent) => {
      const d = selectionPopoverDragRef.current
      if (!d || ev.pointerId !== d.pointerId) return
      selectionPopoverDragRef.current = null
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
    }

    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
  }

  function importFileClick() {
    fileInputRef.current?.click()
  }

  function ImportIcon() {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v10" />
        <path d="M8 9l4 4 4-4" />
        <path d="M4 17v3h16v-3" />
      </svg>
    )
  }

  function PlusIcon() {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    )
  }

  function PrinterIcon() {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V4h12v5" />
        <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
        <path d="M6 14h12v6H6z" />
      </svg>
    )
  }

  function PercentIcon() {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 5L5 19" />
        <circle cx="7" cy="7" r="2" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    )
  }

  function TrashIcon() {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    )
  }

  async function onPickImportFile(fileOrFiles: File | File[] | null) {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles.filter(Boolean) : (fileOrFiles ? [fileOrFiles] : [])
    if (!files.length) return
    const pdfs: File[] = []
    const others: File[] = []
    for (const file of files) {
      const name = String(file.name ?? '').toLowerCase()
      const type = String(file.type ?? '').toLowerCase()
      const isPdf = name.endsWith('.pdf') || type.includes('pdf')
      if (isPdf) pdfs.push(file)
      else others.push(file)
    }
    if (pdfs.length && others.length) {
      window.alert('Please import PDF files and CSV files separately.')
      return
    }
    if (pdfs.length) {
      await onPickPdf(pdfs)
      return
    }
    if (others.length > 1) {
      window.alert('CSV import currently supports one file at a time.')
      return
    }
    await onPickCsv(others[0] ?? null)
  }

  async function readTextFileSmart(file: File): Promise<string> {
    const buf = await file.arrayBuffer()
    let bytes = new Uint8Array(buf)

    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      try {
        return new TextDecoder('utf-16le').decode(bytes.subarray(2))
      } catch {}
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      const swapped = new Uint8Array(Math.max(0, bytes.length - 2))
      let j = 0
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        swapped[j++] = bytes[i + 1]!
        swapped[j++] = bytes[i]!
      }
      try {
        return new TextDecoder('utf-16le').decode(swapped)
      } catch {}
    }

    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      bytes = bytes.subarray(3)
    }

    const candidates: Array<{ enc: string; fatal: boolean }> = [
      { enc: 'utf-8', fatal: true },
      { enc: 'utf-8', fatal: false },
      { enc: 'windows-1252', fatal: false },
      { enc: 'iso-8859-1', fatal: false },
    ]

    let bestText: string | null = null
    let bestBad = Number.POSITIVE_INFINITY

    for (const c of candidates) {
      let text: string
      try {
        text = new TextDecoder(c.enc as any, { fatal: c.fatal }).decode(bytes)
      } catch {
        continue
      }
      const bad = (text.match(/\uFFFD/g) ?? []).length
      if (bad < bestBad) {
        bestBad = bad
        bestText = text
      }
      if (bad === 0 && c.enc === 'utf-8') return text
    }

    return bestText ?? (await file.text())
  }

  async function onPickCsv(file: File | null) {
    if (!file) return
    await beginImportBusy('Reading CSV…')
    try {
      const text = await readTextFileSmart(file)
      updateImportBusy('Parsing rows…')
      const rows = parseCsvRows(text)
      const activeAccounts = state.accounts.filter((a) => !a.archived)
      const resolveAccountId = (raw: string | undefined): UUID | null => {
        const normalized = (raw ?? '').trim()
        if (!normalized) return activeAccounts[0]?.id ?? null
        const exact = activeAccounts.find((a) => a.name.localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0)
        if (exact) return exact.id
        const contains = activeAccounts.find((a) => a.name.toLowerCase().includes(normalized.toLowerCase()) || (a.institution ?? '').toLowerCase().includes(normalized.toLowerCase()))
        return contains?.id ?? activeAccounts[0]?.id ?? null
      }
      const importedBase = rowsToTransactions(rows, state.settings.displayCurrencyCode, resolveAccountId)
      updateImportBusy('Applying category rules…')
      const piped = runImportPipeline({ existing: state.transactions, imported: importedBase, settings: state.settings, sourceTag: 'bank-csv' })
      let autoCount = piped.autoCategorizedCount
      const imported = piped.transactions.map((t) => {
        if (t.kind !== 'expense') return t
        const isUncategorized = (t.category ?? 'other') === 'other' && !(t.customCategoryName ?? '').trim()
        if (!isUncategorized) return t
        const key = payeeGroupKey(t.payee)
        if (!key) return t
        const preset = payeeExpenseCategorization.get(key)
        if (!preset) return t
        autoCount += 1
        return applyExpensePreset(t, preset)
      })
      if (imported.length === 0) {
        window.alert('Import complete. No transactions were imported.')
        return
      }
      updateImportBusy('Checking duplicates…')
      if (piped.duplicateKeysInFile.length > 0 || piped.duplicateKeysExisting.length > 0) {
        setImportDuplicateModal({
          source: 'CSV',
          tx: imported,
          autoCount,
          duplicateKeysInFile: piped.duplicateKeysInFile,
          duplicateKeysExisting: piped.duplicateKeysExisting,
        })
        return
      }
      updateImportBusy('Saving imported transactions…')
      commitImportTransactions(imported, autoCount)
    } finally {
      endImportBusy()
    }
  }

  async function onPickPdf(fileOrFiles: File | File[] | null) {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles.filter(Boolean) : (fileOrFiles ? [fileOrFiles] : [])
    if (!files.length) return
    setImportingPdf(true)
    await beginImportBusy(files.length > 1 ? `Reading ${files.length} PDFs…` : 'Reading PDF…')
    try {
      const allRows: Awaited<ReturnType<typeof parsePdfRowsWithOptions>> = []
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        updateImportBusy(files.length > 1 ? `Reading PDF ${i + 1} of ${files.length}…` : 'Reading PDF…')
        const rows = await parsePdfRowsWithOptions(file, { format: pdfFormat })
        allRows.push(...rows)
      }
      updateImportBusy('Parsing transactions…')
      const activeAccounts = state.accounts.filter((a) => !a.archived)
      const resolveAccountId = (raw: string | undefined): UUID | null => {
        const normalized = (raw ?? '').trim()
        if (!normalized) return activeAccounts[0]?.id ?? null
        const exact = activeAccounts.find((a) => a.name.localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0)
        if (exact) return exact.id
        const contains = activeAccounts.find((a) => a.name.toLowerCase().includes(normalized.toLowerCase()) || (a.institution ?? '').toLowerCase().includes(normalized.toLowerCase()))
        return contains?.id ?? activeAccounts[0]?.id ?? null
      }
      const importedBase = pdfRowsToTransactions(allRows, state.settings.displayCurrencyCode, resolveAccountId)
      updateImportBusy('Applying category rules…')
      const piped = runImportPipeline({ existing: state.transactions, imported: importedBase, settings: state.settings, sourceTag: 'bank-pdf' })
      let autoCount = piped.autoCategorizedCount
      const imported = piped.transactions.map((t) => {
        if (t.kind !== 'expense') return t
        const isUncategorized = (t.category ?? 'other') === 'other' && !(t.customCategoryName ?? '').trim()
        if (!isUncategorized) return t
        const key = payeeGroupKey(t.payee)
        if (!key) return t
        const preset = payeeExpenseCategorization.get(key)
        if (!preset) return t
        autoCount += 1
        return applyExpensePreset(t, preset)
      })
      if (imported.length === 0) {
        window.alert(files.length > 1 ? 'Import complete. No transactions could be identified in the selected PDFs.' : 'Import complete. No transactions could be identified in the PDF.')
        return
      }
      updateImportBusy('Checking duplicates…')
      if (piped.duplicateKeysInFile.length > 0 || piped.duplicateKeysExisting.length > 0) {
        setImportDuplicateModal({
          source: 'PDF',
          tx: imported,
          autoCount,
          duplicateKeysInFile: piped.duplicateKeysInFile,
          duplicateKeysExisting: piped.duplicateKeysExisting,
        })
        return
      }
      updateImportBusy('Saving imported transactions…')
      commitImportTransactions(imported, autoCount)
    } catch (e) {
      console.error(e)
      window.alert('Failed to parse PDF file. Ensure it is a valid bank statement PDF.')
    } finally {
      setImportingPdf(false)
      endImportBusy()
    }
  }

  const categories: BillCategory[] = ['housing', 'utilities', 'subscriptions', 'insurance', 'taxes', 'transport', 'other']
  const activeAccounts = useMemo(() => state.accounts.filter((a) => !a.archived).sort((a, b) => a.name.localeCompare(b.name)), [state.accounts])

  const accountNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of state.accounts) m.set(a.id, a.name)
    return m
  }, [state.accounts])

  const activeFilterCount = useMemo(() => {
    let c = 0
    if (accountFilterId !== 'all') c += 1
    if (kindFilter !== 'all') c += 1
    if (sourceFilter !== 'all') c += 1
    if (dateFilter !== 'all') {
      if (dateFilter !== 'range') c += 1
      else if (dateFrom || dateTo) c += 1
    }
    if (payeeFilter !== 'all') c += 1
    if (categoryFilter !== 'all') c += 1
    if (sort !== 'dateDesc') c += 1
    if (search.trim()) c += 1
    return c
  }, [accountFilterId, categoryFilter, dateFilter, dateFrom, dateTo, kindFilter, payeeFilter, search, sort, sourceFilter])

  const filterSummary = useMemo(() => {
    const parts: string[] = []
    if (accountFilterId !== 'all') {
      const name = accountNameById.get(accountFilterId) ?? 'Account'
      parts.push(`Acct: ${name}`)
    }
    if (kindFilter !== 'all') {
      parts.push(kindFilter === 'expense' ? 'Expenses' : kindFilter === 'income' ? 'Income' : 'Transfers')
    }
    if (sourceFilter !== 'all') parts.push(sourceFilter === 'imported' ? 'Imported' : 'Manual')
    if (dateFilter !== 'all') {
      if (dateFilter === 'range') {
        const from = dateFrom ? dateFrom : '…'
        const to = dateTo ? dateTo : 'now'
        parts.push(`Date: ${from} → ${to}`)
      } else {
        parts.push(dateFilter === 'last30' ? 'Last 30 days' : dateFilter === 'last90' ? 'Last 90 days' : 'This month')
      }
    }
    if (payeeFilter !== 'all') parts.push(`Payee: ${payeeFilter}`)
    if (categoryFilter !== 'all') {
      const raw = categoryFilter
      if (raw.startsWith('cat:')) parts.push(`Cat: ${raw.slice('cat:'.length)}`)
      else if (raw.startsWith('custom:')) parts.push(`Cat: ${raw.slice('custom:'.length)}`)
      else parts.push(`Cat: ${raw}`)
    }
    if (sort !== 'dateDesc') {
      const label =
        sort === 'dateAsc'
          ? 'Oldest'
          : sort === 'amountDesc'
            ? 'Amount ↓'
            : sort === 'amountAsc'
              ? 'Amount ↑'
              : sort === 'netDesc'
                ? 'Net ↓'
                : sort === 'netAsc'
                  ? 'Net ↑'
                  : sort === 'nameAsc'
                    ? 'Name A→Z'
                    : 'Name Z→A'
      parts.push(`Sort: ${label}`)
    }
    return parts.join(' • ')
  }, [accountFilterId, accountNameById, categoryFilter, dateFilter, dateFrom, dateTo, kindFilter, payeeFilter, sort, sourceFilter])

  function clearFilters() {
    setAccountFilterId('all')
    setKindFilter('all')
    setSourceFilter('all')
    setDateFilter('all')
    setDateFrom('')
    setDateTo('')
    setPayeeFilter('all')
    setCategoryFilter('all')
    setSort('dateDesc')
    setAllowLargeUnfilteredList(false)
  }

  function txnTitle(t: Transaction): string {
    if (t.payee && t.payee.trim()) return t.payee
    if (t.kind === 'income') return 'Income'
    if (t.kind === 'expense') return 'Expense'
    return 'Transfer'
  }

  function txnSubtitle(t: Transaction): string {
    const account = t.accountId ? accountNameById.get(t.accountId) : null
    const parts: string[] = []
    if (account) parts.push(account)
    if (t.kind === 'expense') {
      const cat = t.customCategoryName?.trim() || t.category
      if (cat) parts.push(String(cat))
    }
    if ((t.tags ?? []).includes('bank-csv') || (t.tags ?? []).includes('bank-pdf')) parts.push('Imported')
    return parts.join(' • ')
  }

  function signedAmount(t: Transaction): number {
    if (t.kind === 'expense') return -t.amount.value
    return t.amount.value
  }

  function amountTone(t: Transaction): 'pos' | 'neg' | 'neutral' {
    if (t.kind === 'income') return 'pos'
    if (t.kind === 'expense') return 'neg'
    return 'neutral'
  }

  function focusFirstEditorField() {
    window.setTimeout(() => {
      const el = document.querySelector('.detail .form input, .detail .form select, .detail .form textarea') as HTMLElement | null
      el?.focus?.()
    }, 0)
  }

  const rowMenu = useContextMenu([
    {
      id: 'edit',
      label: 'Edit',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'ui/selectTransaction', id: selectedId })
        focusFirstEditorField()
      },
    },
    { id: 'sep', kind: 'separator' as const },
    {
      id: 'delete',
      label: 'Delete',
      tone: 'danger',
      onSelect: () => {
        if (!selectedId) return
        if (!window.confirm('Delete transaction?')) return
        dispatch({ type: 'transactions/delete', id: selectedId })
      },
    },
  ])

  const wizardCurrentSummary = useMemo(() => {
    if (!showCategorizeWizard) return null
    const g = wizardGroups[wizardIndex]
    if (!g) return null
    const byId = new Map<string, Transaction>()
    for (const t of state.transactions) byId.set(t.id, t)
    const tx: Transaction[] = []
    let total = 0
    let minDate: Date | null = null
    let maxDate: Date | null = null
    for (const id of g.ids) {
      const t = byId.get(id)
      if (!t) continue
      tx.push(t)
      if (t.kind === 'expense') total += t.amount.value
      if (!minDate || t.date < minDate) minDate = t.date
      if (!maxDate || t.date > maxDate) maxDate = t.date
    }
    tx.sort((a, b) => b.date.getTime() - a.date.getTime())
    return {
      payeeKey: g.payeeKey,
      count: g.count,
      total,
      sample: tx.slice(0, 6),
      minDate,
      maxDate,
      isLast: wizardIndex >= wizardGroups.length - 1,
      stepLabel: `Step ${wizardIndex + 1} of ${wizardGroups.length}`,
    }
  }, [showCategorizeWizard, state.transactions, wizardGroups, wizardIndex])

  return (
    <>
      {importBusy ? (
        <div className="modalBackdrop">
          <div className="modal" style={{ width: 'min(440px, calc(100vw - 32px))' }}>
            <div className="modalTitle">Please wait</div>
            <div className="busyRow" style={{ marginTop: 8 }}>
              <span className="busySpinner" aria-hidden="true" />
              <span>{importBusyText || 'Working on import…'}</span>
            </div>
          </div>
        </div>
      ) : null}
      {importDuplicateModal ? (
        <div
          className="modalBackdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setImportDuplicateModal(null)
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(760px, calc(100vw - 32px))' }}>
            <div className="modalTitle">Possible duplicates found</div>
            <div className="note">
              Import source: {importDuplicateModal.source}
              {peopleSettings.peopleEnabled && activePerson ? ` • Person: ${activePerson.name}` : ''}
            </div>
            <div className="note" style={{ marginTop: 8 }}>
              {importDuplicateModal.duplicateKeysInFile.length
                ? `${importDuplicateModal.duplicateKeysInFile.length} duplicate pattern(s) inside this file`
                : 'No duplicates inside this file'}
              {importDuplicateModal.duplicateKeysExisting.length
                ? ` • ${importDuplicateModal.duplicateKeysExisting.length} match existing transactions`
                : ''}
            </div>

            <div className="groupBox" style={{ marginTop: 12 }}>
              <div className="groupTitle">Preview</div>
              <div className="note">Duplicates will be imported, but marked as Verify.</div>
              <div className="list" style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto' }}>
                {(() => {
                  const inFile = new Set(importDuplicateModal.duplicateKeysInFile)
                  const inExisting = new Set(importDuplicateModal.duplicateKeysExisting)
                  const dupes = importDuplicateModal.tx
                    .map((t) => ({ t, k: transactionDupeKey(t) }))
                    .filter((x) => inFile.has(x.k) || inExisting.has(x.k))
                    .slice(0, 60)
                  return dupes.map(({ t, k }) => {
                    const reasons = [inFile.has(k) ? 'In file' : null, inExisting.has(k) ? 'Already exists' : null].filter(Boolean).join(' • ')
                    return (
                      <div key={t.id} className="listItem" style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-h)' }}>{t.payee ?? t.kind}</div>
                            <div className="note">
                              {toDateInputValue(t.date)} • {currency(t.kind === 'expense' ? -t.amount.value : t.amount.value, t.amount.currencyCode)}
                              {reasons ? ` • ${reasons}` : ''}
                            </div>
                          </div>
                          <span className="pill" data-tone="neg">
                            Verify
                          </span>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>

            <div className="modalActions">
              <button type="button" onClick={() => setImportDuplicateModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btnPrimary"
                onClick={() => {
                  const inFile = new Set(importDuplicateModal.duplicateKeysInFile)
                  const inExisting = new Set(importDuplicateModal.duplicateKeysExisting)
                  const marked = importDuplicateModal.tx.map((t) => {
                    const k = transactionDupeKey(t)
                    if (!inFile.has(k) && !inExisting.has(k)) return t
                    return { ...t, tags: uniqueTags([...(t.tags ?? []), 'needs-review', 'duplicate']) }
                  })
                  commitImportTransactions(marked, importDuplicateModal.autoCount)
                  setImportDuplicateModal(null)
                }}
              >
                Import anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteAllOpen ? (
        <div className="modalBackdrop" onMouseDown={() => setDeleteAllOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">Delete all transactions</div>
            <div className="note">
              This will permanently delete <strong>{state.transactions.length.toLocaleString()}</strong>{' '}
              transaction(s)
              {peopleSettings.peopleEnabled && activePerson ? ` for ${activePerson.name}` : ''}. This cannot be undone.
            </div>
            <div className="note" style={{ marginTop: 8 }}>
              Type <strong>DELETE ALL</strong> to confirm.
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <div className="fieldLabel">Confirmation</div>
              <input value={deleteAllTyped} onChange={(e) => setDeleteAllTyped(e.target.value)} />
            </div>
            <div className="modalActions">
              <button type="button" onClick={() => setDeleteAllOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btnDanger"
                disabled={deleteAllTyped.trim() !== 'DELETE ALL'}
                onClick={() => {
                  dispatch({ type: 'transactions/clearAll' })
                  setSelectedIds(new Set())
                  setDeleteAllOpen(false)
                }}
              >
                Delete all
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showCategorizeWizard && wizardCurrentSummary ? (
        <div
          className="modalBackdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeCategorizeWizard()
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(760px, calc(100vw - 32px))' }}>
            <div className="modalTitle">Categorize Transactions</div>
            <div className="note">{wizardCurrentSummary.stepLabel}</div>
            <div className="groupBox" style={{ marginTop: 12 }}>
              <div className="groupTitle">Payee group</div>
              <div className="note" style={{ wordBreak: 'break-word' }}>
                {wizardCurrentSummary.payeeKey} • {wizardCurrentSummary.count} transactions • Total {currency(wizardCurrentSummary.total, state.settings.displayCurrencyCode)}
                {wizardCurrentSummary.minDate && wizardCurrentSummary.maxDate
                  ? ` • ${toDateInputValue(wizardCurrentSummary.minDate)} → ${toDateInputValue(wizardCurrentSummary.maxDate)}`
                  : ''}
              </div>
              <div className="list" style={{ marginTop: 10, maxHeight: 240, overflowY: 'auto' }}>
                {wizardCurrentSummary.sample.map((t) => (
                  <div key={t.id} className="listItem" style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 650,
                            color: 'var(--text-h)',
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                            lineHeight: 1.25,
                          }}
                          title={txnTitle(t)}
                        >
                          {txnTitle(t)}
                        </div>
                        {t.notes && t.notes.trim() ? (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 12,
                              color: 'var(--muted)',
                              whiteSpace: 'normal',
                              overflowWrap: 'anywhere',
                              lineHeight: 1.25,
                            }}
                          >
                            {t.notes}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <div className="rowAmount" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {currency(signedAmount(t), t.amount.currencyCode)}
                        </div>
                        <div className="rowMeta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {toDateInputValue(t.date)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="fieldRow" style={{ marginTop: 12 }}>
              <label className="field">
                <div className="fieldLabel">Use existing</div>
                <MenuSelect
                  value={
                    ((wizardCustomName ?? '').trim()
                      ? `custom:${(wizardCustomName ?? '').trim()}`
                      : `cat:${wizardCategory}`) as any
                  }
                  options={[
                    ...categories.map((c) => ({ value: `cat:${c}` as any, label: c })),
                    ...customExpenseCategoryNames.map((c) => ({ value: `custom:${c}` as any, label: c })),
                  ]}
                  onChange={(v) => {
                    const raw = String(v ?? '')
                    if (raw.startsWith('custom:')) {
                      setWizardCategory('other')
                      setWizardCustomName(raw.slice('custom:'.length))
                    } else if (raw.startsWith('cat:')) {
                      setWizardCategory(raw.slice('cat:'.length) as any)
                      setWizardCustomName('')
                    }
                  }}
                  width={240}
                />
              </label>
              <label className="field">
                <div className="fieldLabel">Base category</div>
                <MenuSelect
                  value={wizardCategory as any}
                  options={categories.map((c) => ({ value: c as any, label: c }))}
                  onChange={(v) => {
                    setWizardCategory(v as any)
                    setWizardCustomName('')
                  }}
                  width={240}
                />
              </label>
              <label className="field">
                <div className="fieldLabel">Category name</div>
                <input value={wizardCustomName} onChange={(e) => setWizardCustomName(e.target.value)} placeholder="Example: Groceries" />
              </label>
            </div>

            <div className="modalActions">
              <button type="button" onClick={wizardSkip}>
                Skip
              </button>
              <button type="button" onClick={() => wizardQuickApplyAndNext('Food')}>
                Food
              </button>
              <button type="button" onClick={closeCategorizeWizard}>
                Close
              </button>
              <button type="button" onClick={wizardApplyAndNext} className="btnPrimary">
                {wizardCurrentSummary.isLast ? 'Apply & Finish' : 'Apply & Next'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className={showEditor ? 'toolbarWrap txToolbarWithDetail' : 'toolbarWrap'} ref={toolbarWrapRef}>
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="rowActions" style={{ flex: 1, alignItems: 'center' }}>
            <button type="button" onClick={importFileClick} disabled={importingPdf} className="btnWithIcon">
              <span className="btnIcon">
                <ImportIcon />
              </span>
              Import
            </button>
            <button type="button" onClick={createTransaction} className="btnPrimary btnIconOnly" aria-label="Add transaction" title="Add">
              <PlusIcon />
            </button>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" style={{ width: 280 }} />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.pdf,text/csv,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const picked = Array.from(e.currentTarget.files ?? [])
                e.currentTarget.value = ''
                void onPickImportFile(picked)
              }}
            />
          </div>
          <div className="rowActions" style={{ alignItems: 'center' }}>
            <div className="segmented" role="group" aria-label="View mode" ref={viewModeAnchorRef}>
              <button type="button" className={viewMode === 'standard' ? 'active' : ''} onClick={() => setViewMode('standard')}>
                Standard
              </button>
              <button type="button" className={viewMode === 'detailed' ? 'active' : ''} onClick={() => setViewMode('detailed')}>
                Detailed
              </button>
            </div>
            {selectedIds.size > 0 ? (
              <button
                type="button"
                className="selectionPillBtn"
                onClick={() => {
                  setSelectionPopoverDocked(true)
                  setSelectionPopoverFloatingPos(null)
                  setSelectionPopoverRepositionToken((n) => n + 1)
                }}
                ref={selectionAnchorRef}
              >
                Selected {selectedIds.size}
              </button>
            ) : null}
          </div>
        </div>
        <div className="toolbarSubtitle">
          {filtered.length.toLocaleString()} / {personTransactions.length.toLocaleString()} shown
          {filterSummary ? ` • ${filterSummary}` : ''}
          {peopleSettings.peopleEnabled && activePerson ? ` • Person: ${activePerson.name}` : ''}
        </div>
        {showFilters ? (
          <div className="row" style={{ marginTop: 8 }}>
            <div className="rowActions">
              <button type="button" onClick={openCategorizeWizard} disabled={uncategorizedExpenseGroups.length === 0}>
                Categorize Wizard{categorizeWizardEligibleCount > 0 ? ` (${categorizeWizardEligibleCount})` : ''}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {selectedIds.size > 0 && selectionPopoverStyle && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="selectionPopover"
              ref={selectionPopoverRef}
              style={{
                position: 'fixed',
                left: selectionPopoverStyle.left,
                top: selectionPopoverStyle.top,
                width: selectionPopoverStyle.width,
                maxHeight: selectionPopoverStyle.maxHeight,
                overflowY: 'auto',
              }}
            >
              <div className="selectionMeta selectionDragHandle" onPointerDown={startSelectionPopoverDrag}>
                <span className="pill">Selected {selectedIds.size}</span>
              </div>
              <div className="selectionActions">
                <button type="button" className="selTile" onClick={clearSelection}>
                  <span className="selIcon" aria-hidden="true">
                    ×
                  </span>
                  <span className="selLabel">Clear</span>
                </button>
                <button type="button" className="selTile" disabled={!enableTaxPdf} onClick={printSelection}>
                  <span className="selIcon">
                    <PrinterIcon />
                  </span>
                  <span className="selLabel">Print / PDF</span>
                </button>
                <button type="button" className="selTile" disabled={autoCategorizeShownCount === 0} onClick={autoCategorizeShown}>
                  <span className="selIcon">
                    <PercentIcon />
                  </span>
                  <span className="selLabel">Auto-categorize</span>
                </button>
                <button type="button" className="selTile danger" onClick={deleteSelectionTransactions}>
                  <span className="selIcon">
                    <TrashIcon />
                  </span>
                  <span className="selLabel">Delete Selected</span>
                </button>
                <button type="button" className="selDangerSmall" disabled={state.transactions.length === 0} onClick={deleteAllTransactions}>
                  <span className="selIcon">
                    <TrashIcon />
                  </span>
                  <span className="selLabel">Delete All</span>
                </button>
              </div>
              {peopleSettings.peopleEnabled && peopleSettings.people.length > 1 ? (
                <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Move selected to</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <MenuSelect
                      value={bulkMovePersonId}
                      options={peopleSettings.people
                        .filter((p) => p.id !== peopleSettings.activePersonId)
                        .map((p) => ({ value: p.id as any, label: p.name }))}
                      onChange={(v) => setBulkMovePersonId(String(v))}
                      width={220}
                    />
                    <button type="button" onClick={() => void moveSelectionToPerson()} disabled={!bulkMovePersonId}>
                      Move
                    </button>
                  </div>
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}

      <div ref={txSplitRef} className={showEditor ? 'split stickyDetail txSplit' : 'split noDetail txSplit'}>
        <div className="list" ref={listRef}>
          <div className="listControls">
            <div className="listControlsRow rowActions" style={{ alignItems: 'end' }}>
              <button type="button" onClick={selectAllFiltered} disabled={filtered.length === 0}>
                Select shown
              </button>
              {showFilters ? (
                <button type="button" onClick={clearFilters} disabled={activeFilterCount === 0}>
                  Clear Filters
                </button>
              ) : null}
              <label className="field" style={{ margin: 0 }}>
                <div className="fieldLabel">Sort</div>
                <MenuSelect
                  value={sort}
                  options={[
                    { value: 'dateDesc', label: 'Newest' },
                    { value: 'dateAsc', label: 'Oldest' },
                    { value: 'nameAsc', label: 'Name A→Z' },
                    { value: 'nameDesc', label: 'Name Z→A' },
                    { value: 'amountDesc', label: 'Amount ↓' },
                    { value: 'amountAsc', label: 'Amount ↑' },
                    { value: 'netDesc', label: 'Net ↓' },
                    { value: 'netAsc', label: 'Net ↑' },
                  ]}
                  onChange={(v) => setSort(v as any)}
                  width={150}
                />
              </label>
              {showFilters ? (
                <>
                <label className="field" style={{ margin: 0 }}>
                  <div className="fieldLabel">Account</div>
                  <MenuSelect
                    value={accountFilterId}
                    options={[
                      { value: 'all', label: 'All Accounts' },
                      ...activeAccounts.map((a) => ({ value: a.id as any, label: a.name })),
                    ]}
                    onChange={(v) => setAccountFilterId(v as any)}
                    width={220}
                  />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <div className="fieldLabel">Type</div>
                  <MenuSelect
                    value={kindFilter}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'expense', label: 'Expenses' },
                      { value: 'income', label: 'Income' },
                      { value: 'transfer', label: 'Transfers' },
                    ]}
                    onChange={(v) => setKindFilter(v as any)}
                    width={150}
                  />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <div className="fieldLabel">Source</div>
                  <MenuSelect
                    value={sourceFilter}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'imported', label: 'Imported' },
                      { value: 'manual', label: 'Manual' },
                    ]}
                    onChange={(v) => setSourceFilter(v as any)}
                    width={150}
                  />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <div className="fieldLabel">Date</div>
                  <MenuSelect
                    value={dateFilter}
                    options={[
                      { value: 'all', label: 'All time' },
                      { value: 'last30', label: 'Last 30 days' },
                      { value: 'last90', label: 'Last 90 days' },
                      { value: 'thisMonth', label: 'This month' },
                      { value: 'range', label: 'Custom range' },
                    ]}
                    onChange={(v) => setDateFilter(v as any)}
                    width={160}
                  />
                </label>
                {dateFilter === 'range' ? (
                  <>
                    <label className="field" style={{ margin: 0 }}>
                      <div className="fieldLabel">From</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          style={{
                            appearance: 'none',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-h)',
                            padding: '8px 10px',
                            borderRadius: 8,
                            fontSize: 13,
                            height: 34,
                            width: 140,
                          }}
                        />
                        <div style={{ display: 'grid', gridAutoFlow: 'column', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setDateFrom((v) => shiftDateValue(v, -1, 0))}
                            style={{ padding: '4px 6px', fontSize: 11 }}
                          >
                            -1y
                          </button>
                          <button
                            type="button"
                            onClick={() => setDateFrom((v) => shiftDateValue(v, 1, 0))}
                            style={{ padding: '4px 6px', fontSize: 11 }}
                          >
                            +1y
                          </button>
                          <button
                            type="button"
                            onClick={() => setDateFrom((v) => shiftDateValue(v, 0, -1))}
                            style={{ padding: '4px 6px', fontSize: 11 }}
                          >
                            -1m
                          </button>
                          <button
                            type="button"
                            onClick={() => setDateFrom((v) => shiftDateValue(v, 0, 1))}
                            style={{ padding: '4px 6px', fontSize: 11 }}
                          >
                            +1m
                          </button>
                          <button type="button" onClick={() => setDateFrom('')} style={{ padding: '4px 6px', fontSize: 11 }}>
                            Clear
                          </button>
                        </div>
                      </div>
                    </label>
                    <label className="field" style={{ margin: 0 }}>
                      <div className="fieldLabel">To</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          style={{
                            appearance: 'none',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-h)',
                            padding: '8px 10px',
                            borderRadius: 8,
                            fontSize: 13,
                            height: 34,
                            width: 140,
                          }}
                        />
                        <div style={{ display: 'grid', gridAutoFlow: 'column', gap: 6 }}>
                          <button type="button" onClick={() => setDateTo((v) => shiftDateValue(v, -1, 0))} style={{ padding: '4px 6px', fontSize: 11 }}>
                            -1y
                          </button>
                          <button type="button" onClick={() => setDateTo((v) => shiftDateValue(v, 1, 0))} style={{ padding: '4px 6px', fontSize: 11 }}>
                            +1y
                          </button>
                          <button type="button" onClick={() => setDateTo((v) => shiftDateValue(v, 0, -1))} style={{ padding: '4px 6px', fontSize: 11 }}>
                            -1m
                          </button>
                          <button type="button" onClick={() => setDateTo((v) => shiftDateValue(v, 0, 1))} style={{ padding: '4px 6px', fontSize: 11 }}>
                            +1m
                          </button>
                          <button type="button" onClick={() => setDateTo(toDateInputValue(new Date()))} style={{ padding: '4px 6px', fontSize: 11 }}>
                            Today
                          </button>
                          <button type="button" onClick={() => setDateTo('')} style={{ padding: '4px 6px', fontSize: 11 }}>
                            Clear
                          </button>
                        </div>
                      </div>
                    </label>
                  </>
                ) : null}
                <label className="field" style={{ margin: 0 }}>
                  <div className="fieldLabel">Payee</div>
                  <MenuSelect
                    value={payeeFilter as any}
                    options={[
                      { value: 'all', label: 'All' },
                      ...payeeGroups.map((x) => ({ value: x.key as any, label: `${x.key} (${x.count})` })),
                    ]}
                    onChange={(v) => setPayeeFilter(v as any)}
                    width={340}
                  />
                </label>
                <label className="field" style={{ margin: 0 }}>
                  <div className="fieldLabel">Category</div>
                  <MenuSelect
                    value={categoryFilter}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'cat:other', label: 'Other (uncategorized)' },
                      ...categories
                        .filter((c) => c !== 'other')
                        .map((c) => ({ value: `cat:${c}` as any, label: c })),
                      ...customExpenseCategoryNames.map((c) => ({ value: `custom:${c}` as any, label: c })),
                    ]}
                    onChange={(v) => setCategoryFilter(v as any)}
                    width={170}
                  />
                </label>
                </>
              ) : null}
            </div>
          </div>
          {isListGated ? (
            <div className="empty">
              <div>Lots of transactions ({personTransactions.length}). Apply filters to load them.</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" onClick={() => setDateFilter('last30')}>
                  Last 30 days
                </button>
                <button type="button" onClick={() => setDateFilter('last90')}>
                  Last 90 days
                </button>
                <button type="button" className="btnPrimary" onClick={() => setAllowLargeUnfilteredList(true)}>
                  Load all anyway
                </button>
              </div>
            </div>
          ) : (
            <>
              {virtualWindow.topPad > 0 ? <div style={{ height: virtualWindow.topPad }} /> : null}
              {filtered.slice(virtualWindow.start, virtualWindow.end).map((t) => {
                const isImported = (t.tags ?? []).includes('bank-csv') || (t.tags ?? []).includes('bank-pdf')
                const noteText = String(t.notes ?? '').trim()
                const tooltip = isImported && noteText ? noteText.slice(0, 800) : undefined
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    title={tooltip}
                    className={t.id === selectedId && selectedIds.size === 0 ? 'listItem active txnRow' : 'listItem txnRow'}
                    style={selectedIds.has(t.id) ? { background: 'var(--accent-bg-strong)' } : {}}
                    onClick={() => {
                      if (selectedIds.size > 0) {
                        toggleSelection(t.id)
                      } else {
                        dispatch({ type: 'ui/selectTransaction', id: t.id })
                      }
                    }}
                    onContextMenu={(e) => {
                      dispatch({ type: 'ui/selectTransaction', id: t.id })
                      rowMenu.open(e)
                    }}
                  >
                  <div className="txnCheckWrap" style={{ display: 'grid', placeItems: 'center' }}>
                    <input
                      type="checkbox"
                      className="txnCheck"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelection(t.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="txnIcon" data-tone={amountTone(t)}>
                    <TransactionKindIcon kind={t.kind} />
                  </div>
                  <div className="txnMain">
                    <div className="txnTitle">
                      <span className="txnTitleText">{txnTitle(t)}</span>
                      {(t.tags ?? []).includes('bank-csv') || (t.tags ?? []).includes('bank-pdf') ? <span className="pill">Imported</span> : null}
                      {(t.tags ?? []).includes('needs-review') ? (
                        <span className="pill" data-tone="neg">
                          Verify
                        </span>
                      ) : null}
                    </div>
                    <div className="txnMeta">{txnSubtitle(t)}</div>
                  </div>
                  <div className="txnRight">
                    <div className="txnAmount" data-tone={amountTone(t)}>
                      {currency(signedAmount(t), t.amount.currencyCode)}
                    </div>
                    <div className="txnDate">{toDateInputValue(t.date)}</div>
                  </div>
                  </div>
                )
              })}
              {virtualWindow.bottomPad > 0 ? <div style={{ height: virtualWindow.bottomPad }} /> : null}
              {filtered.length === 0 ? <div className="empty">No transactions match the current filters.</div> : null}
            </>
          )}
        </div>
        {rowMenu.Menu}

        {showEditor ? (
          <>
            <div className="detailSlot" ref={txDetailSlotRef} />
            {txDetailFixedStyle && typeof document !== 'undefined'
              ? createPortal(
                  <div className="detail" style={txDetailFixedStyle}>
            {selectedIds.size > 0 ? (
              <div className="form">
                <div className="groupBox txnSelectionSummary">
                  <div className="groupTitle">Selection summary</div>
                  <div className="note">{selectedTx.length} selected</div>
                  {hasMixedTypes ? (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255, 69, 58, 0.12)', color: 'var(--red)', borderRadius: 8, fontSize: 13, border: '1px solid rgba(255, 69, 58, 0.28)' }}>
                      <strong>Warning:</strong> Your selection contains a mix of both income and expenses. Please double check before printing.
                    </div>
                  ) : null}
                  <label className="field" style={{ marginTop: 8 }}>
                    <div className="fieldLabel">PDF title</div>
                    <input value={selectionReportTitle} onChange={(e) => setSelectionReportTitle(e.target.value)} />
                  </label>
                  <div className="fieldRow" style={{ marginTop: 8 }}>
                    <label className="field">
                      <div className="fieldLabel">Tax base</div>
                      <MenuSelect
                        value={taxBase}
                        options={[
                          { value: 'income', label: 'Income' },
                          { value: 'expense', label: 'Expenses' },
                          { value: 'net', label: 'Net' },
                        ]}
                        onChange={(v) => {
                          const next = v as any
                          setTaxBase(next)
                          if (next !== 'income') setCisAlreadyDeducted(false)
                        }}
                        width={220}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Tax %</div>
                      <input type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(Number(e.target.value))} />
                    </label>
                  </div>
                  <label className="check" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={cisAlreadyDeducted}
                      disabled={taxBase !== 'income'}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setCisAlreadyDeducted(checked)
                        if (checked && (!Number.isFinite(taxRatePct) || taxRatePct === 0)) setTaxRatePct(20)
                        if (checked) setTaxOverrideEnabled(false)
                      }}
                    />
                    CIS already deducted (Income is net)
                  </label>
                  <label className="check" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={taxOverrideEnabled} onChange={(e) => setTaxOverrideEnabled(e.target.checked)} />
                    Override tax amount
                  </label>
                  {taxOverrideEnabled ? (
                    <label className="field" style={{ marginTop: 8 }}>
                      <div className="fieldLabel">Tax amount</div>
                      <input type="number" value={taxOverrideAmount} onChange={(e) => setTaxOverrideAmount(Number(e.target.value))} />
                    </label>
                  ) : null}

                  <div className="groupBox" style={{ marginTop: 10 }}>
                    <div className="groupTitle">Bulk category</div>
                    <div className="note">
                      {selectedTypeCounts.expense} expenses selected
                      {selectedTypeCounts.income || selectedTypeCounts.transfer ? ` • ${selectedTypeCounts.income + selectedTypeCounts.transfer} non-expense ignored` : ''}
                    </div>
                    <div className="fieldRow" style={{ marginTop: 8 }}>
                      <label className="field">
                        <div className="fieldLabel">Category</div>
                        <MenuSelect
                          value={bulkCategoryPreset as any}
                          options={[
                            ...categories.map((c) => ({ value: `cat:${c}` as any, label: c })),
                            ...customExpenseCategoryNames.map((c) => ({ value: `custom:${c}` as any, label: c })),
                          ]}
                          onChange={(v) => {
                            const raw = String(v ?? '')
                            setBulkCategoryPreset(raw)
                            if (raw.startsWith('custom:')) {
                              setBulkCategory('other')
                              setBulkCustomCategoryName(raw.slice('custom:'.length))
                            } else if (raw.startsWith('cat:')) {
                              setBulkCategory(raw.slice('cat:'.length) as any)
                            }
                          }}
                          width={220}
                        />
                      </label>
                      <label className="field">
                        <div className="fieldLabel">Custom name</div>
                        <input
                          value={bulkCustomCategoryName}
                          onChange={(e) => {
                            const v = e.target.value
                            setBulkCustomCategoryName(v)
                            const trimmed = v.trim()
                            if (trimmed) {
                              setBulkCategoryPreset(`custom:${trimmed}`)
                              setBulkCategory('other')
                            } else {
                              setBulkCategoryPreset(`cat:${bulkCategory}`)
                            }
                          }}
                          placeholder="Optional"
                        />
                      </label>
                    </div>
                    <button type="button" onClick={applyBulkCategoryToSelection} className="btnPrimary" disabled={selectedTypeCounts.expense === 0}>
                      Apply to selected
                    </button>
                  </div>

                  <div className="groupBox">
                    <div className="groupTitle">Totals</div>
                    <div className="progressRow">
                      <div className="note">Income</div>
                      <div className="progressValue">{currency(selectionTotals.income, state.settings.displayCurrencyCode)}</div>
                    </div>
                    <div className="progressRow" style={{ marginTop: 4 }}>
                      <div className="note">Expenses</div>
                      <div className="progressValue">{currency(selectionTotals.expense, state.settings.displayCurrencyCode)}</div>
                    </div>
                    <div className="progressRow" style={{ marginTop: 4 }}>
                      <div className="note">Net</div>
                      <div className="progressValue">{currency(selectionTotals.net, state.settings.displayCurrencyCode)}</div>
                    </div>
                    <div className="progressRow" style={{ marginTop: 4 }}>
                      <div className="note">{cisAlreadyDeducted && taxBase === 'income' ? 'CIS' : 'Tax'}</div>
                      <div className="progressValue">{currency(selectionTotals.tax, state.settings.displayCurrencyCode)}</div>
                    </div>
                    <div className="progressRow" style={{ marginTop: 4 }}>
                      <div className="note">{cisAlreadyDeducted && taxBase === 'income' ? 'Gross' : 'Total + Tax'}</div>
                      <div className="progressValue">{currency(selectionTotals.totalWithTax, state.settings.displayCurrencyCode)}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : selected ? (
              <div className="form">
                <div className="groupBox">
                  <div className="groupTitle">Basics</div>
                  <label className="field">
                    <div className="fieldLabel">Type</div>
                    <MenuSelect
                      value={selected.kind}
                      options={[
                        { value: 'expense', label: 'Expense' },
                        { value: 'income', label: 'Income' },
                        { value: 'transfer', label: 'Transfer' },
                      ]}
                      onChange={(v) => updateSelected({ kind: v as TransactionKind })}
                    />
                  </label>

                  <label className="field">
                    <div className="fieldLabel">Date</div>
                    <input type="date" value={toDateInputValue(selected.date)} onChange={(e) => updateSelected({ date: fromDateInputValue(e.target.value) })} />
                  </label>

                  <div className="fieldRow">
                    <label className="field">
                      <div className="fieldLabel">Amount</div>
                      <input
                        type="number"
                        value={selected.amount.value}
                        onChange={(e) => updateSelected({ amount: { ...selected.amount, value: Number(e.target.value) } })}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Currency</div>
                      <input
                        value={selected.amount.currencyCode}
                        onChange={(e) => updateSelected({ amount: { ...selected.amount, currencyCode: e.target.value } })}
                      />
                    </label>
                  </div>
                </div>

                {selected.kind === 'expense' ? (
                  <div className="groupBox">
                    <div className="groupTitle">Category</div>
                    <label className="field">
                      <div className="fieldLabel">Category</div>
                      <MenuSelect
                        value={
                          ((selected.customCategoryName ?? '').trim()
                            ? `custom:${(selected.customCategoryName ?? '').trim()}`
                            : `cat:${(selected.category ?? 'other') as any}`) as any
                        }
                        options={[
                          ...categories.map((c) => ({ value: `cat:${c}` as any, label: c })),
                          ...customExpenseCategoryNames.map((c) => ({ value: `custom:${c}` as any, label: c })),
                        ]}
                        onChange={(v) => {
                          const raw = String(v ?? '')
                          if (raw.startsWith('custom:')) {
                            updateSelected({ category: 'other', customCategoryName: raw.slice('custom:'.length) })
                          } else if (raw.startsWith('cat:')) {
                            updateSelected({ category: raw.slice('cat:'.length) as any, customCategoryName: null })
                          }
                        }}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Custom Category</div>
                      <input value={selected.customCategoryName ?? ''} onChange={(e) => updateSelected({ customCategoryName: e.target.value || null })} />
                    </label>
                  </div>
                ) : null}

                <div className="groupBox">
                  <div className="groupTitle">Details</div>
                  <label className="field">
                    <div className="fieldLabel">Payee</div>
                    <input value={selected.payee ?? ''} onChange={(e) => updateSelected({ payee: e.target.value || null })} />
                  </label>

                  <label className="field">
                    <div className="fieldLabel">Notes</div>
                    <textarea value={selected.notes ?? ''} onChange={(e) => updateSelected({ notes: e.target.value || null })} />
                  </label>

                  <label className="field">
                    <div className="fieldLabel">Tags (comma separated)</div>
                    <input
                      value={(selected.tags ?? []).join(', ')}
                      onChange={(e) =>
                        updateSelected({
                          tags: e.target.value
                            .split(',')
                            .map((x) => x.trim())
                            .filter((x) => x.length > 0),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="form">
                {peopleSettings.peopleEnabled && activePerson ? (
                  <div className="groupBox">
                    <div className="groupTitle">Person</div>
                    <div className="note">{activePerson.name}</div>
                    <label className="field" style={{ marginTop: 10 }}>
                      <div className="fieldLabel">Name</div>
                      <input
                        value={activePerson.name}
                        onChange={(e) => {
                          const name = e.target.value
                          dispatch({
                            type: 'settings/update',
                            patch: { people: peopleSettings.people.map((p) => (p.id === activePerson.id ? { ...p, name } : p)) },
                          })
                        }}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Phone</div>
                      <input
                        value={activePerson.phone ?? ''}
                        onChange={(e) => {
                          const phone = e.target.value || null
                          dispatch({
                            type: 'settings/update',
                            patch: { people: peopleSettings.people.map((p) => (p.id === activePerson.id ? { ...p, phone } : p)) },
                          })
                        }}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Email</div>
                      <input
                        value={activePerson.email ?? ''}
                        onChange={(e) => {
                          const email = e.target.value || null
                          dispatch({
                            type: 'settings/update',
                            patch: { people: peopleSettings.people.map((p) => (p.id === activePerson.id ? { ...p, email } : p)) },
                          })
                        }}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Address</div>
                      <textarea
                        value={activePerson.address ?? ''}
                        onChange={(e) => {
                          const address = e.target.value || null
                          dispatch({
                            type: 'settings/update',
                            patch: { people: peopleSettings.people.map((p) => (p.id === activePerson.id ? { ...p, address } : p)) },
                          })
                        }}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Notes</div>
                      <textarea
                        value={activePerson.notes ?? ''}
                        onChange={(e) => {
                          const notes = e.target.value || null
                          dispatch({
                            type: 'settings/update',
                            patch: { people: peopleSettings.people.map((p) => (p.id === activePerson.id ? { ...p, notes } : p)) },
                          })
                        }}
                      />
                    </label>
                    <label className="field">
                      <div className="fieldLabel">Amount owed to me</div>
                      <input
                        type="number"
                        value={activePerson.amountOwed == null ? '' : String(activePerson.amountOwed)}
                        onChange={(e) => {
                          const raw = e.target.value
                          const num = raw.trim() === '' ? null : Number(raw)
                          const amountOwed = num == null || Number.isNaN(num) ? null : num
                          dispatch({
                            type: 'settings/update',
                            patch: { people: peopleSettings.people.map((p) => (p.id === activePerson.id ? { ...p, amountOwed } : p)) },
                          })
                        }}
                        placeholder="Use negative if they owe you (example: -700)"
                      />
                    </label>
                    {Number(activePerson.amountOwed ?? 0) < 0 ? (
                      <div className="note">
                        Reminder active: {activePerson.name} owes you {currency(Math.abs(Number(activePerson.amountOwed ?? 0)), state.settings.displayCurrencyCode)}.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="empty">Select a transaction.</div>
                )}
              </div>
            )}
                  </div>,
                  document.body
                )
              : null}
          </>
        ) : null}
      </div>
    </>
  )
}
