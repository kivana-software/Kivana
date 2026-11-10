import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AppStoreContext, type AppAction, type AppState, type AppStore, type Section } from './appStore'
import { defaultSettings } from '../domain/settings'
import type { LoadedDatasets } from '../storage/localJsonStore'
import {
  loadAllFromLocalStorage,
  loadTransactionsForPersonFromLocalStorage,
  saveAllToLocalStorage,
  saveTransactionsForPersonToLocalStorage,
} from '../storage/localJsonStore'
import {
  isTauriRuntime,
  loadAllFromTauriFiles,
  loadTransactionsForPersonFromTauriFiles,
  saveAllToTauriFiles,
  saveTransactionsForPersonToTauriFiles,
} from '../storage/tauriJsonStore'
import {
  advanceRecurrence,
  billClearSnooze,
  billMarkPaid,
  billSetSnooze,
  incomeLogReceipt,
  processAutoPayments,
  startOfDay,
} from '../domain/models'
import type { Bill, Goal, Reminder, Transaction } from '../domain/models'
import { scheduleAllNotifications } from '../notifications/notificationScheduler'
import { applyAutostart } from '../desktop/autostart'
import { loadPreferredDisplayCurrencyCode, savePreferredDisplayCurrencyCode } from '../storage/userPrefs'
import { assignMissingInvoicePersonIds, normalizePeopleSettings, withActivePersonCount } from '../domain/people'

const ONBOARDING_KEY = 'Kivana/didCompleteOnboarding'

function loadOnboardingFlag(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true'
  } catch {
    return false
  }
}

function saveOnboardingFlag(v: boolean): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, v ? 'true' : 'false')
  } catch {
  }
}

function seedUkComplianceReminders(params: { now: Date; personId: string | null }): Reminder[] {
  const { now, personId } = params
  const createdAt = now
  const remindMinutesBeforeList = [43200, 20160, 10080, 1440]

  const jan31 = nextAnnualDate({ monthIndex: 0, dayOfMonth: 31, now })
  const jul31 = nextAnnualDate({ monthIndex: 6, dayOfMonth: 31, now })
  const apr5 = nextAnnualDate({ monthIndex: 3, dayOfMonth: 5, now })

  return [
    {
      id: crypto.randomUUID(),
      title: 'Tax return & payment deadline',
      when: jan31,
      allDay: true,
      recurrence: 'yearly',
      priority: 'critical',
      notes: 'Submit your Self Assessment tax return and pay any tax owed. Missing this results in penalties.',
      remindMinutesBefore: null,
      remindMinutesBeforeList,
      completedAt: null,
      personId,
      createdAt,
    },
    {
      id: crypto.randomUUID(),
      title: 'Second tax payment (payment on account)',
      when: jul31,
      allDay: true,
      recurrence: 'yearly',
      priority: 'high',
      notes: 'Second advance payment towards next year’s tax bill. Amount is usually based on previous year.',
      remindMinutesBefore: null,
      remindMinutesBeforeList,
      completedAt: null,
      personId,
      createdAt,
    },
    {
      id: crypto.randomUUID(),
      title: 'End of tax year',
      when: apr5,
      allDay: true,
      recurrence: 'yearly',
      priority: 'medium',
      notes: 'Last day of the UK tax year. Income after this date counts toward the next tax year.',
      remindMinutesBefore: null,
      remindMinutesBeforeList,
      completedAt: null,
      personId,
      createdAt,
    },
  ]
}

function nextAnnualDate(params: { monthIndex: number; dayOfMonth: number; now: Date }): Date {
  const { monthIndex, dayOfMonth, now } = params
  const today = startOfDay(now).getTime()
  const y = now.getFullYear()
  const d = new Date(y, monthIndex, dayOfMonth, 0, 0, 0, 0)
  if (startOfDay(d).getTime() <= today) d.setFullYear(y + 1)
  return d
}

function seedNorwayComplianceReminders(params: { now: Date; personId: string | null }): Reminder[] {
  const { now, personId } = params
  const createdAt = now
  const remindMinutesBeforeList = [43200, 20160, 10080, 1440]

  const apr30 = nextAnnualDate({ monthIndex: 3, dayOfMonth: 30, now })
  const mar15 = nextAnnualDate({ monthIndex: 2, dayOfMonth: 15, now })
  const jun15 = nextAnnualDate({ monthIndex: 5, dayOfMonth: 15, now })
  const sep15 = nextAnnualDate({ monthIndex: 8, dayOfMonth: 15, now })
  const dec15 = nextAnnualDate({ monthIndex: 11, dayOfMonth: 15, now })
  const may31 = nextAnnualDate({ monthIndex: 4, dayOfMonth: 31, now })

  return [
    {
      id: crypto.randomUUID(),
      title: 'Tax return deadline (Skattemelding)',
      when: apr30,
      allDay: true,
      recurrence: 'yearly',
      priority: 'critical',
      notes: 'Deadline to submit your Norwegian tax return (Skattemelding).',
      remindMinutesBefore: null,
      remindMinutesBeforeList,
      completedAt: null,
      personId,
      createdAt,
    },
    {
      id: crypto.randomUUID(),
      title: 'Advance tax instalment (Forskuddsskatt): 15 March',
      when: mar15,
      allDay: true,
      recurrence: 'yearly',
      priority: 'high',
      notes: 'Common due date for advance tax (forskuddsskatt) when you pay tax yourself (e.g. self-employed).',
      remindMinutesBefore: null,
      remindMinutesBeforeList,
      completedAt: null,
      personId,
      createdAt,
    },
    {
      id: crypto.randomUUID(),
      title: 'Advance tax instalment (Forskuddsskatt): 15 June',
      when: jun15,
      allDay: true,
      recurrence: 'yearly',
      priority: 'high',
      notes: 'Common due date for advance tax (forskuddsskatt) when you pay tax yourself (e.g. self-employed).',
      remindMinutesBefore: null,
      remindMinutesBeforeList,
      completedAt: null,
      personId,
      createdAt,
    },
    {
      id: crypto.randomUUID(),
      title: 'Advance tax instalment (Forskuddsskatt): 15 September',
      when: sep15,
      allDay: true,
      recurrence: 'yearly',
      priority: 'high',
      notes: 'Common due date for advance tax (forskuddsskatt) when you pay tax yourself (e.g. self-employed).',
      remindMinutesBefore: null,
      remindMinutesBeforeList,
      completedAt: null,
      personId,
      createdAt,
    },
    {
      id: crypto.randomUUID(),
      title: 'Advance tax instalment (Forskuddsskatt): 15 December',
      when: dec15,
      allDay: true,
      recurrence: 'yearly',
      priority: 'high',
      notes: 'Common due date for advance tax (forskuddsskatt) when you pay tax yourself (e.g. self-employed).',
      remindMinutesBefore: null,
      remindMinutesBeforeList,
      completedAt: null,
      personId,
      createdAt,
    },
    {
      id: crypto.randomUUID(),
      title: 'Optional: extra tax payment to reduce interest',
      when: may31,
      allDay: true,
      recurrence: 'yearly',
      priority: 'medium',
      notes: 'If you expect underpaid tax, an additional payment before 31 May can reduce interest.',
      remindMinutesBefore: null,
      remindMinutesBeforeList,
      completedAt: null,
      personId,
      createdAt,
    },
  ]
}

const UK_COMPLIANCE_TITLES = [
  'Tax return & payment deadline',
  'Second tax payment (payment on account)',
  'End of tax year',
]
const NO_COMPLIANCE_TITLES = [
  'Tax return deadline (Skattemelding)',
  'Advance tax instalment (Forskuddsskatt): 15 March',
  'Advance tax instalment (Forskuddsskatt): 15 June',
  'Advance tax instalment (Forskuddsskatt): 15 September',
  'Advance tax instalment (Forskuddsskatt): 15 December',
  'Optional: extra tax payment to reduce interest',
]

function applyJurisdictionComplianceReminders(params: {
  reminders: Reminder[]
  jurisdiction: 'UK' | 'NO'
  now: Date
  personId: string | null
}): Reminder[] {
  const { reminders, jurisdiction, now, personId } = params
  const remove = new Set([...UK_COMPLIANCE_TITLES, ...NO_COMPLIANCE_TITLES].map((t) => normalizeTitle(t)))
  const stripped = reminders.filter((r) => !remove.has(normalizeTitle(r.title)))
  const additions =
    jurisdiction === 'UK' ? seedUkComplianceReminders({ now, personId }) : seedNorwayComplianceReminders({ now, personId })
  return mergeSeededReminders(stripped, additions)
}

const UK_HOLIDAY_NOTE = 'UK bank holiday.'
const NO_HOLIDAY_NOTE = 'Norway public holiday.'

function seedUkBankHolidayReminders(params: { now: Date; yearsAhead: number }): Reminder[] {
  const { now, yearsAhead } = params
  const createdAt = now
  const startYear = now.getFullYear()
  const out: Reminder[] = []
  for (let y = startYear; y <= startYear + Math.max(0, yearsAhead); y += 1) {
    for (const h of ukBankHolidaysEnglandWales(y)) {
      out.push({
        id: crypto.randomUUID(),
        title: h.title,
        when: startOfDay(h.when),
        allDay: true,
        recurrence: 'once',
        priority: 'low',
        notes: UK_HOLIDAY_NOTE,
        remindMinutesBefore: null,
        remindMinutesBeforeList: null,
        completedAt: null,
        personId: null,
        createdAt,
      })
    }
  }
  return out
}

function seedNorwayPublicHolidayReminders(params: { now: Date; yearsAhead: number }): Reminder[] {
  const { now, yearsAhead } = params
  const createdAt = now
  const startYear = now.getFullYear()
  const out: Reminder[] = []
  for (let y = startYear; y <= startYear + Math.max(0, yearsAhead); y += 1) {
    for (const h of norwayPublicHolidays(y)) {
      out.push({
        id: crypto.randomUUID(),
        title: h.title,
        when: startOfDay(h.when),
        allDay: true,
        recurrence: 'once',
        priority: 'low',
        notes: NO_HOLIDAY_NOTE,
        remindMinutesBefore: null,
        remindMinutesBeforeList: null,
        completedAt: null,
        personId: null,
        createdAt,
      })
    }
  }
  return out
}

function applyJurisdictionHolidayReminders(params: {
  reminders: Reminder[]
  jurisdiction: 'UK' | 'NO'
  now: Date
  yearsAhead: number
}): Reminder[] {
  const { reminders, jurisdiction, now, yearsAhead } = params
  const stripped = reminders.filter((r) => r.notes !== UK_HOLIDAY_NOTE && r.notes !== NO_HOLIDAY_NOTE)
  if (jurisdiction === 'UK') return mergeSeededReminders(stripped, seedUkBankHolidayReminders({ now, yearsAhead }))
  if (jurisdiction === 'NO') return mergeSeededReminders(stripped, seedNorwayPublicHolidayReminders({ now, yearsAhead }))
  return reminders
}

function ukBankHolidaysEnglandWales(year: number): Array<{ title: string; when: Date }> {
  const out: Array<{ title: string; when: Date }> = []
  out.push({ title: "Bank Holiday: New Year's Day", when: observedNewYearsDay(year) })

  const easter = easterSunday(year)
  out.push({ title: 'Bank Holiday: Good Friday', when: addDaysLocal(easter, -2) })
  out.push({ title: 'Bank Holiday: Easter Monday', when: addDaysLocal(easter, 1) })

  out.push({ title: 'Bank Holiday: Early May', when: firstMondayOfMonth(year, 4) })
  out.push({ title: 'Bank Holiday: Spring', when: lastMondayOfMonth(year, 4) })
  out.push({ title: 'Bank Holiday: Summer', when: lastMondayOfMonth(year, 7) })

  const xmas = observedChristmasAndBoxing(year)
  out.push({ title: 'Bank Holiday: Christmas Day', when: xmas.christmas })
  out.push({ title: 'Bank Holiday: Boxing Day', when: xmas.boxing })
  return out
}

function norwayPublicHolidays(year: number): Array<{ title: string; when: Date }> {
  const out: Array<{ title: string; when: Date }> = []
  out.push({ title: "Public Holiday: New Year's Day", when: new Date(year, 0, 1, 0, 0, 0, 0) })
  out.push({ title: 'Public Holiday: Labour Day (1 May)', when: new Date(year, 4, 1, 0, 0, 0, 0) })
  out.push({ title: 'Public Holiday: Constitution Day (17 May)', when: new Date(year, 4, 17, 0, 0, 0, 0) })

  const easter = easterSunday(year)
  out.push({ title: 'Public Holiday: Maundy Thursday', when: addDaysLocal(easter, -3) })
  out.push({ title: 'Public Holiday: Good Friday', when: addDaysLocal(easter, -2) })
  out.push({ title: 'Public Holiday: Easter Sunday', when: addDaysLocal(easter, 0) })
  out.push({ title: 'Public Holiday: Easter Monday', when: addDaysLocal(easter, 1) })
  out.push({ title: 'Public Holiday: Ascension Day', when: addDaysLocal(easter, 39) })
  out.push({ title: 'Public Holiday: Whit Sunday (Pentecost)', when: addDaysLocal(easter, 49) })
  out.push({ title: 'Public Holiday: Whit Monday', when: addDaysLocal(easter, 50) })

  out.push({ title: 'Public Holiday: Christmas Day', when: new Date(year, 11, 25, 0, 0, 0, 0) })
  out.push({ title: 'Public Holiday: Second Day of Christmas', when: new Date(year, 11, 26, 0, 0, 0, 0) })
  return out
}

function observedNewYearsDay(year: number): Date {
  const d = new Date(year, 0, 1, 0, 0, 0, 0)
  const dow = d.getDay()
  if (dow === 6) return new Date(year, 0, 3, 0, 0, 0, 0)
  if (dow === 0) return new Date(year, 0, 2, 0, 0, 0, 0)
  return d
}

function observedChristmasAndBoxing(year: number): { christmas: Date; boxing: Date } {
  const xmas = new Date(year, 11, 25, 0, 0, 0, 0)
  const dow = xmas.getDay()
  if (dow === 6) {
    return { christmas: new Date(year, 11, 27, 0, 0, 0, 0), boxing: new Date(year, 11, 28, 0, 0, 0, 0) }
  }
  if (dow === 0) {
    return { christmas: new Date(year, 11, 27, 0, 0, 0, 0), boxing: new Date(year, 11, 26, 0, 0, 0, 0) }
  }
  if (dow === 5) {
    return { christmas: xmas, boxing: new Date(year, 11, 28, 0, 0, 0, 0) }
  }
  return { christmas: xmas, boxing: new Date(year, 11, 26, 0, 0, 0, 0) }
}

function firstMondayOfMonth(year: number, monthIndex: number): Date {
  const d = new Date(year, monthIndex, 1, 0, 0, 0, 0)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  return d
}

function lastMondayOfMonth(year: number, monthIndex: number): Date {
  const d = new Date(year, monthIndex + 1, 0, 0, 0, 0, 0)
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1)
  return d
}

function addDaysLocal(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function mergeSeededReminders(existing: Reminder[], additions: Reminder[]): Reminder[] {
  const keys = new Set(existing.map((r) => `${normalizeTitle(r.title)}|${dayKey(r.when)}`))
  const merged = [...existing]
  for (const r of additions) {
    const k = `${normalizeTitle(r.title)}|${dayKey(r.when)}`
    if (keys.has(k)) continue
    merged.push(r)
    keys.add(k)
  }
  return merged
}

function normalizeTitle(s: string): string {
  return String(s ?? '').trim().toLowerCase()
}

function dayKey(d: Date): string {
  const x = startOfDay(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function initialUI(): AppState['ui'] {
  return {
    section: 'dashboard',
    didCompleteOnboarding: loadOnboardingFlag(),
    selectedBillId: null,
    selectedIncomeId: null,
    selectedAccountId: null,
    selectedTransactionId: null,
    selectedGoalId: null,
    selectedDebtId: null,
  }
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function advanceMonthlySameDay(from: Date): Date {
  const y = from.getFullYear()
  const m = from.getMonth()
  const day = from.getDate()
  const nextM = m + 1
  const y2 = y + Math.floor(nextM / 12)
  const m2 = ((nextM % 12) + 12) % 12
  const maxDay = daysInMonth(y2, m2)
  return new Date(y2, m2, Math.min(day, maxDay), 0, 0, 0, 0)
}

function applyGoalMonthlyAutoAdd(goals: Goal[], now: Date): Goal[] {
  const today = startOfDay(now).getTime()
  let changed = false

  const out = goals.map((g) => {
    const amt = g.autoMonthlyAmount
    const nextRaw = g.autoMonthlyNextDate
    if (!amt || !nextRaw) return g
    if (!Number.isFinite(amt.value) || amt.value <= 0) return g
    if (amt.currencyCode !== g.savedAmount.currencyCode) return g

    let next = startOfDay(nextRaw)
    if (next.getTime() > today) return g

    let saved = g.savedAmount.value
    while (next.getTime() <= today) {
      saved += amt.value
      next = advanceMonthlySameDay(next)
    }
    changed = true
    return { ...g, savedAmount: { ...g.savedAmount, value: saved }, autoMonthlyNextDate: next }
  })

  return changed ? out : goals
}

function reducer(state: AppState, action: AppAction): AppState {
  const now = new Date()
  if (action.type !== 'data/replaceAll') {
    const nextGoals = applyGoalMonthlyAutoAdd(state.goals, now)
    if (nextGoals !== state.goals) state = { ...state, goals: nextGoals }
  }
  switch (action.type) {
    case 'ui/setSection':
      return { ...state, ui: { ...state.ui, section: action.section } }
    case 'ui/completeOnboarding':
      return { ...state, ui: { ...state.ui, didCompleteOnboarding: true } }
    case 'ui/selectBill':
      return { ...state, ui: { ...state.ui, selectedBillId: action.id } }
    case 'ui/selectIncome':
      return { ...state, ui: { ...state.ui, selectedIncomeId: action.id } }
    case 'ui/selectAccount':
      return { ...state, ui: { ...state.ui, selectedAccountId: action.id } }
    case 'ui/selectTransaction':
      return { ...state, ui: { ...state.ui, selectedTransactionId: action.id } }
    case 'ui/selectGoal':
      return { ...state, ui: { ...state.ui, selectedGoalId: action.id } }
    case 'ui/selectDebt':
      return { ...state, ui: { ...state.ui, selectedDebtId: action.id } }
    case 'data/replaceAll': {
      const next = {
        ...action.data,
        settings: withActivePersonCount(normalizePeopleSettings(action.data.settings), action.data.transactions.length),
        invoices: assignMissingInvoicePersonIds(action.data.invoices, action.data.settings),
      }
      const personId = next.settings.peopleEnabled ? next.settings.activePersonId : null
      const remindersAfterCompliance = applyJurisdictionComplianceReminders({
        reminders: next.reminders ?? [],
        jurisdiction: next.settings.defaultJurisdiction,
        now,
        personId,
      })
      const reminders = applyJurisdictionHolidayReminders({
        reminders: remindersAfterCompliance,
        jurisdiction: next.settings.defaultJurisdiction,
        now,
        yearsAhead: 5,
      })
      return { ...next, reminders, goals: applyGoalMonthlyAutoAdd(next.goals, now), ui: state.ui }
    }
    case 'settings/update': {
      const nextSettings = normalizePeopleSettings({ ...state.settings, ...action.patch } as any)
      const nextActive = action.patch.activePersonId
      const didSwitchActive = typeof nextActive === 'string' && nextActive.length > 0 && nextActive !== state.settings.activePersonId
      const enabledBefore = Boolean(state.settings.peopleEnabled)
      const enabledAfter = Boolean(nextSettings.peopleEnabled)
      const didChangeJurisdiction =
        (action.patch as any).defaultJurisdiction === 'UK' || (action.patch as any).defaultJurisdiction === 'NO'
          ? (action.patch as any).defaultJurisdiction !== state.settings.defaultJurisdiction
          : false
      const nextReminders = (() => {
        if (!didChangeJurisdiction) return state.reminders
        const personId = nextSettings.peopleEnabled ? nextSettings.activePersonId : null
        const afterCompliance = applyJurisdictionComplianceReminders({
          reminders: state.reminders ?? [],
          jurisdiction: nextSettings.defaultJurisdiction,
          now,
          personId,
        })
        return applyJurisdictionHolidayReminders({ reminders: afterCompliance, jurisdiction: nextSettings.defaultJurisdiction, now, yearsAhead: 5 })
      })()
      if (enabledBefore && enabledAfter && didSwitchActive) {
        const nextCounts = {
          ...nextSettings.peopleTransactionCounts,
          [state.settings.activePersonId]: state.transactions.length,
        }
        return {
          ...state,
          settings: { ...nextSettings, peopleTransactionCounts: nextCounts },
          reminders: nextReminders,
          transactions: [],
          ui: { ...state.ui, selectedTransactionId: null },
        }
      }
      if (!enabledBefore && enabledAfter) {
        return {
          ...state,
          settings: withActivePersonCount(nextSettings, state.transactions.length),
          invoices: assignMissingInvoicePersonIds(state.invoices, nextSettings),
          reminders: nextReminders,
        }
      }
      return { ...state, settings: withActivePersonCount(nextSettings, state.transactions.length), reminders: nextReminders }
    }
    case 'bills/add':
      return {
        ...state,
        bills: [...state.bills, action.bill],
        ui: { ...state.ui, selectedBillId: action.bill.id },
      }
    case 'bills/update':
      return {
        ...state,
        bills: state.bills.map((b) => (b.id === action.bill.id ? action.bill : b)),
        ui: { ...state.ui, selectedBillId: action.bill.id },
      }
    case 'bills/bulkUpdate': {
      if (action.bills.length === 0) return state
      const byId = new Map<string, Bill>()
      for (const b of action.bills) byId.set(b.id, b)
      return { ...state, bills: state.bills.map((b) => byId.get(b.id) ?? b) }
    }
    case 'bills/delete': {
      const nextBills = state.bills.filter((b) => b.id !== action.id)
      const nextSelected = state.ui.selectedBillId === action.id ? null : state.ui.selectedBillId
      return { ...state, bills: nextBills, ui: { ...state.ui, selectedBillId: nextSelected } }
    }
    case 'bills/bulkDelete': {
      if (action.ids.length === 0) return state
      const remove = new Set<string>(action.ids)
      const nextBills = state.bills.filter((b) => !remove.has(b.id))
      const nextSelected = state.ui.selectedBillId && remove.has(state.ui.selectedBillId) ? null : state.ui.selectedBillId
      return { ...state, bills: nextBills, ui: { ...state.ui, selectedBillId: nextSelected } }
    }
    case 'bills/logPayment': {
      const idx = state.bills.findIndex((b) => b.id === action.id)
      if (idx < 0) return state
      const b = state.bills[idx]
      const paidOn = action.date ?? b.nextDueDate
      const target = startOfDay(b.nextDueDate)
      const payDay = startOfDay(paidOn)
      let effectivePaidOn = paidOn
      if (b.recurrence !== 'once') {
        const prevDue = startOfDay(advanceRecurrence(b.recurrence, b.nextDueDate, -1))
        if (payDay.getTime() <= prevDue.getTime()) return state
        if (payDay.getTime() > target.getTime()) effectivePaidOn = b.nextDueDate
      }

      const updated = billMarkPaid(b, effectivePaidOn)
      const nextBills = [...state.bills]
      nextBills[idx] = updated
      const didAddPayment = updated.payments.length > b.payments.length
      if (!didAddPayment) return { ...state, bills: nextBills, ui: { ...state.ui, selectedBillId: null } }

      const tx: Transaction = {
        id: crypto.randomUUID(),
        kind: 'expense',
        date: effectivePaidOn,
        amount: { currencyCode: b.amount.currencyCode, value: Math.abs(b.amount.value) },
        personId: state.settings.peopleEnabled ? state.settings.activePersonId : null,
        accountId: state.accounts.find((a) => !a.archived)?.id ?? null,
        toAccountId: null,
        category: 'other',
        customCategoryName: null,
        payee: b.name,
        notes: null,
        tags: ['bill'],
        relatedBillId: b.id,
        relatedIncomeId: null,
      }

      const nextUI: AppState['ui'] =
        state.ui.section === 'bills'
          ? { ...state.ui, section: 'transactions', selectedBillId: null, selectedTransactionId: tx.id }
          : { ...state.ui, selectedBillId: null, selectedTransactionId: tx.id }

      return { ...state, bills: nextBills, transactions: [...state.transactions, tx], ui: nextUI }
    }
    case 'bills/logPaymentFromTransaction': {
      const billIdx = state.bills.findIndex((b) => b.id === action.billId)
      if (billIdx < 0) return state
      const txIdx = state.transactions.findIndex((t) => t.id === action.transactionId)
      if (txIdx < 0) return state
      const b = state.bills[billIdx]
      const t = state.transactions[txIdx]
      if (!t || t.kind !== 'expense') return state
      if (t.relatedBillId || t.relatedIncomeId) return state

      const paidOn = t.date
      const target = startOfDay(b.nextDueDate)
      const payDay = startOfDay(paidOn)
      let effectivePaidOn = paidOn
      if (b.recurrence !== 'once') {
        const prevDue = startOfDay(advanceRecurrence(b.recurrence, b.nextDueDate, -1))
        if (payDay.getTime() <= prevDue.getTime()) return state
        if (payDay.getTime() > target.getTime()) effectivePaidOn = b.nextDueDate
      }

      const updated = billMarkPaid(b, effectivePaidOn)
      const nextBills = [...state.bills]
      nextBills[billIdx] = updated

      const nextTx: Transaction = {
        ...t,
        relatedBillId: b.id,
        tags: Array.from(new Set([...(t.tags ?? []), 'bill'])),
      }
      const nextTransactions = [...state.transactions]
      nextTransactions[txIdx] = nextTx

      return { ...state, bills: nextBills, transactions: nextTransactions, ui: { ...state.ui, selectedBillId: null } }
    }
    case 'bills/skip': {
      const idx = state.bills.findIndex((b) => b.id === action.id)
      if (idx < 0) return state
      const b = state.bills[idx]
      const nextBills = [...state.bills]
      nextBills[idx] = { ...b, nextDueDate: advanceRecurrence(b.recurrence, b.nextDueDate) }
      return { ...state, bills: nextBills }
    }
    case 'bills/setSnooze': {
      const idx = state.bills.findIndex((b) => b.id === action.id)
      if (idx < 0) return state
      const b = state.bills[idx]
      const updated = billSetSnooze(b, action.until)
      const nextBills = [...state.bills]
      nextBills[idx] = updated
      return { ...state, bills: nextBills, ui: { ...state.ui, selectedBillId: updated.id } }
    }
    case 'bills/clearSnooze': {
      const idx = state.bills.findIndex((b) => b.id === action.id)
      if (idx < 0) return state
      const b = state.bills[idx]
      const updated = billClearSnooze(b)
      const nextBills = [...state.bills]
      nextBills[idx] = updated
      return { ...state, bills: nextBills, ui: { ...state.ui, selectedBillId: updated.id } }
    }
    case 'bills/deletePayment': {
      const idx = state.bills.findIndex((b) => b.id === action.id)
      if (idx < 0) return state
      const b = state.bills[idx]
      const nextBills = [...state.bills]
      nextBills[idx] = { ...b, payments: b.payments.filter((p) => p.id !== action.paymentId) }
      return { ...state, bills: nextBills, ui: { ...state.ui, selectedBillId: b.id } }
    }
    case 'incomes/add':
      return {
        ...state,
        incomes: [...state.incomes, action.income],
        ui: { ...state.ui, selectedIncomeId: action.income.id },
      }
    case 'incomes/update':
      return {
        ...state,
        incomes: state.incomes.map((i) => (i.id === action.income.id ? action.income : i)),
        ui: { ...state.ui, selectedIncomeId: action.income.id },
      }
    case 'incomes/delete': {
      const next = state.incomes.filter((i) => i.id !== action.id)
      const sel = state.ui.selectedIncomeId === action.id ? null : state.ui.selectedIncomeId
      return { ...state, incomes: next, ui: { ...state.ui, selectedIncomeId: sel } }
    }
    case 'incomes/logReceipt': {
      const idx = state.incomes.findIndex((i) => i.id === action.id)
      if (idx < 0) return state
      const inc = state.incomes[idx]
      const receivedOn = action.date ?? new Date()
      const updated = incomeLogReceipt(inc, receivedOn)
      const nextIncomes = [...state.incomes]
      nextIncomes[idx] = updated
      const didAddReceipt = updated.receipts.length > inc.receipts.length
      if (!didAddReceipt) return { ...state, incomes: nextIncomes, ui: { ...state.ui, selectedIncomeId: updated.id } }

      const tx: Transaction = {
        id: crypto.randomUUID(),
        kind: 'income',
        date: receivedOn,
        amount: { currencyCode: inc.amount.currencyCode, value: Math.abs(inc.amount.value) },
        personId: state.settings.peopleEnabled ? state.settings.activePersonId : null,
        accountId: state.accounts.find((a) => !a.archived)?.id ?? null,
        toAccountId: null,
        category: null,
        customCategoryName: null,
        payee: inc.name,
        notes: null,
        tags: ['income'],
        relatedBillId: null,
        relatedIncomeId: inc.id,
      }

      const nextUI: AppState['ui'] =
        state.ui.section === 'income'
          ? { ...state.ui, section: 'transactions', selectedIncomeId: updated.id, selectedTransactionId: tx.id }
          : { ...state.ui, selectedIncomeId: updated.id, selectedTransactionId: tx.id }

      return { ...state, incomes: nextIncomes, transactions: [...state.transactions, tx], ui: nextUI }
    }
    case 'incomes/logReceiptFromTransaction': {
      const incIdx = state.incomes.findIndex((i) => i.id === action.incomeId)
      if (incIdx < 0) return state
      const txIdx = state.transactions.findIndex((t) => t.id === action.transactionId)
      if (txIdx < 0) return state
      const inc = state.incomes[incIdx]
      const t = state.transactions[txIdx]
      if (!t || t.kind !== 'income') return state
      if (t.relatedBillId || t.relatedIncomeId) return state

      const receivedOn = t.date
      const updated = incomeLogReceipt(inc, receivedOn)
      const nextIncomes = [...state.incomes]
      nextIncomes[incIdx] = updated

      const nextTx: Transaction = {
        ...t,
        relatedIncomeId: inc.id,
        tags: Array.from(new Set([...(t.tags ?? []), 'income'])),
      }
      const nextTransactions = [...state.transactions]
      nextTransactions[txIdx] = nextTx

      return { ...state, incomes: nextIncomes, transactions: nextTransactions, ui: { ...state.ui, selectedIncomeId: null } }
    }
    case 'incomes/skip': {
      const idx = state.incomes.findIndex((i) => i.id === action.id)
      if (idx < 0) return state
      const inc = state.incomes[idx]
      const nextIncomes = [...state.incomes]
      nextIncomes[idx] = { ...inc, nextPayDate: advanceRecurrence(inc.recurrence, inc.nextPayDate) }
      return { ...state, incomes: nextIncomes, ui: { ...state.ui, selectedIncomeId: inc.id } }
    }
    case 'accounts/add':
      return {
        ...state,
        accounts: [...state.accounts, action.account],
        ui: { ...state.ui, selectedAccountId: action.account.id },
      }
    case 'accounts/update':
      return {
        ...state,
        accounts: state.accounts.map((a) => (a.id === action.account.id ? action.account : a)),
        ui: { ...state.ui, selectedAccountId: action.account.id },
      }
    case 'accounts/delete': {
      const nextAccounts = state.accounts.filter((a) => a.id !== action.id)
      const nextSelected = state.ui.selectedAccountId === action.id ? null : state.ui.selectedAccountId
      const nextTransactions = state.transactions.map((t) => {
        if (t.accountId === action.id) return { ...t, accountId: null }
        if (t.toAccountId === action.id) return { ...t, toAccountId: null }
        return t
      })
      return { ...state, accounts: nextAccounts, transactions: nextTransactions, ui: { ...state.ui, selectedAccountId: nextSelected } }
    }
    case 'transactions/add':
      return (() => {
        const tx =
          state.settings.peopleEnabled && !action.transaction.personId
            ? { ...action.transaction, personId: state.settings.activePersonId }
            : action.transaction
        if (state.transactions.some((t) => t.id === tx.id)) {
          return { ...state, ui: { ...state.ui, selectedTransactionId: tx.id } }
        }
        const nextTransactions = [...state.transactions, tx]
        return {
          ...state,
          settings: withActivePersonCount(state.settings, nextTransactions.length),
          transactions: nextTransactions,
          ui: { ...state.ui, selectedTransactionId: tx.id },
        }
      })()
    case 'transactions/update':
      return {
        ...state,
        transactions: state.transactions.map((t) => (t.id === action.transaction.id ? action.transaction : t)),
        ui: { ...state.ui, selectedTransactionId: action.transaction.id },
      }
    case 'transactions/bulkUpdate': {
      if (action.transactions.length === 0) return state
      const byId = new Map<string, Transaction>()
      for (const t of action.transactions) byId.set(t.id, t)
      return {
        ...state,
        transactions: state.transactions.map((t) => byId.get(t.id) ?? t),
      }
    }
    case 'transactions/replaceLoaded':
      return {
        ...state,
        settings: withActivePersonCount(state.settings, action.transactions.length),
        transactions: action.transactions,
        ui: { ...state.ui, selectedTransactionId: null },
      }
    case 'transactions/delete': {
      const next = state.transactions.filter((t) => t.id !== action.id)
      const sel = state.ui.selectedTransactionId === action.id ? null : state.ui.selectedTransactionId
      return { ...state, settings: withActivePersonCount(state.settings, next.length), transactions: next, ui: { ...state.ui, selectedTransactionId: sel } }
    }
    case 'transactions/bulkDelete': {
      if (action.ids.length === 0) return state
      const remove = new Set<string>(action.ids)
      const next = state.transactions.filter((t) => !remove.has(t.id))
      const sel = state.ui.selectedTransactionId && remove.has(state.ui.selectedTransactionId) ? null : state.ui.selectedTransactionId
      return { ...state, settings: withActivePersonCount(state.settings, next.length), transactions: next, ui: { ...state.ui, selectedTransactionId: sel } }
    }
    case 'transactions/clearAll':
      return {
        ...state,
        settings: withActivePersonCount(state.settings, 0),
        transactions: [],
        ui: { ...state.ui, selectedTransactionId: null },
      }
    case 'reminders/add':
      return { ...state, reminders: [...state.reminders, action.reminder] }
    case 'reminders/update':
      return { ...state, reminders: state.reminders.map((r) => (r.id === action.reminder.id ? action.reminder : r)) }
    case 'reminders/delete':
      return { ...state, reminders: state.reminders.filter((r) => r.id !== action.id) }
    case 'reminders/toggleComplete': {
      const now = new Date()
      return {
        ...state,
        reminders: state.reminders.map((r) => {
          if (r.id !== action.id) return r
          if (!action.completed) return { ...r, completedAt: null }
          if (r.recurrence && r.recurrence !== 'once') {
            const nextWhen = advanceRecurrence(r.recurrence, r.when)
            return { ...r, when: nextWhen, completedAt: null }
          }
          return { ...r, completedAt: now }
        }),
      }
    }
    case 'invoices/add':
      return (() => {
        const order = action.invoice.order ?? Date.now()
        const inv =
          state.settings.peopleEnabled && !action.invoice.personId
            ? { ...action.invoice, personId: state.settings.activePersonId, order }
            : { ...action.invoice, order }
        return { ...state, invoices: [...state.invoices, inv] }
      })()
    case 'invoices/update':
      return { ...state, invoices: state.invoices.map((i) => (i.id === action.invoice.id ? action.invoice : i)) }
    case 'invoices/delete':
      return { ...state, invoices: state.invoices.filter((i) => i.id !== action.id) }
    case 'goals/add':
      return {
        ...state,
        goals: [...state.goals, action.goal],
        ui: { ...state.ui, selectedGoalId: action.goal.id },
      }
    case 'goals/update':
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.goal.id ? action.goal : g)),
        ui: { ...state.ui, selectedGoalId: action.goal.id },
      }
    case 'goals/delete': {
      const next = state.goals.filter((g) => g.id !== action.id)
      const sel = state.ui.selectedGoalId === action.id ? null : state.ui.selectedGoalId
      return { ...state, goals: next, ui: { ...state.ui, selectedGoalId: sel } }
    }
    case 'debts/add':
      return {
        ...state,
        debts: [...state.debts, action.debt],
        ui: { ...state.ui, selectedDebtId: action.debt.id },
      }
    case 'debts/update':
      return {
        ...state,
        debts: state.debts.map((d) => (d.id === action.debt.id ? action.debt : d)),
        ui: { ...state.ui, selectedDebtId: action.debt.id },
      }
    case 'debts/delete': {
      const next = state.debts.filter((d) => d.id !== action.id)
      const sel = state.ui.selectedDebtId === action.id ? null : state.ui.selectedDebtId
      return { ...state, debts: next, ui: { ...state.ui, selectedDebtId: sel } }
    }
  }
}

function emptyDatasets(): LoadedDatasets {
  return {
    settings: defaultSettings(),
    bills: [],
    incomes: [],
    accounts: [],
    transactions: [],
    reminders: [],
    invoices: [],
    goals: [],
    debts: [],
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [state, dispatch] = useReducer(reducer, null, () => ({ ...emptyDatasets(), ui: initialUI() }))
  const lastPersisted = useRef<string>('')
  const persistTimer = useRef<number | null>(null)
  const switchingPerson = useRef(false)
  const prevActivePersonId = useRef<string | null>(null)
  const lastStableTransactions = useRef<Transaction[]>([])
  const undoTimer = useRef<number | null>(null)
  const undoInFlightRef = useRef(false)
  const [undo, setUndo] = useState<{ message: string; run: () => void } | null>(null)

  const storageMode = useMemo(() => (isTauriRuntime() ? 'tauriFiles' : 'localStorage'), [])

  const serializeForPersist = useCallback((s: AppState) => {
    const { ui, ...datasets } = s
    return JSON.stringify(datasets)
  }, [])

  const persistNow = useCallback(async () => {
    if (!ready) return
    const fingerprint = serializeForPersist(state)
    if (fingerprint === lastPersisted.current) return
    const datasets: LoadedDatasets = {
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
    if (storageMode === 'tauriFiles') {
      await saveAllToTauriFiles(datasets)
    } else {
      saveAllToLocalStorage(datasets)
    }
    lastPersisted.current = fingerprint
  }, [ready, serializeForPersist, state, storageMode])

  useEffect(() => {
    async function load() {
      const fallback = defaultSettings()
      const preferredCurrency = loadPreferredDisplayCurrencyCode()
      if (preferredCurrency) fallback.displayCurrencyCode = preferredCurrency
      if (storageMode === 'tauriFiles') {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const msg = (await invoke('migrate_legacy_appsupport_data')) as any
          if (typeof msg === 'string' && msg.trim()) console.log(msg)
        } catch {
        }
      }
      const loaded = storageMode === 'tauriFiles' ? await loadAllFromTauriFiles(fallback) : loadAllFromLocalStorage(fallback)
      const billsAfterAuto = processAutoPayments(loaded.bills, new Date())
      let datasets: LoadedDatasets = billsAfterAuto === loaded.bills ? loaded : { ...loaded, bills: billsAfterAuto }
      const personId = datasets.settings.peopleEnabled ? datasets.settings.activePersonId : null
      const now = new Date()
      const remindersAfterCompliance = applyJurisdictionComplianceReminders({
        reminders: datasets.reminders ?? [],
        jurisdiction: datasets.settings.defaultJurisdiction,
        now,
        personId,
      })
      const reminders = applyJurisdictionHolidayReminders({
        reminders: remindersAfterCompliance,
        jurisdiction: datasets.settings.defaultJurisdiction,
        now,
        yearsAhead: 5,
      })
      datasets = { ...datasets, reminders }
      dispatch({ type: 'data/replaceAll', data: datasets })
      lastPersisted.current = JSON.stringify(datasets)
      prevActivePersonId.current = datasets.settings.activePersonId
      setReady(true)
    }
    void load()
  }, [storageMode])

  useEffect(() => {
    if (!ready) return
    if (switchingPerson.current) return
    lastStableTransactions.current = state.transactions
  }, [ready, state.transactions])

  useLayoutEffect(() => {
    if (!ready) return
    if (!state.settings.peopleEnabled) return
    const current = state.settings.activePersonId
    const previous = prevActivePersonId.current
    if (previous && previous !== current) {
      switchingPerson.current = true
    }
  }, [ready, state.settings.activePersonId, state.settings.peopleEnabled])

  useEffect(() => {
    if (!ready) return
    const current = state.settings.activePersonId
    const previous = prevActivePersonId.current
    if (!state.settings.peopleEnabled) {
      prevActivePersonId.current = current
      return
    }
    if (!previous || previous === current) {
      prevActivePersonId.current = current
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const prevStillExists = Boolean(state.settings.people.find((p) => p.id === previous))
        const oldTransactions = lastStableTransactions.current
        if (prevStillExists) {
          if (storageMode === 'tauriFiles') {
            await saveTransactionsForPersonToTauriFiles(state.settings, previous, oldTransactions)
          } else {
            saveTransactionsForPersonToLocalStorage(state.settings, previous, oldTransactions)
          }
        }
        const loaded =
          storageMode === 'tauriFiles'
            ? await loadTransactionsForPersonFromTauriFiles(state.settings, current)
            : loadTransactionsForPersonFromLocalStorage(state.settings, current)
        if (cancelled) return
        dispatch({
          type: 'settings/update',
          patch: {
            peopleTransactionCounts: {
              ...state.settings.peopleTransactionCounts,
              ...loaded.counts,
              [previous]: oldTransactions.length,
              [current]: loaded.transactions.length,
            },
          },
        })
        dispatch({ type: 'transactions/replaceLoaded', transactions: loaded.transactions })
        prevActivePersonId.current = current
        lastStableTransactions.current = loaded.transactions
      } finally {
        switchingPerson.current = false
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [
    ready,
    state.settings,
    storageMode,
  ])

  useEffect(() => {
    if (!ready) return
    saveOnboardingFlag(state.ui.didCompleteOnboarding)
  }, [ready, state.ui.didCompleteOnboarding])

  useEffect(() => {
    if (!ready) return
    savePreferredDisplayCurrencyCode(state.settings.displayCurrencyCode)
  }, [ready, state.settings.displayCurrencyCode])

  useEffect(() => {
    if (!ready) return
    void scheduleAllNotifications(state.bills, state.reminders, state.settings, new Date())
  }, [ready, state.bills, state.reminders, state.settings])

  useEffect(() => {
    if (!ready) return
    void applyAutostart(state.settings.startOnLogin)
  }, [ready, state.settings.startOnLogin])

  useEffect(() => {
    if (!ready) return
    if (switchingPerson.current) return
    if (persistTimer.current) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      void persistNow()
    }, 150)
  }, [persistNow, ready, state])

  useEffect(() => {
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current)
      if (undoTimer.current) window.clearTimeout(undoTimer.current)
    }
  }, [])

  const pushUndo = useCallback((entry: { message: string; run: () => void }) => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current)
    setUndo(entry)
    undoTimer.current = window.setTimeout(() => {
      setUndo(null)
    }, 10_000)
  }, [])

  const runUndo = useCallback(() => {
    if (!undo) return
    const fn = undo.run
    setUndo(null)
    if (undoTimer.current) window.clearTimeout(undoTimer.current)
    undoTimer.current = null
    undoInFlightRef.current = true
    try {
      fn()
    } finally {
      undoInFlightRef.current = false
    }
  }, [undo])

  const dispatchWithUndo = useCallback(
    (action: AppAction) => {
      if (!ready) {
        dispatch(action)
        return
      }
      if (undoInFlightRef.current) {
        dispatch(action)
        return
      }

      const undoEntry = (() => {
        switch (action.type) {
          case 'bills/delete': {
            const b = state.bills.find((x) => x.id === action.id)
            if (!b) return null
            return {
              message: `Deleted bill: ${b.name}`,
              run: () => dispatch({ type: 'bills/add', bill: b }),
            }
          }
          case 'bills/bulkDelete': {
            const remove = new Set<string>(action.ids)
            const removed = state.bills.filter((b) => remove.has(b.id))
            if (removed.length === 0) return null
            return {
              message: removed.length === 1 ? `Deleted draft: ${removed[0]?.name ?? '1 item'}` : `Deleted ${removed.length} drafts`,
              run: () => {
                for (const b of removed) dispatch({ type: 'bills/add', bill: b })
              },
            }
          }
          case 'bills/setSnooze': {
            const prev = state.bills.find((b) => b.id === action.id)
            if (!prev) return null
            return {
              message: `Snoozed bill: ${prev.name}`,
              run: () => dispatch({ type: 'bills/update', bill: prev }),
            }
          }
          case 'bills/clearSnooze': {
            const prev = state.bills.find((b) => b.id === action.id)
            if (!prev) return null
            return {
              message: `Unsnoozed bill: ${prev.name}`,
              run: () => dispatch({ type: 'bills/update', bill: prev }),
            }
          }
          case 'bills/bulkUpdate': {
            const ids = new Set<string>(action.bills.map((b) => b.id))
            const prev = state.bills.filter((b) => ids.has(b.id))
            if (prev.length === 0) return null
            return {
              message: prev.length === 1 ? `Reverted change: ${prev[0]?.name ?? ''}` : `Reverted ${prev.length} bills`,
              run: () => dispatch({ type: 'bills/bulkUpdate', bills: prev }),
            }
          }
          case 'incomes/delete': {
            const inc = state.incomes.find((x) => x.id === action.id)
            if (!inc) return null
            return {
              message: `Deleted income: ${inc.name}`,
              run: () => dispatch({ type: 'incomes/add', income: inc }),
            }
          }
          case 'transactions/delete': {
            const tx = state.transactions.find((x) => x.id === action.id)
            if (!tx) return null
            return {
              message: 'Deleted transaction',
              run: () => dispatch({ type: 'transactions/add', transaction: tx }),
            }
          }
          case 'transactions/bulkDelete': {
            const remove = new Set<string>(action.ids)
            const removed = state.transactions.filter((t) => remove.has(t.id))
            if (removed.length === 0) return null
            return {
              message: removed.length === 1 ? 'Deleted 1 transaction' : `Deleted ${removed.length} transactions`,
              run: () => {
                for (const t of removed) dispatch({ type: 'transactions/add', transaction: t })
              },
            }
          }
          default:
            return null
        }
      })()

      if (undoEntry) pushUndo(undoEntry)
      dispatch(action)
    },
    [pushUndo, ready, state, dispatch],
  )

  const store: AppStore = useMemo(() => ({ state, dispatch: dispatchWithUndo, persistNow }), [dispatchWithUndo, persistNow, state])

  if (!ready) return null
  return (
    <AppStoreContext.Provider value={store}>
      {children}
      {undo ? (
        <div className="undoToastWrap" role="status" aria-live="polite">
          <div className="undoToast">
            <div className="undoToastMsg">{undo.message}</div>
            <div className="undoToastActions">
              <button type="button" onClick={runUndo} className="btnPrimary">
                Undo
              </button>
              <button type="button" onClick={() => setUndo(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppStoreContext.Provider>
  )
}

export function setSection(section: Section): AppAction {
  return { type: 'ui/setSection', section }
}
