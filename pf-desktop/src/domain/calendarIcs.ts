import type { Bill } from './models'
import { advanceRecurrence, billIsPaidFor, billIsSnoozedActive } from './models'
import type { AppSettings } from './settings'
import { currency } from './finance'

export function buildBillsIcs(bills: Bill[], settings: AppSettings, now: Date = new Date()): string {
  const monthsAhead = Math.max(0, settings.calendarSyncMonthsAhead ?? 0)
  const leadDays = Math.max(0, settings.calendarSyncLeadDays ?? 0)
  const end = addMonths(now, monthsAhead)

  const lines: string[] = []
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push('PRODID:-//Kivana//Bills//EN')
  lines.push('CALSCALE:GREGORIAN')

  for (const bill of bills) {
    if (bill.hiddenUntilEdited) continue
    if (billIsSnoozedActive(bill, now)) continue
    if (bill.recurrence === 'once' && (bill.payments ?? []).length > 0) continue

    let due = new Date(bill.nextDueDate)
    while (startOfDay(due).getTime() <= startOfDay(end).getTime()) {
      if (billIsPaidFor(bill, due)) {
        if (bill.recurrence === 'once') break
        due = advanceRecurrence(bill.recurrence, due)
        continue
      }

      const uid = `${bill.id}|${icsDate(due)}`
      const dtStart = icsDate(due)
      const dtEnd = icsDate(addDays(due, 1))
      const desc = `Amount: ${currency(bill.amount.value, bill.amount.currencyCode)}\\nBill ID: ${bill.id}`

      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${escapeText(uid)}`)
      lines.push(`SUMMARY:${escapeText(bill.name)}`)
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`)
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
      lines.push(`DESCRIPTION:${escapeText(desc)}`)
      if (leadDays > 0) {
        lines.push('BEGIN:VALARM')
        lines.push(`TRIGGER:-P${leadDays}D`)
        lines.push('ACTION:DISPLAY')
        lines.push(`DESCRIPTION:${escapeText(bill.name)}`)
        lines.push('END:VALARM')
      }
      lines.push('END:VEVENT')

      if (bill.recurrence === 'once') break
      due = advanceRecurrence(bill.recurrence, due)
    }
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function icsDate(date: Date): string {
  const d = startOfDay(date)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

