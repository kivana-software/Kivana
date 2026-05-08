import { useMemo, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import type { AppSettings, LanguageCode } from '../../domain/settings'
import { exportBackup, importBackupFromJson } from '../dataActions.ts'
import { MenuSelect } from '../MenuSelect'
import type { Account, Transaction } from '../../domain/models'
import { setSection } from '../../app/AppProvider'
import { languageNativeLabel, t } from '../i18n'
import { isTauriRuntime } from '../../storage/tauriJsonStore'

const LANGS: LanguageCode[] = ['en', 'es', 'de', 'fr', 'it', 'no', 'pl', 'pt', 'nl', 'sv', 'da', 'ru', 'lt']
const CURRENCIES: Array<{ value: string; label: string }> = [
  { value: 'EUR', label: 'EUR (Euro)' },
  { value: 'NOK', label: 'NOK (Norwegian Krone)' },
  { value: 'DKK', label: 'DKK (Danish Krone)' },
  { value: 'SEK', label: 'SEK (Swedish Krona)' },
  { value: 'GBP', label: 'GBP (British Pound)' },
  { value: 'CHF', label: 'CHF (Swiss Franc)' },
  { value: 'PLN', label: 'PLN (Polish Złoty)' },
]

export function SettingsView() {
  const { state, dispatch } = useAppStore()
  const [dataStatus, setDataStatus] = useState<string>('')
  const settings = state.settings
  const lang = settings.language
  const tt = (key: string, fallback?: string) => t(lang, key, fallback)

  async function openSite() {
    const url = 'https://kivana.eu/'
    if (!isTauriRuntime()) {
      window.open(url, '_blank', 'noreferrer')
      return
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_external_url', { url })
    } catch {
      try {
        window.open(url, '_blank', 'noreferrer')
      } catch {
      }
    }
  }

  const datasets = useMemo(
    () => ({
      settings: state.settings,
      bills: state.bills,
      accounts: state.accounts,
      transactions: state.transactions,
    }),
    [state.accounts, state.bills, state.settings, state.transactions],
  )

  function updateSettings(patch: Partial<AppSettings>) {
    dispatch({ type: 'settings/update', patch })
  }

  function populateDemoData() {
    const ok = window.confirm('Populate demo accounts and transactions?\n\nThis will replace your current accounts and transactions.')
    if (!ok) return

    const now = new Date()
    const cc = state.settings.displayCurrencyCode || 'USD'

    const checking: Account = {
      id: crypto.randomUUID(),
      name: 'Checking',
      kind: 'checking',
      currencyCode: cc,
      openingBalance: 0,
      institution: null,
      notes: null,
      archived: false,
    }
    const savings: Account = {
      id: crypto.randomUUID(),
      name: 'Savings',
      kind: 'savings',
      currencyCode: cc,
      openingBalance: 0,
      institution: null,
      notes: null,
      archived: false,
    }
    const accounts: Account[] = [checking, savings]

    function daysAgo(n: number): Date {
      const d = new Date(now)
      d.setDate(d.getDate() - n)
      return d
    }

    const transactions: Transaction[] = [
      {
        id: crypto.randomUUID(),
        kind: 'income',
        date: daysAgo(2),
        amount: { currencyCode: cc, value: 3200 },
        accountId: checking.id,
        toAccountId: null,
        category: null,
        customCategoryName: null,
        payee: 'Salary',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'expense',
        date: daysAgo(3),
        amount: { currencyCode: cc, value: 980 },
        accountId: checking.id,
        toAccountId: null,
        category: 'housing',
        customCategoryName: null,
        payee: 'Rent',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'expense',
        date: daysAgo(5),
        amount: { currencyCode: cc, value: 76.45 },
        accountId: checking.id,
        toAccountId: null,
        category: 'utilities',
        customCategoryName: null,
        payee: 'Electricity',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'expense',
        date: daysAgo(6),
        amount: { currencyCode: cc, value: 43.2 },
        accountId: checking.id,
        toAccountId: null,
        category: 'transport',
        customCategoryName: null,
        payee: 'Fuel',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'expense',
        date: daysAgo(7),
        amount: { currencyCode: cc, value: 123.9 },
        accountId: checking.id,
        toAccountId: null,
        category: 'other',
        customCategoryName: null,
        payee: 'Grocery store',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'transfer',
        date: daysAgo(8),
        amount: { currencyCode: cc, value: 400 },
        accountId: checking.id,
        toAccountId: savings.id,
        category: null,
        customCategoryName: null,
        payee: 'Move to savings',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'expense',
        date: daysAgo(9),
        amount: { currencyCode: cc, value: 14.99 },
        accountId: checking.id,
        toAccountId: null,
        category: 'subscriptions',
        customCategoryName: null,
        payee: 'Streaming',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'expense',
        date: daysAgo(11),
        amount: { currencyCode: cc, value: 28.5 },
        accountId: checking.id,
        toAccountId: null,
        category: 'transport',
        customCategoryName: null,
        payee: 'Taxi',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'income',
        date: daysAgo(14),
        amount: { currencyCode: cc, value: 250 },
        accountId: checking.id,
        toAccountId: null,
        category: null,
        customCategoryName: null,
        payee: 'Refund',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'expense',
        date: daysAgo(16),
        amount: { currencyCode: cc, value: 62.0 },
        accountId: checking.id,
        toAccountId: null,
        category: 'insurance',
        customCategoryName: null,
        payee: 'Insurance',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'expense',
        date: daysAgo(18),
        amount: { currencyCode: cc, value: 39.0 },
        accountId: checking.id,
        toAccountId: null,
        category: 'other',
        customCategoryName: null,
        payee: 'Restaurant',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
      {
        id: crypto.randomUUID(),
        kind: 'transfer',
        date: daysAgo(21),
        amount: { currencyCode: cc, value: 250 },
        accountId: checking.id,
        toAccountId: savings.id,
        category: null,
        customCategoryName: null,
        payee: 'Move to savings',
        notes: null,
        tags: [],
        relatedBillId: null,
      },
    ]

    dispatch({
      type: 'data/replaceAll',
      data: {
        settings: state.settings,
        bills: state.bills,
        accounts,
        transactions,
      },
    })
    dispatch(setSection('dashboard'))
  }

  async function exportBackupClick() {
    setDataStatus('')
    const msg = await exportBackup(datasets)
    setDataStatus(msg)
  }

  async function importBackupClick() {
    setDataStatus('')
    const msg = await importBackupFromJson(dispatch)
    setDataStatus(msg)
  }

  return (
    <>
      <div className="row">
        <div className="toolbarLeft">
          {dataStatus ? <div className="toolbarSubtitle">{dataStatus}</div> : <div className="toolbarSubtitle">{tt('settings.title', 'Settings')}</div>}
        </div>
      </div>

      <div className="groupBox" style={{ marginTop: 0 }}>
        <div className="groupTitle">{tt('settings.general', 'General')}</div>
        <div className="fieldRow">
          <label className="field">
            <div className="fieldLabel">{tt('settings.language', 'Language')}</div>
            <MenuSelect
              value={settings.language}
              options={LANGS.map((l) => ({ value: l, label: languageNativeLabel(l) }))}
              onChange={(v) => updateSettings({ language: v as LanguageCode })}
            />
          </label>
          <label className="field">
            <div className="fieldLabel">{tt('settings.currency', 'Currency')}</div>
            <MenuSelect
              value={settings.displayCurrencyCode}
              options={
                CURRENCIES.some((c) => c.value === settings.displayCurrencyCode)
                  ? CURRENCIES
                  : [{ value: settings.displayCurrencyCode, label: settings.displayCurrencyCode }, ...CURRENCIES]
              }
              onChange={(v) => updateSettings({ displayCurrencyCode: String(v || '').toUpperCase() })}
            />
          </label>
        </div>

        <label className="field" style={{ marginTop: 10 }}>
          <div className="fieldLabel">{tt('settings.sidebarAnimations', 'Sidebar animations')}</div>
          <div className="rowActions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" onClick={() => updateSettings({ enableMenuAnimations: !settings.enableMenuAnimations })}>
              {settings.enableMenuAnimations ? tt('common.on', 'On') : tt('common.off', 'Off')}
            </button>
          </div>
        </label>
      </div>

      <div className="groupBox">
        <div className="groupTitle">{tt('settings.backup', 'Backup')}</div>
        <div className="note">{tt('settings.backup.note', 'Export and restore a single JSON file.')}</div>
        <div className="rowActions">
          <button type="button" onClick={populateDemoData}>
            {tt('settings.backup.populateDemo', 'Populate demo')}
          </button>
          <button type="button" onClick={() => void exportBackupClick()}>
            {tt('settings.backup.export', 'Export')}
          </button>
          <button type="button" onClick={() => void importBackupClick()}>
            {tt('settings.backup.import', 'Import')}
          </button>
        </div>
      </div>

      <div className="groupBox">
        <div className="groupTitle">{tt('settings.about.title', 'About')}</div>
        <div className="note">{tt('settings.about.text', 'This is the basic open-source edition of Kivana (MIT License). For the advanced version, visit kivana.eu.')}</div>
        <div className="rowActions">
          <button type="button" onClick={() => void openSite()}>
            kivana.eu
          </button>
        </div>
      </div>
    </>
  )
}
