import type { Bill, Reminder } from '../domain/models'
import { advanceRecurrence, billIsPaidFor, billIsSnoozedActive } from '../domain/models'
import type { AppSettings } from '../domain/settings'
import { isTauriRuntime } from '../storage/tauriJsonStore'

type TimerId = number

let timers: TimerId[] = []

export function clearScheduledNotifications() {
  for (const t of timers) window.clearTimeout(t)
  timers = []
}

export async function scheduleAllNotifications(bills: Bill[], reminders: Reminder[], settings: AppSettings, now: Date = new Date()) {
  clearScheduledNotifications()
  if (!settings.enableNotifications) return
  if (!isTauriRuntime()) return

  const upcoming = computeUpcoming(bills, reminders, settings, now).slice(0, 50)
  if (upcoming.length === 0) return

  for (const item of upcoming) {
    const delay = item.fireAt.getTime() - now.getTime()
    if (delay <= 0) continue
    const id = window.setTimeout(() => {
      void sendNotification(item.title, item.body)
    }, delay)
    timers.push(id)
  }
}

async function sendNotification(title: string, body: string) {
  if (!isTauriRuntime()) return
  const mod = await import('@tauri-apps/plugin-notification')
  await mod.sendNotification({ title, body })
}

function computeUpcoming(
  bills: Bill[],
  reminders: Reminder[],
  settings: AppSettings,
  now: Date,
): Array<{ fireAt: Date; title: string; body: string }> {
  const list: Array<{ fireAt: Date; title: string; body: string }> = []
  const reminderDays = settings.reminderDays ?? 7
  const horizonEnd = addDays(now, 400)

  for (const bill of bills) {
    if (bill.hiddenUntilEdited) continue
    if (billIsSnoozedActive(bill, now)) continue
    if (billIsPaidFor(bill, bill.nextDueDate)) continue

    const due = startOfDay(bill.nextDueDate)
    let fire = addDays(due, -reminderDays)
    if (fire.getTime() < startOfDay(now).getTime()) {
      fire = due
    }
    fire.setHours(9, 0, 0, 0)
    if (fire.getTime() <= now.getTime()) continue

    list.push({
      fireAt: fire,
      title: `Bill due: ${bill.name}`,
      body: `${formatDate(bill.nextDueDate)} • ${bill.amount.currencyCode} ${bill.amount.value}`,
    })
  }

  for (const r of reminders) {
    if (!r || !r.when) continue
    if (r.recurrence === 'once' && r.completedAt) continue
    const offsets = normalizeReminderOffsets(r)
    if (offsets.length === 0) continue

    const occurrences = upcomingReminderOccurrences(r, now, horizonEnd)
    for (const occ of occurrences) {
      for (const minsBefore of offsets) {
        const fire = new Date(occ)
        if (r.allDay) fire.setHours(9, 0, 0, 0)
        fire.setMinutes(fire.getMinutes() - minsBefore)
        if (fire.getTime() <= now.getTime()) continue
        list.push({
          fireAt: fire,
          title: r.title ? r.title : 'Reminder',
          body: formatDate(occ),
        })
      }
    }
  }

  return list.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
}

function normalizeReminderOffsets(r: Reminder): number[] {
  const listRaw = r.remindMinutesBeforeList
  if (Array.isArray(listRaw) && listRaw.length > 0) {
    const clean = listRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0)
    return Array.from(new Set(clean)).sort((a, b) => a - b)
  }
  const single = r.remindMinutesBefore == null ? null : Number(r.remindMinutesBefore)
  if (single == null || !Number.isFinite(single) || single < 0) return []
  return [single]
}

function upcomingReminderOccurrences(r: Reminder, now: Date, end: Date): Date[] {
  const out: Date[] = []
  const start = startOfDay(now)
  const endDay = startOfDay(end)

  let cursor = new Date(r.when)
  if (r.allDay) cursor = startOfDay(cursor)
  if (r.recurrence !== 'once') {
    let guardrail = 0
    while (cursor.getTime() < start.getTime() && guardrail < 1000) {
      const next = advanceRecurrence(r.recurrence, cursor)
      if (next.getTime() === cursor.getTime()) break
      cursor = r.allDay ? startOfDay(next) : next
      guardrail += 1
    }
    guardrail = 0
    while (cursor.getTime() <= endDay.getTime() && guardrail < 200) {
      out.push(new Date(cursor))
      const next = advanceRecurrence(r.recurrence, cursor)
      if (next.getTime() === cursor.getTime()) break
      cursor = r.allDay ? startOfDay(next) : next
      guardrail += 1
    }
    return out
  }

  if (cursor.getTime() >= start.getTime() && cursor.getTime() <= endDay.getTime()) out.push(cursor)
  return out
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

function formatDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(d)
  } catch {
    return d.toDateString()
  }
}
