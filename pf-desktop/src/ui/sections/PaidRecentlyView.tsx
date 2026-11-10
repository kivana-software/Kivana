import { useMemo } from 'react'
import { useAppStore } from '../../app/appStore'
import { setSection } from '../../app/AppProvider'
import { currency } from '../../domain/finance'
import { toDateInputValue } from '../date'

type Activity =
  | { id: string; kind: 'bill'; name: string; amount: number; currencyCode: string; date: Date; billId: string }
  | { id: string; kind: 'income'; name: string; amount: number; currencyCode: string; date: Date; incomeId: string }

export function PaidRecentlyView() {
  const { state, dispatch } = useAppStore()

  const activities = useMemo(() => {
    const now = new Date()
    const past = new Date(now)
    past.setDate(past.getDate() - 30)

    const items: Activity[] = []
    for (const bill of state.bills) {
      for (const p of bill.payments ?? []) {
        if (p.date >= past) {
          items.push({
            id: p.id,
            kind: 'bill',
            name: bill.name,
            amount: p.amount.value,
            currencyCode: p.amount.currencyCode,
            date: p.date,
            billId: bill.id,
          })
        }
      }
    }
    for (const inc of state.incomes) {
      for (const r of inc.receipts ?? []) {
        if (r.date >= past) {
          items.push({
            id: r.id,
            kind: 'income',
            name: inc.name,
            amount: r.amount.value,
            currencyCode: r.amount.currencyCode,
            date: r.date,
            incomeId: inc.id,
          })
        }
      }
    }
    return items.sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [state.bills, state.incomes])

  const summary = useMemo(() => {
    const billCount = activities.filter((a) => a.kind === 'bill').length
    const incomeCount = activities.filter((a) => a.kind === 'income').length
    const currencies = new Set(activities.map((a) => a.currencyCode))
    const singleCurrency = currencies.size === 1 ? [...currencies][0] ?? null : null
    const total = activities.reduce((acc, a) => acc + a.amount, 0)
    return { billCount, incomeCount, singleCurrency, total }
  }, [activities])

  function open(a: Activity) {
    if (a.kind === 'bill') {
      dispatch({ type: 'ui/selectBill', id: a.billId })
      dispatch(setSection('bills'))
      return
    }
    dispatch({ type: 'ui/selectIncome', id: a.incomeId })
    dispatch(setSection('income'))
  }

  return (
    <>
      <div className="pageHeader">
        <div style={{ minWidth: 0 }}>
          <div className="pageHeaderTitle">Paid Recently</div>
          <div className="pageHeaderSubtitle">Payments and receipts from the last 30 days.</div>
        </div>
        <div className="pageHeaderActions">
          <button type="button" onClick={() => dispatch(setSection('bills'))} className="btnPrimary">
            Review bills
          </button>
          <button type="button" onClick={() => dispatch(setSection('income'))}>Review income</button>
          <button type="button" onClick={() => dispatch(setSection('transactions'))}>Transactions</button>
        </div>
      </div>

      <div className="pageTopTwoCol">
        <div className="groupBox" style={{ marginTop: 0 }}>
          <div className="groupTitle">Summary (last 30 days)</div>
          <div className="progressRow">
            <div className="note">Bill payments</div>
            <div className="progressValue">{summary.billCount}</div>
          </div>
          <div className="progressRow" style={{ marginTop: 4 }}>
            <div className="note">Income receipts</div>
            <div className="progressValue">{summary.incomeCount}</div>
          </div>
          {summary.singleCurrency ? (
            <div className="progressRow" style={{ marginTop: 4 }}>
              <div className="note">Total</div>
              <div className="progressValue">{currency(summary.total, summary.singleCurrency)}</div>
            </div>
          ) : null}
        </div>

        <div className="groupBox">
          <div className="groupTitle">Recommended</div>
          <div className="rowActions">
            <button type="button" onClick={() => dispatch(setSection('dueSoon'))} className="btnPrimary">
              Go to Due Soon
            </button>
            <button type="button" onClick={() => dispatch(setSection('bills'))}>Review bills</button>
            <button type="button" onClick={() => dispatch(setSection('income'))}>Review income</button>
          </div>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="groupBox">
          <div className="groupTitle">No recent activity</div>
          <div className="note">Mark bills as paid or log income receipts to see history here.</div>
          <div className="rowActions" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => dispatch(setSection('dueSoon'))} className="btnPrimary">
              Go to Due Soon
            </button>
            <button type="button" onClick={() => dispatch(setSection('income'))}>Go to Income</button>
          </div>
        </div>
      ) : (
        <div className="list" style={{ marginTop: 12 }}>
          {activities.map((a) => (
            <button
              key={`${a.kind}:${a.id}`}
              type="button"
              className="listItem"
              onClick={() => open(a)}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center' }}
            >
              <div className="listTitle" style={{ margin: 0 }}>
                {a.kind === 'bill' ? 'Bill payment' : 'Income received'} • {a.name}
              </div>
              <div className="listMeta">{toDateInputValue(a.date)}</div>
              <div className="listMeta">{currency(a.amount, a.currencyCode)}</div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
