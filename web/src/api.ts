import type { AlertsResponse, UIConfig } from './types'

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: 'no-store' })
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
