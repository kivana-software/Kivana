import { emit, listen } from '@tauri-apps/api/event'
import type { AppState } from '../app/appStore'
import { setSection } from '../app/AppProvider'
import { exportBackup, importBackupFromFolder, importBackupFromJson } from './dataActions'
import type { BillCategory, Recurrence } from '../domain/models'
import { accountBalance } from '../domain/finance'
import { visibleTransactions } from '../domain/people'
import { calculateMonthSummary, calculateYearSummary } from '../domain/reports'
import { expenseCategoryDisplayName, isBillCategory } from '../domain/settings'

export async function registerMenuEvents(getState: () => AppState, dispatch: (a: any) => void): Promise<() => void> {
  const unsubs: Array<() => void> = []

  async function handleExport() {
    const state = getState()
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
    await exportBackup(datasets)
  }

  unsubs.push(
    await listen('menu:export_backup', () => {
      void handleExport()
    }),
  )
  unsubs.push(
    await listen('menu:import_backup_folder', () => {
      const state = getState()
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
      void importBackupFromFolder(dispatch, datasets)
    }),
  )
  unsubs.push(
    await listen('menu:import_backup_json', () => {
      const state = getState()
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
      void importBackupFromJson(dispatch, datasets)
    }),
  )
  unsubs.push(
    await listen('menu:open_settings', () => {
      dispatch(setSection('settings'))
    }),
  )

  return () => {
    for (const u of unsubs) u()
  }
}

export async function registerAutomationEvents(getState: () => AppState, dispatch: (a: any) => void, persistNow: () => Promise<void>): Promise<() => void> {
  const unsubs: Array<() => void> = []

  function dateOnlyISO(raw: any): string | null {
    const d = raw instanceof Date ? raw : new Date(raw)
    if (!Number.isFinite(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function inRange(d: Date, from: Date | null, to: Date | null): boolean {
    const ms = d.getTime()
    if (from && ms < from.getTime()) return false
    if (to && ms > to.getTime()) return false
    return true
  }

  function parseDateOnly(raw: any): Date | null {
    const s = String(raw ?? '').trim()
    if (!s) return null
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const y = Number(m[1])
    const mo = Number(m[2])
    const da = Number(m[3])
    const d = new Date(y, Math.max(0, mo - 1), da, 0, 0, 0, 0)
    if (!Number.isFinite(d.getTime())) return null
    return d
  }

  function parseDateTime(raw: any): Date | null {
    const s = String(raw ?? '').trim()
    if (!s) return null
    const d = new Date(s)
    if (!Number.isFinite(d.getTime())) return null
    return d
  }

  function normText(v: any): string | null {
    const s = String(v ?? '').trim()
    return s ? s : null
  }

  function normRecurrence(v: any): Recurrence {
    const s = String(v ?? '').trim().toLowerCase()
    if (s === 'weekly' || s === 'monthly' || s === 'yearly' || s === 'once') return s as any
    return 'once'
  }

  function normCategory(v: any): { category: BillCategory; customCategoryName: string | null } {
    const raw = String(v ?? '').trim()
    if (!raw) return { category: 'other', customCategoryName: null }
    const lower = raw.toLowerCase()
    if (isBillCategory(lower)) return { category: lower as any, customCategoryName: null }
    return { category: 'other', customCategoryName: raw }
  }

  async function reply(id: string, ok: boolean, result?: any, error?: string) {
    await emit('automation:result', { id, status: ok ? 'ok' : 'error', result: result ?? null, error: error ?? null })
  }

  async function handleRun(payload: any) {
    const id = String(payload?.id ?? '').trim()
    const name = String(payload?.name ?? '').trim()
    const args = payload?.args ?? {}
    if (!id || !name) {
      await reply(id || 'missing', false, null, 'invalid_request')
      return
    }

    const state = getState()
    const currencyCode = String(args.currencyCode || state.settings.displayCurrencyCode || 'GBP')

    if (name === 'get_capabilities') {
      await reply(id, true, { ok: true })
      return
    }

    if (name === 'list_transactions') {
      const limitRaw = Number(args.limit ?? 20)
      const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20))
      const kind = normText(args.kind)?.toLowerCase()
      const search = normText(args.search)?.toLowerCase()
      const cat = normText(args.category)?.toLowerCase()
      const dateFrom = parseDateOnly(args.dateFrom)
      const dateTo = parseDateOnly(args.dateTo)

      let txs = visibleTransactions(state.transactions as any, state.settings) as any[]
      if (kind) txs = txs.filter((t) => String(t.kind ?? '').toLowerCase() === kind)
      if (dateFrom || dateTo) txs = txs.filter((t) => (t?.date instanceof Date ? inRange(t.date, dateFrom, dateTo) : false))
      if (cat) {
        txs = txs.filter((t) => {
          const built = String(t?.category ?? '').toLowerCase()
          const custom = String(t?.customCategoryName ?? '').trim().toLowerCase()
          return built === cat || custom === cat
        })
      }
      if (search) {
        txs = txs.filter((t) => {
          const payee = String(t?.payee ?? '').toLowerCase()
          const notes = String(t?.notes ?? '').toLowerCase()
          const built = String(t?.category ?? '').toLowerCase()
          const custom = String(t?.customCategoryName ?? '').toLowerCase()
          return `${payee} ${notes} ${built} ${custom}`.includes(search)
        })
      }

      txs.sort((a, b) => (b?.date instanceof Date ? b.date.getTime() : 0) - (a?.date instanceof Date ? a.date.getTime() : 0))
      const total = txs.length
      const items = txs.slice(0, limit).map((t) => {
        const categoryLabel = t.kind === 'expense' ? expenseCategoryDisplayName({ category: t.category, customCategoryName: t.customCategoryName }) : null
        return {
          id: t.id,
          kind: t.kind,
          date: dateOnlyISO(t.date),
          amount: t.amount?.value ?? 0,
          currencyCode: t.amount?.currencyCode ?? currencyCode,
          category: categoryLabel,
          payee: t.payee ?? null,
          notes: t.notes ?? null,
        }
      })

      await reply(id, true, { total, items })
      return
    }

    if (name === 'get_month_summary') {
      const rawMonth = normText(args.month ?? args.date ?? args.monthStart ?? '') ?? ''
      let month: Date | null = null
      const m1 = rawMonth.match(/^(\d{4})-(\d{2})$/)
      if (m1) {
        const y = Number(m1[1])
        const mo = Number(m1[2]) - 1
        if (Number.isFinite(y) && Number.isFinite(mo)) month = new Date(y, Math.min(11, Math.max(0, mo)), 1)
      } else {
        const d = parseDateOnly(rawMonth)
        if (d) month = new Date(d.getFullYear(), d.getMonth(), 1)
      }
      if (!month) month = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

      const personTransactions = visibleTransactions(state.transactions as any, state.settings)
      const summary = calculateMonthSummary({
        month,
        bills: state.bills as any,
        incomes: state.incomes as any,
        transactions: personTransactions as any,
      })

      const billDetails = (summary.billDetails ?? []).map((x) => ({
        id: x.id,
        name: x.name,
        amount: x.amount,
        date: dateOnlyISO(x.date),
        isPaid: x.isPaid,
        billId: x.billId ?? null,
        category: x.category ?? null,
      }))
      const incomeDetails = (summary.incomeDetails ?? []).map((x) => ({
        id: x.id,
        name: x.name,
        amount: x.amount,
        date: dateOnlyISO(x.date),
        isPaid: x.isPaid,
        incomeId: x.incomeId ?? null,
        category: x.category ?? null,
      }))

      await reply(id, true, {
        month: dateOnlyISO(month) ? String(dateOnlyISO(month)).slice(0, 7) : null,
        currencyCode: String(state.settings.displayCurrencyCode || currencyCode || 'GBP'),
        income: summary.income,
        bills: summary.bills,
        net: summary.net,
        billDetails,
        incomeDetails,
      })
      return
    }

    if (name === 'get_year_summary') {
      const yearRaw = Number(args.year ?? new Date().getFullYear())
      const year = Number.isFinite(yearRaw) ? Math.trunc(yearRaw) : new Date().getFullYear()
      const startMonthRaw = Number(args.startMonth ?? 0)
      const startMonth = Math.min(11, Math.max(0, Number.isFinite(startMonthRaw) ? Math.trunc(startMonthRaw) : 0))
      const endMonthRaw = Number(args.endMonth ?? -1)

      const now = new Date()
      const defaultEndMonth = year < now.getFullYear() ? 11 : year > now.getFullYear() ? 11 : now.getMonth()
      const endMonth =
        Number.isFinite(endMonthRaw) && endMonthRaw >= 0
          ? Math.min(11, Math.max(0, Math.trunc(endMonthRaw)))
          : defaultEndMonth

      const personTransactions = visibleTransactions(state.transactions as any, state.settings)
      const summary = calculateYearSummary({
        year,
        startMonth,
        endYear: year,
        endMonth,
        bills: state.bills as any,
        incomes: state.incomes as any,
        transactions: personTransactions as any,
      })

      const months = (summary?.months ?? []).map((m) => ({
        monthName: m.monthName,
        arrayIndex: m.arrayIndex,
        income: m.income,
        bills: m.bills,
        net: m.net,
      }))

      const billDetails = (summary?.billDetails ?? []).map((x) => ({
        id: x.id,
        name: x.name,
        amount: x.amount,
        date: dateOnlyISO(x.date),
        isPaid: x.isPaid,
        billId: x.billId ?? null,
        category: x.category ?? null,
      }))
      const incomeDetails = (summary?.incomeDetails ?? []).map((x) => ({
        id: x.id,
        name: x.name,
        amount: x.amount,
        date: dateOnlyISO(x.date),
        isPaid: x.isPaid,
        incomeId: x.incomeId ?? null,
        category: x.category ?? null,
      }))

      await reply(id, true, {
        year,
        startMonth,
        endMonth,
        currencyCode: String(state.settings.displayCurrencyCode || currencyCode || 'GBP'),
        income: summary?.income ?? 0,
        bills: summary?.bills ?? 0,
        net: summary?.net ?? 0,
        months,
        billDetails,
        incomeDetails,
      })
      return
    }

    if (name === 'list_incomes') {
      const limitRaw = Number(args.limit ?? 50)
      const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50))
      const search = normText(args.search)?.toLowerCase()

      let incomes = [...(state.incomes as any[])]
      if (search) {
        incomes = incomes.filter((i) => {
          const n = String(i?.name ?? '').toLowerCase()
          const notes = String(i?.notes ?? '').toLowerCase()
          const src = String(i?.customSourceName ?? i?.source ?? '').toLowerCase()
          return `${n} ${notes} ${src}`.includes(search)
        })
      }
      incomes.sort((a, b) => (b?.nextPayDate instanceof Date ? b.nextPayDate.getTime() : 0) - (a?.nextPayDate instanceof Date ? a.nextPayDate.getTime() : 0))
      const total = incomes.length
      const items = incomes.slice(0, limit).map((i) => ({
        id: i.id,
        name: i.name,
        amount: i.amount?.value ?? 0,
        currencyCode: i.amount?.currencyCode ?? currencyCode,
        source: i.customSourceName?.trim() || i.source,
        nextPayDate: dateOnlyISO(i.nextPayDate),
        recurrence: i.recurrence,
        notes: i.notes ?? null,
      }))
      await reply(id, true, { total, items })
      return
    }

    if (name === 'list_bills') {
      const limitRaw = Number(args.limit ?? 50)
      const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50))
      const search = normText(args.search)?.toLowerCase()

      let bills = [...(state.bills as any[])]
      if (search) {
        bills = bills.filter((b) => {
          const n = String(b?.name ?? '').toLowerCase()
          const notes = String(b?.notes ?? '').toLowerCase()
          const cat0 = String(b?.customCategoryName ?? b?.category ?? '').toLowerCase()
          return `${n} ${notes} ${cat0}`.includes(search)
        })
      }
      bills.sort((a, b) => (b?.nextDueDate instanceof Date ? b.nextDueDate.getTime() : 0) - (a?.nextDueDate instanceof Date ? a.nextDueDate.getTime() : 0))
      const total = bills.length
      const items = bills.slice(0, limit).map((b) => ({
        id: b.id,
        name: b.name,
        amount: b.amount?.value ?? 0,
        currencyCode: b.amount?.currencyCode ?? currencyCode,
        category: b.customCategoryName?.trim() || b.category,
        nextDueDate: dateOnlyISO(b.nextDueDate),
        recurrence: b.recurrence,
        notes: b.notes ?? null,
      }))
      await reply(id, true, { total, items })
      return
    }

    if (name === 'list_accounts') {
      const txs = visibleTransactions(state.transactions as any, state.settings) as any[]
      const accounts = (state.accounts as any[]).map((a) => {
        const bal = accountBalance(a as any, txs as any)
        return {
          id: a.id,
          name: a.name,
          kind: a.kind,
          currencyCode: a.currencyCode,
          openingBalance: a.openingBalance ?? 0,
          balance: bal,
          institution: a.institution ?? null,
          notes: a.notes ?? null,
          archived: Boolean(a.archived),
        }
      })
      await reply(id, true, { total: accounts.length, items: accounts })
      return
    }

    if (name === 'set_section') {
      const section = String(args.section ?? '').trim()
      if (!section) {
        await reply(id, false, null, 'missing_section')
        return
      }
      dispatch(setSection(section as any))
      await reply(id, true, { section })
      return
    }

    if (name === 'update_settings') {
      const patch = typeof args.patch === 'object' && args.patch ? args.patch : {}
      dispatch({ type: 'settings/update', patch })
      await persistNow().catch(() => {})
      await reply(id, true, { updated: true })
      return
    }

    if (name === 'add_import_category_rule') {
      const match = String(args.match ?? '').trim()
      const field = String(args.field ?? 'any').trim()
      const appliesTo = String(args.appliesTo ?? 'any').trim()
      const catRaw = String(args.category ?? '').trim()
      const custom = normText(args.customCategoryName)
      if (!match) {
        await reply(id, false, null, 'missing_match')
        return
      }
      const built = normCategory(catRaw)
      const next = [
        ...(state.settings.importCategoryRules ?? []),
        { id: crypto.randomUUID(), match, field: field as any, appliesTo: appliesTo as any, category: built.category, customCategoryName: custom ?? built.customCategoryName },
      ]
      dispatch({ type: 'settings/update', patch: { importCategoryRules: next } })
      await persistNow().catch(() => {})
      await reply(id, true, { added: true })
      return
    }

    if (name === 'add_transaction') {
      const kind = String(args.kind ?? 'expense').trim().toLowerCase()
      const amount = Number(args.amount ?? 0)
      const date = parseDateOnly(args.date) ?? new Date()
      const payee = normText(args.payee)
      const notes = normText(args.notes)
      const tags = Array.isArray(args.tags) ? args.tags.map((x: any) => String(x ?? '').trim()).filter((x: string) => x.length > 0) : []
      const accountId = normText(args.accountId)
      const toAccountId = normText(args.toAccountId)
      const catParsed = normCategory(args.category ?? args.customCategoryName ?? '')
      const clientId = normText(args.clientId ?? args.id)

      const tx = {
        id: clientId ?? crypto.randomUUID(),
        kind: (kind === 'income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense') as any,
        date,
        amount: { currencyCode, value: Number.isFinite(amount) ? amount : 0 },
        accountId,
        toAccountId: kind === 'transfer' ? toAccountId : null,
        category: kind === 'expense' ? catParsed.category : null,
        customCategoryName: kind === 'expense' ? catParsed.customCategoryName : null,
        payee,
        notes,
        tags,
        relatedBillId: null,
        relatedIncomeId: null,
        personId: (state.settings.peopleEnabled ? state.settings.activePersonId : null) as any,
      }
      dispatch({ type: 'transactions/add', transaction: tx as any })
      dispatch({ type: 'ui/selectTransaction', id: tx.id as any })
      dispatch(setSection('transactions'))
      try {
        window.dispatchEvent(new CustomEvent('automation:reveal', { detail: { entity: 'transaction', id: tx.id } }))
      } catch {
      }
      await persistNow().catch(() => {})
      await reply(id, true, { id: tx.id })
      return
    }

    if (name === 'add_bill') {
      const now = new Date()
      const amt = Number(args.amount ?? 0)
      const name0 = String(args.name ?? 'New Bill').trim() || 'New Bill'
      const due = parseDateOnly(args.nextDueDate) ?? now
      const rec = normRecurrence(args.recurrence)
      const notes = normText(args.notes)
      const catParsed = normCategory(args.category ?? args.customCategoryName ?? '')
      const bill = {
        id: crypto.randomUUID(),
        name: name0,
        amount: { currencyCode, value: Number.isFinite(amt) ? amt : 0 },
        category: catParsed.category,
        customCategoryName: catParsed.customCategoryName,
        recurrence: rec,
        nextDueDate: due,
        notes,
        payments: [],
        paidAutomatically: false,
        hiddenUntilEdited: false,
        snoozeUntil: null,
        snoozeCount: 0,
        attachments: [],
      }
      dispatch({ type: 'bills/add', bill })
      dispatch({ type: 'ui/selectBill', id: bill.id as any })
      dispatch(setSection('bills'))
      try {
        window.dispatchEvent(new CustomEvent('automation:reveal', { detail: { entity: 'bill', id: bill.id } }))
      } catch {
      }
      await persistNow().catch(() => {})
      await reply(id, true, { id: bill.id })
      return
    }

    if (name === 'add_income') {
      const now = new Date()
      const amt = Number(args.amount ?? 0)
      const name0 = String(args.name ?? 'New Income').trim() || 'New Income'
      const nextPayDate = parseDateOnly(args.nextPayDate) ?? now
      const rec = normRecurrence(args.recurrence)
      const notes = normText(args.notes)
      const source = String(args.source ?? 'other').trim().toLowerCase()
      const income = {
        id: crypto.randomUUID(),
        name: name0,
        amount: { currencyCode, value: Number.isFinite(amt) ? amt : 0 },
        source: (source === 'salary' || source === 'freelance' || source === 'rental' || source === 'investment' ? source : 'other') as any,
        customSourceName: normText(args.customSourceName),
        recurrence: rec,
        nextPayDate,
        notes,
        receipts: [],
      }
      dispatch({ type: 'incomes/add', income })
      dispatch({ type: 'ui/selectIncome', id: income.id as any })
      dispatch(setSection('income'))
      try {
        window.dispatchEvent(new CustomEvent('automation:reveal', { detail: { entity: 'income', id: income.id } }))
      } catch {
      }
      await persistNow().catch(() => {})
      await reply(id, true, { id: income.id })
      return
    }

    if (name === 'add_reminder') {
      const when = parseDateTime(args.when) ?? new Date()
      const title = String(args.title ?? '').trim()
      if (!title) {
        await reply(id, false, null, 'missing_title')
        return
      }
      const allDay = Boolean(args.allDay)
      const rec = normRecurrence(args.recurrence)
      const priority = String(args.priority ?? 'medium').trim().toLowerCase()
      const reminder = {
        id: crypto.randomUUID(),
        title,
        when,
        allDay,
        recurrence: rec,
        priority: (priority === 'low' || priority === 'medium' || priority === 'high' || priority === 'critical' ? priority : 'medium') as any,
        notes: normText(args.notes),
        remindMinutesBefore: args.remindMinutesBefore == null ? null : Number(args.remindMinutesBefore),
        remindMinutesBeforeList: null,
        completedAt: null,
        personId: (state.settings.peopleEnabled ? state.settings.activePersonId : null) as any,
        createdAt: new Date(),
      }
      dispatch({ type: 'reminders/add', reminder })
      await persistNow().catch(() => {})
      await reply(id, true, { id: reminder.id })
      return
    }

    if (name === 'backup_now') {
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
      await exportBackup(datasets)
      dispatch({ type: 'settings/update', patch: { lastBackupAtMs: Date.now() } })
      await persistNow().catch(() => {})
      await reply(id, true, { ok: true })
      return
    }

    if (name === 'dispatch_action') {
      const action = args.action
      const dangerousConfirm = Boolean(args.dangerousConfirm)
      const type = String(action?.type ?? '')
      const isDangerous = type === 'data/replaceAll' || type === 'transactions/clearAll' || type === 'bills/bulkDelete' || type === 'transactions/bulkDelete'
      if (isDangerous && !dangerousConfirm) {
        await reply(id, false, null, 'dangerous_requires_confirm')
        return
      }
      if (!type) {
        await reply(id, false, null, 'missing_action_type')
        return
      }
      dispatch(action)
      await persistNow().catch(() => {})
      await reply(id, true, { dispatched: type })
      return
    }

    await reply(id, false, null, 'unknown_command')
  }

  unsubs.push(
    await listen('automation:run', (e) => {
      void handleRun(e.payload)
    }),
  )

  return () => {
    for (const u of unsubs) u()
  }
}
