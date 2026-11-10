import type { EntitlementsResponse, ProductEntitlement } from './entitlementsApi'

export function isAdvancedAccount(entitlements: EntitlementsResponse | null): boolean {
  const p = entitlements?.products?.find((x) => x.productCode === 'kivana') ?? entitlements?.products?.[0]
  if (!p) return true
  const status = String(p.status || '').toLowerCase()
  const code = String(p.planCode || '').toLowerCase()
  const name = String(p.planName || '').toLowerCase()
  if (status.includes('trial') || code.includes('trial') || name.includes('trial') || name.includes('tryal')) return true
  return code === 'pro' || code === 'lifetime_pro' || code === 'accountant' || name.includes('accountant')
}

export function displayPlanName(p: ProductEntitlement): string {
  const status = String(p.status || '').toLowerCase()
  const planCode = String(p.planCode || '').toLowerCase()
  const planName = String(p.planName || '').trim()
  const planNameLower = planName.toLowerCase()
  if (status.includes('trial') || planCode.includes('trial') || planNameLower.includes('trial') || planNameLower.includes('tryal')) return 'Trial'
  if (planCode === 'accountant' || planNameLower.includes('accountant')) return 'Accountant'
  if (planCode === 'pro' || planCode === 'lifetime_pro') return 'Pro'
  if (planCode === 'ordinary' || planNameLower.includes('ordinary')) return 'Ordinary'
  if (planCode === 'standard' || planNameLower === 'standard') return 'Ordinary'
  if (planName) return planName
  if (planCode) return planCode.toUpperCase()
  return 'Free'
}

export function planBadgeLabel(entitlements: EntitlementsResponse | null): string {
  const p = entitlements?.products?.find((x) => x.productCode === 'kivana') ?? entitlements?.products?.[0]
  if (!p) return 'Pro'
  return displayPlanName(p)
}
