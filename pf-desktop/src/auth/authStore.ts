import { isTauriRuntime } from '../storage/tauriJsonStore'

export interface AuthSession {
  backendBaseURL: string
  accessToken: string
  refreshToken: string
  userId: string
  userEmail: string
  userDisplayName?: string | null
  userAvatarDataUrl?: string | null
  updatedAt: string
}

const AUTH_STORAGE_KEY = 'Kivana/auth.json'
const AUTH_FILE_NAME = 'auth.json'

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

export async function loadAuthSession(): Promise<AuthSession | null> {
  if (isTauriRuntime()) {
    const raw = await invoke<string | null>('read_data_file', { name: AUTH_FILE_NAME })
    if (!raw) return null
    try {
      const v = safeParseJSON(raw)
      if (!v || typeof v !== 'object') return null
      return v as AuthSession
    } catch {
      return null
    }
  }

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const v = safeParseJSON(raw)
    if (!v || typeof v !== 'object') return null
    return v as AuthSession
  } catch {
    return null
  }
}

export async function saveAuthSession(session: AuthSession | null): Promise<void> {
  if (isTauriRuntime()) {
    const content = safeStringifyJSON(session)
    await invoke<void>('write_data_file', { name: AUTH_FILE_NAME, content })
    return
  }
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, safeStringifyJSON(session))
  } catch {
  }
}
