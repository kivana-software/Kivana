import './App.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from './app/appStore'
import type { Section } from './app/appStore'
import { SectionRouter } from './ui/SectionRouter'
import { OnboardingModal } from './ui/OnboardingModal'
import { Sidebar } from './ui/Sidebar'
import type { Bill, Transaction } from './domain/models'
import { startOfDay } from './domain/models'
import { t } from './ui/i18n'

type TourStep = {
  selector?: string
  fallbackSelector?: string
  section?: Section
  title: string
  body: string
  action?: 'createDemoAccount' | 'createDemoTransactions' | 'createDemoBill'
  preferredDir?: 'left' | 'right' | 'up' | 'down'
  offsetX?: number
  offsetY?: number
  requires?: 'account' | 'transaction' | 'bill'
}

export default function App() {
  const store = useAppStore()
  const { state, dispatch } = store
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const lang = state.settings.language
  const tt = useCallback((key: string, fallback?: string) => t(lang, key, fallback), [lang])

  const enableMenuAnimations = state.settings.enableMenuAnimations
  const effectiveSidebarExpanded = enableMenuAnimations ? sidebarExpanded : true
  const sectionTitle = useMemo(() => tt(`nav.${state.ui.section}`, ''), [state.ui.section, tt])
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const quickAddButtonRef = useRef<HTMLButtonElement | null>(null)
  const [quickAddPos, setQuickAddPos] = useState<{ left: number; top: number; width: number } | null>(null)

  const quickAddWidth = 240

  function makeId(): string {
    const anyCrypto = crypto as any
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') return anyCrypto.randomUUID()
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function findDemoAccountId(): string | null {
    const a = state.accounts.find((x) => !x.archived && x.name.trim().toLowerCase() === 'demo bank')
    return a?.id ?? null
  }

  function ensureDemoAccount(): string {
    const existing = findDemoAccountId()
    if (existing) return existing
    const id = makeId()
    dispatch({
      type: 'accounts/add',
      account: {
        id,
        name: 'Demo Bank',
        kind: 'checking',
        currencyCode: state.settings.displayCurrencyCode,
        openingBalance: 2500,
        institution: null,
        notes: null,
        archived: false,
      },
    })
    dispatch({ type: 'ui/addTutorialDemoAccounts', ids: [id] })
    return id
  }

  function addNextDemoTransaction(accountId: string) {
    const hasIncome = state.transactions.some((t) => t.kind === 'income' && t.accountId === accountId && t.payee === 'Demo Salary')
    const hasExpense = state.transactions.some((t) => t.kind === 'expense' && t.accountId === accountId && t.payee === 'Demo Groceries')
    if (!hasIncome) {
      const id = makeId()
      dispatch({
        type: 'transactions/add',
        transaction: {
          id,
          kind: 'income',
          date: new Date(Date.now() - 86400000 * 2),
          amount: { currencyCode: state.settings.displayCurrencyCode, value: 1800 },
          accountId,
          toAccountId: null,
          category: null,
          customCategoryName: null,
          payee: 'Demo Salary',
          notes: null,
          tags: [],
          relatedBillId: null,
        },
      })
      dispatch({ type: 'ui/addTutorialDemoTransactions', ids: [id] })
      dispatch({ type: 'ui/selectTransaction', id })
      return
    }
    if (!hasExpense) {
      const id = makeId()
      dispatch({
        type: 'transactions/add',
        transaction: {
          id,
          kind: 'expense',
          date: new Date(Date.now() - 86400000),
          amount: { currencyCode: state.settings.displayCurrencyCode, value: 120 },
          accountId,
          toAccountId: null,
          category: 'other',
          customCategoryName: null,
          payee: 'Demo Groceries',
          notes: null,
          tags: [],
          relatedBillId: null,
        },
      })
      dispatch({ type: 'ui/addTutorialDemoTransactions', ids: [id] })
      dispatch({ type: 'ui/selectTransaction', id })
      return
    }
  }

  function addNextDemoBill() {
    const hasRent = state.bills.some((b) => b.name.trim() === 'Demo Rent')
    const hasSub = state.bills.some((b) => b.name.trim() === 'Demo Subscription')
    const today = startOfDay(new Date())
    if (!hasRent) {
      const id = makeId()
      dispatch({
        type: 'bills/add',
        bill: {
          id,
          name: 'Demo Rent',
          amount: { currencyCode: state.settings.displayCurrencyCode, value: 950 },
          category: 'housing',
          customCategoryName: null,
          recurrence: 'monthly',
          nextDueDate: today,
          notes: null,
          payments: [],
          paidAutomatically: false,
          hiddenUntilEdited: false,
          snoozeUntil: null,
          snoozeCount: 0,
        },
      })
      dispatch({ type: 'ui/addTutorialDemoBills', ids: [id] })
      dispatch({ type: 'ui/selectBill', id })
      return
    }
    if (!hasSub) {
      const id = makeId()
      dispatch({
        type: 'bills/add',
        bill: {
          id,
          name: 'Demo Subscription',
          amount: { currencyCode: state.settings.displayCurrencyCode, value: 12.99 },
          category: 'subscriptions',
          customCategoryName: null,
          recurrence: 'monthly',
          nextDueDate: today,
          notes: null,
          payments: [],
          paidAutomatically: false,
          hiddenUntilEdited: false,
          snoozeUntil: null,
          snoozeCount: 0,
        },
      })
      dispatch({ type: 'ui/addTutorialDemoBills', ids: [id] })
      dispatch({ type: 'ui/selectBill', id })
      return
    }
  }

  function stopTutorialAndCleanup() {
    const billIds = [...state.ui.tutorialDemoBillIds]
    const txIds = [...state.ui.tutorialDemoTransactionIds]
    const accIds = [...state.ui.tutorialDemoAccountIds]
    for (const id of billIds) dispatch({ type: 'bills/delete', id })
    for (const id of txIds) dispatch({ type: 'transactions/delete', id })
    for (const id of accIds) {
      const willRemain = state.transactions.some((t) => (t.accountId === id || t.toAccountId === id) && !txIds.includes(t.id))
      if (!willRemain) dispatch({ type: 'accounts/delete', id })
    }
    dispatch({ type: 'ui/stopTutorial' })
  }

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

  function createBill() {
    const now = new Date()
    const b: Bill = {
      id: makeId(),
      name: tt('app.quickAdd.newBill', 'New Bill'),
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
    }
    dispatch({ type: 'bills/add', bill: b })
    dispatch({ type: 'ui/setSection', section: 'bills' })
    dispatch({ type: 'ui/selectBill', id: b.id })
    closeQuickAdd()
  }

  function createTransaction() {
    const now = new Date()
    const t: Transaction = {
      id: makeId(),
      kind: 'expense',
      date: now,
      amount: { currencyCode: state.settings.displayCurrencyCode, value: 0 },
      accountId: null,
      toAccountId: null,
      category: 'other',
      customCategoryName: null,
      payee: '',
      notes: null,
      tags: [],
      relatedBillId: null,
    }
    dispatch({ type: 'transactions/add', transaction: t })
    dispatch({ type: 'ui/setSection', section: 'transactions' })
    dispatch({ type: 'ui/selectTransaction', id: t.id })
    closeQuickAdd()
  }

  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        selector: '[data-tour="nav-accounts"]',
        section: 'accounts',
        title: tt('tutorial.step1.title', 'Accounts'),
        body: tt('tutorial.step1.body', 'Start here. Accounts are where your balances come from.'),
      },
      {
        selector: '[data-tour="accounts-add"]',
        section: 'accounts',
        title: tt('tutorial.step2.title', 'Add a bank account'),
        body: tt('tutorial.step2.body', 'Create your first bank account. You can add a real one, or use a demo to learn.'),
        action: 'createDemoAccount',
        preferredDir: 'right',
        offsetX: -40,
      },
      {
        selector: '[data-tour="accounts-selected"]',
        fallbackSelector: '[data-tour="accounts-add"]',
        section: 'accounts',
        title: tt('tutorial.step3.title', 'Edit account details'),
        body: tt(
          'tutorial.step3.body',
          'Select an account to edit name, currency, and starting balance. If you have no accounts yet, add a demo account first.',
        ),
        action: 'createDemoAccount',
        requires: 'account',
      },
      {
        selector: '[data-tour="nav-transactions"]',
        section: 'transactions',
        title: tt('tutorial.step4.title', 'Transactions'),
        body: tt('tutorial.step4.body', 'Transactions are income, expenses, and transfers. They drive your balances and dashboard.'),
      },
      {
        selector: '[data-tour="transactions-add-income"]',
        section: 'transactions',
        title: tt('tutorial.step5.title', 'Add demo transactions'),
        body: tt('tutorial.step5.body', 'Use the buttons here, or add demo transactions one by one to see how it works.'),
        action: 'createDemoTransactions',
      },
      {
        selector: '[data-tour="transactions-selected"]',
        fallbackSelector: '[data-tour="transactions-add-income"]',
        section: 'transactions',
        title: tt('tutorial.step6.title', 'Edit a transaction'),
        body: tt(
          'tutorial.step6.body',
          'Select a transaction to edit date, account, amount, and category on the right panel. If you have none, add a demo transaction first.',
        ),
        action: 'createDemoTransactions',
        requires: 'transaction',
      },
      {
        selector: '[data-tour="quick-add"]',
        title: tt('tutorial.step7.title', 'Quick add'),
        body: tt('tutorial.step7.body', 'Use the + button to quickly create a new transaction or bill from anywhere.'),
      },
      {
        selector: '[data-tour="nav-bills"]',
        section: 'bills',
        title: tt('tutorial.step8.title', 'Bills'),
        body: tt('tutorial.step8.body', 'Bills track upcoming due dates and show what is coming next.'),
      },
      {
        selector: '[data-tour="bills-add"]',
        section: 'bills',
        title: tt('tutorial.step9.title', 'Add a bill'),
        body: tt('tutorial.step9.body', 'Click + to add a bill. Or add a demo bill to learn.'),
        action: 'createDemoBill',
      },
      {
        selector: '[data-tour="bills-selected"]',
        fallbackSelector: '[data-tour="bills-add"]',
        section: 'bills',
        title: tt('tutorial.step10.title', 'Edit a bill'),
        body: tt('tutorial.step10.body', 'Select a bill to edit amount, due date, recurrence, and snooze.'),
        action: 'createDemoBill',
        requires: 'bill',
      },
      {
        selector: '[data-tour="settings-setupwizard"]',
        section: 'settings',
        title: tt('tutorial.step11.title', 'Settings'),
        body: tt('tutorial.step11.body', 'Change language/currency, export/import backups, or open the setup wizard again.'),
      },
    ],
    [tt],
  )

  const tutorialOpen = state.ui.tutorialOpen
  const tutorialStep = state.ui.tutorialStep
  const currentTour = tourSteps[Math.min(tourSteps.length - 1, Math.max(0, tutorialStep))]
  const hasAnyAccount = state.accounts.some((a) => !a.archived)
  const selectedTxId = state.ui.selectedTransactionId
  const hasSelectedTransaction = selectedTxId ? state.transactions.some((t) => t.id === selectedTxId) : false
  const selectedBillId = state.ui.selectedBillId
  const hasSelectedBill = selectedBillId ? state.bills.some((b) => b.id === selectedBillId) : false
  const nextDisabled =
    currentTour?.requires === 'account'
      ? !hasAnyAccount
      : currentTour?.requires === 'transaction'
        ? !hasSelectedTransaction
        : currentTour?.requires === 'bill'
          ? !hasSelectedBill
          : false

  useEffect(() => {
    if (!tutorialOpen) return
    if (currentTour?.section && state.ui.section !== currentTour.section) {
      dispatch({ type: 'ui/setSection', section: currentTour.section })
    }
  }, [currentTour?.section, dispatch, state.ui.section, tutorialOpen])

  const [tourRect, setTourRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [tourPopover, setTourPopover] = useState<{
    left: number
    top: number
    dir: 'left' | 'right' | 'up' | 'down'
    arrowX: number
    arrowY: number
  } | null>(null)

  useEffect(() => {
    if (!tutorialOpen) return
    const margin = 14
    const popW = 340
    const popMinH = 160
    let stopped = false
    let rafId: number | null = null
    function clamp(v: number, min: number, max: number) {
      return Math.max(min, Math.min(max, v))
    }
    function overlaps(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
      return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
    }
    function update(attempt = 0) {
      if (stopped) return
      const selector = currentTour?.selector
      const fallbackSelector = currentTour?.fallbackSelector
      const el =
        (selector ? (document.querySelector(selector) as HTMLElement | null) : null) ??
        (fallbackSelector ? (document.querySelector(fallbackSelector) as HTMLElement | null) : null)
      const r = el ? el.getBoundingClientRect() : null
      if (!r) {
        setTourRect(null)
        const left = Math.round((window.innerWidth - popW) / 2)
        const top = Math.round((window.innerHeight - popMinH) / 2)
        setTourPopover({ left: Math.max(margin, left), top: Math.max(margin, top), dir: 'down', arrowX: 22, arrowY: 22 })
        if (selector && attempt < 10) rafId = window.requestAnimationFrame(() => update(attempt + 1))
        return
      }

      const rect = {
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
      setTourRect(rect)

      try {
        const pad = 10
        const offscreen =
          r.top < pad ||
          r.left < pad ||
          r.bottom > window.innerHeight - pad ||
          r.right > window.innerWidth - pad
        if (offscreen) el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
      } catch {
      }

      const centerY = rect.top + rect.height / 2
      const centerX = rect.left + rect.width / 2
      const popH = currentTour?.action ? 240 : popMinH
      const offsetX = currentTour?.offsetX ?? 0
      const offsetY = currentTour?.offsetY ?? 0

      const target = { left: rect.left - 8, top: rect.top - 8, right: rect.left + rect.width + 8, bottom: rect.top + rect.height + 8 }
      function candidate(dir: 'left' | 'right' | 'up' | 'down') {
        if (dir === 'left') {
          return { dir, left: rect.left + rect.width + 12, top: Math.round(centerY - popH / 2) }
        }
        if (dir === 'right') {
          return { dir, left: rect.left - popW - 12, top: Math.round(centerY - popH / 2) }
        }
        if (dir === 'up') {
          return { dir, left: Math.round(centerX - popW / 2), top: rect.top + rect.height + 12 }
        }
        return { dir, left: Math.round(centerX - popW / 2), top: rect.top - popH - 12 }
      }

      function apply(dir: 'left' | 'right' | 'up' | 'down', left: number, top: number) {
        const maxLeft = window.innerWidth - popW - margin
        const maxTop = window.innerHeight - popH - margin
        const clampedLeft = clamp(Math.round(left + offsetX), margin, maxLeft)
        const clampedTop = clamp(Math.round(top + offsetY), margin, maxTop)
        const pop = { left: clampedLeft, top: clampedTop, right: clampedLeft + popW, bottom: clampedTop + popH }
        if (overlaps(pop, target)) return false
        if (dir === 'left' || dir === 'right') {
          const arrowY = clamp(Math.round(centerY - clampedTop), 18, popH - 18)
          setTourPopover({ left: clampedLeft, top: clampedTop, dir, arrowX: 0, arrowY })
          return true
        }
        const arrowX = clamp(Math.round(centerX - clampedLeft), 18, popW - 18)
        setTourPopover({ left: clampedLeft, top: clampedTop, dir, arrowX, arrowY: 0 })
        return true
      }

      const preferred = currentTour?.preferredDir
      const baseOrder = ['right', 'left', 'up', 'down'] as const
      const order: Array<'left' | 'right' | 'up' | 'down'> = preferred
        ? ([preferred, ...baseOrder.filter((d): d is (typeof baseOrder)[number] => d !== preferred)] as Array<'left' | 'right' | 'up' | 'down'>)
        : [...baseOrder]

      for (const dir of order) {
        const c = candidate(dir)
        if (apply(c.dir, c.left, c.top)) return
      }

      const fallbackLeft = clamp(Math.round(centerX - popW / 2), margin, window.innerWidth - popW - margin)
      const fallbackTop = clamp(Math.round(centerY - popH / 2), margin, window.innerHeight - popH - margin)
      const arrowX = clamp(Math.round(centerX - fallbackLeft), 18, popW - 18)
      setTourPopover({ left: fallbackLeft, top: fallbackTop, dir: 'down', arrowX, arrowY: 0 })
    }
    update(0)
    const onReflow = () => update(0)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      stopped = true
      if (rafId != null) window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [currentTour?.selector, state.ui.section, tutorialOpen])

  return (
    <div
      className={
        (effectiveSidebarExpanded ? 'shell shellSidebarExpanded' : 'shell shellSidebarCollapsed') +
        (enableMenuAnimations ? '' : ' noMenuAnimations')
      }
    >
      <OnboardingModal />
      {tutorialOpen && currentTour && tourPopover ? (
        <div className="tourOverlay" aria-live="polite">
          {tourRect ? (
            <div
              className="tourSpotlight"
              style={{
                left: tourRect.left - 6,
                top: tourRect.top - 6,
                width: tourRect.width + 12,
                height: tourRect.height + 12,
              }}
            />
          ) : (
            <div className="tourDim" />
          )}
          <div
            className="tourPopover"
            style={
              {
                left: tourPopover.left,
                top: tourPopover.top,
                ['--tour-arrow-x' as any]: `${tourPopover.arrowX}px`,
                ['--tour-arrow-y' as any]: `${tourPopover.arrowY}px`,
              } as any
            }
            data-dir={tourPopover.dir}
          >
            <div className="tourHeader">
              <div className="tourTitle">{currentTour.title}</div>
              <button type="button" className="tourClose" onClick={stopTutorialAndCleanup} aria-label={tt('common.close', 'Close')}>
                ×
              </button>
            </div>
            <div className="tourBody">{currentTour.body}</div>
            {currentTour.action ? (
              <div className="tourFooter" style={{ marginTop: 10 }}>
                <div />
                <div className="tourActions">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentTour.action === 'createDemoAccount') {
                        const id = ensureDemoAccount()
                        dispatch({ type: 'ui/setSection', section: 'accounts' })
                        dispatch({ type: 'ui/selectAccount', id })
                        return
                      }
                      if (currentTour.action === 'createDemoTransactions') {
                        const id = ensureDemoAccount()
                        dispatch({ type: 'ui/setSection', section: 'transactions' })
                        dispatch({ type: 'ui/setTransactionsAccountFilter', id })
                        addNextDemoTransaction(id)
                        return
                      }
                      if (currentTour.action === 'createDemoBill') {
                        dispatch({ type: 'ui/setSection', section: 'bills' })
                        addNextDemoBill()
                      }
                    }}
                  >
                    {currentTour.action === 'createDemoAccount'
                      ? tt('tutorial.demo.addAccount', 'Add demo bank account')
                      : currentTour.action === 'createDemoTransactions'
                        ? tt('tutorial.demo.addTransactions', 'Add demo transaction')
                        : tt('tutorial.demo.addBill', 'Add demo bill')}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="tourFooter">
              <div className="tourCount">
                {tutorialStep + 1}/{tourSteps.length}
              </div>
              <div className="tourActions">
                <button type="button" onClick={() => dispatch({ type: 'ui/prevTutorial' })} disabled={tutorialStep <= 0}>
                  {tt('tutorial.back', 'Back')}
                </button>
                <button
                  type="button"
                  className="btnPrimary"
                  disabled={nextDisabled}
                  onClick={() => {
                    if (tutorialStep >= tourSteps.length - 1) stopTutorialAndCleanup()
                    else dispatch({ type: 'ui/nextTutorial' })
                  }}
                >
                  {tutorialStep >= tourSteps.length - 1 ? tt('tutorial.done', 'Done') : tt('tutorial.next', 'Next')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <Sidebar onHoverChange={enableMenuAnimations ? setSidebarExpanded : undefined} />

      <main className="main">
        <header className="topbar">
          <div className="windowDragStrip" data-tauri-drag-region>
            <div className="windowDragHandle" data-tauri-drag-region />
          </div>
          <div className="appToolbar" data-tauri-drag-region>
            <div className="toolbarLeft">
              <button type="button" className="toolbarPlus" onClick={toggleQuickAdd} ref={quickAddButtonRef} data-tour="quick-add">
                +
              </button>
            </div>
            <div />
            <div className="toolbarRight">{sectionTitle ? <div className="toolbarTitle">{sectionTitle}</div> : null}</div>
          </div>
        </header>

        {quickAddOpen && quickAddPos ? (
          <>
            <div className="popoverOverlay" onMouseDown={closeQuickAdd} />
            <div className="popoverPanel" style={{ left: quickAddPos.left, top: quickAddPos.top, right: 'auto', width: quickAddPos.width }}>
              <div className="groupTitle" style={{ marginBottom: 8 }}>
                {tt('app.quickAdd.create', 'Create')}
              </div>
              <div className="rowActions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <button type="button" onClick={createTransaction}>
                  {tt('app.quickAdd.newTransaction', 'New Transaction')}
                </button>
                <button type="button" onClick={createBill}>
                  {tt('app.quickAdd.newBill', 'New Bill')}
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
