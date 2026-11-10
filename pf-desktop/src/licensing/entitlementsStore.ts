import { isTauriRuntime } from '../storage/tauriJsonStore'
import type { EntitlementsResponse } from './entitlementsApi'

const ENTITLEMENTS_STORAGE_KEY = 'Kivana/entitlements.json'
const ENTITLEMENTS_FILE_NAME = 'entitlements.json'

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core')
  return mod.invoke<T>(cmd, args)
}

function safeParseJSON(text: string): unknown {
  return JSON.parse(text) as unknown
}

function safeStringifyJSON(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export async function loadEntitlements(): Promise<EntitlementsResponse | null> {
  if (isTauriRuntime()) {
    const raw = await invoke<string | null>('read_data_file', { name: ENTITLEMENTS_FILE_NAME })
    if (!raw) return null
    try {
      const v = safeParseJSON(raw)
      if (!v || typeof v !== 'object') return null
      return v as EntitlementsResponse
    } catch {
      return null
    }
  }

  try {
    const raw = localStorage.getItem(ENTITLEMENTS_STORAGE_KEY)
    if (!raw) return null
    const v = safeParseJSON(raw)
    if (!v || typeof v !== 'object') return null
    return v as EntitlementsResponse
  } catch {
    return null
  }
}

export async function saveEntitlements(v: EntitlementsResponse | null): Promise<void> {
  if (isTauriRuntime()) {
    const content = safeStringifyJSON(v)
    await invoke<void>('write_data_file', { name: ENTITLEMENTS_FILE_NAME, content })
    return
  }
  try {
    localStorage.setItem(ENTITLEMENTS_STORAGE_KEY, safeStringifyJSON(v))
  } catch {
  }
}

