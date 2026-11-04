export interface AMAlert {
  fingerprint: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  startsAt: string
  generatorURL?: string
  status?: { state?: string; silencedBy?: string[] | null; inhibitedBy?: string[] | null }
}

export interface Fetcher {
  fetch(): Promise<AMAlert[]>
}

export class AlertmanagerClient implements Fetcher {
  constructor(
    private readonly baseURL: string,
    private readonly user = '',
    private readonly password = '',
    private readonly timeoutMs = 15_000,
  ) {}

  async fetch(): Promise<AMAlert[]> {
    const url = this.baseURL.replace(/\/$/, '') + '/api/v2/alerts?active=true&silenced=true&inhibited=true&unprocessed=true'
    const headers: Record<string, string> = {}
    if (this.user) headers.authorization = 'Basic ' + Buffer.from(`${this.user}:${this.password}`).toString('base64')
    let resp: Response
    try {
      resp = await fetch(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) })
    } catch (e) {
      const err = e as Error & { cause?: Error }
      throw new Error(`alertmanager: ${err.cause?.message ?? err.message}`)
    }
    if (!resp.ok) {
      const body = (await resp.text()).slice(0, 512).trim()
      throw new Error(`alertmanager: HTTP ${resp.status}: ${body}`)
    }
    try {
      return (await resp.json()) as AMAlert[]
    } catch (e) {
      throw new Error(`alertmanager: decode: ${(e as Error).message}`)
    }
  }
}
