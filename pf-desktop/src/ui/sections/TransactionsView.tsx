import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import type { BillCategory, Transaction, TransactionKind, UUID } from '../../domain/models'
import { currency } from '../../domain/finance'
import { fromDateInputValue, toDateInputValue } from '../date'
import { MenuSelect } from '../MenuSelect'
import { TransactionKindIcon } from '../icons'
import { billCategoryLabel, tf, t, transactionKindLabel } from '../i18n'

const CATEGORIES: BillCategory[] = ['housing', 'utilities', 'subscriptions', 'insurance', 'taxes', 'transport', 'other']
const KINDS: TransactionKind[] = ['expense', 'income', 'transfer']

export function TransactionsView() {
  const { state, dispatch } = useAppStore()
  const selectedId = state.ui.selectedTransactionId
  const [search, setSearch] = useState('')
  const [accountFilterId, setAccountFilterId] = useState<UUID | 'all'>(() => state.ui.transactionsAccountFilterId ?? 'all')
  const [kindFilter, setKindFilter] = useState<TransactionKind | 'all'>('all')
  const lang = state.settings.language
  const tt = (key: string, fallback?: string) => t(lang, key, fallback)

  const accounts = useMemo(() => state.accounts.filter((a) => !a.archived), [state.accounts])

  useEffect(() => {
    const next = state.ui.transactionsAccountFilterId ?? 'all'
    if (next !== accountFilterId) setAccountFilterId(next)
  }, [accountFilterId, state.ui.transactionsAccountFilterId])

  function setAccountFilter(next: UUID | 'all') {
    setAccountFilterId(next)
    dispatch({ type: 'ui/setTransactionsAccountFilter', id: next === 'all' ? null : next })
  }

  const filtered = useMemo(() => {
    let items = [...state.transactions]
    const q = search.trim().toLowerCase()
    if (q) {
      items = items.filter((t) => {
        const payee = String(t.payee ?? '').toLowerCase()
        const notes = String(t.notes ?? '').toLowerCase()
        return payee.includes(q) || notes.includes(q)
      })
    }
    if (accountFilterId !== 'all') {
      items = items.filter((t) => t.accountId === accountFilterId || t.toAccountId === accountFilterId)
    }
    if (kindFilter !== 'all') items = items.filter((t) => t.kind === kindFilter)
    items.sort((a, b) => b.date.getTime() - a.date.getTime())
    return items
  }, [accountFilterId, kindFilter, search, state.transactions])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return state.transactions.find((t) => t.id === selectedId) ?? null
  }, [selectedId, state.transactions])

  function createTransaction(kind: TransactionKind) {
    const now = new Date()
    const t: Transaction = {
      id: crypto.randomUUID(),
      kind,
      date: now,
      amount: { currencyCode: state.settings.displayCurrencyCode, value: 0 },
      accountId: null,
      toAccountId: null,
      category: kind === 'expense' ? 'other' : null,
      customCategoryName: kind === 'expense' ? null : null,
      payee: '',
      notes: null,
      tags: [],
      relatedBillId: null,
    }
    dispatch({ type: 'transactions/add', transaction: t })
  }

  function updateSelected(patch: Partial<Transaction>) {
    if (!selected) return
    const next: Transaction = { ...selected, ...patch }
    if (next.kind !== 'transfer') next.toAccountId = null
    if (next.kind !== 'expense') {
      next.category = null
      next.customCategoryName = null
    }
    dispatch({ type: 'transactions/update', transaction: next })
  }

  function deleteSelected() {
    if (!selected) return
    if (!window.confirm(tt('transactions.deleteConfirm', 'Delete transaction?'))) return
    dispatch({ type: 'transactions/delete', id: selected.id })
  }

  function amountTone(t: Transaction): 'pos' | 'neg' | 'neutral' {
    if (t.kind === 'expense') return 'neg'
    if (t.kind === 'income') return 'pos'
    return 'neutral'
  }

  return (
    <>
      <div className="row">
        <div className="toolbarLeft">
          {filtered.length ? (
            <div className="toolbarSubtitle">{tf(lang, 'transactions.summary.items', { count: filtered.length }, `${filtered.length} items`)}</div>
          ) : (
            <div className="toolbarSubtitle">{tt('transactions.summary.none', 'No transactions')}</div>
          )}
        </div>
        <div className="rowActions">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tt('common.search', 'Search')} style={{ width: 180 }} />
          <MenuSelect
            value={kindFilter}
            options={[{ value: 'all', label: tt('transactions.filter.allKinds', 'All kinds') }, ...KINDS.map((k) => ({ value: k, label: transactionKindLabel(lang, k) }))]}
            onChange={(v) => setKindFilter(v as any)}
          />
          <MenuSelect
            value={accountFilterId}
            options={[
              { value: 'all', label: tt('transactions.filter.allAccounts', 'All accounts') },
              ...accounts.map((a) => ({ value: a.id, label: a.name || 'Untitled' })),
            ]}
            onChange={(v) => setAccountFilter(v as any)}
          />
          <button type="button" className="btnPrimary" onClick={() => createTransaction('income')}>
            {tt('transactions.add.income', '+ Income')}
          </button>
          <button type="button" onClick={() => createTransaction('expense')}>
            {tt('transactions.add.expense', '- Expense')}
          </button>
          <button type="button" onClick={() => createTransaction('transfer')}>
            {tt('transactions.add.transfer', 'Transfer')}
          </button>
        </div>
      </div>

      <div className="split">
        <div className="list">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === selectedId ? 'listItem active stdRow' : 'listItem stdRow'}
              onClick={() => dispatch({ type: 'ui/selectTransaction', id: t.id })}
            >
              <div className="rowIcon" data-tone={amountTone(t)}>
                <TransactionKindIcon kind={t.kind} />
              </div>
              <div className="rowMain">
                <div className="rowTitle">
                  <span className="rowTitleText">{t.payee?.trim() ? t.payee : tt('transactions.fallbackName', 'Transaction')}</span>
                </div>
                <div className="rowMeta">{toDateInputValue(t.date)}</div>
              </div>
              <div className="rowRight">
                <div className="rowAmount" data-tone={amountTone(t)}>
                  {currency(t.kind === 'expense' ? -t.amount.value : t.amount.value, t.amount.currencyCode)}
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 ? <div className="empty">{tt('transactions.empty', 'No transactions yet.')}</div> : null}
        </div>

        <div className="detail">
          {selected ? (
            <div className="form">
              <div className="groupBox" style={{ marginTop: 0 }}>
                <div className="groupTitle">{tt('common.actions', 'Actions')}</div>
                <div className="rowActions">
                  <button type="button" onClick={deleteSelected}>
                    {tt('common.delete', 'Delete')}
                  </button>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">{tt('common.basics', 'Basics')}</div>
                <div className="fieldRow">
                  <label className="field">
                    <div className="fieldLabel">{tt('transactions.kind', 'Kind')}</div>
                    <MenuSelect
                      value={selected.kind}
                      options={KINDS.map((k) => ({ value: k, label: transactionKindLabel(lang, k) }))}
                      onChange={(v) => updateSelected({ kind: v as TransactionKind })}
                    />
                  </label>
                  <label className="field">
                    <div className="fieldLabel">{tt('transactions.date', 'Date')}</div>
                    <input value={toDateInputValue(selected.date)} onChange={(e) => updateSelected({ date: fromDateInputValue(e.target.value) })} />
                  </label>
                </div>

                <div className="fieldRow">
                  <label className="field">
                    <div className="fieldLabel">{tt('transactions.account', 'Account')}</div>
                    <MenuSelect
                      value={selected.accountId ?? ''}
                      options={[{ value: '', label: tt('transactions.unassigned', 'Unassigned') }, ...accounts.map((a) => ({ value: a.id, label: a.name || 'Untitled' }))]}
                      onChange={(v) => updateSelected({ accountId: v ? (v as UUID) : null })}
                    />
                  </label>
                  {selected.kind === 'transfer' ? (
                    <label className="field">
                      <div className="fieldLabel">{tt('transactions.toAccount', 'To account')}</div>
                      <MenuSelect
                        value={selected.toAccountId ?? ''}
                        options={[{ value: '', label: tt('transactions.selectAccount', 'Select') }, ...accounts.map((a) => ({ value: a.id, label: a.name || 'Untitled' }))]}
                        onChange={(v) => updateSelected({ toAccountId: v ? (v as UUID) : null })}
                      />
                    </label>
                  ) : null}
                </div>

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

                {selected.kind === 'expense' ? (
                  <div className="fieldRow">
                    <label className="field">
                      <div className="fieldLabel">{tt('common.category', 'Category')}</div>
                      <MenuSelect
                        value={(selected.category ?? 'other') as BillCategory}
                        options={CATEGORIES.map((c) => ({ value: c, label: billCategoryLabel(lang, c) }))}
                        onChange={(v) => updateSelected({ category: v as BillCategory, customCategoryName: null })}
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="groupBox">
                <div className="groupTitle">{tt('common.details', 'Details')}</div>
                <label className="field">
                  <div className="fieldLabel">{tt('transactions.payee', 'Payee')}</div>
                  <input value={selected.payee ?? ''} onChange={(e) => updateSelected({ payee: e.target.value })} />
                </label>
                <label className="field">
                  <div className="fieldLabel">{tt('common.notes', 'Notes')}</div>
                  <textarea value={selected.notes ?? ''} onChange={(e) => updateSelected({ notes: e.target.value || null })} />
                </label>
              </div>
            </div>
          ) : (
            <div className="empty">{tt('transactions.select', 'Select a transaction.')}</div>
          )}
        </div>
      </div>
    </>
  )
}
