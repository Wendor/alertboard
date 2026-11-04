import { textKey, type GrafanaLink, type PrometheusLink, type Problem } from './config.js'

const HOUR = 3_600_000

export interface Link {
  name: string
  url: string
}

function parseURL(s: string): URL | null {
  try {
    const u = new URL(s)
    return u.host ? u : null
  } catch {
    return null
  }
}

export class Enricher {
  private readonly rules: { re: RegExp; title: string }[]
  private readonly proms: { name: string; base: URL }[]
  private readonly grafanas: GrafanaLink[]

  constructor(problems: Problem[], proms: PrometheusLink[], grafanas: GrafanaLink[] = []) {
    this.rules = problems.map((p) => {
      try {
        return { re: new RegExp(`^(?:${p.match})$`), title: textKey(p.title) }
      } catch (e) {
        throw new Error(`problem ${JSON.stringify(textKey(p.title))}: ${(e as Error).message}`)
      }
    })
    this.proms = proms.map((p) => {
      const base = parseURL(p.url)
      if (!base) throw new Error(`prometheus url ${JSON.stringify(p.url)} is invalid`)
      if (!p.name) throw new Error(`prometheus url ${JSON.stringify(p.url)}: name is required`)
      return { name: p.name, base }
    })
    for (const g of grafanas) {
      if (!parseURL(g.url)) throw new Error(`grafana url ${JSON.stringify(g.url)} is invalid`)
      if (!g.datasource) throw new Error(`grafana ${JSON.stringify(g.name)}: datasource is required`)
    }
    this.grafanas = grafanas.map((g) => ({ ...g, url: g.url.replace(/\/$/, '') }))
  }

  problem(alertname: string): string {
    return this.rules.find((r) => r.re.test(alertname))?.title ?? alertname
  }

  // Rewrites generatorURL onto every configured Prometheus, keeping path and query.
  // Without configured Prometheus the original URL is returned as is.
  promLinks(generatorURL: string): Link[] {
    const u = generatorURL ? parseURL(generatorURL) : null
    if (!u) return []
    if (!this.proms.length) return [{ name: 'prom', url: generatorURL }]
    const rest = u.pathname + u.search + u.hash
    return this.proms.map(({ name, base }) => ({
      name,
      url: `${base.protocol}//${base.host}${base.pathname.replace(/\/$/, '')}${rest}`,
    }))
  }

  // Grafana Explore with the alert expression: from an hour before the alert started, clamped to the last 6..24 hours.
  grafanaLinks(generatorURL: string, startsAt: string, now = Date.now()): Link[] {
    const expr = (generatorURL && parseURL(generatorURL)?.searchParams.get('g0.expr')) || ''
    const start = Date.parse(startsAt)
    if (!expr || Number.isNaN(start)) return []
    const at = start - HOUR
    const from = at < now - 24 * HOUR ? 'now-24h' : at < now - 6 * HOUR ? String(at) : 'now-6h'
    return this.grafanas.map((g) => {
      const ds = { type: 'prometheus', uid: g.datasource }
      const panes = {
        a: {
          datasource: g.datasource,
          queries: [{ refId: 'A', expr, range: true, instant: false, datasource: ds }],
          range: { from, to: 'now' },
        },
      }
      const q = new URLSearchParams({ schemaVersion: '1', orgId: g.orgId, panes: JSON.stringify(panes) })
      return { name: g.name, url: `${g.url}/explore?${q}` }
    })
  }
}
