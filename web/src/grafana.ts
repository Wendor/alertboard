import { startOf } from './group'
import type { Alert, Link, UIConfig } from './types'

const HOUR = 3_600_000
const MARK = 'alertboard_host'

// host label -> values, using for each alert the label its host is taken from (ui.host_labels)
export function hostFilter(alerts: Alert[], cfg: UIConfig): Map<string, string[]> {
  const m = new Map<string, Set<string>>()
  for (const a of alerts) {
    const label = cfg.hostLabels.find((l) => a.labels[l])
    if (label) (m.get(label) ?? m.set(label, new Set()).get(label)!).add(a.labels[label])
  }
  return new Map([...m].map(([l, v]) => [l, [...v].sort()]))
}

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const promString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// Keeps only series of the given hosts without parsing the expression: matching series get a
// temporary label, "and" drops the rest, the outer label_replace removes the label again.
export function filterExpr(expr: string, filter: Map<string, string[]>): string {
  if (!filter.size) return expr
  let marked = `(${expr})`
  for (const [label, values] of filter) {
    marked = `label_replace(${marked}, "${MARK}", "1", ${promString(label)}, ${promString(values.map(reEscape).join('|'))})`
  }
  return `label_replace(${marked} and on(${MARK}) label_replace(vector(1), "${MARK}", "1", "", ""), "${MARK}", "", "", "")`
}

// from an hour before the start, clamped to the last 6..24 hours
function rangeFrom(startMs: number, now: number): string {
  const at = startMs - HOUR
  if (at < now - 24 * HOUR) return 'now-24h'
  return at < now - 6 * HOUR ? String(at) : 'now-6h'
}

// Explore links for alerts sharing the first alert's expression, filtered to their hosts
export function grafanaLinks(alerts: Alert[], cfg: UIConfig, now = Date.now()): Link[] {
  const expr = alerts.find((a) => a.expr)?.expr
  if (!expr || !cfg.grafana.length) return []
  const same = alerts.filter((a) => a.expr === expr)
  const query = filterExpr(expr, hostFilter(same, cfg))
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
