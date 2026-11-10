import { useMemo } from 'react'
import { useAppStore } from '../../app/appStore'
import { setSection } from '../../app/AppProvider'
import type { Bill } from '../../domain/models'
import { billIsPaidFor, billIsSnoozedActive } from '../../domain/models'
import { currency } from '../../domain/finance'
import { toDateInputValue } from '../date'

export function DueSoonView() {
  const { state, dispatch } = useAppStore()

  const now = new Date()
  const today = useMemo(() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
  }, [now])

  const dueSoon = useMemo(() => {
    const start = new Date(today)
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + 7)
    return state.bills
      .filter((b) => {
        if (b.hiddenUntilEdited) return false
        if (billIsSnoozedActive(b, now)) return false
        if (billIsPaidFor(b, b.nextDueDate)) return false
        const d = new Date(b.nextDueDate)
        d.setHours(0, 0, 0, 0)
        return d.getTime() >= start.getTime() && d.getTime() <= cutoff.getTime()
      })
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
  }, [now, state.bills, today])

  const overdue = useMemo(() => {
    return state.bills
      .filter((b) => {
        if (b.hiddenUntilEdited) return false
        if (billIsSnoozedActive(b, now)) return false
        if (billIsPaidFor(b, b.nextDueDate)) return false
        const d = new Date(b.nextDueDate)
        d.setHours(0, 0, 0, 0)
        return d.getTime() < today.getTime()
      })
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
  }, [now, state.bills, today])

  const totalDueSoon = useMemo(() => {
    if (dueSoon.length === 0) return null
    const sameCurrency = dueSoon.every((b) => b.amount.currencyCode === dueSoon[0]?.amount.currencyCode)
    const code = sameCurrency ? dueSoon[0]!.amount.currencyCode : state.settings.displayCurrencyCode
    const total = dueSoon.reduce((acc, b) => acc + b.amount.value, 0)
    return { total, code, sameCurrency }
  }, [dueSoon, state.settings.displayCurrencyCode])

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

  function markPaid(id: string) {
    const bill = state.bills.find((b) => b.id === id)
    if (!bill) return
    dispatch({ type: 'bills/logPayment', id, date: bill.nextDueDate })
  }

  function snooze7(id: string) {
    const until = new Date()
    until.setHours(0, 0, 0, 0)
    until.setDate(until.getDate() + 7)
    dispatch({ type: 'bills/setSnooze', id, until })
  }

  return (
    <>
      <div className="pageHeader">
        <div style={{ minWidth: 0 }}>
          <div className="pageHeaderTitle">Due Soon</div>
          <div className="pageHeaderSubtitle">Bills due in the next 7 days (and overdue).</div>
        </div>
        <div className="pageHeaderActions">
          <button type="button" onClick={createBill} className="btnPrimary">
            Add bill
          </button>
          <button type="button" onClick={() => dispatch(setSection('bills'))}>Open Bills</button>
        </div>
      </div>

      <div className="pageTopTwoCol">
        <div className="groupBox" style={{ marginTop: 0 }}>
          <div className="groupTitle">Summary</div>
          <div className="progressRow">
            <div className="note">Overdue</div>
            <div className="progressValue">{overdue.length}</div>
          </div>
          <div className="progressRow" style={{ marginTop: 4 }}>
            <div className="note">Due in next 7 days</div>
            <div className="progressValue">{dueSoon.length}</div>
          </div>
          {totalDueSoon && totalDueSoon.sameCurrency ? (
            <div className="progressRow" style={{ marginTop: 4 }}>
              <div className="note">Total due (7 days)</div>
              <div className="progressValue">{currency(totalDueSoon.total, totalDueSoon.code)}</div>
            </div>
          ) : null}
        </div>

        <div className="groupBox">
          <div className="groupTitle">Recommended</div>
          <div className="rowActions">
            <button type="button" onClick={() => dispatch(setSection('deferred'))}>View Snoozed</button>
          </div>
        </div>
      </div>

      {dueSoon.length === 0 ? (
        <div className="groupBox">
          <div className="groupTitle">All clear</div>
          <div className="note">Nothing due in the next 7 days.</div>
          <div className="rowActions" style={{ marginTop: 8 }}>
            <button type="button" onClick={createBill} className="btnPrimary">
              Create bill
            </button>
            <button type="button" onClick={() => dispatch(setSection('bills'))}>Review bills</button>
          </div>
        </div>
      ) : (
        <div className="list" style={{ marginTop: 12 }}>
          {dueSoon.map((b) => (
            <div key={b.id} className="note" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border-2)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.name} • {toDateInputValue(b.nextDueDate)}
                </div>
                <div className="note" style={{ marginTop: 6 }}>
                  Why is this here? Unpaid and due within 7 days.
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                <div>{currency(b.amount.value, b.amount.currencyCode)}</div>
                <div className="rowActions" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => markPaid(b.id)} style={{ padding: '2px 8px' }}>
                    Paid
                  </button>
                  <button type="button" onClick={() => snooze7(b.id)} style={{ padding: '2px 8px' }}>
                    Snooze
                  </button>
                  <button type="button" onClick={() => openBill(b.id)} style={{ padding: '2px 8px' }}>
                    Open
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
