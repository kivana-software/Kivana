import { listen } from '@tauri-apps/api/event'
import type { AppState } from '../app/appStore'
import { setSection } from '../app/AppProvider'
import { isTauriRuntime } from '../storage/tauriJsonStore'

export function registerTouchBarEvents(dispatch: (action: any) => void, getState: () => AppState) {
  if (!isTauriRuntime()) return () => {}

  const unsubs: Array<() => void> = []

  listen('touchbar:nextDue', () => {
    dispatch(setSection('dueSoon'))
  }).then((u) => unsubs.push(u))

  listen('touchbar:reports', () => {
    dispatch(setSection('reports'))
  }).then((u) => unsubs.push(u))

  listen('touchbar:settings', () => {
    dispatch(setSection('settings'))
  }).then((u) => unsubs.push(u))

  listen('touchbar:pay', () => {
    const id = getState().ui.selectedBillId
    if (!id) return
    dispatch({ type: 'bills/logPayment', id, date: new Date() })
  }).then((u) => unsubs.push(u))

  listen('touchbar:snooze3', () => {
    const id = getState().ui.selectedBillId
    if (!id) return
    const until = new Date()
    until.setHours(0, 0, 0, 0)
    until.setDate(until.getDate() + 3)
    dispatch({ type: 'bills/setSnooze', id, until })
  }).then((u) => unsubs.push(u))

  return () => {
    for (const u of unsubs) u()
  }
}
