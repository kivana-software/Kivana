import './App.css'
import { useMemo, useRef, useState } from 'react'
import { useAppStore } from './app/appStore'
import { SectionRouter } from './ui/SectionRouter'
import { OnboardingModal } from './ui/OnboardingModal'
import { Sidebar } from './ui/Sidebar'
import type { Bill, Transaction } from './domain/models'
import { t } from './ui/i18n'

export default function App() {
  const store = useAppStore()
  const { state, dispatch } = store
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const lang = state.settings.language
  const tt = (key: string, fallback?: string) => t(lang, key, fallback)

  const enableMenuAnimations = state.settings.enableMenuAnimations
  const effectiveSidebarExpanded = enableMenuAnimations ? sidebarExpanded : true
  const sectionTitle = useMemo(() => tt(`nav.${state.ui.section}`, ''), [state.ui.section, lang])
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const quickAddButtonRef = useRef<HTMLButtonElement | null>(null)
  const [quickAddPos, setQuickAddPos] = useState<{ left: number; top: number; width: number } | null>(null)

  const quickAddWidth = 240

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
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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

  return (
    <div
      className={
        (effectiveSidebarExpanded ? 'shell shellSidebarExpanded' : 'shell shellSidebarCollapsed') +
        (enableMenuAnimations ? '' : ' noMenuAnimations')
      }
    >
      <OnboardingModal />
      <Sidebar onHoverChange={enableMenuAnimations ? setSidebarExpanded : undefined} />

      <main className="main">
        <header className="topbar">
          <div className="windowDragStrip" data-tauri-drag-region>
            <div className="windowDragHandle" data-tauri-drag-region />
          </div>
          <div className="appToolbar" data-tauri-drag-region>
            <div className="toolbarLeft">
              <button type="button" className="toolbarPlus" onClick={toggleQuickAdd} ref={quickAddButtonRef}>
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
