import { useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import type { Account, AccountKind } from '../../domain/models'
import { accountBalance, currency, signedAmountForAccount } from '../../domain/finance'
import { visibleTransactions } from '../../domain/people'
import { toDateInputValue } from '../date'
import { useContextMenu } from '../ContextMenu'
import { MenuSelect } from '../MenuSelect'
import { AccountKindIcon } from '../icons'

export function AccountsView() {
  const { state, dispatch } = useAppStore()
  const selectedId = state.ui.selectedAccountId
  const [setCurrentBalanceText, setSetCurrentBalanceText] = useState('')
  const [search, setSearch] = useState('')
  const personTransactions = useMemo(() => visibleTransactions(state.transactions, state.settings), [state.settings, state.transactions])
  const hideBalances = state.settings.hideAccountBalances

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
    if (search.trim()) return `${count} result${count === 1 ? '' : 's'}`
    if (count === 0) return 'No accounts'
    if (count === 1) return '1 account'
    return `${count} accounts`
  }, [accountsFiltered.length, search])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return state.accounts.find((a) => a.id === selectedId) ?? null
  }, [selectedId, state.accounts])

  const selectedBalance = selected ? accountBalance(selected, personTransactions) : 0

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
    const count = personTransactions.filter((t) => t.accountId === selected.id || t.toAccountId === selected.id).length
    const msg =
      count > 0
        ? `This account is referenced by ${count} transaction(s). Deleting will remove the account and those transactions will become unassigned.`
        : 'This will permanently delete the account.'
    const ok = window.confirm(`Delete account?\n\n${msg}`)
    if (!ok) return
    dispatch({ type: 'accounts/delete', id: selected.id })
  }

  function applySetCurrentBalance() {
    if (!selected) return
    const target = parseDecimal(setCurrentBalanceText)
    if (target == null) return
    const current = accountBalance(selected, personTransactions)
    const delta = target - current
    updateSelected({ openingBalance: (selected.openingBalance ?? 0) + delta })
    setSetCurrentBalanceText('')
  }

  const kinds: AccountKind[] = ['checking', 'savings', 'credit', 'cash', 'investment', 'other']

  const rowMenu = useContextMenu([
    {
      id: 'edit',
      label: 'Edit',
      onSelect: () => {
        if (!selectedId) return
        dispatch({ type: 'ui/selectAccount', id: selectedId })
      },
    },
    { id: 'sep1', kind: 'separator' as const },
    {
      id: 'archive',
      label: 'Archive',
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
      label: 'Delete',
      tone: 'danger',
      onSelect: () => {
        if (!selectedId) return
        const acc = state.accounts.find((a) => a.id === selectedId)
        if (!acc) return
        const count = personTransactions.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id).length
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
            placeholder="Search"
            style={{ width: 160 }}
          />
          <button type="button" onClick={createAccount} className="btnPrimary">
            Add
          </button>
        </div>
      </div>

      <div className="split">
        <div className="list">
          {accountsFiltered.map((a) => {
            const bal = accountBalance(a, personTransactions)
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
                        Credit
                      </span>
                    ) : null}
                  </div>
                  <div className="rowMeta">{a.institution ? a.institution : a.kind}</div>
                </div>
                <div className="rowRight">
                  <div className="rowAmount" data-tone={balanceTone(bal)}>
                    {hideBalances ? '—' : currency(bal, a.currencyCode)}
                  </div>
                  <div className="rowDate" />
                </div>
              </button>
            )
          })}
          {accountsFiltered.length === 0 ? <div className="empty">No accounts yet.</div> : null}
        </div>
        {rowMenu.Menu}

        <div className="detail">
          {selected ? (
            <div className="form">
              <div className="groupBox" style={{ marginTop: 0 }}>
                <div className="groupTitle">Actions</div>
                <div className="rowActions">
                  <button type="button" onClick={archiveSelected}>
                    Archive
                  </button>
                  <button type="button" onClick={deleteSelected}>
                    Delete
                  </button>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Basics</div>
                <label className="field">
                  <div className="fieldLabel">Name</div>
                  <input value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} />
                </label>

                <div className="fieldRow">
                  <label className="field">
                    <div className="fieldLabel">Type</div>
                    <MenuSelect
                      value={selected.kind}
                      options={kinds.map((k) => ({ value: k, label: k }))}
                      onChange={(v) => updateSelected({ kind: v as AccountKind })}
                    />
                  </label>
                  <label className="field">
                    <div className="fieldLabel">Currency</div>
                    <input value={selected.currencyCode} onChange={(e) => updateSelected({ currencyCode: e.target.value })} />
                  </label>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Balances</div>
                <label className="field">
                  <div className="fieldLabel">Opening Balance</div>
                  <input
                    type={hideBalances ? 'password' : 'number'}
                    value={selected.openingBalance}
                    onChange={(e) => updateSelected({ openingBalance: Number(e.target.value) })}
                  />
                </label>

                <div className="field">
                  <div className="fieldLabel">Current Balance</div>
                  <div className="note">
                    {hideBalances ? '—' : currency(selectedBalance, selected.currencyCode)}
                  </div>
                </div>

                <div className="field">
                  <div className="fieldLabel">Set Current Balance</div>
                  <div className="fieldRow">
                    <input
                      type={hideBalances ? 'password' : 'text'}
                      value={setCurrentBalanceText}
                      onChange={(e) => setSetCurrentBalanceText(e.target.value)}
                    />
                    <button type="button" onClick={applySetCurrentBalance} disabled={parseDecimal(setCurrentBalanceText) == null}>
                      Apply
                    </button>
                  </div>
                </div>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Details</div>
                <label className="field">
                  <div className="fieldLabel">Institution</div>
                  <input
                    value={selected.institution ?? ''}
                    onChange={(e) => updateSelected({ institution: e.target.value.trim() ? e.target.value : null })}
                  />
                </label>

                <label className="field">
                  <div className="fieldLabel">Notes</div>
                  <textarea value={selected.notes ?? ''} onChange={(e) => updateSelected({ notes: e.target.value || null })} />
                </label>
              </div>

              <div className="groupBox">
                <div className="groupTitle">Recent</div>
                {personTransactions
                  .filter((t) => t.accountId === selected.id || t.toAccountId === selected.id)
                  .sort((a, b) => b.date.getTime() - a.date.getTime())
                  .slice(0, 10)
                  .map((t) => (
                    <div key={t.id} className="note" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>{toDateInputValue(t.date)}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.payee ?? t.kind}
                      </span>
                      <span>{hideBalances ? '—' : currency(signedAmountForAccount(t, selected.id), selected.currencyCode)}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="empty">Select an account.</div>
          )}
        </div>
      </div>
    </>
  )
}


function parseDecimal(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/,/g, '.')
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return n
}
