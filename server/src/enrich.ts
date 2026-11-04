import { textKey, type GrafanaLink, type PrometheusLink, type Problem } from './config.js'

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

  // the alert's PromQL expression, carried by Prometheus in generatorURL
  expr(generatorURL: string): string {
    return (generatorURL && parseURL(generatorURL)?.searchParams.get('g0.expr')) || ''
  }
}
