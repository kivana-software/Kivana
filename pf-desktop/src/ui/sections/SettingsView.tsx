import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../app/appStore'
import { AI_FEATURE_ENABLED, type AIProvider, type AppSettings, type ImportCategoryRule } from '../../domain/settings'
import type { BillCategory } from '../../domain/models'
import {
  deleteAutoBackup,
  exportAutoBackup,
  exportBackup,
  importBackupFromFolder,
  importBackupFromJson,
  importBackupFromPath,
  listAutoBackups,
} from '../dataActions'
import { buildBillsIcs } from '../../domain/calendarIcs'
import { isTauriRuntime } from '../../storage/tauriJsonStore'
import { getCaptchaChallenge, getMe } from '../../auth/authApi'
import { useAuth } from '../../auth/AuthProvider'
import { preservePrefsAcrossLocalStorageClear, savePreferredDisplayCurrencyCode } from '../../storage/userPrefs'
import { displayPlanName, isAdvancedAccount } from '../../licensing/licenseGates'
import { MenuSelect } from '../MenuSelect'
import { formatBackupAge } from '../date'
import { languageLabel, t } from '../i18n'

export function SettingsView() {
  const { state, dispatch } = useAppStore()
  const auth = useAuth()
  const advanced = useMemo(() => isAdvancedAccount(auth.entitlements), [auth.entitlements])
  const settingsRootRef = useRef<HTMLDivElement | null>(null)
  const [tab, setTab] = useState<'general' | 'categories' | 'notifications' | 'calendar' | 'forecast' | 'ai' | 'account' | 'data' | 'updates'>(() => {
    if (typeof window === 'undefined') return 'general'
    const h = String(window.location.hash ?? '')
    if (h === '#data' || h === '#backup') return 'data'
    return 'general'
  })
  const [settingsQuery, setSettingsQuery] = useState('')
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null)
  const [ollamaStatus, setOllamaStatus] = useState<string>('')
  const [dataStatus, setDataStatus] = useState<string>('')
  const [autoBackups, setAutoBackups] = useState<Array<{ path: string; name: string; modifiedAtMs: number }>>([])
  const [autoBackupStatus, setAutoBackupStatus] = useState<string>('')
  const [notifStatus, setNotifStatus] = useState<string>('')
  const [calendarStatus, setCalendarStatus] = useState<string>('')
  const [updateStatus, setUpdateStatus] = useState<string>('')
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [showUpdateNotes, setShowUpdateNotes] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<string>('—')
  const [dataDir, setDataDir] = useState<string>('')
  const [attachmentsDir, setAttachmentsDir] = useState<string>('')
  const [authEmail, setAuthEmail] = useState<string>('')
  const [authPassword, setAuthPassword] = useState<string>('')
  const [authCaptchaQuestion, setAuthCaptchaQuestion] = useState<string>('')
  const [authCaptchaToken, setAuthCaptchaToken] = useState<string>('')
  const [authCaptchaAnswer, setAuthCaptchaAnswer] = useState<string>('')
  const [authCaptchaLoading, setAuthCaptchaLoading] = useState(false)
  const [authStatus, setAuthStatus] = useState<string>('')
  const [meStatus, setMeStatus] = useState<string>('')
  const [entitlementsStatus, setEntitlementsStatus] = useState<string>('')

  const settings = state.settings
  const lang = settings.language
  const systemTheme = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  const themeValue = settings.theme === 'system' ? systemTheme : settings.theme
  const savedBackups = Array.isArray(settings.savedBackups) ? settings.savedBackups : []
  const builtinCategories: BillCategory[] = ['housing', 'utilities', 'subscriptions', 'insurance', 'taxes', 'transport', 'other']
  const ruleFields: Array<ImportCategoryRule['field']> = ['any', 'payee', 'notes']
  const ruleKinds: Array<ImportCategoryRule['appliesTo']> = ['any', 'expense', 'income', 'transfer']
  const [newRuleMatch, setNewRuleMatch] = useState('')
  const [newRuleField, setNewRuleField] = useState<ImportCategoryRule['field']>('payee')
  const [newRuleAppliesTo, setNewRuleAppliesTo] = useState<ImportCategoryRule['appliesTo']>('expense')
  const [newRuleTarget, setNewRuleTarget] = useState<string>('custom:Food')
  const [newRuleCustomName, setNewRuleCustomName] = useState<string>('')
  const [editRuleId, setEditRuleId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<ImportCategoryRule | null>(null)

  const customExpenseCategoryNames = useMemo(() => {
    const set = new Set<string>()
    for (const t of state.transactions) {
      if (t.kind !== 'expense') continue
      const v = (t.customCategoryName ?? '').trim()
      if (v) set.add(v)
    }
    for (const b of state.bills) {
      const v = (b.customCategoryName ?? '').trim()
      if (v) set.add(v)
    }
    for (const x of settings.customBillCategories ?? []) {
      const v = String(x ?? '').trim()
      if (v) set.add(v)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [settings.customBillCategories, state.bills, state.transactions])

  const payeeSuggestions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of state.transactions) {
      const p = String(t.payee ?? '').trim()
      if (!p) continue
      counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([payee, count]) => ({ payee, count }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.payee.localeCompare(b.payee)))
      .slice(0, 40)
  }, [state.transactions])

  function ruleTargetOptions(): Array<{ value: string; label: string }> {
    const custom = customExpenseCategoryNames.map((c) => ({ value: `custom:${c}`, label: `Custom: ${c}` }))
    const builtin = builtinCategories.map((c) => ({ value: `cat:${c}`, label: `Category: ${c}` }))
    const common = [
      { value: 'custom:__new__', label: 'Custom: + New…' },
      { value: 'custom:Food', label: 'Custom: Food' },
      { value: 'custom:Groceries', label: 'Custom: Groceries' },
      { value: 'custom:Fuel', label: 'Custom: Fuel' },
      { value: 'custom:Rent', label: 'Custom: Rent' },
    ]
    const out = [...common, ...custom, ...builtin]
    const uniq = new Map<string, string>()
    for (const o of out) if (!uniq.has(o.value)) uniq.set(o.value, o.label)
    return [...uniq.entries()].map(([value, label]) => ({ value, label }))
  }

  function parseTarget(value: string): { category: BillCategory; customCategoryName: string | null } {
    const raw = String(value ?? '')
    if (raw.startsWith('custom:')) {
      const name = raw.slice('custom:'.length).trim()
      return { category: 'other', customCategoryName: name || null }
    }
    if (raw.startsWith('cat:')) {
      const cat = raw.slice('cat:'.length).trim() as BillCategory
      return { category: cat || 'other', customCategoryName: null }
    }
    return { category: 'other', customCategoryName: null }
  }

  function updateImportRules(next: ImportCategoryRule[]) {
    updateSettings({ importCategoryRules: next })
  }

  function startEditRule(id: string) {
    const r = (settings.importCategoryRules ?? []).find((x) => x.id === id) ?? null
    setEditRuleId(id)
    setEditDraft(r ? { ...r } : null)
  }

  function saveEditRule() {
    if (!editRuleId || !editDraft) {
      setEditRuleId(null)
      setEditDraft(null)
      return
    }
    updateImportRules((settings.importCategoryRules ?? []).map((x) => (x.id === editRuleId ? editDraft : x)))
    setEditRuleId(null)
    setEditDraft(null)
  }

  useEffect(() => {
    if (!isTauriRuntime()) return
    void import('@tauri-apps/api/app').then(({ getVersion }) => getVersion().then(setCurrentVersion)).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab !== 'data') return
    if (!isTauriRuntime()) {
      setDataDir('')
      setAttachmentsDir('')
      return
    }
    void import('@tauri-apps/api/core')
      .then(async ({ invoke }) => {
        const d = (await invoke('app_data_dir')) as string
        const a = (await invoke('attachments_root_dir')) as string
        setDataDir(String(d ?? ''))
        setAttachmentsDir(String(a ?? ''))
      })
      .catch(() => {})
  }, [tab])

  useEffect(() => {
    if (!authEmail && auth.session?.userEmail) setAuthEmail(auth.session.userEmail)
  }, [auth.session?.userEmail, authEmail])

  async function refreshAuthCaptcha() {
    setAuthCaptchaLoading(true)
    try {
      const base = auth.session?.backendBaseURL || state.settings.backendBaseURL || 'https://kivana.eu'
      const c = await getCaptchaChallenge(base)
      setAuthCaptchaQuestion(String(c.question || ''))
      setAuthCaptchaToken(String(c.token || ''))
      setAuthCaptchaAnswer('')
      setAuthCaptchaLoading(false)
    } catch {
      setAuthCaptchaQuestion('')
      setAuthCaptchaToken('')
      setAuthCaptchaAnswer('')
      setAuthCaptchaLoading(false)
    }
  }

  function updateSettings(patch: Partial<AppSettings>) {
    const nextSettings: AppSettings = { ...settings, ...patch }
    const oldCode = settings.displayCurrencyCode
    const newCode = nextSettings.displayCurrencyCode
    const shouldRelabel = Boolean(patch.displayCurrencyCode) && oldCode !== newCode

    const bills = shouldRelabel
      ? state.bills.map((b) => ({
          ...b,
          amount: b.amount.currencyCode === oldCode ? { ...b.amount, currencyCode: newCode } : b.amount,
          payments: (b.payments ?? []).map((p) => ({
            ...p,
            amount: p.amount.currencyCode === oldCode ? { ...p.amount, currencyCode: newCode } : p.amount,
          })),
        }))
      : state.bills

    const incomes = shouldRelabel
      ? state.incomes.map((i) => ({
          ...i,
          amount: i.amount.currencyCode === oldCode ? { ...i.amount, currencyCode: newCode } : i.amount,
          receipts: (i.receipts ?? []).map((r) => ({
            ...r,
            amount: r.amount.currencyCode === oldCode ? { ...r.amount, currencyCode: newCode } : r.amount,
          })),
        }))
      : state.incomes

    const transactions = shouldRelabel
      ? state.transactions.map((t) => ({
          ...t,
          amount: t.amount.currencyCode === oldCode ? { ...t.amount, currencyCode: newCode } : t.amount,
        }))
      : state.transactions

    dispatch({
      type: 'data/replaceAll',
      data: {
        settings: nextSettings,
        bills,
        incomes,
        accounts: state.accounts,
        transactions,
        reminders: state.reminders,
        invoices: state.invoices,
        goals: state.goals,
        debts: state.debts,
      },
    })
  }

  const aiProvider = settings.aiProvider as AIProvider

  const ollamaTagsUrl = useMemo(() => {
    const base = (settings.aiBaseURL || 'http://localhost:11434').replace(/\/+$/, '')
    return `${base}/api/tags`
  }, [settings.aiBaseURL])

  async function detectOllamaModels() {
    setOllamaStatus('Checking…')
    setOllamaModels(null)
    try {
      const res = await fetch(ollamaTagsUrl, { method: 'GET' })
      if (!res.ok) {
        setOllamaStatus(`Ollama responded with ${res.status}`)
        return
      }
      const json = (await res.json()) as any
      const models: string[] =
        Array.isArray(json?.models) ? json.models.map((m: any) => String(m?.name ?? '')).filter((x: string) => x.length > 0) : []
      if (models.length === 0) {
        setOllamaModels([])
        setOllamaStatus('No models found. Run: ollama pull <model>')
        return
      }
      setOllamaModels(models)
      setOllamaStatus(`Found ${models.length} model(s).`)
      if (!settings.aiModel && models[0]) {
        updateSettings({ aiModel: models[0] })
      }
    } catch {
      setOllamaStatus('Ollama not reachable. Start Ollama and run a model.')
    }
  }

  async function exportBackupClick() {
    setDataStatus('')
    const datasets = {
      settings: state.settings,
      bills: state.bills,
      incomes: state.incomes,
      accounts: state.accounts,
      transactions: state.transactions,
      reminders: state.reminders,
      invoices: state.invoices,
      goals: state.goals,
      debts: state.debts,
    }
    const res = await exportBackup(datasets)
    setDataStatus(res.message)
    if (res.message.startsWith('Export complete') || res.message.startsWith('Exported')) {
      updateSettings({ lastBackupAtMs: Date.now() })
    }
    if (res.backupPath) {
      addSavedBackupPath(res.backupPath)
    }
  }

  async function importBackupJsonClick() {
    setDataStatus('')
    if (!window.confirm('Restore will replace your current data. Continue?')) return
    const datasets = {
      settings: state.settings,
      bills: state.bills,
      incomes: state.incomes,
      accounts: state.accounts,
      transactions: state.transactions,
      reminders: state.reminders,
      invoices: state.invoices,
      goals: state.goals,
      debts: state.debts,
    }
    const msg = await importBackupFromJson(dispatch, datasets)
    setDataStatus(msg)
  }

  async function importBackupFolderClick() {
    setDataStatus('')
    if (!window.confirm('Restore will replace your current data. Continue?')) return
    const datasets = {
      settings: state.settings,
      bills: state.bills,
      incomes: state.incomes,
      accounts: state.accounts,
      transactions: state.transactions,
      reminders: state.reminders,
      invoices: state.invoices,
      goals: state.goals,
      debts: state.debts,
    }
    const msg = await importBackupFromFolder(dispatch, datasets)
    setDataStatus(msg)
  }
  
  useEffect(() => {
    if (typeof window === 'undefined') return
    const h = String(window.location.hash ?? '')
    if (h === '#data' || h === '#backup') setTab('data')
  }, [])

  useEffect(() => {
    if (tab !== 'data') return
    if (typeof window === 'undefined') return
    if (String(window.location.hash ?? '') !== '#backup') return
    const el = document.getElementById('settings-backup')
    if (!el) return
    const root = settingsRootRef.current
    const scroller = root ? (root.closest('.content') as HTMLElement | null) : null
    scroller?.scrollTo({ top: 0 })
    el.scrollIntoView({ block: 'start' })
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#data`)
    } catch {
    }
  }, [tab])

  async function refreshAutoBackups() {
    if (!isTauriRuntime()) {
      setAutoBackups([])
      return
    }
    try {
      const list = await listAutoBackups()
      setAutoBackups(list)
    } catch {
      setAutoBackups([])
    }
  }

  async function runAutoBackupNow() {
    setAutoBackupStatus('')
    if (!isTauriRuntime()) {
      setAutoBackupStatus('Desktop only.')
      return
    }
    const datasets = {
      settings: state.settings,
      bills: state.bills,
      incomes: state.incomes,
      accounts: state.accounts,
      transactions: state.transactions,
      reminders: state.reminders,
      invoices: state.invoices,
      goals: state.goals,
      debts: state.debts,
    }
    try {
      const keep = Number(state.settings.autoBackupKeepCount ?? 5)
      const res = await exportAutoBackup({ datasets, keepCount: Number.isFinite(keep) ? keep : 5 })
      setAutoBackupStatus(res.message)
      updateSettings({ lastBackupAtMs: Date.now(), autoBackupLastRunAtMs: Date.now() })
      await refreshAutoBackups()
    } catch (e: any) {
      setAutoBackupStatus(`Auto backup failed: ${String(e?.message ?? e)}`)
    }
  }

  async function restoreAutoBackup(path: string) {
    setAutoBackupStatus('')
    if (!window.confirm('Restore this backup? This will replace all current data.')) return
    const datasets = {
      settings: state.settings,
      bills: state.bills,
      incomes: state.incomes,
      accounts: state.accounts,
      transactions: state.transactions,
      reminders: state.reminders,
      invoices: state.invoices,
      goals: state.goals,
      debts: state.debts,
    }
    try {
      const msg = await importBackupFromPath(dispatch, path, datasets)
      setAutoBackupStatus(msg)
      updateSettings({ lastBackupAtMs: Date.now() })
    } catch (e: any) {
      setAutoBackupStatus(`Restore failed: ${String(e?.message ?? e)}`)
    }
  }

  async function deleteAutoBackupClick(path: string) {
    setAutoBackupStatus('')
    if (!window.confirm('Delete this backup?')) return
    try {
      const msg = await deleteAutoBackup(path)
      setAutoBackupStatus(msg)
      await refreshAutoBackups()
    } catch (e: any) {
      setAutoBackupStatus(`Delete failed: ${String(e?.message ?? e)}`)
    }
  }

  function backupNameFromPath(path: string): string {
    const p = String(path ?? '').trim()
    if (!p) return 'Backup'
    const parts = p.split(/[/\\]+/).filter(Boolean)
    return parts.length ? parts[parts.length - 1] : p
  }

  function addSavedBackupPath(path: string) {
    const p = String(path ?? '').trim()
    if (!p) return
    const existing = Array.isArray(settings.savedBackups) ? settings.savedBackups : []
    const next = [{ path: p, savedAtMs: Date.now() }, ...existing.filter((x) => String(x?.path ?? '') !== p)].slice(0, 20)
    updateSettings({ savedBackups: next })
  }

  async function addSavedBackupClick() {
    setDataStatus('')
    if (!isTauriRuntime()) {
      setDataStatus('Desktop only.')
      return
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const dir = await open({ multiple: false, directory: true })
      if (!dir || Array.isArray(dir)) {
        setDataStatus('Add cancelled.')
        return
      }
      addSavedBackupPath(String(dir))
      setDataStatus('Backup added.')
    } catch (e: any) {
      setDataStatus(`Failed to add backup: ${String(e?.message ?? e)}`)
    }
  }

  function removeSavedBackupPath(path: string) {
    const p = String(path ?? '').trim()
    if (!p) return
    const existing = Array.isArray(settings.savedBackups) ? settings.savedBackups : []
    updateSettings({ savedBackups: existing.filter((x) => String(x?.path ?? '') !== p) })
  }

  async function restoreSavedBackup(path: string) {
    setDataStatus('')
    if (!window.confirm('Restore this backup? This will replace all current data.')) return
    const datasets = {
      settings: state.settings,
      bills: state.bills,
      incomes: state.incomes,
      accounts: state.accounts,
      transactions: state.transactions,
      reminders: state.reminders,
      invoices: state.invoices,
      goals: state.goals,
      debts: state.debts,
    }
    try {
      const msg = await importBackupFromPath(dispatch, path, datasets)
      setDataStatus(msg)
    } catch (e: any) {
      setDataStatus(`Restore failed: ${String(e?.message ?? e)}`)
    }
  }

  async function clearAllDataClick() {
    setDataStatus('')
    if (!window.confirm('This will permanently delete ALL your data (bills, income, accounts, transactions, goals, debts, attachments). Continue?')) return
    if (!window.confirm('Are you absolutely sure? This cannot be undone.')) return
    try {
      savePreferredDisplayCurrencyCode(settings.displayCurrencyCode)
      localStorage.removeItem('Kivana/didCompleteOnboarding')
      if (isTauriRuntime()) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('reset_all_data')
      } else {
        preservePrefsAcrossLocalStorageClear()
      }
      window.location.reload()
    } catch (e: any) {
      setDataStatus(`Failed to clear data: ${String(e?.message ?? e)}`)
    }
  }

  async function migrateLegacyDataClick() {
    setDataStatus('')
    if (!isTauriRuntime()) {
      setDataStatus('Migration requires the desktop app (Tauri).')
      return
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const msg = (await invoke('migrate_legacy_appsupport_data')) as any
      const s = String(msg ?? '').trim()
      setDataStatus(s || 'Migration complete.')
      if (s.startsWith('Migrated:')) window.location.reload()
    } catch (e: any) {
      setDataStatus(`Migration failed: ${String(e?.message ?? e)}`)
    }
  }

  async function requestNotificationPermission() {
    setNotifStatus('')
    if (!isTauriRuntime()) {
      setNotifStatus('Desktop only.')
      return
    }
    const mod = await import('@tauri-apps/plugin-notification')
    const r = await mod.requestPermission()
    setNotifStatus(r)
  }

  async function exportCalendarIcs() {
    setCalendarStatus('')
    if (!isTauriRuntime()) {
      setCalendarStatus('Desktop only.')
      return
    }
    const ics = buildBillsIcs(state.bills, state.settings, new Date())
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await save({ defaultPath: 'Kivana_Bills.ics' })
    if (!path) return
    await invoke('export_calendar_ics', { destinationPath: path, icsContent: ics })
    setCalendarStatus('Exported calendar .ics.')
  }

  async function checkForUpdatesClick() {
    setUpdateStatus('')
    setUpdateInfo(null)
    setShowUpdateNotes(false)
    if (!isTauriRuntime()) {
      setUpdateStatus('Desktop only.')
      return
    }
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (!update) {
        setUpdateStatus('You are up to date.')
        return
      }
      setUpdateInfo(update)
      setUpdateStatus(`Update available: ${update.version}`)
      setShowUpdateNotes(true)
    } catch (e: any) {
      setUpdateStatus(`Update check failed: ${String(e?.message ?? e)}`)
    }
  }

  async function downloadAndInstallUpdateClick() {
    if (!updateInfo) return
    setUpdateStatus('Downloading…')
    try {
      await updateInfo.downloadAndInstall()
      setUpdateStatus('Update installed. Restart the app to finish.')
    } catch (e: any) {
      setUpdateStatus(`Update failed: ${String(e?.message ?? e)}`)
    }
  }

  async function signUpClick() {
    setAuthStatus('')
    setMeStatus('')
    setEntitlementsStatus('')
    try {
      await auth.signUp(
        authEmail,
        authPassword,
        { token: authCaptchaToken, answer: authCaptchaAnswer },
      )
      setAuthStatus('Signed up.')
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      setAuthStatus(`Sign up failed: ${msg}`)
      if (msg === 'captcha_required' || msg === 'captcha_failed') {
        await refreshAuthCaptcha()
        if (!authCaptchaQuestion) setAuthCaptchaQuestion('Captcha required. Press Refresh.')
      }
    }
  }

  async function signInClick() {
    setAuthStatus('')
    setMeStatus('')
    setEntitlementsStatus('')
    try {
      await auth.signIn(
        authEmail,
        authPassword,
        { token: authCaptchaToken, answer: authCaptchaAnswer },
      )
      setAuthStatus('Signed in.')
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      setAuthStatus(`Sign in failed: ${msg}`)
      if (msg === 'captcha_required' || msg === 'captcha_failed') {
        await refreshAuthCaptcha()
        if (!authCaptchaQuestion) setAuthCaptchaQuestion('Captcha required. Press Refresh.')
      }
    }
  }

  async function signOutClick() {
    setAuthStatus('')
    setMeStatus('')
    setEntitlementsStatus('')
    try {
      await auth.signOut()
      setAuthStatus('Signed out.')
    } catch (e: any) {
      setAuthStatus(`Sign out failed: ${String(e?.message ?? e)}`)
    }
  }

  async function meClick() {
    setMeStatus('')
    const s = await auth.getValidSession()
    if (!s?.accessToken) {
      setMeStatus('Not signed in.')
      return
    }
    try {
      const u = await getMe(s.backendBaseURL, s.accessToken)
      setMeStatus(`Signed in as ${u.email}`)
    } catch (e: any) {
      setMeStatus(`Failed: ${String(e?.message ?? e)}`)
    }
  }

  async function refreshEntitlementsClick() {
    setEntitlementsStatus('Loading entitlements…')
    try {
      await auth.refreshEntitlements()
      setEntitlementsStatus('Entitlements updated.')
    } catch (err: any) {
      setEntitlementsStatus(`Failed: ${String(err?.message ?? err)}`)
    }
  }

  useEffect(() => {
    if (!AI_FEATURE_ENABLED && tab === 'ai') setTab('general')
  }, [tab])
  useEffect(() => {
    if (!advanced && tab === 'categories') setTab('general')
  }, [advanced, tab])
  useEffect(() => {
    if (tab !== 'data') return
    void refreshAutoBackups()
  }, [tab])
  useEffect(() => {
    if (tab !== 'account') return
    if (auth.session) return
    void refreshAuthCaptcha()
  }, [tab, auth.session])

  function scrollSettingsToTop() {
    const root = settingsRootRef.current
    if (!root) return
    const scroller = root.closest('.content') as HTMLElement | null
    if (!scroller) return
    scroller.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const id = window.setTimeout(() => scrollSettingsToTop(), 0)
    return () => window.clearTimeout(id)
  }, [tab])

  useEffect(() => {
    const root = settingsRootRef.current
    if (!root) return
    const q = String(settingsQuery ?? '').trim().toLowerCase()
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.settingsRow, .fieldRow, .groupBox, .listItem'))
    if (!q) {
      for (const el of targets) el.style.removeProperty('display')
      for (const g of Array.from(root.querySelectorAll<HTMLElement>('.settingsGroup'))) g.style.removeProperty('display')
      return
    }
    for (const el of targets) {
      const text = String(el.textContent ?? '').toLowerCase()
      el.style.display = text.includes(q) ? '' : 'none'
    }
    for (const g of Array.from(root.querySelectorAll<HTMLElement>('.settingsGroup'))) {
      const anyVisible = Array.from(g.querySelectorAll<HTMLElement>('.settingsRow, .fieldRow, .groupBox, .listItem')).some(
        (x) => x.style.display !== 'none',
      )
      g.style.display = anyVisible ? '' : 'none'
    }
  }, [settingsQuery, tab])

  return (
    <>
      <div className="settingsPage form settingsLayout">
        <div className="settingsNav">
          <div className="settingsNavHeader">
            <div className="settingsNavTitle">Settings</div>
            <input
              className="settingsSearch"
              value={settingsQuery}
              onChange={(e) => setSettingsQuery(e.target.value)}
              placeholder="Search in this page…"
            />
          </div>
          <div className="settingsNavGroup">
            <button
              type="button"
              className={`settingsNavItem ${tab === 'general' ? 'active' : ''}`}
              onClick={() => {
                scrollSettingsToTop()
                setTab('general')
              }}
            >
              General
            </button>
            <button
              type="button"
              className={`settingsNavItem ${tab === 'data' ? 'active' : ''}`}
              onClick={() => {
                scrollSettingsToTop()
                setTab('data')
              }}
            >
              Backups
            </button>
            <button
              type="button"
              className={`settingsNavItem ${tab === 'notifications' ? 'active' : ''}`}
              onClick={() => {
                scrollSettingsToTop()
                setTab('notifications')
              }}
            >
              Notifications
            </button>
            <button
              type="button"
              className={`settingsNavItem ${tab === 'calendar' ? 'active' : ''}`}
              onClick={() => {
                scrollSettingsToTop()
                setTab('calendar')
              }}
            >
              Calendar
            </button>
            <button
              type="button"
              className={`settingsNavItem ${tab === 'forecast' ? 'active' : ''}`}
              onClick={() => {
                scrollSettingsToTop()
                setTab('forecast')
              }}
            >
              Forecast
            </button>
            <button
              type="button"
              className={`settingsNavItem ${tab === 'updates' ? 'active' : ''}`}
              onClick={() => {
                scrollSettingsToTop()
                setTab('updates')
              }}
            >
              Updates
            </button>
            <button
              type="button"
              className={`settingsNavItem ${tab === 'account' ? 'active' : ''}`}
              onClick={() => {
                scrollSettingsToTop()
                setTab('account')
              }}
            >
              Account
            </button>
          </div>
          {advanced || AI_FEATURE_ENABLED ? (
            <details className="settingsNavAdvanced">
              <summary>Advanced</summary>
              <div className="settingsNavGroup">
                {advanced ? (
                  <button
                    type="button"
                    className={`settingsNavItem ${tab === 'categories' ? 'active' : ''}`}
                    onClick={() => {
                      scrollSettingsToTop()
                      setTab('categories')
                    }}
                  >
                    Automation
                  </button>
                ) : null}
                {AI_FEATURE_ENABLED ? (
                  <button
                    type="button"
                    className={`settingsNavItem ${tab === 'ai' ? 'active' : ''}`}
                    onClick={() => {
                      scrollSettingsToTop()
                      setTab('ai')
                    }}
                  >
                    AI
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>

        <div className="settingsMain" ref={settingsRootRef}>
        {tab === 'general' ? (
          <div className="settingsGroup">
          <div className="settingsGroupHeader">
            <div className="settingsGroupTitle">General</div>
          </div>
          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Display currency</div>
              <div className="settingsRowHint">Used across totals, bills, and reports.</div>
            </div>
            <MenuSelect
              value={settings.displayCurrencyCode as any}
              options={[
                { value: 'NOK' as any, label: 'NOK' },
                { value: 'EUR' as any, label: 'EUR' },
                { value: 'GBP' as any, label: 'GBP' },
                { value: 'USD' as any, label: 'USD' },
                { value: 'SEK' as any, label: 'SEK' },
                { value: 'DKK' as any, label: 'DKK' },
                { value: 'PLN' as any, label: 'PLN' },
              ]}
              onChange={(v) => updateSettings({ displayCurrencyCode: v })}
            />
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Theme</div>
              <div className="settingsRowHint">Switch between Dark and Light (white) theme.</div>
            </div>
            <MenuSelect
              value={themeValue as any}
              options={[
                { value: 'dark' as any, label: 'Dark' },
                { value: 'light' as any, label: 'Light' },
              ]}
              onChange={(v) => updateSettings({ theme: v as any })}
            />
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">{t(lang, 'settings.language.label', 'Language')}</div>
              <div className="settingsRowHint">{t(lang, 'settings.language.hint', 'App language (more coming soon).')}</div>
            </div>
            <MenuSelect
              value={settings.language as any}
              options={[
                { value: 'en' as any, label: languageLabel('en') },
                { value: 'no' as any, label: languageLabel('no'), disabled: true },
                { value: 'de' as any, label: languageLabel('de'), disabled: true },
                { value: 'pl' as any, label: languageLabel('pl'), disabled: true },
                { value: 'es' as any, label: languageLabel('es'), disabled: true },
                { value: 'fr' as any, label: languageLabel('fr'), disabled: true },
              ]}
              onChange={(v) => updateSettings({ language: v as any })}
            />
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Holiday calendar</div>
              <div className="settingsRowHint">Controls which public holidays are shown in Calendar.</div>
            </div>
            <MenuSelect
              value={settings.defaultJurisdiction as any}
              options={[
                { value: 'UK' as any, label: 'UK' },
                { value: 'NO' as any, label: 'Norway' },
              ]}
              onChange={(v) => updateSettings({ defaultJurisdiction: v as any })}
            />
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Hide account balances</div>
              <div className="settingsRowHint">Keeps amounts obscured across the app.</div>
            </div>
            <input
              className="settingsSwitch"
              type="checkbox"
              checked={settings.hideAccountBalances}
              onChange={(e) => updateSettings({ hideAccountBalances: e.target.checked })}
            />
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Menu animations</div>
              <div className="settingsRowHint">When off, the sidebar stays open (no auto-hide).</div>
            </div>
            <input
              className="settingsSwitch"
              type="checkbox"
              checked={settings.enableMenuAnimations}
              onChange={(e) => updateSettings({ enableMenuAnimations: e.target.checked })}
            />
          </div>

          {advanced ? (
            <div className="settingsRow">
              <div className="settingsRowText">
                <div className="settingsRowLabel">People (separate transactions)</div>
                <div className="settingsRowHint">Adds profiles so each person has their own transactions list.</div>
              </div>
              <input
                className="settingsSwitch"
                type="checkbox"
                checked={settings.peopleEnabled}
                onChange={(e) => updateSettings({ peopleEnabled: e.target.checked })}
              />
            </div>
          ) : null}
        </div>
        ) : null}

        {advanced && tab === 'categories' && editRuleId && editDraft ? (
          <div className="modalBackdrop" onMouseDown={(e) => e.target === e.currentTarget && (setEditRuleId(null), setEditDraft(null))}>
            <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalTitle">Edit rule</div>
              <div className="fieldRow" style={{ marginTop: 12 }}>
                <label className="field" style={{ flex: 1 }}>
                  <div className="fieldLabel">Match text</div>
                  <input value={editDraft.match} onChange={(e) => setEditDraft({ ...editDraft, match: e.target.value })} />
                </label>
                <label className="field">
                  <div className="fieldLabel">Where</div>
                  <MenuSelect
                    value={(editDraft.field ?? 'any') as any}
                    options={ruleFields.map((f) => ({ value: f as any, label: f }))}
                    onChange={(v: any) => setEditDraft({ ...editDraft, field: String(v) as any })}
                    width={160}
                  />
                </label>
                <label className="field">
                  <div className="fieldLabel">Applies to</div>
                  <MenuSelect
                    value={(editDraft.appliesTo ?? 'expense') as any}
                    options={ruleKinds.map((k) => ({ value: k as any, label: k }))}
                    onChange={(v: any) => setEditDraft({ ...editDraft, appliesTo: String(v) as any })}
                    width={160}
                  />
                </label>
              </div>

              <div className="fieldRow" style={{ marginTop: 10 }}>
                <label className="field">
                  <div className="fieldLabel">Base category</div>
                  <MenuSelect
                    value={(editDraft.category ?? 'other') as any}
                    options={builtinCategories.map((c) => ({ value: c as any, label: c }))}
                    onChange={(v: any) => setEditDraft({ ...editDraft, category: String(v) as any, customCategoryName: null })}
                    width={220}
                  />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <div className="fieldLabel">Custom category name (optional)</div>
                  <input
                    value={editDraft.customCategoryName ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, category: 'other', customCategoryName: e.target.value || null })}
                    placeholder="Example: Food"
                  />
                </label>
              </div>

              <div className="modalActions">
                <button type="button" onClick={() => { setEditRuleId(null); setEditDraft(null) }}>
                  Cancel
                </button>
                <button type="button" className="btnPrimary" onClick={saveEditRule}>
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {advanced && tab === 'categories' ? (
          <div className="settingsGroup">
            <div className="settingsGroupHeader">
              <div className="settingsGroupTitle">Auto-categorization (import)</div>
            </div>

            <div className="note" style={{ marginTop: 0 }}>
              Add rules so imported transactions get categorized automatically. First matching rule wins. Rules apply only when a transaction is uncategorized.
            </div>

            <div className="groupBox" style={{ marginTop: 12 }}>
              <div className="groupTitle">Quick add</div>
              <div className="fieldRow" style={{ marginTop: 10 }}>
                <label className="field" style={{ flex: 1 }}>
                  <div className="fieldLabel">Match text</div>
                  <input value={newRuleMatch} onChange={(e) => setNewRuleMatch(e.target.value)} placeholder="Example: tesco / uber / salary" />
                </label>
                <label className="field">
                  <div className="fieldLabel">Pick payee</div>
                  <MenuSelect
                    value={'' as any}
                    options={[{ value: '' as any, label: 'Choose…' }, ...payeeSuggestions.map((p) => ({ value: p.payee as any, label: p.payee }))]}
                    onChange={(v: any) => {
                      const p = String(v ?? '').trim()
                      if (p) setNewRuleMatch(p)
                    }}
                    width={240}
                  />
                </label>
              </div>

              <div className="fieldRow" style={{ marginTop: 10 }}>
                <label className="field">
                  <div className="fieldLabel">Where</div>
                  <MenuSelect
                    value={newRuleField as any}
                    options={ruleFields.map((f) => ({ value: f as any, label: f }))}
                    onChange={(v: any) => setNewRuleField(String(v) as any)}
                    width={140}
                  />
                </label>
                <label className="field">
                  <div className="fieldLabel">Applies to</div>
                  <MenuSelect
                    value={newRuleAppliesTo as any}
                    options={ruleKinds.map((k) => ({ value: k as any, label: k }))}
                    onChange={(v: any) => setNewRuleAppliesTo(String(v) as any)}
                    width={160}
                  />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <div className="fieldLabel">Category</div>
                  <MenuSelect
                    value={newRuleTarget as any}
                    options={ruleTargetOptions().map((o) => ({ value: o.value as any, label: o.label }))}
                    onChange={(v: any) => {
                      const raw = String(v ?? '')
                      if (raw === 'custom:__new__') {
                        const name = (window.prompt('New custom category name:') ?? '').trim()
                        if (!name) return
                        setNewRuleTarget(`custom:${name}`)
                        setNewRuleCustomName(name)
                        return
                      }
                      setNewRuleTarget(raw)
                      if (raw.startsWith('custom:')) setNewRuleCustomName(raw.slice('custom:'.length))
                      else setNewRuleCustomName('')
                    }}
                    width={320}
                  />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <div className="fieldLabel">Custom name</div>
                  <input
                    value={newRuleCustomName}
                    onChange={(e) => setNewRuleCustomName(e.target.value)}
                    placeholder="Optional (example: Food)"
                  />
                </label>
                <button
                  type="button"
                  className="btnPrimary"
                  onClick={() => {
                    const match = newRuleMatch.trim()
                    if (!match) return
                    const t = newRuleCustomName.trim() ? { category: 'other' as BillCategory, customCategoryName: newRuleCustomName.trim() } : parseTarget(newRuleTarget)
                    const rule: ImportCategoryRule = {
                      id: crypto.randomUUID(),
                      match,
                      field: newRuleField,
                      appliesTo: newRuleAppliesTo,
                      category: t.category,
                      customCategoryName: t.customCategoryName,
                    }
                    updateImportRules([...(settings.importCategoryRules ?? []), rule])
                    setNewRuleMatch('')
                    setNewRuleCustomName('')
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="list" style={{ marginTop: 12 }}>
              {(settings.importCategoryRules ?? []).length === 0 ? (
                <div className="empty">No rules yet. Use “Quick add”.</div>
              ) : (
                (settings.importCategoryRules ?? []).map((r, idx) => {
                  const targetLabel = String(r.customCategoryName ?? '').trim()
                    ? `Custom: ${String(r.customCategoryName ?? '').trim()}`
                    : `Category: ${r.category ?? 'other'}`
                  return (
                    <div key={r.id} className="listItem ruleRow">
                      <div className="ruleRowMain">
                        <div className="ruleRowTitle">
                          {r.match} → {targetLabel}
                        </div>
                        <div className="ruleRowMeta">
                          Where: {r.field ?? 'any'} • Applies: {r.appliesTo ?? 'expense'}
                        </div>
                      </div>
                      <div className="ruleRowActions">
                        <button type="button" disabled={idx === 0} onClick={() => {
                          const list = [...(settings.importCategoryRules ?? [])]
                          const tmp = list[idx - 1]!
                          list[idx - 1] = list[idx]!
                          list[idx] = tmp
                          updateImportRules(list)
                        }}>Up</button>
                        <button type="button" disabled={idx >= (settings.importCategoryRules ?? []).length - 1} onClick={() => {
                          const list = [...(settings.importCategoryRules ?? [])]
                          const tmp = list[idx + 1]!
                          list[idx + 1] = list[idx]!
                          list[idx] = tmp
                          updateImportRules(list)
                        }}>Down</button>
                        <button type="button" onClick={() => startEditRule(r.id)}>Edit</button>
                        <button type="button" className="btnDanger" onClick={() => updateImportRules((settings.importCategoryRules ?? []).filter((x) => x.id !== r.id))}>Delete</button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ) : null}

        {tab === 'notifications' ? (
          <div className="settingsGroup">
          <div className="settingsGroupHeader">
            <div className="settingsGroupTitle">Notifications</div>
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Enable notifications</div>
              <div className="settingsRowHint">Reminders for upcoming bills.</div>
            </div>
            <input
              className="settingsSwitch"
              type="checkbox"
              checked={settings.enableNotifications}
              onChange={(e) => updateSettings({ enableNotifications: e.target.checked })}
            />
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Reminder days</div>
              <div className="settingsRowHint">How many days before the due date to remind.</div>
            </div>
            <input
              className="settingsInput"
              type="number"
              value={settings.reminderDays}
              onChange={(e) => updateSettings({ reminderDays: Math.max(0, Number(e.target.value)) })}
            />
          </div>

          <div className="settingsRow settingsRowActions">
            <div className="rowActions">
              <button type="button" onClick={() => void requestNotificationPermission()}>
                Request permission
              </button>
            </div>
            {notifStatus ? <div className="note">{notifStatus}</div> : null}
          </div>
        </div>
        ) : null}

        {tab === 'general' ? (
          <div className="settingsGroup">
            <div className="settingsGroupHeader">
              <div className="settingsGroupTitle">Startup</div>
            </div>
            <div className="settingsRow">
              <div className="settingsRowText">
                <div className="settingsRowLabel">Start on login</div>
                <div className="settingsRowHint">Launch Kivana automatically when you sign in.</div>
              </div>
              <input
                className="settingsSwitch"
                type="checkbox"
                checked={settings.startOnLogin}
                onChange={(e) => updateSettings({ startOnLogin: e.target.checked })}
              />
            </div>
          </div>
        ) : null}

        {tab === 'calendar' ? (
          <div className="settingsGroup">
          <div className="settingsGroupHeader">
            <div className="settingsGroupTitle">Calendar</div>
          </div>
          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Enable calendar export</div>
              <div className="settingsRowHint">Generate an .ics file for upcoming bills.</div>
            </div>
            <input
              className="settingsSwitch"
              type="checkbox"
              checked={settings.calendarSyncEnabled}
              onChange={(e) => updateSettings({ calendarSyncEnabled: e.target.checked })}
            />
          </div>

          <div className="fieldRow">
            <label className="field">
              <div className="fieldLabel">Months ahead</div>
              <input
                type="number"
                value={settings.calendarSyncMonthsAhead}
                onChange={(e) => updateSettings({ calendarSyncMonthsAhead: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label className="field">
              <div className="fieldLabel">Lead days</div>
              <input
                type="number"
                value={settings.calendarSyncLeadDays}
                onChange={(e) => updateSettings({ calendarSyncLeadDays: Math.max(0, Number(e.target.value)) })}
              />
            </label>
          </div>

          <div className="settingsRow settingsRowActions">
            <div className="rowActions">
              <button type="button" onClick={() => void exportCalendarIcs()} disabled={!settings.calendarSyncEnabled}>
                Export .ics
              </button>
            </div>
            {calendarStatus ? <div className="note">{calendarStatus}</div> : null}
          </div>
        </div>
        ) : null}

        {tab === 'forecast' ? (
          <div className="settingsGroup">
          <div className="settingsGroupHeader">
            <div className="settingsGroupTitle">Forecast</div>
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Use manual available balance</div>
              <div className="settingsRowHint">Overrides account totals for forecasts.</div>
            </div>
            <input
              className="settingsSwitch"
              type="checkbox"
              checked={settings.preferManualForecastBalance}
              onChange={(e) => updateSettings({ preferManualForecastBalance: e.target.checked })}
            />
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Manual available balance</div>
              <div className="settingsRowHint">Used when manual balance is enabled.</div>
            </div>
            <input
              className="settingsInput"
              type="number"
              value={settings.availableBalance}
              onChange={(e) => updateSettings({ availableBalance: Number(e.target.value) })}
            />
          </div>
        </div>
        ) : null}

        {AI_FEATURE_ENABLED && tab === 'ai' ? (
          <div className="settingsGroup">
          <div className="settingsGroupHeader">
            <div className="settingsGroupTitle">AI</div>
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">AI Provider</div>
              <div className="settingsRowHint">Local runs via Ollama. External uses an API key.</div>
            </div>
            <MenuSelect
              value={aiProvider as any}
              options={[
                { value: 'local' as any, label: 'Local (Ollama)' },
                { value: 'external' as any, label: 'External (Groq/OpenAI)' },
              ]}
              onChange={(v) => updateSettings({ aiProvider: v as AIProvider })}
            />
          </div>

          {aiProvider === 'local' ? (
            <>
              <div className="settingsRow">
                <div className="settingsRowText">
                  <div className="settingsRowLabel">Ollama Base URL</div>
                  <div className="settingsRowHint">Example: http://localhost:11434</div>
                </div>
                <input value={settings.aiBaseURL} onChange={(e) => updateSettings({ aiBaseURL: e.target.value })} />
              </div>
              <div className="settingsRow">
                <div className="settingsRowText">
                  <div className="settingsRowLabel">Model</div>
                  <div className="settingsRowHint">Select or type a model name.</div>
                </div>
                {ollamaModels && ollamaModels.length > 0 ? (
                  <MenuSelect
                    value={settings.aiModel as any}
                    options={ollamaModels.map((m) => ({ value: m as any, label: m }))}
                    onChange={(v) => updateSettings({ aiModel: v })}
                  />
                ) : (
                  <input value={settings.aiModel} onChange={(e) => updateSettings({ aiModel: e.target.value })} />
                )}
              </div>
              <div className="settingsRow settingsRowActions">
                <div className="rowActions">
                  <button type="button" onClick={() => void detectOllamaModels()}>
                    Detect models
                  </button>
                </div>
                {ollamaStatus ? <div className="note">{ollamaStatus}</div> : null}
              </div>
            </>
          ) : (
            <>
              <div className="settingsRow">
                <div className="settingsRowText">
                  <div className="settingsRowLabel">External Endpoint</div>
                  <div className="settingsRowHint">Provider endpoint for chat completions.</div>
                </div>
                <input value={settings.aiExternalEndpoint} onChange={(e) => updateSettings({ aiExternalEndpoint: e.target.value })} />
              </div>
              <div className="settingsRow">
                <div className="settingsRowText">
                  <div className="settingsRowLabel">External API Key</div>
                  <div className="settingsRowHint">Stored locally on this device.</div>
                </div>
                <input
                  type="password"
                  value={settings.aiExternalAPIKey ?? ''}
                  onChange={(e) => updateSettings({ aiExternalAPIKey: e.target.value || null })}
                />
              </div>
            </>
          )}
        </div>
        ) : null}

        {tab === 'account' ? (
          <div className="settingsGroup">
            <div className="settingsGroupHeader">
              <div className="settingsGroupTitle">Account</div>
            </div>
            <div className="note" style={{ marginBottom: 8 }}>
              Optional. Kivana Pro is included free on this device — no account or sign-in required. Data stays local.
            </div>

            <div className="settingsRow">
              <div className="settingsRowText">
                <div className="settingsRowLabel">Email</div>
              </div>
              <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
            </div>

            <div className="settingsRow">
              <div className="settingsRowText">
                <div className="settingsRowLabel">Password</div>
                <div className="settingsRowHint">Minimum 8 characters.</div>
              </div>
              <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
            </div>

            {!auth.session ? (
              <div className="settingsRow">
                <div className="settingsRowText">
                  <div className="settingsRowLabel">Captcha</div>
                  <div className="settingsRowHint">{authCaptchaQuestion || (authCaptchaLoading ? 'Loading…' : 'Captcha required. Press Refresh.')}</div>
                </div>
                <div className="rowActions">
                  <input value={authCaptchaAnswer} onChange={(e) => setAuthCaptchaAnswer(e.target.value)} placeholder="Answer" style={{ width: 140 }} />
                  <button type="button" onClick={() => void refreshAuthCaptcha()} disabled={authCaptchaLoading}>
                    {authCaptchaLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="settingsRow settingsRowActions">
              <div className="rowActions">
                <button type="button" onClick={() => void signUpClick()}>
                  Sign up
                </button>
                <button type="button" onClick={() => void signInClick()}>
                  Sign in
                </button>
                <button type="button" onClick={() => void meClick()} disabled={!auth.session?.accessToken}>
                  Check session
                </button>
                <button type="button" onClick={() => void refreshEntitlementsClick()} disabled={!auth.session}>
                  Refresh entitlements
                </button>
                <button type="button" onClick={() => void signOutClick()} disabled={!auth.session}>
                  Sign out
                </button>
              </div>
              {auth.session ? <div className="note">Signed in: {auth.session.userEmail}</div> : null}
              {authStatus ? <div className="note">{authStatus}</div> : null}
              {meStatus ? <div className="note">{meStatus}</div> : null}
              {auth.entitlements?.products?.length ? (
                <div className="note">
                  {(() => {
                    const p = auth.entitlements?.products?.find((x) => x.productCode === 'kivana') ?? auth.entitlements?.products?.[0]
                    if (!p) return null
                    return `Plan: ${p.productCode} / ${displayPlanName(p)} (${p.features?.length ?? 0} features)`
                  })()}
                </div>
              ) : null}
              {entitlementsStatus ? <div className="note">{entitlementsStatus}</div> : null}
            </div>
          </div>
        ) : null}

        {tab === 'data' ? (
          <div className="settingsGroup">
          <div className="settingsGroupHeader">
            <div className="settingsGroupTitle">Backups</div>
          </div>
          <div className="settingsRow" id="settings-backup">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Backup now</div>
              <div className="settingsRowHint">
                Make a safety copy of your data. Use it to restore if something goes wrong.
              </div>
            </div>
            <div className="rowActions">
              <span className="pill">Last backup: {formatBackupAge(settings.lastBackupAtMs)}</span>
              <button type="button" onClick={() => void exportBackupClick()} className="btnPrimary">
                Backup now
              </button>
            </div>
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">My backups</div>
              <div className="settingsRowHint">Save a backup here so you can restore it with one click.</div>
            </div>
            <div style={{ display: 'grid', gap: 8, justifyItems: 'end', textAlign: 'right', width: 'min(560px, 100%)' }}>
              <div className="rowActions" style={{ justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => void addSavedBackupClick()} disabled={!isTauriRuntime()}>
                  Choose backup…
                </button>
              </div>
              {savedBackups.length === 0 ? <div className="note" style={{ marginTop: 0 }}>No saved backups yet.</div> : null}
              {savedBackups.map((b) => (
                <div key={b.path} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', width: '100%' }}>
                  <div className="note" style={{ marginTop: 0, textAlign: 'left' }} title={b.path}>
                    {backupNameFromPath(b.path)} • {new Date(b.savedAtMs).toLocaleString()}
                  </div>
                  <div className="rowActions" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => void restoreSavedBackup(b.path)}>
                      Restore
                    </button>
                    <button type="button" onClick={() => removeSavedBackupPath(b.path)} className="btnDanger">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Automatic backups</div>
              <div className="settingsRowHint">Kivana can create backups for you and keep the latest copies.</div>
            </div>
            <div className="rowActions">
              <button
                type="button"
                onClick={() => updateSettings({ autoBackupEnabled: !settings.autoBackupEnabled })}
                disabled={!isTauriRuntime()}
                className={settings.autoBackupEnabled ? 'btnPrimary' : ''}
              >
                {settings.autoBackupEnabled ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {settings.autoBackupEnabled ? (
            <>
              <div className="settingsRow">
                <div className="settingsRowText">
                  <div className="settingsRowLabel">Schedule</div>
                  <div className="settingsRowHint">Choose how often to back up, and how many copies to keep.</div>
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <div className="rowActions" style={{ justifyContent: 'flex-end' }}>
                    <input
                      value={String(settings.autoBackupEveryDays ?? 7)}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (!Number.isFinite(n)) return
                        updateSettings({ autoBackupEveryDays: Math.max(1, Math.min(60, Math.floor(n))) })
                      }}
                      style={{ width: 80 }}
                    />
                    <div className="note" style={{ marginTop: 0 }}>days</div>
                    <input
                      value={String(settings.autoBackupKeepCount ?? 5)}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (!Number.isFinite(n)) return
                        updateSettings({ autoBackupKeepCount: Math.max(1, Math.min(20, Math.floor(n))) })
                      }}
                      style={{ width: 80 }}
                    />
                    <div className="note" style={{ marginTop: 0 }}>copies</div>
                    <button type="button" onClick={() => void runAutoBackupNow()} disabled={!isTauriRuntime()}>
                      Make now
                    </button>
                  </div>
                  <div className="note" style={{ marginTop: 0 }}>Last automatic backup: {formatBackupAge(settings.autoBackupLastRunAtMs)}</div>
                  {autoBackupStatus ? <div className="note" style={{ marginTop: 0 }}>{autoBackupStatus}</div> : null}
                </div>
              </div>

              <div className="settingsRow">
                <div className="settingsRowText">
                  <div className="settingsRowLabel">Backup history</div>
                  <div className="settingsRowHint">Restore or delete one of your last automatic backups.</div>
                </div>
                <div style={{ display: 'grid', gap: 8, justifyItems: 'end', textAlign: 'right', width: 'min(560px, 100%)' }}>
                  {autoBackups.length === 0 ? <div className="note" style={{ marginTop: 0 }}>No automatic backups yet.</div> : null}
                  {autoBackups.map((b) => (
                    <div key={b.path} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', width: '100%' }}>
                      <div className="note" style={{ marginTop: 0, textAlign: 'left' }}>
                        {new Date(b.modifiedAtMs).toLocaleString()}
                      </div>
                      <div className="rowActions" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => void restoreAutoBackup(b.path)}>
                          Restore
                        </button>
                        <button type="button" onClick={() => void deleteAutoBackupClick(b.path)} className="btnDanger">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          <div className="settingsRow">
            <div className="settingsRowText">
              <div className="settingsRowLabel">Restore from backup</div>
              <div className="settingsRowHint">Choose a backup folder (.pfbackup) to restore. This replaces your current data.</div>
            </div>
            <div className="rowActions">
              <button type="button" onClick={() => void importBackupFolderClick()}>
                Choose backup…
              </button>
            </div>
          </div>

          <div className="settingsRow settingsRowActions">
            <details style={{ width: '100%' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--text-h)' }}>Advanced</summary>
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                <div className="note" style={{ marginTop: 0 }}>
                  Use these only if you know what they do.
                </div>
                <div className="settingsRow" style={{ padding: 0, borderTop: 'none' }}>
                  <div className="settingsRowText">
                    <div className="settingsRowLabel">Old JSON backup</div>
                    <div className="settingsRowHint">Import a legacy JSON-only backup (no attachments).</div>
                  </div>
                  <div className="rowActions">
                    <button type="button" onClick={() => void importBackupJsonClick()}>
                      Choose JSON…
                    </button>
                  </div>
                </div>
                <div className="settingsRow" style={{ padding: 0, borderTop: 'none' }}>
                  <div className="settingsRowText">
                    <div className="settingsRowLabel">Data location</div>
                    <div className="settingsRowHint">Where Kivana stores your data on this device.</div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, justifyItems: 'end', textAlign: 'right' }}>
                    {isTauriRuntime() ? (
                      <>
                        <div className="note" style={{ marginTop: 0 }}>{dataDir || '—'}</div>
                        <div className="note" style={{ marginTop: 0 }}>{attachmentsDir ? `Attachments: ${attachmentsDir}` : ''}</div>
                        <div className="rowActions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const text = [dataDir ? `Data: ${dataDir}` : '', attachmentsDir ? `Attachments: ${attachmentsDir}` : ''].filter(Boolean).join('\n')
                              void navigator.clipboard?.writeText(text)
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="note" style={{ marginTop: 0 }}>Web mode uses localStorage keys like Kivana/settings.json.</div>
                    )}
                  </div>
                </div>
                <div className="rowActions">
                  <button type="button" onClick={() => void migrateLegacyDataClick()}>
                    Migrate legacy data
                  </button>
                  <button type="button" onClick={() => void clearAllDataClick()} className="btnDanger">
                    Clear all data
                  </button>
                </div>
              </div>
            </details>
            {dataStatus ? <div className="note">{dataStatus}</div> : null}
          </div>
        </div>
        ) : null}

        {tab === 'updates' ? (
          <div className="settingsGroup">
            <div className="settingsGroupHeader">
              <div className="settingsGroupTitle">Updates</div>
            </div>

            <div className="settingsRow">
              <div className="settingsRowText">
                <div className="settingsRowLabel">Current version</div>
                <div className="settingsRowHint">Updates are delivered automatically.</div>
              </div>
              <div className="settingsRowLabel">{currentVersion}</div>
            </div>

            <div className="settingsRow settingsRowActions">
              <div className="rowActions">
                <button type="button" onClick={() => void checkForUpdatesClick()}>
                  Check for updates
                </button>
                <button type="button" onClick={() => setShowUpdateNotes(true)} disabled={!updateInfo?.body}>
                  What’s new
                </button>
                <button type="button" onClick={() => void downloadAndInstallUpdateClick()} disabled={!updateInfo}>
                  Download & install
                </button>
              </div>
              {updateStatus ? <div className="note">{updateStatus}</div> : null}
              {updateInfo?.version ? <div className="note">Available: {String(updateInfo.version)}</div> : null}
            </div>
          </div>
        ) : null}
        </div>
      </div>

      {showUpdateNotes && updateInfo?.body ? (
        <div
          className="modalBackdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowUpdateNotes(false)
          }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(820px, calc(100vw - 32px))' }}>
            <div className="modalTitle">What’s new</div>
            <div className="note" style={{ marginTop: 6 }}>
              {updateInfo?.version ? `Kivana ${String(updateInfo.version)}` : ''}
            </div>
            <div className="groupBox" style={{ marginTop: 12, maxHeight: 360, overflow: 'auto' }}>
              <div className="note" style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>
                {String(updateInfo.body)}
              </div>
            </div>
            <div className="rowActions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowUpdateNotes(false)}>
                Close
              </button>
              <button type="button" className="btnPrimary" onClick={() => void downloadAndInstallUpdateClick()}>
                Download & install
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
