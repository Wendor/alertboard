import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { load } from 'js-yaml'

// a plain string or a per-language map, e.g. {ru: Диск, en: Disk}
export type Text = string | Record<string, string>

// stable identifier of a text: the string itself or the first translation
export const textKey = (t: Text): string => (typeof t === 'string' ? t : (Object.values(t)[0] ?? ''))

export interface PrometheusLink {
  name: string
  url: string
}

export interface GrafanaLink {
  name: string
  url: string
  datasource: string
  orgId: string
}

export interface Problem {
  match: string
  title: Text
}

export interface Group {
  name: string
  title: Text
}

export interface View {
  name: Text
  query?: string
  groupBy?: string[]
  hiddenGroups?: string[]
  hiddenProblems?: string[]
  sectionOrder?: string[]
  showSilenced: boolean
  collapseStale?: boolean
  staleAfter?: string
  range?: string
}

export interface UI {
  groupLabel: string
  groups: Group[]
  staleAfter: string
  freshWithin: string
  searchSkipLabels: string[]
  hostLabels: string[]
  groupByLabels: { label: string; title: Text }[]
  problemTitles: Record<string, Text>
  links: { name: Text; url: string }[]
  views: View[]
}

export interface TLS {
  cert: string
  key: string
}

export interface Config {
  listen: string
  tls?: TLS
  cacheTtlMs: number
  alertmanager: { url: string; publicUrl: string }
  prometheus: PrometheusLink[]
  grafana: GrafanaLink[]
  problems: Problem[]
  ui: UI
}

const UNITS: Record<string, number> = { ns: 1e-6, us: 1e-3, µs: 1e-3, ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }

// Go durations plus a "d" (day) suffix, e.g. "7d", "1h30m", "500ms".
export function parseDuration(s: string): number {
  const re = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h|d)/gy
  let total = 0
  let pos = 0
  for (const m of s.matchAll(re)) {
    total += Number(m[1]) * UNITS[m[2]]
    pos += m[0].length
  }
  if (pos === 0 || pos !== s.length) throw new Error(`invalid duration ${JSON.stringify(s)}`)
  return total
}

export function splitHostPort(addr: string): { host: string; port: number } {
  const i = addr.lastIndexOf(':')
  const port = Number(addr.slice(i + 1))
  if (i < 0 || !Number.isInteger(port)) throw new Error(`invalid listen address ${JSON.stringify(addr)}`)
  return { host: addr.slice(0, i).replace(/^\[(.*)\]$/, '$1') || '0.0.0.0', port }
}

type Raw = Record<string, any>

const str = (v: unknown): string => (v == null ? '' : String(v))
const localized = (v: unknown): Text =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, str(x)]))
    : str(v)
const list = <T>(v: unknown, f: (x: Raw) => T): T[] => (Array.isArray(v) ? v.map((x) => f(x ?? {})) : [])
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.length ? v.map(String) : undefined)

function view(v: Raw): View {
  return {
    name: localized(v.name),
    query: str(v.query) || undefined,
    groupBy: strings(v.group_by),
    hiddenGroups: strings(v.hidden_groups),
    hiddenProblems: strings(v.hidden_problems),
    sectionOrder: strings(v.section_order),
    showSilenced: v.show_silenced === true,
    collapseStale: typeof v.collapse_stale === 'boolean' ? v.collapse_stale : undefined,
    staleAfter: str(v.stale_after) || undefined,
    range: str(v.range) || undefined,
  }
}

// relative tls paths are resolved against baseDir (the config file's directory)
export function parseConfig(text: string, source = 'config', baseDir = process.cwd()): Config {
  let raw: Raw
  try {
    raw = (load(text) as Raw) ?? {}
  } catch (e) {
    throw new Error(`${source}: ${(e as Error).message}`)
  }
  const am: Raw = raw.alertmanager ?? {}
  const prom: Raw = raw.prometheus ?? {}
  const ui: Raw = raw.ui ?? {}
  const amURL = str(am.url)
  if (!amURL) throw new Error(`${source}: alertmanager.url is required`)

  const tlsRaw: Raw = raw.tls ?? {}
  const cert = str(tlsRaw.cert)
  const key = str(tlsRaw.key)
  if (!cert !== !key) throw new Error(`${source}: tls.cert and tls.key must be set together`)
  const problems: Problem[] = list(raw.problems, (x) => ({ match: str(x.match), title: localized(x.title) }))
  const prometheus: PrometheusLink[] = []
  if (prom.url) prometheus.push({ name: str(prom.name) || 'prom', url: str(prom.url) })
  prometheus.push(...list(prom.extra, (x) => ({ name: str(x.name), url: str(x.url) })))

  const cfg: Config = {
    listen: str(raw.listen) || '127.0.0.1:8080',
    tls: cert ? { cert: resolve(baseDir, cert), key: resolve(baseDir, key) } : undefined,
    cacheTtlMs: 5000,
    alertmanager: { url: amURL, publicUrl: str(am.public_url) || amURL },
    prometheus,
    grafana: list(raw.grafana, (x) => ({
      name: str(x.name) || 'grafana',
      url: str(x.url).replace(/\/$/, ''),
      datasource: str(x.datasource),
      orgId: str(x.org_id) || '1',
    })),
    problems,
    ui: {
      groupLabel: str(ui.group_label) || 'severity',
      groups: list(ui.groups, (x) => ({ name: str(x.name), title: localized(x.title) })),
      staleAfter: str(ui.stale_after) || '7d',
      freshWithin: str(ui.fresh_within) || '1h',
      searchSkipLabels: strings(ui.search_skip_labels) ?? [],
      hostLabels: strings(ui.host_labels) ?? ['instance'],
      groupByLabels: list(ui.group_by_labels, (x) => ({ label: str(x.label), title: localized(x.title) })).filter((l) => l.label),
      problemTitles: Object.fromEntries(problems.filter((p) => typeof p.title !== 'string').map((p) => [textKey(p.title), p.title])),
      links: list(ui.links, (x) => ({ name: localized(x.name), url: str(x.url) })),
      views: list(ui.views, view),
    },
  }
  try {
    if (raw.cache_ttl != null) cfg.cacheTtlMs = parseDuration(str(raw.cache_ttl))
    parseDuration(cfg.ui.staleAfter)
    parseDuration(cfg.ui.freshWithin)
  } catch (e) {
    throw new Error(`${source}: ${(e as Error).message}`)
  }
  return cfg
}

export function loadConfig(path: string): Config {
  return parseConfig(readFileSync(path, 'utf8'), path, dirname(resolve(path)))
}

export function readTLS(tls: TLS): { cert: Buffer; key: Buffer } {
  const read = (what: string, path: string) => {
    try {
      return readFileSync(path)
    } catch (e) {
      throw new Error(`tls.${what}: ${(e as Error).message}`)
    }
  }
  return { cert: read('cert', tls.cert), key: read('key', tls.key) }
}
