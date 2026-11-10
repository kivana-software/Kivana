import { useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import type { Debt, DebtKind } from '../../domain/models'
import { currency, payoffProjection } from '../../domain/finance'
import { useContextMenu } from '../ContextMenu'
import { MenuSelect } from '../MenuSelect'
import { DebtKindIcon } from '../icons'

export function DebtsView() {
  const { state, dispatch } = useAppStore()
  const selectedId = state.ui.selectedDebtId
  const [search, setSearch] = useState('')
  const [extraPayment, setExtraPayment] = useState(0)

  const debtsFiltered = useMemo(() => {
    let items = state.debts.filter((d) => !d.archived)
    const q = search.trim().toLowerCase()
    if (q) {
      items = items.filter((d) => d.name.toLowerCase().includes(q) || (d.notes ?? '').toLowerCase().includes(q))
    }
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }, [search, state.debts])

  const summary = useMemo(() => {
    const count = debtsFiltered.length
    if (search.trim()) return `${count} result${count === 1 ? '' : 's'}`
    if (count === 0) return 'No debts'
    if (count === 1) return '1 debt'
    return `${count} debts`
  }, [debtsFiltered.length, search])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return state.debts.find((d) => d.id === selectedId) ?? null
  }, [selectedId, state.debts])

  const kinds: DebtKind[] = ['creditCard', 'loan', 'mortgage', 'other']

  const rowMenu = useContextMenu([
    {
      id: 'edit',
      label: 'Edit',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'ui/selectDebt', id: selectedId })
      },
    },
    { id: 'sep1', kind: 'separator' as const },
    {
      id: 'archive',
      label: 'Archive',
      onSelect: () => {
        if (!selectedId) return
        const d = state.debts.find((x) => x.id === selectedId)
        if (!d) return
        dispatch({ type: 'debts/update', debt: { ...d, archived: true } })
        dispatch({ type: 'ui/selectDebt', id: null })
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      tone: 'danger',
      onSelect: () => {
        if (!selectedId) return
        if (!window.confirm('Delete debt?')) return
        dispatch({ type: 'debts/delete', id: selectedId })
      },
    },
  ])

  function debtSubtitle(d: Debt): string {
    const parts: string[] = []
    if (d.kind) parts.push(d.kind)
    if (d.minimumPayment) parts.push(`Min ${currency(d.minimumPayment, d.currencyCode)}`)
    return parts.join(' • ')
  }

  function createDebt() {
    const code = state.settings.displayCurrencyCode
    const d: Debt = {
      id: crypto.randomUUID(),
      name: '',
      kind: 'creditCard',
      currencyCode: code,
      principal: 0,
      annualInterestRate: 0,
      minimumPayment: 0,
      dueDayOfMonth: null,
      notes: null,
      archived: false,
    }
    dispatch({ type: 'debts/add', debt: d })
  }

  function updateSelected(patch: Partial<Debt>) {
    if (!selected) return
    dispatch({ type: 'debts/update', debt: { ...selected, ...patch } })
  }

  function archiveSelected() {
    if (!selected) return
    dispatch({ type: 'debts/update', debt: { ...selected, archived: true } })
    dispatch({ type: 'ui/selectDebt', id: null })
  }

  function deleteSelected() {
    if (!selected) return
    if (!window.confirm('Delete debt?')) return
    dispatch({ type: 'debts/delete', id: selected.id })
  }
  return (
    <>
      <div className="row">
        <div className="toolbarLeft">{summary ? <div className="toolbarSubtitle">{summary}</div> : null}</div>
        <div className="rowActions">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" style={{ width: 160 }} />
          <button type="button" onClick={createDebt} className="btnPrimary">
            Add
          </button>
        </div>
      </div>

      <div className="split">
        <div className="list">
          {debtsFiltered.map((d) => (
            <button
              key={d.id}
              type="button"
              className={d.id === selectedId ? 'listItem active stdRow' : 'listItem stdRow'}
              onClick={() => dispatch({ type: 'ui/selectDebt', id: d.id })}
              onContextMenu={(e) => {
                dispatch({ type: 'ui/selectDebt', id: d.id })
                rowMenu.open(e)
              }}
            >
              <div className="rowIcon" data-tone="neg">
                <DebtKindIcon kind={d.kind} />
              </div>
              <div className="rowMain">
                <div className="rowTitle">
                  <span className="rowTitleText">{d.name || 'Untitled'}</span>
                  {d.annualInterestRate ? (
                    <span className="pill" data-tone="neutral">
                      {d.annualInterestRate.toFixed(2)}% APR
                    </span>
                  ) : null}
                </div>
                <div className="rowMeta">{debtSubtitle(d)}</div>
              </div>
              <div className="rowRight">
                <div className="rowAmount" data-tone="neg">
                  {currency(-Math.abs(d.principal), d.currencyCode)}
                </div>
                <div className="rowDate">{d.dueDayOfMonth ? `Due ${d.dueDayOfMonth}` : ''}</div>
              </div>
            </button>
          ))}
          {debtsFiltered.length === 0 ? <div className="empty">No debts yet.</div> : null}
        </div>
        {rowMenu.Menu}

        <div className="detail">
          {selected ? (
            <div className="form">
              <div className="row" style={{ marginBottom: 0 }}>
                <h2 style={{ margin: 0 }}>Details</h2>
                <div className="rowActions">
                  <button type="button" onClick={archiveSelected}>
                    Archive
                  </button>
                  <button type="button" onClick={deleteSelected}>
                    Delete
                  </button>
                </div>
              </div>

              <label className="field">
                <div className="fieldLabel">Name</div>
                <input value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} />
              </label>

              <label className="field">
                <div className="fieldLabel">Type</div>
                <MenuSelect
                  value={selected.kind}
                  options={kinds.map((k) => ({ value: k, label: k }))}
                  onChange={(v) => updateSelected({ kind: v as DebtKind })}
                />
              </label>

              <div className="fieldRow">
                <label className="field">
                  <div className="fieldLabel">Currency</div>
                  <input value={selected.currencyCode} onChange={(e) => updateSelected({ currencyCode: e.target.value })} />
                </label>
                <label className="field">
                  <div className="fieldLabel">Balance</div>
                  <input type="number" value={selected.principal} onChange={(e) => updateSelected({ principal: Number(e.target.value) })} />
                </label>
              </div>

              <div className="fieldRow">
                <label className="field">
                  <div className="fieldLabel">APR (%)</div>
                  <input
                    type="number"
                    value={selected.annualInterestRate}
                    onChange={(e) => updateSelected({ annualInterestRate: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <div className="fieldLabel">Minimum Payment</div>
                  <input
                    type="number"
                    value={selected.minimumPayment}
                    onChange={(e) => updateSelected({ minimumPayment: Number(e.target.value) })}
                  />
                </label>
              </div>

              <label className="field">
                <div className="fieldLabel">Due Day (1-28)</div>
                <input
                  value={selected.dueDayOfMonth ?? ''}
                  onChange={(e) => {
                    const trimmed = e.target.value.trim()
                    const day = trimmed ? Number(trimmed) : NaN
                    const v = Number.isFinite(day) && day >= 1 && day <= 28 ? day : null
                    updateSelected({ dueDayOfMonth: v })
                  }}
                />
              </label>

              <div className="groupBox">
                <div className="groupTitle">Payoff Projection</div>
                <div className="fieldRow">
                  <label className="field" style={{ margin: 0 }}>
                    <div className="fieldLabel">Extra monthly</div>
                    <input type="number" value={extraPayment} onChange={(e) => setExtraPayment(Number(e.target.value))} />
                  </label>
                  <div />
                </div>
                {(() => {
                  const proj = payoffProjection({
                    principal: selected.principal,
                    annualInterestRate: selected.annualInterestRate,
                    minimumPayment: selected.minimumPayment,
                    extraPayment,
                  })
                  if (proj.message) return <div className="note">{proj.message}</div>
                  return (
                    <>
                      <div className="note">Months: {proj.months}</div>
                      <div className="note">Total Interest: {currency(proj.totalInterest, selected.currencyCode)}</div>
                      {proj.payoffDate ? <div className="note">Payoff Date: {proj.payoffDate.toDateString()}</div> : null}
                    </>
                  )
                })()}
              </div>

              <label className="field">
                <div className="fieldLabel">Notes</div>
                <textarea value={selected.notes ?? ''} onChange={(e) => updateSelected({ notes: e.target.value || null })} />
              </label>
            </div>
          ) : (
            <div className="empty">Select a debt.</div>
          )}
        </div>
      </div>
    </>
  )
}
