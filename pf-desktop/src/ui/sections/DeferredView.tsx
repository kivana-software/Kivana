import { useMemo } from 'react'
import { useAppStore } from '../../app/appStore'
import { setSection } from '../../app/AppProvider'
import type { Bill } from '../../domain/models'
import { billClearSnooze, billIsSnoozedActive } from '../../domain/models'
import { toDateInputValue } from '../date'

export function DeferredView() {
  const { state, dispatch } = useAppStore()
  const now = new Date()

  const drafts = useMemo(() => {
    return state.bills
      .filter((b) => Boolean(b.hiddenUntilEdited))
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
  }, [now, state.bills])

  const snoozed = useMemo(() => {
    return state.bills
      .filter((b) => billIsSnoozedActive(b, now))
      .sort((a, b) => (a.snoozeUntil?.getTime() ?? 0) - (b.snoozeUntil?.getTime() ?? 0))
  }, [now, state.bills])

  function openBill(id: string) {
    dispatch({ type: 'ui/selectBill', id })
    dispatch(setSection('bills'))
  }

  function createBill() {
    const b: Bill = {
      id: crypto.randomUUID(),
      name: 'New Bill',
      amount: { currencyCode: state.settings.displayCurrencyCode, value: 0 },
      category: 'other',
      customCategoryName: null,
      recurrence: 'monthly',
      nextDueDate: new Date(),
      notes: null,
      payments: [],
      paidAutomatically: false,
      hiddenUntilEdited: false,
      snoozeUntil: null,
      snoozeCount: 0,
      attachments: [],
    }
    dispatch({ type: 'bills/add', bill: b })
    dispatch({ type: 'ui/selectBill', id: b.id })
    dispatch(setSection('bills'))
  }

  function clear(id: string) {
    dispatch({ type: 'bills/clearSnooze', id })
  }

  function activateAllDrafts() {
    for (const b of drafts) {
      dispatch({ type: 'bills/update', bill: { ...b, hiddenUntilEdited: false } })
    }
  }

  function deleteAllDrafts() {
    if (drafts.length === 0) return
    if (!window.confirm(`Delete ${drafts.length} draft${drafts.length === 1 ? '' : 's'}?`)) return
    dispatch({ type: 'bills/bulkDelete', ids: drafts.map((b) => b.id) })
  }

  function unsnoozeAll() {
    if (snoozed.length === 0) return
    dispatch({ type: 'bills/bulkUpdate', bills: snoozed.map((b) => billClearSnooze(b)) })
  }

  return (
    <>
      <div className="pageHeader">
        <div style={{ minWidth: 0 }}>
          <div className="pageHeaderTitle">Drafts & Snoozed</div>
          <div className="pageHeaderSubtitle">Drafts are hidden until edited. Snoozed bills are paused until a future date.</div>
        </div>
        <div className="pageHeaderActions">
          <button type="button" onClick={createBill} className="btnPrimary">
            Create bill
          </button>
          <button type="button" onClick={() => dispatch(setSection('dueSoon'))}>Due Soon</button>
          <button type="button" onClick={() => dispatch(setSection('bills'))}>Open Bills</button>
        </div>
      </div>

      <div className="pageTopTwoCol">
        <div className="groupBox" style={{ marginTop: 0 }}>
          <div className="groupTitle">Summary</div>
          <div className="progressRow">
            <div className="note">Drafts (not active yet)</div>
            <div className="progressValue">{drafts.length}</div>
          </div>
          <div className="progressRow" style={{ marginTop: 4 }}>
            <div className="note">Snoozed / paused</div>
            <div className="progressValue">{snoozed.length}</div>
          </div>
        </div>

        <div className="groupBox">
          <div className="groupTitle">Recommended</div>
          <div className="rowActions">
            <button type="button" onClick={() => dispatch(setSection('dueSoon'))} className="btnPrimary">
              Snooze from Due Soon
            </button>
            <button type="button" onClick={() => dispatch(setSection('bills'))}>Review bills</button>
          </div>
        </div>
      </div>

      <div className="groupBox">
        <div className="groupTitle">Bulk actions</div>
        <div className="rowActions">
          <button type="button" onClick={activateAllDrafts} disabled={drafts.length === 0}>
            Activate all drafts
          </button>
          <button type="button" onClick={deleteAllDrafts} disabled={drafts.length === 0} className="btnDanger">
            Delete all drafts
          </button>
          <button type="button" onClick={unsnoozeAll} disabled={snoozed.length === 0}>
            Unsnooze all
          </button>
        </div>
      </div>

      {drafts.length === 0 && snoozed.length === 0 ? (
        <div className="groupBox">
          <div className="groupTitle">Nothing here</div>
          <div className="note">1) Drafts show bills you created but hid until you finish editing.</div>
          <div className="note">2) Snoozed bills are paused until a future date.</div>
          <div className="rowActions" style={{ marginTop: 8 }}>
            <button type="button" onClick={createBill} className="btnPrimary">
              Create bill
            </button>
            <button type="button" onClick={() => dispatch(setSection('dueSoon'))}>Go to Due Soon</button>
          </div>
        </div>
      ) : null}

      {drafts.length > 0 ? (
        <div className="list" style={{ marginTop: 12 }}>
          {drafts.map((b) => (
            <div
              key={`draft:${b.id}`}
              className="note"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                padding: '10px 12px',
                borderBottom: '1px solid var(--border-2)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                <div className="note" style={{ marginTop: 6 }}>
                  Why is this here? Draft — hidden until edited.
                </div>
              </div>
              <div className="rowActions" style={{ justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => openBill(b.id)} style={{ padding: '2px 8px' }}>
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'bills/update', bill: { ...b, hiddenUntilEdited: false } })}
                  style={{ padding: '2px 8px' }}
                >
                  Activate
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {snoozed.length > 0 ? (
        <div className="list" style={{ marginTop: 12 }}>
          {snoozed.map((b) => (
            <div
              key={`snoozed:${b.id}`}
              className="note"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                padding: '10px 12px',
                borderBottom: '1px solid var(--border-2)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                <div className="note" style={{ marginTop: 6 }}>
                  Why is this here? Snoozed until {b.snoozeUntil ? toDateInputValue(b.snoozeUntil) : '—'}.
                </div>
              </div>
              <div className="rowActions" style={{ justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => clear(b.id)} style={{ padding: '2px 8px' }}>
                  Unsnooze
                </button>
                <button type="button" onClick={() => openBill(b.id)} style={{ padding: '2px 8px' }}>
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
