import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import type { Bill, BillCategory, Recurrence, UUID } from '../../domain/models'
import { billIsOverdue, billIsPaidFor, billIsSnoozedActive } from '../../domain/models'
import { currency } from '../../domain/finance'
import { fromDateInputValue, toDateInputValue } from '../date'
import { MenuSelect } from '../MenuSelect'
import { BillCategoryIcon } from '../icons'
import { billCategoryLabel, recurrenceLabel, tf, t } from '../i18n'

const BILL_CATEGORIES: BillCategory[] = ['housing', 'utilities', 'subscriptions', 'insurance', 'taxes', 'transport', 'other']
const RECURRENCES: Recurrence[] = ['once', 'weekly', 'monthly', 'yearly']

export function BillsView() {
  const { state, dispatch } = useAppStore()
  const selectedId = state.ui.selectedBillId
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<BillCategory | 'all'>('all')
  const [soonestFirst, setSoonestFirst] = useState(true)
  const [snoozeDate, setSnoozeDate] = useState('')
  const now = new Date()
  const lang = state.settings.language
  const tt = (key: string, fallback?: string) => t(lang, key, fallback)

  const billsSorted = useMemo(() => {
    let items = state.bills
    const q = search.trim().toLowerCase()
    if (q) items = items.filter((b) => b.name.toLowerCase().includes(q))
    if (categoryFilter !== 'all') items = items.filter((b) => b.category === categoryFilter)
    const sorted = [...items].sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
    return soonestFirst ? sorted : sorted.reverse()
  }, [categoryFilter, search, soonestFirst, state.bills])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return state.bills.find((b) => b.id === selectedId) ?? null
  }, [selectedId, state.bills])

  useEffect(() => {
    if (!selected) {
      setSnoozeDate('')
      return
    }
    const d = selected.snoozeUntil ?? selected.nextDueDate
    setSnoozeDate(toDateInputValue(d))
  }, [selectedId, selected?.nextDueDate?.getTime(), selected?.snoozeUntil?.getTime()])

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
  }

  function updateSelected(patch: Partial<Bill>) {
    if (!selected) return
    dispatch({ type: 'bills/update', bill: { ...selected, ...patch } })
  }

  function deleteSelected() {
    if (!selected) return
    if (!window.confirm('Delete bill?')) return
    dispatch({ type: 'bills/delete', id: selected.id })
  }

  function markPaidToday() {
    if (!selected) return
    dispatch({ type: 'bills/logPayment', id: selected.id, date: new Date() })
  }

  function skipBill() {
    if (!selected) return
    dispatch({ type: 'bills/skip', id: selected.id })
  }

  function setSnoozeFromInput() {
    if (!selected) return
    const d = snoozeDate ? fromDateInputValue(snoozeDate) : null
    if (!d) return
    dispatch({ type: 'bills/setSnooze', id: selected.id, until: d })
  }

  function clearSnooze() {
    if (!selected) return
    dispatch({ type: 'bills/clearSnooze', id: selected.id })
  }

  function deletePayment(paymentId: UUID) {
    if (!selected) return
    if (!window.confirm('Delete payment record?')) return
    dispatch({ type: 'bills/deletePayment', id: selected.id, paymentId })
  }

  function billTone(b: Bill): 'pos' | 'neg' | 'neutral' {
    if (billIsPaidFor(b, b.nextDueDate)) return 'pos'
    if (billIsOverdue(b, now)) return 'neg'
    return 'neutral'
  }

  const summary = useMemo(() => {
    const count = billsSorted.length
    if (count === 0) return tt('bills.summary.none', 'No bills')
    if (count === 1) return tt('bills.summary.one', '1 bill')
    return tf(lang, 'bills.summary.many', { count }, `${count} bills`)
  }, [billsSorted.length, lang])

  return (
    <>
      <div className="row">
        <div className="toolbarLeft">{summary ? <div className="toolbarSubtitle">{summary}</div> : null}</div>
        <div className="rowActions">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tt('bills.search.placeholder', 'Search')} style={{ width: 180 }} />
          <MenuSelect
            value={categoryFilter}
            options={[
              { value: 'all', label: tt('bills.filter.allCategories', 'All categories') },
              ...BILL_CATEGORIES.map((c) => ({ value: c, label: billCategoryLabel(lang, c) })),
            ]}
            onChange={(v) => setCategoryFilter(v as any)}
          />
          <button type="button" onClick={() => setSoonestFirst((v) => !v)}>
            {soonestFirst ? tt('common.soonest', 'Soonest') : tt('common.latest', 'Latest')}
          </button>
          <button type="button" className="btnPrimary" onClick={createBill} title={tt('bills.new', 'New bill')} aria-label={tt('bills.new', 'New bill')}>
            +
          </button>
        </div>
      </div>

      <div className="split">
        <div className="list">
          {billsSorted.map((b) => (
            <button
              key={b.id}
              type="button"
              className={b.id === selectedId ? 'listItem active stdRow' : 'listItem stdRow'}
              onClick={() => dispatch({ type: 'ui/selectBill', id: b.id })}
            >
              <div className="rowIcon" data-tone={billTone(b)}>
                <BillCategoryIcon category={b.category} />
              </div>
              <div className="rowMain">
                <div className="rowTitle">
                  <span className="rowTitleText">{b.name || tt('bills.fallbackName', 'Bill')}</span>
                </div>
                <div className="rowMeta">{b.nextDueDate.toLocaleDateString()}</div>
              </div>
              <div className="rowRight">
                <div className="rowAmount" data-tone={billTone(b)}>
                  {currency(b.amount.value, b.amount.currencyCode)}
                </div>
              </div>
            </button>
          ))}
          {billsSorted.length === 0 ? <div className="empty">{tt('bills.empty', 'No bills yet.')}</div> : null}
        </div>

        <div className="detail">
          {selected ? (
            <div className="form">
              <div className="groupBox" style={{ marginTop: 0 }}>
                <div className="groupTitle">{tt('common.actions', 'Actions')}</div>
                <div className="rowActions">
                  <button type="button" onClick={markPaidToday}>
                    {tt('bills.markPaid', 'Mark paid')}
                  </button>
                  <button type="button" onClick={skipBill}>
                    {tt('bills.skip', 'Skip')}
                  </button>
                  <button type="button" onClick={deleteSelected}>
                    {tt('common.delete', 'Delete')}
                  </button>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">{tt('common.basics', 'Basics')}</div>
                <label className="field">
                  <div className="fieldLabel">{tt('common.name', 'Name')}</div>
                  <input value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} />
                </label>

                <div className="fieldRow">
                  <label className="field">
                    <div className="fieldLabel">{tt('common.amount', 'Amount')}</div>
                    <input
                      type="number"
                      value={selected.amount.value}
                      onChange={(e) => updateSelected({ amount: { ...selected.amount, value: Number(e.target.value) } })}
                    />
                  </label>
                  <label className="field">
                    <div className="fieldLabel">{tt('common.currency', 'Currency')}</div>
                    <input
                      value={selected.amount.currencyCode}
                      onChange={(e) => updateSelected({ amount: { ...selected.amount, currencyCode: e.target.value } })}
                    />
                  </label>
                </div>

                <div className="fieldRow">
                  <label className="field">
                    <div className="fieldLabel">{tt('common.category', 'Category')}</div>
                    <MenuSelect
                      value={selected.category}
                      options={BILL_CATEGORIES.map((c) => ({ value: c, label: billCategoryLabel(lang, c) }))}
                      onChange={(v) => updateSelected({ category: v as BillCategory, customCategoryName: null })}
                    />
                  </label>
                  <label className="field">
                    <div className="fieldLabel">{tt('common.recurrence', 'Recurrence')}</div>
                    <MenuSelect
                      value={selected.recurrence}
                      options={RECURRENCES.map((r) => ({ value: r, label: recurrenceLabel(lang, r) }))}
                      onChange={(v) => updateSelected({ recurrence: v as Recurrence })}
                    />
                  </label>
                </div>

                <label className="field">
                  <div className="fieldLabel">{tt('bills.nextDueDate', 'Next due date')}</div>
                  <input value={toDateInputValue(selected.nextDueDate)} onChange={(e) => updateSelected({ nextDueDate: fromDateInputValue(e.target.value) })} />
                </label>
              </div>

              <div className="groupBox">
                <div className="groupTitle">{tt('common.snooze', 'Snooze')}</div>
                <div className="note">
                  {billIsSnoozedActive(selected, now) && selected.snoozeUntil
                    ? tf(lang, 'bills.snoozedUntil', { date: selected.snoozeUntil.toLocaleDateString() }, `Snoozed until ${selected.snoozeUntil.toLocaleDateString()}`)
                    : tt('bills.notSnoozed', 'Not snoozed')}
                </div>
                <div className="fieldRow">
                  <input type="date" value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)} style={{ width: 170 }} />
                  <button type="button" onClick={setSnoozeFromInput}>
                    {tt('common.snooze', 'Snooze')}
                  </button>
                  <button type="button" onClick={clearSnooze}>
                    {tt('common.clear', 'Clear')}
                  </button>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">{tt('common.notes', 'Notes')}</div>
                <textarea value={selected.notes ?? ''} onChange={(e) => updateSelected({ notes: e.target.value || null })} />
              </div>

              <div className="groupBox">
                <div className="groupTitle">{tt('bills.payments', 'Payments')}</div>
                {(selected.payments ?? []).length === 0 ? (
                  <div className="note">{tt('bills.payments.none', 'No payments recorded.')}</div>
                ) : (
                  <div className="list" style={{ gap: 6 }}>
                    {selected.payments
                      .slice()
                      .sort((a, b) => b.date.getTime() - a.date.getTime())
                      .map((p) => (
                        <div key={p.id} className="note" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span>{toDateInputValue(p.date)}</span>
                          <span>{currency(p.amount.value, p.amount.currencyCode)}</span>
                          <button type="button" onClick={() => deletePayment(p.id)}>
                            {tt('common.delete', 'Delete')}
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty">{tt('bills.select', 'Select a bill.')}</div>
          )}
        </div>
      </div>
    </>
  )
}
