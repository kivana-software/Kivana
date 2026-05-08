import { useMemo } from 'react'
import { useAppStore } from '../../app/appStore'
import { setSection } from '../../app/AppProvider'
import { accountBalance, currency, signedAmountForAccount } from '../../domain/finance'
import { billIsOverdue, billIsPaidFor, billIsSnoozedActive } from '../../domain/models'
import { BillCategoryIcon, TransactionKindIcon } from '../icons'
import { t, transactionKindLabel } from '../i18n'

export function DashboardView() {
  const { state, dispatch } = useAppStore()
  const lang = state.settings.language
  const tt = (key: string, fallback?: string) => t(lang, key, fallback)
  const now = new Date()

  const activeAccounts = useMemo(() => state.accounts.filter((a) => !a.archived), [state.accounts])
  const accountById = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts])

  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of activeAccounts) {
      const bal = accountBalance(a, state.transactions)
      map.set(a.currencyCode, (map.get(a.currencyCode) ?? 0) + bal)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [activeAccounts, state.transactions])

  const net30Days = useMemo(() => {
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - 30)
    let total = 0
    for (const t of state.transactions) {
      if (t.date.getTime() < cutoff.getTime()) continue
      if (t.kind === 'income') total += t.amount.value
      if (t.kind === 'expense') total -= t.amount.value
    }
    return total
  }, [now, state.transactions])

  const upcomingBillsAll = useMemo(() => {
    return state.bills
      .filter((b) => !b.hiddenUntilEdited)
      .filter((b) => !billIsSnoozedActive(b, now))
      .filter((b) => !billIsPaidFor(b, b.nextDueDate))
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
  }, [now, state.bills])

  const upcomingBills = useMemo(() => upcomingBillsAll.slice(0, 8), [upcomingBillsAll])
  const nextBill = upcomingBillsAll[0] ?? null

  const recentTransactions = useMemo(() => {
    return [...state.transactions].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10)
  }, [state.transactions])

  function netTone(v: number): 'pos' | 'neg' | 'neutral' {
    if (!Number.isFinite(v) || v === 0) return 'neutral'
    return v < 0 ? 'neg' : 'pos'
  }

  return (
    <>
      <div className="dashStats">
        <div className="groupBox dashStat">
          <div className="groupTitle">{tt('dashboard.totalBalance', 'Total balance')}</div>
          {totalsByCurrency.length === 0 ? (
            <div className="note">{tt('dashboard.totalBalance.empty', 'Add an account to see balances.')}</div>
          ) : (
            <>
              <div className="dashStatValue">{currency(totalsByCurrency[0]![1], totalsByCurrency[0]![0])}</div>
              {totalsByCurrency.length > 1 ? (
                <div className="dashStatMeta">
                  {totalsByCurrency
                    .slice(1)
                    .map(([code, amount]) => currency(amount, code))
                    .join(' · ')}
                </div>
              ) : null}
              <div className="dashAccountList">
                {activeAccounts.slice(0, 4).map((a) => {
                  const bal = accountBalance(a, state.transactions)
                  return (
                    <div key={a.id} className="dashAccountRow">
                      <div className="dashAccountName">{a.name || 'Untitled'}</div>
                      <div className="dashAccountAmount" data-tone={bal < 0 ? 'neg' : bal > 0 ? 'pos' : 'neutral'}>
                        {currency(bal, a.currencyCode)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="groupBox dashStat">
          <div className="groupTitle">{tt('dashboard.net30', 'Net (30 days)')}</div>
          <div className="dashStatValue" data-tone={netTone(net30Days)}>
            {currency(net30Days, state.settings.displayCurrencyCode)}
          </div>
          <div className="dashStatMeta">{tt('dashboard.net30.meta', 'Income minus expenses (transfers ignored)')}</div>
          <div className="rowActions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" onClick={() => dispatch(setSection('transactions'))}>
              {tt('dashboard.viewTransactions', 'View transactions')}
            </button>
          </div>
        </div>

        <div className="groupBox dashStat">
          <div className="groupTitle">{tt('dashboard.upcomingBills', 'Upcoming bills')}</div>
          <div className="dashStatValue">{upcomingBillsAll.length}</div>
          <div className="dashStatMeta">
            {nextBill
              ? `${tt('dashboard.next', 'Next')}: ${nextBill.name || tt('bills.fallbackName', 'Bill')} · ${nextBill.nextDueDate.toLocaleDateString()}`
              : tt('dashboard.nextBill.none', 'No unpaid bills')}
          </div>
          <div className="rowActions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" onClick={() => dispatch(setSection('bills'))}>
              {tt('dashboard.viewBills', 'View bills')}
            </button>
          </div>
        </div>
      </div>

      <div className="split">
        <div className="groupBox dashRecentCard">
          <div className="dashSideHeader">
            <div className="groupTitle" style={{ marginBottom: 0 }}>
              {tt('dashboard.recentActivity', 'Recent activity')}
            </div>
            <button type="button" className="dashSideLink" onClick={() => dispatch(setSection('transactions'))}>
              {tt('dashboard.viewAll', 'View all')}
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="note">{tt('dashboard.noTransactions', 'No transactions yet.')}</div>
          ) : (
            <div className="list dashMiniList">
              {recentTransactions.map((t) => {
                const accId = t.accountId
                const signed = accId ? signedAmountForAccount(t, accId) : t.kind === 'expense' ? -t.amount.value : t.amount.value
                const acc = accId ? accountById.get(accId) : null
                const meta = t.kind === 'transfer' ? transactionKindLabel(lang, 'transfer') : acc?.name || tt('transactions.unassigned', 'Unassigned')
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="listItem stdRow"
                    onClick={() => {
                      dispatch(setSection('transactions'))
                      dispatch({ type: 'ui/selectTransaction', id: t.id })
                    }}
                  >
                    <div className="rowIcon" data-tone={signed < 0 ? 'neg' : signed > 0 ? 'pos' : 'neutral'}>
                      <TransactionKindIcon kind={t.kind} />
                    </div>
                    <div className="rowMain">
                      <div className="rowTitle">
                        <span className="rowTitleText">{t.payee?.trim() ? t.payee : tt('transactions.fallbackName', 'Transaction')}</span>
                      </div>
                      <div className="rowMeta">{meta}</div>
                    </div>
                    <div className="rowRight">
                      <div className="rowAmount" data-tone={signed < 0 ? 'neg' : signed > 0 ? 'pos' : 'neutral'}>
                        {currency(signed, t.amount.currencyCode)}
                      </div>
                      <div className="rowDate">{t.date.toLocaleDateString()}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="detail">
          <div className="groupBox dashSideCard" style={{ marginTop: 0 }}>
            <div className="dashSideHeader">
              <div className="groupTitle" style={{ marginBottom: 0 }}>
                {tt('dashboard.upcomingBills', 'Upcoming bills')}
              </div>
              <button type="button" className="dashSideLink" onClick={() => dispatch(setSection('bills'))}>
                {tt('dashboard.viewAll', 'View all')}
              </button>
            </div>
            {upcomingBills.length === 0 ? (
              <div className="note">{tt('dashboard.upcomingBills.none', 'No upcoming bills.')}</div>
            ) : (
              <div className="list dashMiniList">
                {upcomingBills.map((b) => {
                  const overdue = billIsOverdue(b, now)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className="listItem stdRow"
                      onClick={() => {
                        dispatch(setSection('bills'))
                        dispatch({ type: 'ui/selectBill', id: b.id })
                      }}
                    >
                      <div className="rowIcon" data-tone={overdue ? 'neg' : 'neutral'}>
                        <BillCategoryIcon category={b.category} />
                      </div>
                      <div className="rowMain">
                        <div className="rowTitle">
                          <span className="rowTitleText">{b.name || tt('bills.fallbackName', 'Bill')}</span>
                        </div>
                        <div className="rowMeta">{b.nextDueDate.toLocaleDateString()}</div>
                      </div>
                      <div className="rowRight">
                        <div className="rowAmount" data-tone={overdue ? 'neg' : 'neutral'}>
                          {currency(b.amount.value, b.amount.currencyCode)}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
