import { startOf } from './group'
import { addMatcher, hostMatcher, keepSeries } from './promql'
import type { Alert, Link, UIConfig } from './types'

const HOUR = 3_600_000

// label and values the hosts of the alerts come from (ui.host_labels);
// null when an alert has no host label or the alerts disagree on the label
function hostsOf(alerts: Alert[], cfg: UIConfig): { label: string; values: string[] } | null {
  const labels = new Set<string>()
  const values = new Set<string>()
  for (const a of alerts) {
    const label = cfg.hostLabels.find((l) => a.labels[l])
    if (!label) return null
    labels.add(label)
    values.add(a.labels[label])
  }
  if (labels.size !== 1) return null
  return { label: [...labels][0], values: [...values].sort() }
}

export function hostSelector(alerts: Alert[], cfg: UIConfig): string | null {
  const h = hostsOf(alerts, cfg)
  return h && hostMatcher(h.label, h.values)
}

// from an hour before the start, clamped to the last 6..24 hours
function rangeFrom(startMs: number, now: number): string {
  const at = startMs - HOUR
  if (at < now - 24 * HOUR) return 'now-24h'
  return at < now - 6 * HOUR ? String(at) : 'now-6h'
}

// one query per distinct expression (a row may mix rules), each narrowed to the hosts of its alerts
export function scopedExprs(alerts: Alert[], cfg: UIConfig): { query: string; alerts: Alert[] }[] {
  const byExpr = new Map<string, Alert[]>()
  for (const a of alerts) if (a.expr) (byExpr.get(a.expr) ?? byExpr.set(a.expr, []).get(a.expr)!).push(a)
  return [...byExpr].map(([expr, same]) => {
    const hosts = hostsOf(same, cfg)
    if (!hosts) return { query: expr, alerts: same }
    // selectors narrowed by host; a host may run several targets (e.g. two mysqld),
    // so the result is cut down to the alerts' own instances (through their up series) as well
    let query = addMatcher(expr, hostMatcher(hosts.label, hosts.values))
    if (hosts.label !== 'instance' && same.every((a) => a.labels.instance)) {
      query = keepSeries(query, 'instance', [...new Set(same.map((a) => a.labels.instance))].sort())
    }
    return { query, alerts: same }
  })
}

// Prometheus links as built by the server, one graph panel (g0, g1, ...) per expression;
// other g0.* parameters such as the tab are copied to every panel
export function promLinks(alerts: Alert[], cfg: UIConfig): Link[] {
  const scoped = scopedExprs(alerts, cfg)
  const links = alerts.find((a) => a.promLinks.length)?.promLinks ?? []
  if (!scoped.length) return links
  return links.map((l) => {
    const u = new URL(l.url)
    if (!u.searchParams.has('g0.expr')) return l
    const panel = [...u.searchParams].filter(([k]) => k.startsWith('g0.') && k !== 'g0.expr')
    for (const k of [...u.searchParams.keys()]) if (/^g\d+\./.test(k)) u.searchParams.delete(k)
    scoped.forEach(({ query }, i) => {
      u.searchParams.set(`g${i}.expr`, query)
      for (const [k, v] of panel) u.searchParams.set(`g${i}.${k.slice(3)}`, v)
    })
    return { name: l.name, url: u.href }
  })
}

// Explore links with one query (A, B, ...) per expression, range from the oldest alert
export function grafanaLinks(alerts: Alert[], cfg: UIConfig, now = Date.now()): Link[] {
  const scoped = scopedExprs(alerts, cfg)
  if (!scoped.length || !cfg.grafana.length) return []
  const from = rangeFrom(Math.min(...scoped.flatMap((s) => s.alerts.map(startOf))), now)
  return cfg.grafana.map((g) => {
    const datasource = { type: 'prometheus', uid: g.datasource }
    const queries = scoped.map(({ query }, i) => ({ refId: String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : ''), expr: query, range: true, instant: false, datasource }))
    const panes = { a: { datasource: g.datasource, queries, range: { from, to: 'now' } } }
    const q = new URLSearchParams({ schemaVersion: '1', orgId: g.orgId, panes: JSON.stringify(panes) })
    return { name: g.name, url: `${g.url}/explore?${q}` }
  })
}
