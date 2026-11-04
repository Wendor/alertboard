import { parseDuration } from './duration'
import { t, tr } from './i18n'
import { matchAlert, parseQuery } from './query'
import { BASE_GROUP_KEYS, type Alert, type GroupKey, type UIConfig, type ViewState } from './types'

export interface Row {
  key: string
  title: string
  count: number
  alerts: Alert[]
  newest: number
  oldest: number
  hosts: string[]
  fresh: boolean
}

export interface Section {
  key: string
  title: string
  count: number
  rows: Row[]
  newest: number
}

export const groupKeys = (cfg: UIConfig): GroupKey[] => [
  ...BASE_GROUP_KEYS,
  ...cfg.groupByLabels.map((l) => `label:${l.label}` as GroupKey),
]

const labelOf = (key: GroupKey) => (key.startsWith('label:') ? key.slice(6) : null)

export function groupKeyTitle(key: GroupKey, cfg: UIConfig): string {
  const label = labelOf(key)
  if (label === null) return t(`groupBy.${key}`)
  return tr(cfg.groupByLabels.find((l) => l.label === label)?.title) || label
}

export const startOf = (a: Alert) => Date.parse(a.startsAt)

export const hostOf = (a: Alert, cfg: UIConfig) => cfg.hostLabels.map((l) => a.labels[l]).find(Boolean) ?? ''

export const groupOf = (a: Alert, cfg: UIConfig) => a.labels[cfg.groupLabel] ?? ''

export const problemTitle = (key: string, cfg: UIConfig) => tr(cfg.problemTitles?.[key]) || key

export const isSuppressed = (a: Alert) => a.state === 'suppressed'

export function groupTitle(name: string, cfg: UIConfig): string {
  if (name === '') return t('group.noGroup')
  return tr(cfg.groups.find((g) => g.name === name)?.title) || name
}

function keyOf(a: Alert, key: GroupKey, cfg: UIConfig): string {
  const label = labelOf(key)
  if (label !== null) return a.labels[label] ?? ''
  switch (key) {
    case 'group':
      return groupOf(a, cfg)
    case 'problem':
      return a.problem
    case 'host':
      return hostOf(a, cfg)
    default:
      return ''
  }
}

function titleOf(key: GroupKey, value: string, cfg: UIConfig): string {
  if (labelOf(key) !== null) return value || t('group.noLabel', { title: groupKeyTitle(key, cfg) })
  switch (key) {
    case 'group':
      return groupTitle(value, cfg)
    case 'problem':
      return problemTitle(value, cfg)
    case 'host':
      return value || t('group.noHost')
    default:
      return t('group.all')
  }
}

export function filterAlerts(
  alerts: Alert[],
  view: ViewState,
  cfg: UIConfig,
  opts: { ignoreTime?: boolean } = {},
): Alert[] {
  const { terms } = parseQuery(view.query)
  const hiddenGroups = new Set(view.hiddenGroups)
  const hiddenProblems = new Set(view.hiddenProblems)
  const skipLabels = new Set(cfg.searchSkipLabels ?? [])
  const tf = opts.ignoreTime ? undefined : view.timeFilter
  return alerts.filter((a) => {
    if (!view.showSilenced && isSuppressed(a)) return false
    if (hiddenGroups.has(groupOf(a, cfg))) return false
    if (hiddenProblems.has(a.problem)) return false
    if (tf) {
      const t = startOf(a)
      if (t < tf.from || t >= tf.to) return false
    }
    return matchAlert(a, terms, skipLabels)
  })
}

function bucket<T>(items: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of items) {
    const k = key(x)
    const list = m.get(k)
    if (list) list.push(x)
    else m.set(k, [x])
  }
  return m
}

function makeRow(key: string, title: string, alerts: Alert[], cfg: UIConfig, freshMs: number, now: number): Row {
  const times = alerts.map(startOf)
  const newest = Math.max(...times)
  const hosts = [...new Set(alerts.map((a) => hostOf(a, cfg)).filter(Boolean))].sort()
  const sorted = [...alerts].sort((a, b) => startOf(b) - startOf(a))
  return {
    key,
    title,
    count: alerts.length,
    alerts: sorted,
    newest,
    oldest: Math.min(...times),
    hosts,
    fresh: now - newest < freshMs,
  }
}

function sectionsOf(alerts: Alert[], view: ViewState, cfg: UIConfig, now: number): Section[] {
  const [k1, k2] = view.groupBy
  const freshMs = parseDuration(cfg.freshWithin) ?? 3_600_000
  const sections: Section[] = []
  for (const [sk, sAlerts] of bucket(alerts, (a) => keyOf(a, k1, cfg))) {
    const rows: Row[] =
      k2 === 'none'
        ? sAlerts.map((a) => makeRow(a.fingerprint, a.alertname, [a], cfg, freshMs, now))
        : [...bucket(sAlerts, (a) => keyOf(a, k2, cfg))].map(([rk, rAlerts]) =>
            makeRow(rk, titleOf(k2, rk, cfg), rAlerts, cfg, freshMs, now),
          )
    rows.sort((a, b) => b.newest - a.newest || a.title.localeCompare(b.title))
    sections.push({
      key: sk,
      title: titleOf(k1, sk, cfg),
      count: sAlerts.length,
      rows,
      newest: Math.max(...rows.map((r) => r.newest)),
    })
  }
  const order = new Map(cfg.groups.map((g, i) => [g.name, i]))
  const rank = (s: Section) => {
    if (s.key === '' && k1 !== 'none') return Number.MAX_SAFE_INTEGER
    if (k1 === 'group') return order.get(s.key) ?? cfg.groups.length
    return 0
  }
  return sections.sort((a, b) => rank(a) - rank(b) || b.newest - a.newest)
}

export function buildSections(
  alerts: Alert[],
  view: ViewState,
  cfg: UIConfig,
  now: number,
): { sections: Section[]; stale: Section[] } {
  if (!view.collapseStale) return { sections: sectionsOf(alerts, view, cfg, now), stale: [] }
  const staleMs = parseDuration(view.staleAfter) ?? parseDuration(cfg.staleAfter) ?? 7 * 86_400_000
  const fresh: Alert[] = []
  const stale: Alert[] = []
  for (const a of alerts) (now - startOf(a) > staleMs ? stale : fresh).push(a)
  return { sections: sectionsOf(fresh, view, cfg, now), stale: sectionsOf(stale, view, cfg, now) }
}
