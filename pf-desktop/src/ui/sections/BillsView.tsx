import { useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import type { Bill, BillAttachment, BillCategory, Recurrence, UUID } from '../../domain/models'
import { billIsOverdue, billIsPaidFor, billIsSnoozedActive } from '../../domain/models'
import { currency } from '../../domain/finance'
import { fromDateInputValue, toDateInputValue } from '../date'
import { isTauriRuntime } from '../../storage/tauriJsonStore'
import { useContextMenu } from '../ContextMenu'
import { MenuSelect } from '../MenuSelect'
import { BillCategoryIcon } from '../icons'

const BILL_CATEGORIES: BillCategory[] = [
  'housing',
  'utilities',
  'subscriptions',
  'insurance',
  'taxes',
  'transport',
  'other',
]

const RECURRENCES: Recurrence[] = ['once', 'weekly', 'monthly', 'yearly']

export function BillsView() {
  const { state, dispatch } = useAppStore()
  const selectedId = state.ui.selectedBillId
  const [snoozeDate, setSnoozeDate] = useState<string>('')
  const [showMore, setShowMore] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<BillCategory | 'all'>('all')
  const [soonestFirst, setSoonestFirst] = useState(true)
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)
  const now = new Date()

  const billsSorted = useMemo(() => {
    let items = state.bills
    const q = search.trim().toLowerCase()
    if (q) items = items.filter((b) => b.name.toLowerCase().includes(q))
    if (categoryFilter !== 'all') items = items.filter((b) => b.category === categoryFilter)
    const sorted = [...items].sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
    return soonestFirst ? sorted : sorted.reverse()
  }, [categoryFilter, search, soonestFirst, state.bills])

  const summary = useMemo(() => {
    const count = billsSorted.length
    if (search.trim() || categoryFilter !== 'all') return `${count} result${count === 1 ? '' : 's'}`
    if (count === 0) return 'No bills'
    if (count === 1) return '1 bill'
    return `${count} bills`
  }, [billsSorted.length, categoryFilter, search])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return state.bills.find((b) => b.id === selectedId) ?? null
  }, [selectedId, state.bills])

  function createBill() {
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
  }

  function deleteSelected() {
    if (!selected) return
    if (!window.confirm('Delete bill?')) return
    dispatch({ type: 'bills/delete', id: selected.id })
  }

  function updateSelected(patch: Partial<Bill>) {
    if (!selected) return
    dispatch({ type: 'bills/update', bill: { ...selected, ...patch } })
  }

  function markPaidToday() {
    if (!selected) return
    dispatch({ type: 'bills/logPayment', id: selected.id, date: new Date() })
  }

  function markPaidOnDueDate() {
    if (!selected) return
    dispatch({ type: 'bills/logPayment', id: selected.id, date: selected.nextDueDate })
  }

  function skipBill() {
    if (!selected) return
    dispatch({ type: 'bills/skip', id: selected.id })
  }

  function setSnooze(until: Date) {
    if (!selected) return
    dispatch({ type: 'bills/setSnooze', id: selected.id, until })
  }

  function clearSnooze() {
    if (!selected) return
    dispatch({ type: 'bills/clearSnooze', id: selected.id })
  }

  function deletePayment(paymentId: UUID) {
    if (!selected) return
    const ok = window.confirm('Delete payment record?')
    if (!ok) return
    dispatch({ type: 'bills/deletePayment', id: selected.id, paymentId })
  }

  async function addAttachment() {
    if (!selected) return
    if (!isTauriRuntime()) {
      window.alert('Attachments are available in the desktop app (Tauri).')
      return
    }
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await open({ multiple: false, directory: false })
    if (!path || Array.isArray(path)) return
    const attachmentId = crypto.randomUUID()
    const saved = (await invoke('save_bill_attachment', {
      billId: selected.id,
      attachmentId: attachmentId,
      sourcePath: path,
      displayName: null,
    })) as { stored_relative_path: string; display_name: string }
    const att: BillAttachment = {
      id: attachmentId,
      displayName: saved.display_name,
      storedRelativePath: saved.stored_relative_path,
      createdAt: new Date(),
    }
    updateSelected({ attachments: [...selected.attachments, att] })
  }

  async function removeAttachment(a: BillAttachment) {
    if (!selected) return
    const ok = window.confirm('Remove attachment?')
    if (!ok) return
    if (isTauriRuntime()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('delete_bill_attachment', { storedRelativePath: a.storedRelativePath })
      } catch (err) {
        console.error('Failed to delete attachment', err)
      }
    }
    updateSelected({ attachments: selected.attachments.filter((x) => x.id !== a.id) })
  }

  const status = useMemo(() => {
    if (!selected) return null
    const overdue = billIsOverdue(selected)
    const snoozed = billIsSnoozedActive(selected)
    const paidFor = billIsPaidFor(selected, selected.nextDueDate)
    return { overdue, snoozed, paidFor }
  }, [selected])

  const rowMenu = useContextMenu([
    {
      id: 'open',
      label: 'Edit',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'ui/selectBill', id: selectedId })
      },
    },
    { id: 'sep1', kind: 'separator' as const },
    {
      id: 'paid',
      label: 'Mark paid',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'bills/logPayment', id: selectedId, date: new Date() })
      },
    },
    {
      id: 'snooze',
      label: 'Snooze 3 days',
      onSelect: () => {
        if (!selectedId) return
        const until = new Date()
        until.setHours(0, 0, 0, 0)
        until.setDate(until.getDate() + 3)
        dispatch({ type: 'bills/setSnooze', id: selectedId, until })
      },
    },
    {
      id: 'skip',
      label: 'Handle later',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'bills/skip', id: selectedId })
      },
    },
    { id: 'sep2', kind: 'separator' as const },
    {
      id: 'delete',
      label: 'Delete',
      tone: 'danger',
      onSelect: () => {
        if (!selectedId) return
        if (!window.confirm('Delete bill?')) return
        dispatch({ type: 'bills/delete', id: selectedId })
      },
    },
  ])

  function billTone(b: Bill): 'pos' | 'neg' | 'neutral' {
    if (billIsPaidFor(b, b.nextDueDate)) return 'pos'
    if (billIsOverdue(b, now)) return 'neg'
    return 'neutral'
  }

  function billSubtitle(b: Bill): string {
    const parts: string[] = []
    if (b.paidAutomatically) parts.push('Auto')
    if (billIsSnoozedActive(b, now)) parts.push('Snoozed')
    const cat = b.customCategoryName?.trim() || b.category
    if (cat) parts.push(String(cat))
    return parts.join(' • ')
  }

  const snoozePresets = useMemo(() => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const in3 = new Date(now)
    in3.setDate(in3.getDate() + 3)
    const in7 = new Date(now)
    in7.setDate(in7.getDate() + 7)
    const nextWeek = new Date(now)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return [
      { label: 'Tomorrow', date: tomorrow },
      { label: 'In 3 days', date: in3 },
      { label: 'In 7 days', date: in7 },
      { label: 'Next week', date: nextWeek },
      { label: 'End of month', date: endOfMonth },
    ]
  }, [])

  return (
    <>
      <div className="row">
        <div className="toolbarLeft">
          {summary ? <div className="toolbarSubtitle">{summary}</div> : null}
        </div>
        <div className="rowActions" style={{ flexWrap: 'wrap' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" style={{ width: 180 }} />
          <button type="button" className="menuButton" onClick={() => setShowCategoryMenu(true)}>
            {categoryFilter === 'all' ? 'All Items' : categoryFilter}
            <span className="menuChevron">▾</span>
          </button>
          <div className="segmented">
            <button type="button" className={soonestFirst ? 'active' : ''} onClick={() => setSoonestFirst(true)}>
              Soonest
            </button>
            <button type="button" className={!soonestFirst ? 'active' : ''} onClick={() => setSoonestFirst(false)}>
              Latest
            </button>
          </div>
        </div>
        <div className="rowActions">
          <button type="button" onClick={createBill} className="btnPrimary">
            New
          </button>
          <button type="button" onClick={deleteSelected} disabled={!selected} className="btnDanger">
            Delete
          </button>
          <button type="button" onClick={markPaidToday} disabled={!selected}>
            Mark Paid
          </button>
          <button type="button" onClick={skipBill} disabled={!selected}>
            Skip
          </button>
        </div>
      </div>

      {showCategoryMenu ? <div className="popoverOverlay" onClick={() => setShowCategoryMenu(false)} /> : null}
      {showCategoryMenu ? (
        <div className="popoverPanel" style={{ right: 'auto', left: 0, top: 44, width: 260 }}>
          <div className="groupTitle" style={{ marginBottom: 8 }}>
            Category
          </div>
          <div className="rowActions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all')
                setShowCategoryMenu(false)
              }}
            >
              All Items
            </button>
            {BILL_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategoryFilter(c)
                  setShowCategoryMenu(false)
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="split">
        <div className="list">
          {billsSorted.map((b) => (
            <button
              key={b.id}
              type="button"
              className={b.id === selectedId ? 'listItem active stdRow' : 'listItem stdRow'}
              onClick={() => dispatch({ type: 'ui/selectBill', id: b.id })}
              onContextMenu={(e) => {
                dispatch({ type: 'ui/selectBill', id: b.id })
                rowMenu.open(e)
              }}
            >
              <div className="rowIcon" data-tone={billTone(b)}>
                <BillCategoryIcon category={b.category} />
              </div>
              <div className="rowMain">
                <div className="rowTitle">
                  <span className="rowTitleText">{b.name}</span>
                  {billIsOverdue(b, now) && !billIsPaidFor(b, b.nextDueDate) ? (
                    <span className="pill" data-tone="neg">
                      Overdue
                    </span>
                  ) : null}
                  {billIsPaidFor(b, b.nextDueDate) ? (
                    <span className="pill" data-tone="pos">
                      Paid
                    </span>
                  ) : null}
                </div>
                <div className="rowMeta">{billSubtitle(b)}</div>
              </div>
              <div className="rowRight">
                <div className="rowAmount" data-tone={billTone(b)}>
                  {currency(-Math.abs(b.amount.value), b.amount.currencyCode)}
                </div>
                <div className="rowDate">{toDateInputValue(b.nextDueDate)}</div>
              </div>
            </button>
          ))}
          {billsSorted.length === 0 ? <div className="empty">No bills yet.</div> : null}
        </div>
        {rowMenu.Menu}

        <div className="detail">
          {selected ? (
            <div className="form">
              <div className="groupBox" style={{ marginTop: 0 }}>
                <div className="groupTitle">Status</div>
                <div className="note">
                  {status?.overdue ? 'Overdue' : 'Not overdue'}
                  {status?.paidFor ? ' • Paid for this due date' : ''}
                  {status?.snoozed && selected.snoozeUntil ? ` • Snoozed until ${toDateInputValue(selected.snoozeUntil)}` : ''}
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Basics</div>
                <label className="field">
                  <div className="fieldLabel">Name</div>
                  <input value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} placeholder="Bill name" />
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

                <div className="fieldRow">
                  <label className="field">
                    <div className="fieldLabel">Category</div>
                    <MenuSelect
                      value={selected.category}
                      options={BILL_CATEGORIES.map((c) => ({ value: c, label: c }))}
                      onChange={(v) => updateSelected({ category: v as BillCategory })}
                    />
                  </label>
                  <label className="field">
                    <div className="fieldLabel">Recurrence</div>
                    <MenuSelect
                      value={selected.recurrence}
                      options={RECURRENCES.map((r) => ({ value: r, label: r }))}
                      onChange={(v) => updateSelected({ recurrence: v as Recurrence })}
                    />
                  </label>
                </div>

                <label className="field">
                  <div className="fieldLabel">Next Due Date</div>
                  <input
                    type="date"
                    value={toDateInputValue(selected.nextDueDate)}
                    onChange={(e) => updateSelected({ nextDueDate: fromDateInputValue(e.target.value) })}
                  />
                </label>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Preferences</div>
                <div className="fieldRow">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={selected.paidAutomatically}
                      onChange={(e) => updateSelected({ paidAutomatically: e.target.checked })}
                    />
                    Paid automatically
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={selected.hiddenUntilEdited}
                      onChange={(e) => updateSelected({ hiddenUntilEdited: e.target.checked })}
                    />
                    Hidden until edited
                  </label>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Notes</div>
                <label className="field" style={{ margin: 0 }}>
                  <div className="fieldLabel">Notes</div>
                  <textarea value={selected.notes ?? ''} onChange={(e) => updateSelected({ notes: e.target.value })} />
                </label>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Payments</div>
                {selected.payments.length === 0 ? (
                  <div className="note">No payments recorded yet.</div>
                ) : (
                  selected.payments
                    .slice()
                    .sort((a, b) => b.date.getTime() - a.date.getTime())
                    .map((p) => (
                      <div key={p.id} className="note" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span>{toDateInputValue(p.date)}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {currency(p.amount.value, p.amount.currencyCode)}
                        </span>
                        <button type="button" onClick={() => deletePayment(p.id)} style={{ padding: '2px 8px' }}>
                          Delete
                        </button>
                      </div>
                    ))
                )}
              </div>

              <div className="groupBox">
                <div className="groupTitle">Attachments</div>
                <div className="rowActions">
                  <button type="button" onClick={() => void addAttachment()}>
                    Add attachment
                  </button>
                </div>
                {selected.attachments.length === 0 ? (
                  <div className="note">No attachments yet.</div>
                ) : (
                  selected.attachments.map((a) => (
                    <div key={a.id} className="note" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.displayName}
                      </span>
                      <button type="button" onClick={() => void removeAttachment(a)} style={{ padding: '2px 8px' }}>
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="groupBox">
                <div className="groupTitle">More</div>
                <div className="rowActions" style={{ flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setShowMore((v) => !v)}>
                    {showMore ? 'Hide extra options' : 'Show extra options'}
                  </button>
                </div>
              </div>

              {showMore ? (
                <>
                  <div className="groupBox">
                    <div className="groupTitle">Actions</div>
                    <div className="rowActions" style={{ flexWrap: 'wrap' }}>
                      <button type="button" onClick={markPaidOnDueDate}>
                        Paid on due date
                      </button>
                      <button type="button" onClick={markPaidToday}>
                        Paid today
                      </button>
                      <button type="button" onClick={skipBill}>
                        Handle later
                      </button>
                    </div>
                  </div>

                  <div className="groupBox">
                    <div className="groupTitle">Snooze</div>
                    <div className="note">
                      {selected.snoozeUntil ? `Snoozed until ${toDateInputValue(selected.snoozeUntil)}.` : 'Not snoozed.'}
                    </div>
                    <div className="rowActions" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                      {snoozePresets.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            setSnooze(p.date)
                            setSnoozeDate('')
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          clearSnooze()
                          setSnoozeDate('')
                        }}
                        disabled={!selected.snoozeUntil}
                      >
                        Clear
                      </button>
                    </div>

                    <div className="fieldRow" style={{ marginTop: 8 }}>
                      <input type="date" value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)} />
                      <button
                        type="button"
                        onClick={() => {
                          if (!snoozeDate) return
                          setSnooze(fromDateInputValue(snoozeDate))
                          setSnoozeDate('')
                        }}
                        disabled={!snoozeDate}
                      >
                        Snooze to date
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="empty">Select a bill to edit.</div>
          )}
        </div>
      </div>
    </>
  )
}
