import './App.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from './app/appStore'
import { SectionRouter } from './ui/SectionRouter'
import { OnboardingModal } from './ui/OnboardingModal'
import { isTauriRuntime } from './storage/tauriJsonStore'
import { registerAutomationEvents, registerMenuEvents } from './ui/menuEvents'
import { registerTouchBarEvents } from './ui/touchbarEvents'
import { Sidebar } from './ui/Sidebar'
import { CommandBar } from './ui/CommandBar'
import { UpdateWatcher } from './ui/UpdateWatcher'
import { useAuth } from './auth/AuthProvider'
import { LoginModal } from './ui/LoginModal'
import { normalizePeopleSettings } from './domain/people'
import { isAdvancedAccount, planBadgeLabel } from './licensing/licenseGates'
import type { Bill, Income } from './domain/models'
import type { LanguageCode, Theme } from './domain/settings'
import { AI_FEATURE_ENABLED } from './domain/settings'
import { t } from './ui/i18n'
import { exportAutoBackup } from './ui/dataActions'

function SplashScreen(props: { title?: string; subtitle?: string }) {
  return (
    <div className="splash">
      <div className="splashCard">
        <div className="splashLogo" aria-hidden="true">
          <img className="splashLogoImg" src="/kivana-logo.png" alt="" />
        </div>
        <div className="splashTitle">{props.title || 'Welcome back'}</div>
        <div className="splashSubtitle">
          {props.subtitle || 'Getting things ready'}
          <span className="splashDots" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function MainApp() {
  const store = useAppStore()
  const { state, dispatch } = store
  const auth = useAuth()
  const offlineProMode = !auth.session
  const advanced = offlineProMode || isAdvancedAccount(auth.entitlements)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const stateRef = useRef(store.state)
  stateRef.current = store.state
  const accountLabel = auth.session ? displayNameForUser(auth.session.userDisplayName, auth.session.userEmail) : 'Offline Pro'
  const avatarDataUrl = auth.session?.userAvatarDataUrl ? String(auth.session.userAvatarDataUrl || '').trim() : ''
  const peopleSettings = normalizePeopleSettings(state.settings as any)
  const activePerson =
    advanced && peopleSettings.peopleEnabled ? peopleSettings.people.find((p) => p.id === peopleSettings.activePersonId) ?? null : null
  const sectionTitle = titleForSection(state.ui.section, state.settings.language)
  const showCommandBar = AI_FEATURE_ENABLED && state.ui.section === 'bills'
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const quickAddButtonRef = useRef<HTMLButtonElement | null>(null)
  const [quickAddPos, setQuickAddPos] = useState<{ left: number; top: number; width: number } | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null

    const resolvedTheme = (raw: Theme): 'dark' | 'light' => {
      if (raw === 'dark' || raw === 'light') return raw
      return mq?.matches ? 'dark' : 'light'
    }

    const apply = () => {
      root.dataset.theme = resolvedTheme(state.settings.theme)
    }

    apply()
    if (state.settings.theme !== 'system' || !mq) return

    const onChange = () => apply()
    if ('addEventListener' in mq) {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    ;(mq as any).addListener(onChange)
    return () => (mq as any).removeListener(onChange)
  }, [state.settings.theme])

  useEffect(() => {
    if (!isTauriRuntime()) return
    let cleanup: (() => void) | null = null
    let cleanupAutomation: (() => void) | null = null
    const cleanupTouch = registerTouchBarEvents(dispatch, () => stateRef.current)
    void registerMenuEvents(() => stateRef.current, dispatch).then((c) => {
      cleanup = c
    })
    void registerAutomationEvents(() => stateRef.current, dispatch, store.persistNow).then((c) => {
      cleanupAutomation = c
    })
    return () => {
      cleanup?.()
      cleanupAutomation?.()
      cleanupTouch()
    }
  }, [dispatch])

  useEffect(() => {
    if (!isTauriRuntime()) return
    if (!state.settings.autoBackupEnabled) return
    const everyDays = Number(state.settings.autoBackupEveryDays ?? 7)
    const keep = Number(state.settings.autoBackupKeepCount ?? 5)
    const intervalDays = Number.isFinite(everyDays) ? Math.max(1, Math.min(60, Math.floor(everyDays))) : 7
    const keepCount = Number.isFinite(keep) ? Math.max(1, Math.min(10, Math.floor(keep))) : 5
    const dueMs = intervalDays * 24 * 60 * 60 * 1000

    let cancelled = false
    let running = false

    const run = async () => {
      if (cancelled || running) return
      const last = Number(state.settings.autoBackupLastRunAtMs ?? 0)
      if (last && Number.isFinite(last)) {
        const age = Date.now() - last
        if (age < dueMs) return
      }
      running = true
      try {
        const datasets = {
          settings: state.settings,
          bills: state.bills,
          incomes: state.incomes,
          accounts: state.accounts,
          transactions: state.transactions,
          reminders: state.reminders,
          invoices: state.invoices,
          goals: state.goals,
          debts: state.debts,
        }
        await exportAutoBackup({ datasets, keepCount })
        dispatch({ type: 'settings/update', patch: { lastBackupAtMs: Date.now(), autoBackupLastRunAtMs: Date.now() } })
      } catch {
      } finally {
        running = false
      }
    }

    void run()
    const id = window.setInterval(() => void run(), 30 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [
    dispatch,
    state.accounts,
    state.bills,
    state.debts,
    state.incomes,
    state.invoices,
    state.reminders,
    state.settings,
    state.transactions,
    state.settings.autoBackupEnabled,
    state.settings.autoBackupEveryDays,
    state.settings.autoBackupKeepCount,
    state.settings.autoBackupLastRunAtMs,
  ])

  const enableMenuAnimations = state.settings.enableMenuAnimations
  const effectiveSidebarExpanded = enableMenuAnimations ? sidebarExpanded : true
  const quickAddWidth = 220

  function openQuickAdd() {
    const el = quickAddButtonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 10
    const left = Math.max(margin, Math.min(r.right - quickAddWidth, window.innerWidth - quickAddWidth - margin))
    const top = r.bottom + 8
    setQuickAddPos({ left, top, width: quickAddWidth })
    setQuickAddOpen(true)
  }

  function closeQuickAdd() {
    setQuickAddOpen(false)
    setQuickAddPos(null)
  }

  function toggleQuickAdd() {
    if (quickAddOpen) {
      closeQuickAdd()
      return
    }
    openQuickAdd()
  }

  function createBillFromTopBar() {
    const now = new Date()
    const b: Bill = {
      id: crypto.randomUUID(),
      name: 'New Bill',
      amount: { currencyCode: state.settings.displayCurrencyCode, value: 0 },
      category: 'other',
      customCategoryName: null,
      recurrence: 'monthly',
      nextDueDate: now,
      notes: null,
      payments: [],
      paidAutomatically: false,
      hiddenUntilEdited: false,
      snoozeUntil: null,
      snoozeCount: 0,
      attachments: [],
    }
    dispatch({ type: 'bills/add', bill: b })
    dispatch({ type: 'ui/setSection', section: 'bills' })
    dispatch({ type: 'ui/selectBill', id: b.id })
    closeQuickAdd()
  }

  function createIncomeFromTopBar() {
    const now = new Date()
    const inc: Income = {
      id: crypto.randomUUID(),
      name: 'New Income',
      amount: { currencyCode: state.settings.displayCurrencyCode, value: 0 },
      source: 'salary',
      customSourceName: null,
      recurrence: 'monthly',
      nextPayDate: now,
      notes: null,
      receipts: [],
    }
    dispatch({ type: 'incomes/add', income: inc })
    dispatch({ type: 'ui/setSection', section: 'income' })
    dispatch({ type: 'ui/selectIncome', id: inc.id })
    closeQuickAdd()
  }

  return (
    <div
      className={
        (effectiveSidebarExpanded ? 'shell shellSidebarExpanded' : 'shell shellSidebarCollapsed') +
        (enableMenuAnimations ? '' : ' noMenuAnimations')
      }
    >
      <OnboardingModal />
      <LoginModal />
      <UpdateWatcher />
      <Sidebar onHoverChange={enableMenuAnimations ? setSidebarExpanded : undefined} />

      <main className="main">
        <header className="topbar">
          <div className="windowDragStrip" data-tauri-drag-region>
            <div className="windowDragHandle" data-tauri-drag-region />
          </div>
          <div className="appToolbar" data-tauri-drag-region>
            <div className="toolbarLeft">
              {auth.session ? (
                <button type="button" className="accountButton" onClick={() => auth.setOpenLogin(true)}>
                  {avatarDataUrl ? <img className="accountAvatar" src={avatarDataUrl} alt="" /> : null}
                  <span className="accountEmail">{accountLabel}</span>
                  <span className="planBadge">
                    {planBadgeLabel(auth.entitlements)}
                  </span>
                </button>
              ) : (
                <div className="accountButton" aria-label="Offline Pro mode">
                  <span className="accountEmail">{accountLabel}</span>
                  <span className="planBadge">Pro</span>
                </div>
              )}
              <button type="button" className="toolbarPlus" onClick={toggleQuickAdd} ref={quickAddButtonRef}>
                +
              </button>
            </div>
            {showCommandBar ? <CommandBar /> : <div />}
            <div className="toolbarRight">
              {sectionTitle ? <div className="toolbarTitle">{sectionTitle}</div> : null}
              {activePerson ? <span className="personBadge">{activePerson.name}</span> : null}
            </div>
          </div>
        </header>
        {quickAddOpen && quickAddPos ? (
          <>
            <div className="popoverOverlay" onMouseDown={closeQuickAdd} />
            <div className="popoverPanel" style={{ left: quickAddPos.left, top: quickAddPos.top, right: 'auto', width: quickAddPos.width }}>
              <div className="groupTitle" style={{ marginBottom: 8 }}>
                {t(state.settings.language, 'app.quickAdd.title', 'Create')}
              </div>
              <div className="rowActions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <button type="button" onClick={createBillFromTopBar}>
                  {t(state.settings.language, 'app.quickAdd.newBill', 'New Bill')}
                </button>
                <button type="button" onClick={createIncomeFromTopBar}>
                  {t(state.settings.language, 'app.quickAdd.newIncome', 'New Income')}
                </button>
              </div>
            </div>
          </>
        ) : null}
        <section className="panel content">
          <SectionRouter />
        </section>
      </main>
    </div>
  )
}

function App() {
  const isPdfViewerWindow = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pdfViewer') === '1'
  const [minSplashDone, setMinSplashDone] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setMinSplashDone(true), 3500)
    return () => window.clearTimeout(id)
  }, [])

  if (!isPdfViewerWindow && !minSplashDone) {
    return <SplashScreen subtitle="Loading your workspace" />
  }
  return isPdfViewerWindow ? <PdfViewerWindow /> : <MainApp />
}

export default App

function PdfViewerWindow() {
  const [title, setTitle] = useState('PDF')
  const [pageCount, setPageCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1.15)
  const [tool, setTool] = useState<'pan' | 'highlight'>('pan')
  const [highlightsByPage, setHighlightsByPage] = useState<Record<number, Array<{ x: number; y: number; w: number; h: number }>>>({})
  const [printImages, setPrintImages] = useState<string[] | null>(null)
  const [printing, setPrinting] = useState(false)
  const docRef = useRef<any>(null)
  const [docKey, setDocKey] = useState(0)
  const tokenRef = useRef(0)

  const loadPdf = useCallback(async (relRaw: string, nextTitleRaw: string) => {
    const rel = String(relRaw ?? '').trim()
    if (!rel) return
    const nextTitle = String(nextTitleRaw ?? '').trim() || 'PDF'
    setTitle(nextTitle)
    tokenRef.current += 1
    const token = tokenRef.current
    setBusy(true)
    docRef.current = null
    setPageCount(0)
    setPage(1)
    setZoom(1.15)
    setTool('pan')
    setHighlightsByPage({})
    setPrintImages(null)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const r = (await invoke('read_attachment_file', { storedRelativePath: rel })) as any
      const b64 = String(r?.base64 ?? '')
      if (!b64) return
      const bytes = base64ToBytes(b64)
      const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
      const doc = await pdfjs.getDocument({ data: bytes }).promise
      if (tokenRef.current !== token) return
      docRef.current = doc
      setPageCount(Number(doc?.numPages ?? 0))
      setDocKey((k) => k + 1)
    } finally {
      if (tokenRef.current === token) setBusy(false)
    }
  }, [])

  function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }

  const closeWindow = useCallback(async () => {
    if (!isTauriRuntime()) {
      window.close()
      return
    }
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  }, [])

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const rel = String(sp.get('rel') ?? '').trim()
    const t = String(sp.get('title') ?? '').trim()
    if (rel) void loadPdf(rel, t || 'PDF')
  }, [loadPdf])

  useEffect(() => {
    if (!isTauriRuntime()) return
    let unlisten: null | (() => void) = null
    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      unlisten = await win.listen('pdf:open', (e) => {
        const payload: any = (e as any)?.payload ?? null
        const rel = String(payload?.rel ?? '').trim()
        const t = String(payload?.title ?? '').trim()
        if (rel) void loadPdf(rel, t || 'PDF')
      })
    })()
    return () => {
      unlisten?.()
      docRef.current = null
    }
  }, [loadPdf])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') void closeWindow()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeWindow])

  useEffect(() => {
    if (!printImages) return
    function onAfterPrint() {
      setPrintImages(null)
      setPrinting(false)
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [printImages])

  useEffect(() => {
    if (!printImages) return
    let cancelled = false
    void (async () => {
      for (let i = 0; i < 80; i++) {
        if (cancelled) return
        const imgs = Array.from(document.querySelectorAll('img[data-pdf-print="1"]')) as HTMLImageElement[]
        const ok = imgs.length === printImages.length && imgs.every((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
        if (ok) break
        await new Promise((r) => setTimeout(r, 40))
      }
      if (cancelled) return
      try {
        window.print()
      } catch {
        setPrintImages(null)
        setPrinting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [printImages])

  const canPrev = page > 1
  const canNext = pageCount > 0 && page < pageCount

  async function doPrint(mode: 'all' | 'current') {
    if (printing) return
    const doc = docRef.current
    if (!doc) return
    setPrinting(true)
    try {
      const imgs: string[] = []
      const total = Number(doc?.numPages ?? 0)
      const start = mode === 'current' ? page : 1
      const end = mode === 'current' ? page : total
      for (let p = start; p <= end; p++) {
        const pageObj = await doc.getPage(p)
        const viewport = pageObj.getViewport({ scale: 1.85 })
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        canvas.width = Math.max(1, Math.floor(viewport.width))
        canvas.height = Math.max(1, Math.floor(viewport.height))
        await pageObj.render({ canvasContext: ctx, viewport }).promise
        applyCanvasWatermark(ctx, canvas.width, canvas.height, 'Kivana')
        const hs = highlightsByPage[p] ?? []
        drawHighlights(ctx, canvas.width, canvas.height, hs)
        imgs.push(canvas.toDataURL('image/jpeg', 0.92))
      }
      setPrintImages(imgs)
    } catch {
      setPrinting(false)
      setPrintImages(null)
    }
  }

  return (
    <div className="pdfViewerWindow" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {printImages ? null : (
        <div
          className="pdfViewerTitlebar"
          data-tauri-drag-region
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--panel)',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }} data-tauri-drag-region>
            <img src="/kivana-logo.png" alt="Kivana logo" style={{ width: 28, height: 28, borderRadius: 10 }} draggable={false} data-tauri-drag-region />
            <div style={{ minWidth: 0 }} data-tauri-drag-region>
              <div style={{ fontWeight: 800, color: 'var(--text-h)', lineHeight: 1.2 }} data-tauri-drag-region>
                Kivana • PDF
              </div>
              <div className="note" style={{ marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {title}
              </div>
            </div>
          </div>
          <div style={{ flex: 1 }} data-tauri-drag-region />
          <div className="modalActions" style={{ marginTop: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" disabled={!canPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </button>
            <div className="note" style={{ minWidth: 92, textAlign: 'center' }}>
              {pageCount ? `${page} / ${pageCount}` : ''}
            </div>
            <button type="button" disabled={!canNext} onClick={() => setPage((p) => Math.min(pageCount || 1, p + 1))}>
              Next
            </button>
            <button type="button" onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 100) / 100))}>
              −
            </button>
            <div className="note" style={{ minWidth: 52, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </div>
            <button type="button" onClick={() => setZoom((z) => Math.min(2.2, Math.round((z + 0.1) * 100) / 100))}>
              +
            </button>
            <button type="button" className={tool === 'highlight' ? 'btnPrimary' : undefined} onClick={() => setTool((t) => (t === 'highlight' ? 'pan' : 'highlight'))}>
              Highlight
            </button>
            <button
              type="button"
              onClick={() =>
                setHighlightsByPage((prev) => {
                  const next = { ...prev }
                  delete next[page]
                  return next
                })
              }
            >
              Clear
            </button>
            <button type="button" onClick={() => void doPrint('current')} disabled={!docRef.current || printing}>
              Print page
            </button>
            <button type="button" onClick={() => void doPrint('all')} disabled={!docRef.current || printing}>
              {printing ? 'Printing…' : 'Print all'}
            </button>
            <button type="button" onClick={() => void closeWindow()}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className="pdfViewerContent" style={{ flex: 1, background: printImages ? '#fff' : 'rgba(255,255,255,0.03)', overflow: 'auto' }}>
        {printImages ? (
          <div className="pdfPrintRoot">
            {printImages.map((src, idx) => (
              <div
                key={src.slice(0, 48) + idx}
                className="pdfPrintPage"
                style={{ breakAfter: 'page' as any, pageBreakAfter: 'always' as any, breakInside: 'avoid' as any, pageBreakInside: 'avoid' as any }}
              >
                <img data-pdf-print="1" src={src} className="pdfPrintImg" />
              </div>
            ))}
          </div>
        ) : docRef.current && pageCount > 0 ? (
          <div style={{ padding: 18 }}>
            <PdfSinglePage
              key={`${docKey}-${page}-${zoom}-${tool}`}
              doc={docRef.current}
              page={page}
              zoom={zoom}
              tool={tool}
              watermark="Kivana"
              highlights={highlightsByPage[page] ?? []}
              onAddHighlight={(h) =>
                setHighlightsByPage((prev) => {
                  const next = { ...prev }
                  next[page] = [...(next[page] ?? []), h]
                  return next
                })
              }
            />
          </div>
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <div className="busyRow">
              <div className="busySpinner" />
              <div>{busy ? 'Loading PDF…' : 'Waiting…'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function applyCanvasWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  const s = Math.max(42, Math.floor(Math.min(w, h) * 0.12))
  const stepX = Math.max(220, Math.floor(w * 0.55))
  const stepY = Math.max(180, Math.floor(h * 0.45))
  const angle = (-22 * Math.PI) / 180
  ctx.save()
  ctx.globalAlpha = 0.18
  ctx.fillStyle = '#000'
  ctx.font = `900 ${s}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let y = -stepY; y <= h + stepY; y += stepY) {
    for (let x = -stepX; x <= w + stepX; x += stepX) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle)
      ctx.fillText(text, 0, 0)
      ctx.restore()
    }
  }
  ctx.restore()
}

function drawHighlights(ctx: CanvasRenderingContext2D, w: number, h: number, hs: Array<{ x: number; y: number; w: number; h: number }>) {
  if (!hs.length) return
  ctx.save()
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(255, 230, 70, 0.30)'
  for (const r of hs) {
    const rx = Math.max(0, Math.min(w, r.x * w))
    const ry = Math.max(0, Math.min(h, r.y * h))
    const rw = Math.max(0, Math.min(w - rx, r.w * w))
    const rh = Math.max(0, Math.min(h - ry, r.h * h))
    if (rw <= 0 || rh <= 0) continue
    ctx.fillRect(rx, ry, rw, rh)
  }
  ctx.restore()
}

function PdfSinglePage(props: {
  doc: any
  page: number
  zoom: number
  tool: 'pan' | 'highlight'
  watermark: string
  highlights: Array<{ x: number; y: number; w: number; h: number }>
  onAddHighlight: (h: { x: number; y: number; w: number; h: number }) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderTaskRef = useRef<any>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragNow, setDragNow] = useState<{ x: number; y: number } | null>(null)

  const watermarkBg = (() => {
    const t = String(props.watermark || '').trim() || 'Kivana'
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="320">` +
      `<g transform="translate(230 160) rotate(-22)">` +
      `<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" ` +
      `fill="#000" fill-opacity="0.18" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="74" font-weight="900" letter-spacing="6">` +
      `${t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}` +
      `</text>` +
      `</g>` +
      `</svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  })()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (renderTaskRef.current?.cancel) {
        try {
          renderTaskRef.current.cancel()
        } catch {
        }
        renderTaskRef.current = null
      }
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const pageObj = await props.doc.getPage(props.page)
      const viewport = pageObj.getViewport({ scale: 1.45 * props.zoom })
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      const task = pageObj.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch (e: any) {
        const name = String(e?.name ?? '')
        const msg = String(e?.message ?? e ?? '')
        if (name.includes('RenderingCancelled') || msg.toLowerCase().includes('cancel')) return
        return
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null
      }
      if (cancelled) return
      applyCanvasWatermark(ctx, canvas.width, canvas.height, props.watermark)
      drawHighlights(ctx, canvas.width, canvas.height, props.highlights)
    })()
    return () => {
      cancelled = true
      if (renderTaskRef.current?.cancel) {
        try {
          renderTaskRef.current.cancel()
        } catch {
        }
      }
      renderTaskRef.current = null
    }
  }, [props.doc, props.page, props.watermark, props.zoom, props.highlights])

  function toNorm(e: React.PointerEvent) {
    const el = boxRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / Math.max(1, r.width)
    const y = (e.clientY - r.top) / Math.max(1, r.height)
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (props.tool !== 'highlight') return
    const p = toNorm(e)
    if (!p) return
    setDragStart(p)
    setDragNow(p)
    ;(e.currentTarget as any).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (props.tool !== 'highlight') return
    if (!dragStart) return
    const p = toNorm(e)
    if (!p) return
    setDragNow(p)
  }

  function onPointerUp(e: React.PointerEvent) {
    if (props.tool !== 'highlight') return
    if (!dragStart) return
    const p = toNorm(e)
    const end = p ?? dragNow ?? dragStart
    const x0 = Math.min(dragStart.x, end.x)
    const y0 = Math.min(dragStart.y, end.y)
    const x1 = Math.max(dragStart.x, end.x)
    const y1 = Math.max(dragStart.y, end.y)
    const w = x1 - x0
    const h = y1 - y0
    setDragStart(null)
    setDragNow(null)
    if (w < 0.01 || h < 0.01) return
    props.onAddHighlight({ x: x0, y: y0, w, h })
  }

  return (
    <div
      style={{
        position: 'relative',
        width: 'min(980px, 100%)',
        margin: '0 auto 18px auto',
        borderRadius: 12,
        background: '#fff',
        boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
      ref={boxRef}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: watermarkBg,
          backgroundRepeat: 'repeat',
          backgroundSize: '460px 320px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: props.tool === 'highlight' ? 'auto' : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {dragStart && dragNow ? (
          <div
            style={{
              position: 'absolute',
              left: `${Math.min(dragStart.x, dragNow.x) * 100}%`,
              top: `${Math.min(dragStart.y, dragNow.y) * 100}%`,
              width: `${Math.abs(dragNow.x - dragStart.x) * 100}%`,
              height: `${Math.abs(dragNow.y - dragStart.y) * 100}%`,
              background: 'rgba(255, 230, 70, 0.25)',
              outline: '2px solid rgba(255, 230, 70, 0.65)',
              borderRadius: 4,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function titleForSection(section: string, language: LanguageCode): string {
  switch (section) {
    case 'dashboard':
      return t(language, 'nav.dashboard', 'Dashboard')
    case 'budget':
      return t(language, 'nav.budget', 'Budget')
    case 'calendar':
      return t(language, 'nav.calendar', 'Calendar')
    case 'bills':
      return t(language, 'sidebar.group.bills', 'Bills')
    case 'income':
      return t(language, 'nav.income', 'Income')
    case 'dueSoon':
      return t(language, 'nav.dueSoon', 'Due Soon')
    case 'deferred':
      return t(language, 'nav.deferred', 'Snoozed')
    case 'paidRecently':
      return t(language, 'nav.paidRecently', 'Paid Recently')
    case 'accounts':
      return t(language, 'nav.accounts', 'Accounts')
    case 'transactions':
      return ''
    case 'invoices':
      return t(language, 'nav.files', 'Files')
    case 'goals':
      return t(language, 'nav.goals', 'Goals')
    case 'debts':
      return t(language, 'nav.debts', 'Debts')
    case 'reports':
      return t(language, 'nav.reports', 'Reports')
    case 'settings':
      return t(language, 'nav.settings', 'Settings')
    default:
      return 'Kivana'
  }
}

function displayNameForEmail(email: string): string {
  const trimmed = String(email || '').trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return trimmed
  return trimmed.slice(0, at)
}

function displayNameForUser(displayName: string | null | undefined, email: string): string {
  const name = String(displayName ?? '').trim()
  if (name) return name
  return displayNameForEmail(email)
}
