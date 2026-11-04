import type { AlertsResponse, UIConfig } from './types'

// resolve against the origin, not the page URL: a page opened as https://user:pass@host/
// has credentials in its URL, and browsers refuse fetch() to URLs that inherit them
export const apiURL = (path: string, origin: string) => new URL(path, origin).href

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(apiURL(path, location.origin), { cache: 'no-store' })
  let body: unknown
  try {
    body = await r.json()
  } catch {
    throw new Error(`${path}: HTTP ${r.status}`)
  }
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `${path}: HTTP ${r.status}`)
  return body as T
}

export const fetchConfig = () => getJSON<UIConfig>('/api/config')
export const fetchAlerts = () => getJSON<AlertsResponse>('/api/alerts')
