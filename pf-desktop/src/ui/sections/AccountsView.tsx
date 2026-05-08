import { useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import { setSection } from '../../app/AppProvider'
import type { Account, AccountKind, Transaction } from '../../domain/models'
import { accountBalance, currency } from '../../domain/finance'
import { useContextMenu } from '../ContextMenu'
import { MenuSelect } from '../MenuSelect'
import { AccountKindIcon } from '../icons'
import { accountKindLabel, tf, t } from '../i18n'

export function AccountsView() {
  const { state, dispatch } = useAppStore()
  const selectedId = state.ui.selectedAccountId
  const [search, setSearch] = useState('')
  const transactions = useMemo(() => state.transactions, [state.transactions])
  const lang = state.settings.language
  const tt = (key: string, fallback?: string) => t(lang, key, fallback)

  const accountsFiltered = useMemo(() => {
    let items = state.accounts.filter((a) => !a.archived)
    const q = search.trim().toLowerCase()
    if (q) {
      items = items.filter((a) => a.name.toLowerCase().includes(q) || (a.institution ?? '').toLowerCase().includes(q))
    }
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }, [search, state.accounts])

  const summary = useMemo(() => {
    const count = accountsFiltered.length
    if (search.trim()) {
      if (count === 1) return tf(lang, 'accounts.summary.results.one', { count }, `${count} result`)
      return tf(lang, 'accounts.summary.results.many', { count }, `${count} results`)
    }
    if (count === 0) return tt('accounts.summary.none', 'No accounts')
    if (count === 1) return tt('accounts.summary.one', '1 account')
    return tf(lang, 'accounts.summary.many', { count }, `${count} accounts`)
  }, [accountsFiltered.length, lang, search])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return state.accounts.find((a) => a.id === selectedId) ?? null
  }, [selectedId, state.accounts])

  const selectedBalance = selected ? accountBalance(selected, transactions) : 0
  const selectedTransactionCount = useMemo(() => {
    if (!selected) return 0
    return transactions.filter((t) => t.accountId === selected.id || t.toAccountId === selected.id).length
  }, [selected, transactions])

  function addStartingBalance() {
    if (!selected) return
    const t: Transaction = {
      id: crypto.randomUUID(),
      kind: 'income',
      date: new Date(),
      amount: { currencyCode: selected.currencyCode || state.settings.displayCurrencyCode, value: 0 },
      accountId: selected.id,
      toAccountId: null,
      category: null,
      customCategoryName: null,
      payee: tt('accounts.startingBalancePayee', 'Starting balance'),
      notes: null,
      tags: [],
      relatedBillId: null,
    }
    dispatch({ type: 'transactions/add', transaction: t })
    dispatch({ type: 'ui/setTransactionsAccountFilter', id: selected.id })
    dispatch(setSection('transactions'))
  }

  function createAccount() {
    const a: Account = {
      id: crypto.randomUUID(),
      name: '',
      kind: 'checking',
      currencyCode: state.settings.displayCurrencyCode,
      openingBalance: 0,
      institution: null,
      notes: null,
      archived: false,
    }
    dispatch({ type: 'accounts/add', account: a })
  }

  function updateSelected(patch: Partial<Account>) {
    if (!selected) return
    dispatch({ type: 'accounts/update', account: { ...selected, ...patch } })
  }

  function archiveSelected() {
    if (!selected) return
    dispatch({ type: 'accounts/update', account: { ...selected, archived: true } })
    dispatch({ type: 'ui/selectAccount', id: null })
  }

  function deleteSelected() {
    if (!selected) return
    const count = transactions.filter((t) => t.accountId === selected.id || t.toAccountId === selected.id).length
    const msg =
      count > 0
        ? `This account is referenced by ${count} transaction(s). Deleting will remove the account and those transactions will become unassigned.`
        : 'This will permanently delete the account.'
    const ok = window.confirm(`Delete account?\n\n${msg}`)
    if (!ok) return
    dispatch({ type: 'accounts/delete', id: selected.id })
  }

  const kinds: AccountKind[] = ['checking', 'savings', 'credit', 'cash', 'investment', 'other']

  const rowMenu = useContextMenu([
    {
      id: 'edit',
      label: tt('common.edit', 'Edit'),
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'ui/selectAccount', id: selectedId })
      },
    },
    { id: 'sep1', kind: 'separator' as const },
    {
      id: 'archive',
      label: tt('common.archive', 'Archive'),
      onSelect: () => {
        if (!selectedId) return
        const acc = state.accounts.find((a) => a.id === selectedId)
        if (!acc) return
        dispatch({ type: 'accounts/update', account: { ...acc, archived: true } })
        dispatch({ type: 'ui/selectAccount', id: null })
      },
    },
    {
      id: 'delete',
      label: tt('common.delete', 'Delete'),
      tone: 'danger',
      onSelect: () => {
        if (!selectedId) return
        const acc = state.accounts.find((a) => a.id === selectedId)
        if (!acc) return
        const count = transactions.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id).length
        const msg =
          count > 0
            ? `This account is referenced by ${count} transaction(s). Deleting will remove the account and those transactions will become unassigned.`
            : 'This will permanently delete the account.'
        const ok = window.confirm(`Delete account?\n\n${msg}`)
        if (!ok) return
        dispatch({ type: 'accounts/delete', id: acc.id })
      },
    },
  ])

  function balanceTone(amount: number): 'pos' | 'neg' | 'neutral' {
    if (!Number.isFinite(amount) || amount === 0) return 'neutral'
    return amount < 0 ? 'neg' : 'pos'
  }

  return (
    <>
      <div className="row">
        <div className="toolbarLeft">{summary ? <div className="toolbarSubtitle">{summary}</div> : null}</div>
        <div className="rowActions">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tt('accounts.search.placeholder', 'Search')}
            style={{ width: 160 }}
          />
          <button type="button" onClick={createAccount} className="btnPrimary">
            {tt('common.add', 'Add')}
          </button>
        </div>
      </div>

      <div className="split">
        <div className="list">
          {accountsFiltered.map((a) => {
            const bal = accountBalance(a, transactions)
            return (
              <button
                key={a.id}
                type="button"
                className={a.id === selectedId ? 'listItem active stdRow' : 'listItem stdRow'}
                onClick={() => dispatch({ type: 'ui/selectAccount', id: a.id })}
                onContextMenu={(e) => {
                  dispatch({ type: 'ui/selectAccount', id: a.id })
                  rowMenu.open(e)
                }}
              >
                <div className="rowIcon" data-tone={balanceTone(bal)}>
                  <AccountKindIcon kind={a.kind} />
                </div>
                <div className="rowMain">
                  <div className="rowTitle">
                    <span className="rowTitleText">{a.name || 'Untitled'}</span>
                    {a.kind === 'credit' ? (
                      <span className="pill" data-tone="neutral">
                        {tt('accounts.credit', 'Credit')}
                      </span>
                    ) : null}
                  </div>
                  <div className="rowMeta">{a.institution ? a.institution : accountKindLabel(lang, a.kind)}</div>
                </div>
                <div className="rowRight">
                  <div className="rowAmount" data-tone={balanceTone(bal)}>
                    {currency(bal, a.currencyCode)}
                  </div>
                  <div className="rowDate" />
                </div>
              </button>
            )
          })}
          {accountsFiltered.length === 0 ? <div className="empty">{tt('accounts.empty', 'No accounts yet.')}</div> : null}
        </div>
        {rowMenu.Menu}

        <div className="detail">
          {selected ? (
            <div className="form">
              <div className="groupBox" style={{ marginTop: 0 }}>
                <div className="groupTitle">{tt('common.actions', 'Actions')}</div>
                <div className="rowActions">
                  <button type="button" onClick={archiveSelected}>
                    {tt('common.archive', 'Archive')}
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
                    <div className="fieldLabel">{tt('accounts.type', 'Type')}</div>
                    <MenuSelect
                      value={selected.kind}
                      options={kinds.map((k) => ({ value: k, label: accountKindLabel(lang, k) }))}
                      onChange={(v) => updateSelected({ kind: v as AccountKind })}
                    />
                  </label>
                  <label className="field">
                    <div className="fieldLabel">{tt('common.currency', 'Currency')}</div>
                    <input value={selected.currencyCode} onChange={(e) => updateSelected({ currencyCode: e.target.value })} />
                  </label>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">{tt('accounts.balances', 'Balances')}</div>
                <div className="note">{tt('accounts.balanceFromTransactions', 'Balance comes from transactions.')}</div>
                <div className="rowActions">
                  <button type="button" onClick={addStartingBalance}>
                    {tt('accounts.addStartingBalance', 'Add starting balance')}
                  </button>
                </div>

                <div className="field">
                  <div className="fieldLabel">{tt('accounts.currentBalance', 'Current Balance')}</div>
                  <div className="note">
                    {currency(selectedBalance, selected.currencyCode)}
                  </div>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">{tt('common.details', 'Details')}</div>
                <label className="field">
                  <div className="fieldLabel">{tt('accounts.institution', 'Institution')}</div>
                  <input
                    value={selected.institution ?? ''}
                    onChange={(e) => updateSelected({ institution: e.target.value.trim() ? e.target.value : null })}
                  />
                </label>

                <label className="field">
                  <div className="fieldLabel">{tt('common.notes', 'Notes')}</div>
                  <textarea value={selected.notes ?? ''} onChange={(e) => updateSelected({ notes: e.target.value || null })} />
                </label>
              </div>

              <div className="groupBox">
                <div className="groupTitle">{tt('accounts.transactions', 'Transactions')}</div>
                <div className="note">
                  {selectedTransactionCount
                    ? tf(lang, 'accounts.linkedTransactions', { count: selectedTransactionCount }, `${selectedTransactionCount} linked transaction(s).`)
                    : tt('accounts.noTransactions', 'No transactions for this account.')}
                </div>
                <div className="rowActions">
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'ui/setTransactionsAccountFilter', id: selected.id })
                      dispatch(setSection('transactions'))
                    }}
                  >
                    {tt('accounts.seeTransactions', 'See transactions')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty">{tt('accounts.select', 'Select an account.')}</div>
          )}
        </div>
      </div>
    </>
  )
}
