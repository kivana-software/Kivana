import { useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import type { Income, IncomeSource, Recurrence } from '../../domain/models'
import { currency } from '../../domain/finance'
import { fromDateInputValue, toDateInputValue } from '../date'
import { useContextMenu } from '../ContextMenu'
import { MenuSelect } from '../MenuSelect'

export function IncomeView() {
  const { state, dispatch } = useAppStore()
  const selectedId = state.ui.selectedIncomeId
  const [search, setSearch] = useState('')
  const sources: IncomeSource[] = ['salary', 'freelance', 'rental', 'investment', 'other']
  const recurrences: Recurrence[] = ['once', 'weekly', 'monthly', 'yearly']
  const now = new Date()

  const incomesSorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    let items = state.incomes
    if (q) {
      items = items.filter((i) => i.name.toLowerCase().includes(q))
    }
    return [...items].sort((a, b) => a.nextPayDate.getTime() - b.nextPayDate.getTime())
  }, [search, state.incomes])

  const summary = useMemo(() => {
    const count = incomesSorted.length
    if (search.trim()) return `${count} result${count === 1 ? '' : 's'}`
    if (count === 0) return 'No incomes'
    if (count === 1) return '1 income'
    return `${count} incomes`
  }, [incomesSorted.length, search])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return state.incomes.find((i) => i.id === selectedId) ?? null
  }, [selectedId, state.incomes])

  function createIncome() {
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
  }

  function deleteSelected() {
    if (!selected) return
    if (!window.confirm('Delete income?')) return
    dispatch({ type: 'incomes/delete', id: selected.id })
  }

  function updateSelected(patch: Partial<Income>) {
    if (!selected) return
    dispatch({ type: 'incomes/update', income: { ...selected, ...patch } })
  }

  function logReceipt() {
    if (!selected) return
    dispatch({ type: 'incomes/logReceipt', id: selected.id, date: new Date() })
  }

  function handleLater() {
    if (!selected) return
    dispatch({ type: 'incomes/skip', id: selected.id })
  }

  const rowMenu = useContextMenu([
    {
      id: 'edit',
      label: 'Edit',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'ui/selectIncome', id: selectedId })
      },
    },
    { id: 'sep1', kind: 'separator' as const },
    {
      id: 'receipt',
      label: 'Log receipt',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'incomes/logReceipt', id: selectedId, date: new Date() })
      },
    },
    {
      id: 'skip',
      label: 'Handle later',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'incomes/skip', id: selectedId })
      },
    },
    { id: 'sep2', kind: 'separator' as const },
    {
      id: 'delete',
      label: 'Delete',
      tone: 'danger',
      onSelect: () => {
        if (!selectedId) return
        if (!window.confirm('Delete income?')) return
        dispatch({ type: 'incomes/delete', id: selectedId })
      },
    },
  ])

  function incomeTone(i: Income): 'pos' | 'neg' | 'neutral' {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const due = new Date(i.nextPayDate)
    due.setHours(0, 0, 0, 0)
    const received = (i.receipts ?? []).some((r) => sameDay(r.date, i.nextPayDate))
    if (received) return 'pos'
    if (due.getTime() < today.getTime()) return 'neg'
    return 'neutral'
  }

  function incomeGlyph(i: Income): string {
    const tone = incomeTone(i)
    if (tone === 'pos') return '✓'
    if (tone === 'neg') return '!'
    return '↓'
  }

  function incomeSubtitle(i: Income): string {
    const parts: string[] = []
    const src = i.customSourceName?.trim() || i.source
    if (src) parts.push(String(src))
    if (i.recurrence) parts.push(i.recurrence)
    return parts.join(' • ')
  }

  function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  }

  return (
    <>
      <div className="row">
        <div className="toolbarLeft">{summary ? <div className="toolbarSubtitle">{summary}</div> : null}</div>
        <div className="rowActions">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" style={{ width: 160 }} />
          <button type="button" onClick={createIncome} className="btnPrimary">
            Add
          </button>
          <button type="button" onClick={deleteSelected} disabled={!selected} className="btnDanger">
            Delete
          </button>
        </div>
      </div>

      <div className="split">
        <div className="list">
          {incomesSorted.map((i) => (
            <button
              key={i.id}
              type="button"
              className={i.id === selectedId ? 'listItem active stdRow' : 'listItem stdRow'}
              onClick={() => dispatch({ type: 'ui/selectIncome', id: i.id })}
              onContextMenu={(e) => {
                dispatch({ type: 'ui/selectIncome', id: i.id })
                rowMenu.open(e)
              }}
            >
              <div className="rowIcon" data-tone={incomeTone(i)}>
                {incomeGlyph(i)}
              </div>
              <div className="rowMain">
                <div className="rowTitle">
                  <span className="rowTitleText">{i.name}</span>
                  {incomeTone(i) === 'neg' ? (
                    <span className="pill" data-tone="neg">
                      Overdue
                    </span>
                  ) : null}
                  {incomeTone(i) === 'pos' ? (
                    <span className="pill" data-tone="pos">
                      Received
                    </span>
                  ) : null}
                </div>
                <div className="rowMeta">{incomeSubtitle(i)}</div>
              </div>
              <div className="rowRight">
                <div className="rowAmount" data-tone="pos">
                  {currency(Math.abs(i.amount.value), i.amount.currencyCode)}
                </div>
                <div className="rowDate">{toDateInputValue(i.nextPayDate)}</div>
              </div>
            </button>
          ))}
          {incomesSorted.length === 0 ? <div className="empty">No income yet.</div> : null}
        </div>
        {rowMenu.Menu}

        <div className="detail">
          {selected ? (
            <div className="form">
              <div className="groupBox" style={{ marginTop: 0 }}>
                <div className="groupTitle">Actions</div>
                <div className="rowActions">
                  <button type="button" onClick={logReceipt}>
                    Log Receipt
                  </button>
                  <button type="button" onClick={handleLater}>
                    Handle Later
                  </button>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Basics</div>
                <label className="field">
                  <div className="fieldLabel">Name</div>
                  <input value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} />
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

              <div className="groupBox">
                <div className="groupTitle">Schedule</div>
                <div className="fieldRow">
                  <label className="field">
                    <div className="fieldLabel">Source</div>
                    <MenuSelect
                      value={selected.source}
                      options={sources.map((s) => ({ value: s, label: s }))}
                      onChange={(v) => updateSelected({ source: v as IncomeSource })}
                    />
                  </label>
                  <label className="field">
                    <div className="fieldLabel">Recurrence</div>
                    <MenuSelect
                      value={selected.recurrence}
                      options={recurrences.map((r) => ({ value: r, label: r }))}
                      onChange={(v) => updateSelected({ recurrence: v as Recurrence })}
                    />
                  </label>
                </div>

                <label className="field">
                  <div className="fieldLabel">Next Pay Date</div>
                  <input
                    type="date"
                    value={toDateInputValue(selected.nextPayDate)}
                    onChange={(e) => updateSelected({ nextPayDate: fromDateInputValue(e.target.value) })}
                  />
                </label>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Notes</div>
                <label className="field" style={{ margin: 0 }}>
                  <div className="fieldLabel">Notes</div>
                  <textarea value={selected.notes ?? ''} onChange={(e) => updateSelected({ notes: e.target.value || null })} />
                </label>
              </div>
            </div>
          ) : (
            <div className="empty">Select income.</div>
          )}
        </div>
      </div>
    </>
  )
}
