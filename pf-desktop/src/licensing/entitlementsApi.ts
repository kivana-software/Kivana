export interface ProductEntitlement {
  productCode: string
  planCode: string
  planName: string
  status: string
  endsAt: string | null
  features: string[]
}

export interface EntitlementsResponse {
  products: ProductEntitlement[]
}

export async function getEntitlements(baseURL: string, accessToken: string): Promise<EntitlementsResponse> {
  const url = normalizeBaseURL(baseURL) + '/v1/entitlements'
  const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as EntitlementsResponse
}

function normalizeBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim()
  if (!trimmed) throw new Error('Missing backend URL')
  return trimmed.replace(/\/+$/, '')
}

async function readError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as any
    const msg = String(json?.error ?? '')
    if (msg) return msg
  } catch {
  }
  return `HTTP ${res.status}`
}

