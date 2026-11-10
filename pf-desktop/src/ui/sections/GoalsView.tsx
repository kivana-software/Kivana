import { useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import type { Goal } from '../../domain/models'
import { currency, goalProgress } from '../../domain/finance'
import { fromDateInputValue, toDateInputValue } from '../date'
import { useContextMenu } from '../ContextMenu'
import { GoalIcon } from '../icons'

export function GoalsView() {
  const { state, dispatch } = useAppStore()
  const selectedId = state.ui.selectedGoalId
  const [search, setSearch] = useState('')
  const [addAmount, setAddAmount] = useState(0)

  function daysInMonth(year: number, monthIndex: number): number {
    return new Date(year, monthIndex + 1, 0).getDate()
  }

  function advanceMonthlySameDay(from: Date): Date {
    const y = from.getFullYear()
    const m = from.getMonth()
    const day = from.getDate()
    const nextM = m + 1
    const y2 = y + Math.floor(nextM / 12)
    const m2 = ((nextM % 12) + 12) % 12
    const maxDay = daysInMonth(y2, m2)
    return new Date(y2, m2, Math.min(day, maxDay), 0, 0, 0, 0)
  }

  const goalsFiltered = useMemo(() => {
    let items = state.goals.filter((g) => !g.archived)
    const q = search.trim().toLowerCase()
    if (q) {
      items = items.filter((g) => g.name.toLowerCase().includes(q) || (g.notes ?? '').toLowerCase().includes(q))
    }
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }, [search, state.goals])

  const summary = useMemo(() => {
    const count = goalsFiltered.length
    if (search.trim()) return `${count} result${count === 1 ? '' : 's'}`
    if (count === 0) return 'No goals'
    if (count === 1) return '1 goal'
    return `${count} goals`
  }, [goalsFiltered.length, search])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return state.goals.find((g) => g.id === selectedId) ?? null
  }, [selectedId, state.goals])

  function createGoal() {
    const code = state.settings.displayCurrencyCode
    const g: Goal = {
      id: crypto.randomUUID(),
      name: '',
      targetAmount: { currencyCode: code, value: 0 },
      savedAmount: { currencyCode: code, value: 0 },
      autoMonthlyAmount: null,
      autoMonthlyNextDate: null,
      targetDate: null,
      notes: null,
      archived: false,
    }
    dispatch({ type: 'goals/add', goal: g })
  }

  function updateSelected(patch: Partial<Goal>) {
    if (!selected) return
    dispatch({ type: 'goals/update', goal: { ...selected, ...patch } })
  }

  function archiveSelected() {
    if (!selected) return
    dispatch({ type: 'goals/update', goal: { ...selected, archived: true } })
    dispatch({ type: 'ui/selectGoal', id: null })
  }

  function deleteSelected() {
    if (!selected) return
    if (!window.confirm('Delete goal?')) return
    dispatch({ type: 'goals/delete', id: selected.id })
  }

  function applyAddToSaved() {
    if (!selected) return
    if (!Number.isFinite(addAmount) || addAmount === 0) return
    updateSelected({
      savedAmount: { ...selected.savedAmount, value: selected.savedAmount.value + addAmount },
    })
    setAddAmount(0)
  }

  const rowMenu = useContextMenu([
    {
      id: 'edit',
      label: 'Edit',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'ui/selectGoal', id: selectedId })
      },
    },
    { id: 'sep1', kind: 'separator' as const },
    {
      id: 'archive',
      label: 'Archive',
      onSelect: () => {
        if (!selectedId) return
        const g = state.goals.find((x) => x.id === selectedId)
        if (!g) return
        dispatch({ type: 'goals/update', goal: { ...g, archived: true } })
        dispatch({ type: 'ui/selectGoal', id: null })
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      tone: 'danger',
      onSelect: () => {
        if (!selectedId) return
        if (!window.confirm('Delete goal?')) return
        dispatch({ type: 'goals/delete', id: selectedId })
      },
    },
  ])

  function goalTone(p: number): 'pos' | 'neg' | 'neutral' {
    if (p >= 1) return 'pos'
    return 'neutral'
  }

  return (
    <>
      <div className="row">
        <div className="toolbarLeft">{summary ? <div className="toolbarSubtitle">{summary}</div> : null}</div>
        <div className="rowActions">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" style={{ width: 160 }} />
          <button type="button" onClick={createGoal} className="btnPrimary">
            Add
          </button>
        </div>
      </div>

      <div className="split">
        <div className="list">
          {goalsFiltered.map((g) => {
            const p = goalProgress(g.savedAmount.value, g.targetAmount.value)
            return (
              <button
                key={g.id}
                type="button"
                className={g.id === selectedId ? 'listItem active stdRow' : 'listItem stdRow'}
                onClick={() => dispatch({ type: 'ui/selectGoal', id: g.id })}
                onContextMenu={(e) => {
                  dispatch({ type: 'ui/selectGoal', id: g.id })
                  rowMenu.open(e)
                }}
              >
                <div className="rowIcon" data-tone={goalTone(p)}>
                  <GoalIcon />
                </div>
                <div className="rowMain">
                  <div className="rowTitle">
                    <span className="rowTitleText">{g.name || 'Untitled'}</span>
                    {p >= 1 ? (
                      <span className="pill" data-tone="pos">
                        Done
                      </span>
                    ) : null}
                  </div>
                  <div className="rowMeta">
                    {currency(g.savedAmount.value, g.savedAmount.currencyCode)} / {currency(g.targetAmount.value, g.targetAmount.currencyCode)}
                  </div>
                </div>
                <div className="rowRight">
                  <div className="rowAmount" data-tone={goalTone(p)}>
                    {Math.round(p * 100)}%
                  </div>
                  <div className="rowDate">{g.targetDate ? toDateInputValue(g.targetDate) : ''}</div>
                </div>
              </button>
            )
          })}
          {goalsFiltered.length === 0 ? <div className="empty">No goals yet.</div> : null}
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

              <div className="fieldRow">
                <label className="field">
                  <div className="fieldLabel">Target Amount</div>
                  <input
                    type="number"
                    value={selected.targetAmount.value}
                    onChange={(e) =>
                      updateSelected({ targetAmount: { ...selected.targetAmount, value: Number(e.target.value) } })
                    }
                  />
                </label>
                <label className="field">
                  <div className="fieldLabel">Saved Amount</div>
                  <input
                    type="number"
                    value={selected.savedAmount.value}
                    onChange={(e) =>
                      updateSelected({ savedAmount: { ...selected.savedAmount, value: Number(e.target.value) } })
                    }
                  />
                </label>
              </div>

              <label className="field">
                <div className="fieldLabel">Has Target Date</div>
                <select
                  value={selected.targetDate ? 'yes' : 'no'}
                  onChange={(e) => updateSelected({ targetDate: e.target.value === 'yes' ? new Date() : null })}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>

              {selected.targetDate ? (
                <label className="field">
                  <div className="fieldLabel">Target Date</div>
                  <input
                    type="date"
                    value={toDateInputValue(selected.targetDate)}
                    onChange={(e) => updateSelected({ targetDate: fromDateInputValue(e.target.value) })}
                  />
                </label>
              ) : null}

              <div className="groupBox">
                <div className="groupTitle">Progress</div>
                <div className="progressRow">
                  <div className="progressBar">
                    <div
                      className="progressFill"
                      style={{
                        width: `${Math.min(100, Math.max(0, goalProgress(selected.savedAmount.value, selected.targetAmount.value) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="progressValue">
                    {Math.round(goalProgress(selected.savedAmount.value, selected.targetAmount.value) * 100)}%
                  </div>
                </div>
              </div>

              <div className="field">
                <div className="fieldLabel">Add to saved</div>
                <div className="fieldRow">
                  <input type="number" value={addAmount} onChange={(e) => setAddAmount(Number(e.target.value))} />
                  <button type="button" onClick={applyAddToSaved} disabled={!Number.isFinite(addAmount) || addAmount === 0}>
                    Apply
                  </button>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Monthly auto add</div>
                <div className="fieldRow">
                  <label className="field">
                    <div className="fieldLabel">Amount</div>
                    <input
                      type="number"
                      value={selected.autoMonthlyAmount?.value ?? 0}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (!Number.isFinite(v) || v <= 0) {
                          updateSelected({ autoMonthlyAmount: null, autoMonthlyNextDate: null })
                          return
                        }
                        const next = selected.autoMonthlyNextDate ?? advanceMonthlySameDay(new Date())
                        updateSelected({
                          autoMonthlyAmount: { currencyCode: selected.savedAmount.currencyCode, value: v },
                          autoMonthlyNextDate: next,
                        })
                      }}
                    />
                  </label>
                  <label className="field">
                    <div className="fieldLabel">Next add date</div>
                    <input
                      type="date"
                      value={selected.autoMonthlyNextDate ? toDateInputValue(selected.autoMonthlyNextDate) : ''}
                      onChange={(e) => updateSelected({ autoMonthlyNextDate: fromDateInputValue(e.target.value) })}
                      disabled={!selected.autoMonthlyAmount || (selected.autoMonthlyAmount?.value ?? 0) <= 0}
                    />
                  </label>
                </div>
              </div>

              <label className="field">
                <div className="fieldLabel">Notes</div>
                <textarea value={selected.notes ?? ''} onChange={(e) => updateSelected({ notes: e.target.value || null })} />
              </label>
            </div>
          ) : (
            <div className="empty">Select a goal.</div>
          )}
        </div>
      </div>
    </>
  )
}
