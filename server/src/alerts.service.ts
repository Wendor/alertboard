import { Inject, Injectable } from '@nestjs/common'
import type { AMAlert, Fetcher } from './alertmanager.js'
import type { Config } from './config.js'
import type { Enricher, Link } from './enrich.js'
import { CONFIG, ENRICHER, FETCHER } from './tokens.js'

export interface Alert {
  fingerprint: string
  alertname: string
  problem: string
  labels: Record<string, string>
  annotations: Record<string, string>
  startsAt: string
  state: string
  silencedBy: string[]
  inhibitedBy: string[]
  promLinks: Link[]
}

export interface AlertsResponse {
  fetchedAt: string
  alerts: Alert[]
}

@Injectable()
export class AlertsService {
  private cached?: { at: number; resp: AlertsResponse }
  private inflight?: Promise<AlertsResponse>

  constructor(
    @Inject(CONFIG) private readonly cfg: Config,
    @Inject(FETCHER) private readonly fetcher: Fetcher,
    @Inject(ENRICHER) private readonly enricher: Enricher,
  ) {}

  // Concurrent requests share one upstream fetch; errors are not cached.
  load(): Promise<AlertsResponse> {
    if (this.cached && Date.now() - this.cached.at < this.cfg.cacheTtlMs) return Promise.resolve(this.cached.resp)
    this.inflight ??= this.refresh().finally(() => (this.inflight = undefined))
    return this.inflight
  }

  private async refresh(): Promise<AlertsResponse> {
    const raw = await this.fetcher.fetch()
    const at = Date.now()
    const resp = { fetchedAt: new Date(at).toISOString(), alerts: raw.map((a) => this.convert(a)) }
    this.cached = { at, resp }
    return resp
  }

  private convert(a: AMAlert): Alert {
    const labels = a.labels ?? {}
    const name = labels.alertname ?? ''
    return {
      fingerprint: a.fingerprint,
      alertname: name,
      problem: this.enricher.problem(name),
      labels,
      annotations: a.annotations ?? {},
      startsAt: a.startsAt,
      state: a.status?.state ?? '',
      silencedBy: a.status?.silencedBy ?? [],
      inhibitedBy: a.status?.inhibitedBy ?? [],
      promLinks: [
        ...this.enricher.promLinks(a.generatorURL ?? ''),
        ...this.enricher.grafanaLinks(a.generatorURL ?? '', a.startsAt),
      ],
    }
  }
}
