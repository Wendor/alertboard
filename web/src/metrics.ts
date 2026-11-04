import { startOf } from './group'
import { addMatcher, hostMatcher } from './promql'
import type { Alert, Link, UIConfig } from './types'

const HOUR = 3_600_000

// matcher for the hosts of the alerts, by the label each host comes from (ui.host_labels);
// null when an alert has no host label or the alerts disagree on the label
export function hostSelector(alerts: Alert[], cfg: UIConfig): string | null {
  const labels = new Set<string>()
  const values = new Set<string>()
  for (const a of alerts) {
    const label = cfg.hostLabels.find((l) => a.labels[l])
    if (!label) return null
    labels.add(label)
    values.add(a.labels[label])
  }
  if (labels.size !== 1) return null
  return hostMatcher([...labels][0], [...values].sort())
}

// from an hour before the start, clamped to the last 6..24 hours
function rangeFrom(startMs: number, now: number): string {
  const at = startMs - HOUR
  if (at < now - 24 * HOUR) return 'now-24h'
  return at < now - 6 * HOUR ? String(at) : 'now-6h'
}

// the first alert's expression narrowed to the hosts of the alerts that share it
export function scopedExpr(alerts: Alert[], cfg: UIConfig): { query: string; alerts: Alert[] } | null {
  const expr = alerts.find((a) => a.expr)?.expr
  if (!expr) return null
  const same = alerts.filter((a) => a.expr === expr)
  const matcher = hostSelector(same, cfg)
  return { query: matcher ? addMatcher(expr, matcher) : expr, alerts: same }
}

// Prometheus links as built by the server, with g0.expr replaced by the narrowed expression
export function promLinks(alerts: Alert[], cfg: UIConfig): Link[] {
  const scoped = scopedExpr(alerts, cfg)
  const links = (scoped?.alerts ?? alerts).find((a) => a.promLinks.length)?.promLinks ?? []
  if (!scoped) return links
  return links.map((l) => {
    const u = new URL(l.url)
    if (!u.searchParams.has('g0.expr')) return l
    u.searchParams.set('g0.expr', scoped.query)
    return { name: l.name, url: u.href }
  })
}

// Explore links for alerts sharing the first alert's expression, filtered to their hosts
export function grafanaLinks(alerts: Alert[], cfg: UIConfig, now = Date.now()): Link[] {
  const scoped = scopedExpr(alerts, cfg)
  if (!scoped || !cfg.grafana.length) return []
  const { query, alerts: same } = scoped
  const from = rangeFrom(Math.min(...same.map(startOf)), now)
  return cfg.grafana.map((g) => {
    const panes = {
      a: {
        datasource: g.datasource,
        queries: [{ refId: 'A', expr: query, range: true, instant: false, datasource: { type: 'prometheus', uid: g.datasource } }],
        range: { from, to: 'now' },
      },
    }
    const q = new URLSearchParams({ schemaVersion: '1', orgId: g.orgId, panes: JSON.stringify(panes) })
    return { name: g.name, url: `${g.url}/explore?${q}` }
  })
}
