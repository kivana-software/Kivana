import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMe, refreshToken as refreshTokenCall, signIn as signInCall, signOut as signOutCall, signUp as signUpCall, type AuthUser } from './authApi'
import { loadAuthSession, saveAuthSession, type AuthSession } from './authStore'
import { getEntitlements, type EntitlementsResponse } from '../licensing/entitlementsApi'
import { loadEntitlements, saveEntitlements } from '../licensing/entitlementsStore'
import { saveLastLoginEmail } from '../storage/userPrefs'

export interface AuthContextValue {
  ready: boolean
  session: AuthSession | null
  entitlements: EntitlementsResponse | null
  openLogin: boolean
  setOpenLogin: (v: boolean) => void
  signUp: (email: string, password: string, captcha?: { token: string; answer: string }) => Promise<void>
  signIn: (email: string, password: string, captcha?: { token: string; answer: string }) => Promise<void>
  signOut: () => Promise<void>
  refreshEntitlements: () => Promise<void>
  getValidSession: () => Promise<AuthSession | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('AuthContext is not available')
  return v
}

function normalizeBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim()
  const normalized = trimmed.replace(/\/+$/, '')
  if (!normalized) return normalized
  try {
    const u = new URL(normalized)
    if (!import.meta.env.DEV) {
      const host = String(u.hostname || '').trim().toLowerCase()
      const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
      if (!isLocal && u.protocol !== 'https:') {
        throw new Error('Backend URL must use https')
      }
    }
  } catch (e) {
    if (!import.meta.env.DEV && String(e) === 'Error: Backend URL must use https') throw e
  }
  return normalized
}

const DEFAULT_BACKEND_URL = 'https://kivana.eu'
const HARDCODED_BACKEND_URL = normalizeBaseURL(import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL)

export function AuthProvider(props: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [entitlements, setEntitlements] = useState<EntitlementsResponse | null>(null)
  const [openLogin, setOpenLogin] = useState(false)

  const effectiveBaseURL = HARDCODED_BACKEND_URL

  const applyMeToSession = useCallback((s: AuthSession, me: AuthUser): AuthSession => {
    const next: AuthSession = {
      ...s,
      userId: me.id || s.userId,
      userEmail: me.email || s.userEmail,
      userDisplayName: me.displayName ?? s.userDisplayName ?? null,
      userAvatarDataUrl: me.avatarDataUrl ?? s.userAvatarDataUrl ?? null,
    }
    if (
      next.userId === s.userId &&
      next.userEmail === s.userEmail &&
      (next.userDisplayName ?? null) === (s.userDisplayName ?? null) &&
      (next.userAvatarDataUrl ?? null) === (s.userAvatarDataUrl ?? null)
    ) {
      return s
    }
    return next
  }, [])

  const clearAll = useCallback(async () => {
    setSession(null)
    setEntitlements(null)
    await saveAuthSession(null)
    await saveEntitlements(null)
  }, [])

  const ensureValidSession = useCallback(
    async (s: AuthSession): Promise<AuthSession | null> => {
      const base = normalizeBaseURL(s.backendBaseURL || effectiveBaseURL)
      try {
        const me = await getMe(base, s.accessToken)
        const withMe = applyMeToSession(s, me)
        if (withMe !== s) {
          setSession(withMe)
          await saveAuthSession(withMe)
        }
        return withMe
      } catch (e: any) {
        const msg = String(e?.message ?? '')
        if (!(msg === 'invalid_token' || msg === 'missing_token' || msg.includes('401') || msg.includes('403'))) {
          // Network error or 5xx error, assume session is still valid for offline use
          return s
        }
      }

      try {
        const refreshed = await refreshTokenCall(base, s.refreshToken)
        const next: AuthSession = {
          backendBaseURL: base,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          userId: refreshed.user.id,
          userEmail: refreshed.user.email,
          userDisplayName: refreshed.user.displayName ?? null,
          userAvatarDataUrl: refreshed.user.avatarDataUrl ?? null,
          updatedAt: new Date().toISOString(),
        }
        setSession(next)
        await saveAuthSession(next)
        return next
      } catch (e: any) {
        const msg = String(e?.message ?? '')
        if (!(msg === 'invalid_refresh_token' || msg.includes('401') || msg.includes('403') || msg.includes('400'))) {
          // Network error or 5xx error, assume session is still valid
          return s
        }
        return null
      }
    },
    [applyMeToSession, effectiveBaseURL],
  )

  const getValidSession = useCallback(async (): Promise<AuthSession | null> => {
    if (!session) return null
    const valid = await ensureValidSession(session)
    if (!valid) {
      await clearAll()
    }
    return valid
  }, [session, ensureValidSession, clearAll])

  const refreshEntitlements = useCallback(async () => {
    const s = await getValidSession()
    if (!s?.accessToken) return
    const base = normalizeBaseURL(s.backendBaseURL || effectiveBaseURL)
    const e = await getEntitlements(base, s.accessToken)
    setEntitlements(e)
    await saveEntitlements(e)
  }, [effectiveBaseURL, getValidSession])

  const refreshMe = useCallback(async () => {
    const s = await getValidSession()
    if (!s?.accessToken) return
    const base = normalizeBaseURL(s.backendBaseURL || effectiveBaseURL)
    const me = await getMe(base, s.accessToken)
    const withMe = applyMeToSession(s, me)
    if (withMe !== s) {
      setSession(withMe)
      await saveAuthSession(withMe)
    }
  }, [applyMeToSession, effectiveBaseURL, getValidSession])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [savedSession, savedEntitlements] = await Promise.all([loadAuthSession(), loadEntitlements()])
      if (cancelled) return
      setEntitlements(savedEntitlements)
      if (!savedSession) {
        setSession(null)
        setReady(true)
        return
      }

      const valid = await ensureValidSession(savedSession)
      if (cancelled) return
      if (!valid) {
        await clearAll()
        setReady(true)
        return
      }

      setSession(valid)
      await saveAuthSession(valid)
      try {
        const base = normalizeBaseURL(valid.backendBaseURL || effectiveBaseURL)
        const e = await getEntitlements(base, valid.accessToken)
        if (!cancelled) {
          setEntitlements(e)
          await saveEntitlements(e)
        }
      } catch {
      }
      if (!cancelled) {
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clearAll, effectiveBaseURL, ensureValidSession])

  useEffect(() => {
    let cancelled = false

    async function pollEvents() {
      while (!cancelled) {
        const s = await getValidSession()
        if (!s?.accessToken) {
          await new Promise((r) => setTimeout(r, 2000))
          continue
        }

        try {
          const base = normalizeBaseURL(s.backendBaseURL || effectiveBaseURL)
          const res = await fetch(`${base}/v1/events/poll`, {
            method: 'GET',
            headers: {
              'authorization': `Bearer ${s.accessToken}`,
            }
          })

          if (cancelled) break

          if (res.status === 200) {
            const event = await res.json()
            const eventType = (event as any)?.eventType || (event as any)?.event_type
            if (eventType === 'entitlements_updated') {
              await refreshEntitlements()
            } else if (eventType === 'profile_updated' || eventType === 'me_updated') {
              await refreshMe()
            }
          } else if (res.status === 401 || res.status === 403) {
            await new Promise((r) => setTimeout(r, 5000))
          } else {
            // 204 No Content or other errors: just loop immediately or after short delay
            if (res.status !== 204) {
              await new Promise((r) => setTimeout(r, 2000))
            }
          }
        } catch {
          // Network error, wait before retrying
          if (!cancelled) await new Promise((r) => setTimeout(r, 5000))
        }
      }
    }

    void pollEvents()

    return () => {
      cancelled = true
    }
  }, [effectiveBaseURL, getValidSession, refreshEntitlements, refreshMe])

  useEffect(() => {
    let cancelled = false
    if (!session?.accessToken) return
    const interval = setInterval(() => {
      if (cancelled) return
      void refreshEntitlements().catch(() => {})
    }, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session?.accessToken, refreshEntitlements])

  const signUp = useCallback(
    async (email: string, password: string, captcha?: { token: string; answer: string }) => {
      const base = normalizeBaseURL(effectiveBaseURL)
      const r = await signUpCall(base, email, password, captcha)
      const next: AuthSession = {
        backendBaseURL: base,
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        userId: r.user.id,
        userEmail: r.user.email,
        userDisplayName: r.user.displayName ?? null,
        userAvatarDataUrl: r.user.avatarDataUrl ?? null,
        updatedAt: new Date().toISOString(),
      }
      setSession(next)
      await saveAuthSession(next)
      saveLastLoginEmail(r.user.email || email)
      setOpenLogin(false)
      try {
        const e = await getEntitlements(base, next.accessToken)
        setEntitlements(e)
        await saveEntitlements(e)
      } catch {
      }
    },
    [effectiveBaseURL],
  )

  const signIn = useCallback(
    async (email: string, password: string, captcha?: { token: string; answer: string }) => {
      const base = normalizeBaseURL(effectiveBaseURL)
      const r = await signInCall(base, email, password, captcha)
      const next: AuthSession = {
        backendBaseURL: base,
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        userId: r.user.id,
        userEmail: r.user.email,
        userDisplayName: r.user.displayName ?? null,
        userAvatarDataUrl: r.user.avatarDataUrl ?? null,
        updatedAt: new Date().toISOString(),
      }
      setSession(next)
      await saveAuthSession(next)
      saveLastLoginEmail(r.user.email || email)
      setOpenLogin(false)
      try {
        const e = await getEntitlements(base, next.accessToken)
        setEntitlements(e)
        await saveEntitlements(e)
      } catch {
      }
    },
    [effectiveBaseURL],
  )

  const signOut = useCallback(async () => {
    const s = session
    await clearAll()
    if (!s?.refreshToken) return
    const base = normalizeBaseURL(s.backendBaseURL || effectiveBaseURL)
    try {
      await signOutCall(base, s.refreshToken)
    } catch {
    }
  }, [clearAll, effectiveBaseURL, session])

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      entitlements,
      openLogin,
      setOpenLogin,
      signUp,
      signIn,
      signOut,
      refreshEntitlements,
      getValidSession,
    }),
    [entitlements, openLogin, ready, refreshEntitlements, session, signIn, signOut, signUp, getValidSession],
  )

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}
