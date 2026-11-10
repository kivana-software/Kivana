import type { AppState, Section } from '../app/appStore'
import { billIsPaidFor, billIsSnoozedActive } from '../domain/models'
import { visibleInvoices, visibleTransactions } from '../domain/people'
import type { LanguageCode } from '../domain/settings'
import { t } from './i18n'

export type SidebarGroup = { title: string; items: SidebarItem[] }

export type DueSeverity = 'none' | 'soon' | 'overdue'

export interface SidebarItem {
  section: Section
  title: string
  subtitle?: string
  icon: SidebarIcon
  dueSeverity?: DueSeverity
}

export type SidebarIcon =
  | 'overview'
  | 'calendar'
  | 'income'
  | 'dueSoon'
  | 'deferred'
  | 'paidRecently'
  | 'accounts'
  | 'transactions'
  | 'invoices'
  | 'goals'
  | 'debts'
  | 'reports'
  | 'settings'

export function buildSidebar(state: AppState, advanced: boolean, language: LanguageCode): SidebarGroup[] {
  const now = new Date()

  const billsItems: SidebarItem[] = [
    { section: 'dashboard', title: t(language, 'nav.dashboard', 'Dashboard'), subtitle: overviewSubtitle(state, now), icon: 'overview' },
    { section: 'budget', title: t(language, 'nav.budget', 'Budget'), icon: 'reports' },
    { section: 'calendar', title: t(language, 'nav.calendar', 'Calendar'), subtitle: calendarSubtitle(state, now), icon: 'calendar' },
    { section: 'income', title: t(language, 'nav.income', 'Income'), subtitle: incomeSubtitle(state), icon: 'income' },
  ]
  if (advanced) {
    billsItems.push({
      section: 'dueSoon',
      title: t(language, 'nav.dueSoon', 'Due Soon'),
      subtitle: dueSoonSubtitle(state, now),
      icon: 'dueSoon',
      dueSeverity: dueSoonSeverity(state, now),
    })
    billsItems.push({
      section: 'deferred',
      title: t(language, 'nav.deferred', 'Snoozed'),
      subtitle: deferredSubtitle(state, now),
      icon: 'deferred',
    })
    billsItems.push({
      section: 'paidRecently',
      title: t(language, 'nav.paidRecently', 'Paid Recently'),
      subtitle: paidRecentlySubtitle(state, now),
      icon: 'paidRecently',
    })
  } else {
    billsItems.push({
      section: 'deferred',
      title: t(language, 'nav.deferred', 'Snoozed'),
      subtitle: deferredSubtitle(state, now),
      icon: 'deferred',
    })
  }

  if (advanced) {
    billsItems.push({ section: 'goals', title: t(language, 'nav.goals', 'Goals'), subtitle: goalsSubtitle(state), icon: 'goals' })
  }

  const billsGroup: SidebarGroup = { title: t(language, 'sidebar.group.bills', 'Bills'), items: billsItems }

  const accountantItems: SidebarItem[] = []
  if (advanced) {
    accountantItems.push({
      section: 'accounts',
      title: t(language, 'nav.accounts', 'Accounts'),
      subtitle: accountsSubtitle(state),
      icon: 'accounts',
    })
  }
  accountantItems.push({
    section: 'transactions',
    title: t(language, 'nav.transactions', 'Transactions'),
    subtitle: transactionsSubtitle(state, now),
    icon: 'transactions',
  })
  if (advanced) {
    accountantItems.push({
      section: 'invoices',
      title: t(language, 'nav.files', 'Files'),
      subtitle: filesSubtitle(state),
      icon: 'invoices',
    })
    accountantItems.push({ section: 'debts', title: t(language, 'nav.debts', 'Debts'), subtitle: debtsSubtitle(state), icon: 'debts' })
  }
  accountantItems.push({ section: 'reports', title: t(language, 'nav.reports', 'Reports'), icon: 'reports' })
  const accountantGroup: SidebarGroup = { title: t(language, 'sidebar.group.accountant', 'Accountant'), items: accountantItems }

  return [
    billsGroup,
    accountantGroup,
    {
      title: t(language, 'sidebar.group.settings', 'Settings'),
      items: [{ section: 'settings', title: t(language, 'nav.settings', 'Settings'), icon: 'settings' }],
    },
  ]
}

function calendarSubtitle(state: AppState, now: Date): string {
  const start = startOfDay(now)
  const cutoff = addDays(start, 30)
  const upcomingBills = state.bills.filter((b) => {
    if (b.hiddenUntilEdited) return false
    if (billIsSnoozedActive(b, now)) return false
    if (billIsPaidFor(b, b.nextDueDate)) return false
    const due = startOfDay(b.nextDueDate)
    return due.getTime() >= start.getTime() && due.getTime() <= cutoff.getTime()
  }).length
  const upcomingIncome = state.incomes.filter((i) => {
    const d = startOfDay(i.nextPayDate)
    return d.getTime() >= start.getTime() && d.getTime() <= cutoff.getTime()
  }).length
  const total = upcomingBills + upcomingIncome
  if (total === 0) return 'No events'
  if (total === 1) return '1 event'
  return `${total} events`
}

function overviewSubtitle(state: AppState, now: Date): string {
  const today = startOfDay(now).getTime()
  const unpaid = state.bills.filter((b) => {
    if (b.hiddenUntilEdited) return false
    if (billIsSnoozedActive(b, now)) return false
    if (billIsPaidFor(b, b.nextDueDate)) return false
    return startOfDay(b.nextDueDate).getTime() <= today
  }).length
  if (unpaid === 0) return 'All paid'
  if (unpaid === 1) return '1 unpaid'
  return `${unpaid} unpaid`
}

function incomeSubtitle(state: AppState): string {
  const count = state.incomes.length
  if (count === 0) return 'No incomes'
  if (count === 1) return '1 income'
  return `${count} incomes`
}

function accountsSubtitle(state: AppState): string {
  const count = state.accounts.filter((a) => !a.archived).length
  if (count === 0) return 'No accounts'
  if (count === 1) return '1 account'
  return `${count} accounts`
}

function transactionsSubtitle(state: AppState, now: Date): string {
  const past = new Date(now)
  past.setDate(past.getDate() - 30)
  const tx = visibleTransactions(state.transactions, state.settings)
  const count = tx.filter((t) => t.date >= past).length
  if (count === 0) return 'No activity'
  if (count === 1) return '1 item'
  return `${count} items`
}

function goalsSubtitle(state: AppState): string {
  const count = state.goals.filter((g) => !g.archived).length
  if (count === 0) return 'No goals'
  if (count === 1) return '1 goal'
  return `${count} goals`
}

function debtsSubtitle(state: AppState): string {
  const count = state.debts.filter((d) => !d.archived).length
  if (count === 0) return 'No debts'
  if (count === 1) return '1 debt'
  return `${count} debts`
}

function filesSubtitle(state: AppState): string {
  const items = visibleInvoices(state.invoices, state.settings)
  const count = items.length
  if (count === 0) return 'No files'
  if (count === 1) return '1 file'
  return `${count} files`
}

function dueSoonSubtitle(state: AppState, now: Date): string {
  const start = startOfDay(now)
  const cutoff = addDays(start, 7)
  const count = state.bills.filter((b) => {
    if (b.hiddenUntilEdited) return false
    if (billIsSnoozedActive(b, now)) return false
    if (billIsPaidFor(b, b.nextDueDate)) return false
    const due = startOfDay(b.nextDueDate)
    return due.getTime() >= start.getTime() && due.getTime() <= cutoff.getTime()
  }).length
  if (count === 0) return 'All paid'
  if (count === 1) return '1 unpaid'
  return `${count} unpaid`
}

function deferredSubtitle(state: AppState, now: Date): string {
  const drafts = state.bills.filter((b) => Boolean(b.hiddenUntilEdited)).length
  const snoozed = state.bills.filter((b) => billIsSnoozedActive(b, now)).length
  if (drafts === 0 && snoozed === 0) return 'No items'
  if (drafts > 0 && snoozed > 0) return `${drafts} draft${drafts === 1 ? '' : 's'} • ${snoozed} snoozed`
  if (drafts > 0) return `${drafts} draft${drafts === 1 ? '' : 's'}`
  return `${snoozed} snoozed`
}

function paidRecentlySubtitle(state: AppState, now: Date): string {
  const past = new Date(now)
  past.setDate(past.getDate() - 30)
  const billCount = state.bills.filter((b) => (b.payments ?? []).some((p) => p.date >= past)).length
  const incomeCount = state.incomes.reduce((acc, inc) => acc + (inc.receipts ?? []).filter((r) => r.date >= past).length, 0)
  const total = billCount + incomeCount
  if (total === 0) return 'No items'
  if (total === 1) return '1 item'
  return `${total} items`
}

function dueSoonSeverity(state: AppState, now: Date): DueSeverity {
  const start = startOfDay(now)
  const cutoff = addDays(start, 7)
  const hasOverdue = state.bills.some((b) => {
    if (b.hiddenUntilEdited) return false
    if (billIsSnoozedActive(b, now)) return false
    const due = startOfDay(b.nextDueDate)
    return due.getTime() < start.getTime() && !billIsPaidFor(b, b.nextDueDate)
  })
  if (hasOverdue) return 'overdue'
  const hasSoon = state.bills.some((b) => {
    if (b.hiddenUntilEdited) return false
    if (billIsSnoozedActive(b, now)) return false
    const due = startOfDay(b.nextDueDate)
    return due.getTime() >= start.getTime() && due.getTime() <= cutoff.getTime() && !billIsPaidFor(b, b.nextDueDate)
  })
  if (hasSoon) return 'soon'
  return 'none'
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}
