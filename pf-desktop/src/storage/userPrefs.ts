const DISPLAY_CURRENCY_KEY = 'Kivana/prefs/displayCurrencyCode'
const LAST_LOGIN_EMAIL_KEY = 'Kivana/prefs/lastLoginEmail'
const SIDEBAR_COLLAPSED_GROUPS_KEY = 'Kivana/prefs/sidebarCollapsedGroups'

export function loadPreferredDisplayCurrencyCode(): string | null {
  try {
    const v = localStorage.getItem(DISPLAY_CURRENCY_KEY)
    const s = String(v ?? '').trim().toUpperCase()
    return s || null
  } catch {
    return null
  }
}

export function savePreferredDisplayCurrencyCode(code: string | null | undefined): void {
  try {
    const s = String(code ?? '').trim().toUpperCase()
    if (!s) return
    localStorage.setItem(DISPLAY_CURRENCY_KEY, s)
  } catch {
  }
}

export function loadLastLoginEmail(): string {
  try {
    return String(localStorage.getItem(LAST_LOGIN_EMAIL_KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function saveLastLoginEmail(email: string | null | undefined): void {
  try {
    const s = String(email ?? '').trim()
    if (!s) return
    localStorage.setItem(LAST_LOGIN_EMAIL_KEY, s)
  } catch {
  }
}

export function loadSidebarCollapsedGroups(): string[] {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_GROUPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((x) => String(x ?? '').trim())
      .map((x) => (x === 'Core' ? 'Accountant' : x))
      .filter((x) => x.length > 0)
  } catch {
    return []
  }
}

export function saveSidebarCollapsedGroups(groups: string[] | null | undefined): void {
  try {
    const list = Array.isArray(groups) ? groups.map((x) => String(x ?? '').trim()).filter((x) => x.length > 0) : []
    localStorage.setItem(SIDEBAR_COLLAPSED_GROUPS_KEY, JSON.stringify(list))
  } catch {
  }
}

export function preservePrefsAcrossLocalStorageClear(): void {
  const currency = loadPreferredDisplayCurrencyCode()
  const email = loadLastLoginEmail()
  const sidebarGroups = loadSidebarCollapsedGroups()
  try {
    localStorage.clear()
  } catch {
    return
  }
  if (currency) savePreferredDisplayCurrencyCode(currency)
  if (email) saveLastLoginEmail(email)
  if (sidebarGroups.length > 0) saveSidebarCollapsedGroups(sidebarGroups)
}
