import { beforeEach, describe, expect, it } from 'vitest'
import { apiURL } from './api'
import { formatAge, formatValue, parseDuration } from './duration'
import { setLocale, tr } from './i18n'
import { buildSections, filterAlerts, moveSection } from './group'
import { grafanaLinks, hostSelector, promLinks } from './metrics'
import { commonLabels, renderLink, silenceURL } from './links'
import { buildHistogram } from './timeline'
import type { Alert, UIConfig, ViewState } from './types'

beforeEach(() => setLocale('ru'))

const NOW = Date.parse('2026-11-04T10:00:00Z')
const H = 3600_000

let n = 0
function alert(labels: Record<string, string>, agoMs: number, extra: Partial<Alert> = {}): Alert {
  return {
    fingerprint: `f${n++}`,
    alertname: labels.alertname ?? 'X',
    problem: extra.problem ?? labels.alertname ?? 'X',
    labels,
    annotations: {},
    startsAt: new Date(NOW - agoMs).toISOString(),
    state: 'active',
    silencedBy: [],
    inhibitedBy: [],
    expr: '',
    promLinks: [],
    ...extra,
  }
}

const cfg: UIConfig = {
  alertmanagerURL: 'http://am:9093/',
  groupLabel: 'team',
  groups: [
    { name: 'core', title: 'Core' },
    { name: 'ops', title: 'Ops' },
  ],
  staleAfter: '7d',
  freshWithin: '1h',
  hostLabels: ['node', 'instance'],
  grafana: [],
  groupByLabels: [{ label: 'owner', title: 'владелец' }],
  links: [],
  views: [],
}

const view = (over: Partial<ViewState> = {}): ViewState => ({
  name: 't',
  query: '',
  groupBy: ['group', 'problem'],
  hiddenGroups: [],
  hiddenProblems: [],
  sectionOrder: {},
  showSilenced: false,
  collapseStale: true,
  staleAfter: '7d',
  range: '24h',
  ...over,
})

describe('duration', () => {
  it('parses', () => {
    expect(parseDuration('7d')).toBe(7 * 24 * H)
    expect(parseDuration('1h30m')).toBe(1.5 * H)
    expect(parseDuration('bad')).toBeNull()
  })
  it('formats age', () => {
    expect(formatAge(30_000)).toBe('<1 мин')
    expect(formatAge(5 * 60_000)).toBe('5 мин')
    expect(formatAge(10 * H)).toBe('10 ч')
    expect(formatAge(2 * 24 * H)).toBe('2 д')
    expect(formatAge(80 * 24 * H)).toBe('2 мес')
  })
})

describe('formatValue', () => {
  it('rounds and shortens numbers, leaves text as is', () => {
    expect(formatValue('3.0291962e+07')).toBe('30,3\u00a0млн')
    expect(formatValue('4.97342')).toBe('4.97')
    expect(formatValue('1159')).toBe('1159')
    expect(formatValue('0')).toBe('0')
    expect(formatValue('none')).toBe('none')
    expect(formatValue('')).toBe('')
    setLocale('en')
    expect(formatValue('5.5770223e+07')).toBe('55.8M')
    expect(formatValue('-2.5e9')).toBe('-2.5B')
    expect(formatValue('1e6')).toBe('1M')
  })
})

describe('apiURL', () => {
  it('drops credentials of the page URL', () => {
    // location.origin never carries user:pass, so the API URL is clean
    expect(apiURL('/api/config', new URL('https://u:p@board.example:8443/view#x').origin)).toBe('https://board.example:8443/api/config')
  })
})

describe('i18n', () => {
  it('formats age and titles in english', () => {
    setLocale('en')
    expect(formatAge(5 * 60_000)).toBe('5 min')
    expect(formatAge(2 * 24 * H)).toBe('2 d')
    const { sections } = buildSections([alert({ alertname: 'A' }, H)], view(), cfg, NOW)
    expect(sections[0].title).toBe('no group')
  })
  it('tr picks current language, falls back to en, then any', () => {
    expect(tr({ ru: 'Диск', en: 'Disk' })).toBe('Диск')
    setLocale('en')
    expect(tr({ ru: 'Диск', en: 'Disk' })).toBe('Disk')
    expect(tr({ ru: 'Диск' })).toBe('Диск')
    expect(tr('plain')).toBe('plain')
  })
  it('localized config titles for groups and problems', () => {
    setLocale('en')
    const c = { ...cfg, groups: [{ name: 'ops', title: { ru: 'Опсы', en: 'Ops team' } }], problemTitles: { Диск: { ru: 'Диск', en: 'Disk' } } }
    const { sections } = buildSections([alert({ alertname: 'X', team: 'ops' }, H, { problem: 'Диск' })], view(), c, NOW)
    expect(sections[0].title).toBe('Ops team')
    expect(sections[0].rows[0].title).toBe('Disk')
  })
})

describe('filterAlerts', () => {
  it('hides silenced unless asked, hidden groups and problems', () => {
    const a = [
      alert({ alertname: 'A', team: 'ops' }, H),
      alert({ alertname: 'B', team: 'batch' }, H),
      alert({ alertname: 'C' }, H, { state: 'suppressed', silencedBy: ['s'] }),
      alert({ alertname: 'D' }, H, { problem: 'Шум' }),
    ]
    const v = view({ hiddenGroups: ['batch'], hiddenProblems: ['Шум'] })
    expect(filterAlerts(a, v, cfg).map((x) => x.alertname)).toEqual(['A'])
    expect(filterAlerts(a, { ...v, showSilenced: true }, cfg).map((x) => x.alertname)).toEqual(['A', 'C'])
  })
  it('applies query and time filter', () => {
    const a = [alert({ alertname: 'A', node: 'db1' }, H), alert({ alertname: 'B', node: 'db2' }, 5 * H)]
    expect(filterAlerts(a, view({ query: 'node=db2' }), cfg).map((x) => x.alertname)).toEqual(['B'])
    const tf = { from: NOW - 2 * H, to: NOW }
    expect(filterAlerts(a, view({ timeFilter: tf }), cfg).map((x) => x.alertname)).toEqual(['A'])
    expect(filterAlerts(a, view({ timeFilter: tf }), cfg, { ignoreTime: true })).toHaveLength(2)
  })
})

describe('buildSections', () => {
  it('orders groups by config, ungrouped last, unmatched problem keeps alertname', () => {
    const a = [
      alert({ alertname: 'Unknown' }, H),
      alert({ alertname: 'X1', team: 'ops' }, 2 * H, { problem: 'Диск' }),
      alert({ alertname: 'X2', team: 'ops' }, 3 * H, { problem: 'Диск' }),
      alert({ alertname: 'Y', team: 'core' }, 10 * H),
    ]
    const { sections } = buildSections(a, view(), cfg, NOW)
    expect(sections.map((s) => s.title)).toEqual(['Core', 'Ops', 'без группы'])
    expect(sections[1].rows).toHaveLength(1)
    expect(sections[1].rows[0]).toMatchObject({ title: 'Диск', count: 2 })
    expect(sections[2].rows[0].title).toBe('Unknown')
  })

  it('moves stale alerts to the stale list and marks fresh rows', () => {
    const a = [
      alert({ alertname: 'A', team: 'ops' }, 10 * 60_000),
      alert({ alertname: 'A', team: 'ops' }, 30 * 24 * H),
    ]
    const { sections, stale } = buildSections(a, view(), cfg, NOW)
    expect(sections[0].count).toBe(1)
    expect(sections[0].rows[0].fresh).toBe(true)
    expect(stale.reduce((s, x) => s + x.count, 0)).toBe(1)
    const all = buildSections(a, view({ collapseStale: false }), cfg, NOW)
    expect(all.sections[0].count).toBe(2)
    expect(all.stale).toHaveLength(0)
  })

  it('sorts rows by newest, collects hosts, second level none yields one row per alert', () => {
    const a = [
      alert({ alertname: 'Old', team: 'ops', node: 'n1' }, 5 * H),
      alert({ alertname: 'New', team: 'ops', instance: 'i1:9100' }, H),
      alert({ alertname: 'New', team: 'ops', node: 'n2' }, 2 * H),
    ]
    const { sections } = buildSections(a, view(), cfg, NOW)
    expect(sections[0].rows.map((r) => r.title)).toEqual(['New', 'Old'])
    expect(sections[0].rows[0].hosts).toEqual(['i1:9100', 'n2'])
    const flat = buildSections(a, view({ groupBy: ['none', 'none'] }), cfg, NOW)
    expect(flat.sections).toHaveLength(1)
    expect(flat.sections[0].rows).toHaveLength(3)
  })
})

describe('section order', () => {
  const a = [
    alert({ alertname: 'A', team: 'core' }, H),
    alert({ alertname: 'B', team: 'ops' }, H),
    alert({ alertname: 'C' }, H),
  ]
  const titles = (order: string[]) => buildSections(a, view({ sectionOrder: { group: order, 'label:owner': ['x'] } }), cfg, NOW).sections.map((s) => s.title)

  it('custom order goes first, unlisted sections follow in default order', () => {
    expect(titles([])).toEqual(['Core', 'Ops', 'без группы'])
    expect(titles(['', 'ops'])).toEqual(['без группы', 'Ops', 'Core'])
    expect(titles(['ops'])).toEqual(['Ops', 'Core', 'без группы'])
  })

  it('each first grouping level keeps its own order', () => {
    const v = view({ groupBy: ['label:owner', 'problem'], sectionOrder: { group: ['ops', 'core'] } })
    const b = [alert({ alertname: 'A', owner: 'db' }, H), alert({ alertname: 'B', owner: 'web' }, 2 * H)]
    expect(buildSections(b, v, cfg, NOW).sections.map((s) => s.title)).toEqual(['db', 'web'])
    expect(buildSections(b, { ...v, sectionOrder: { ...v.sectionOrder, 'label:owner': ['web'] } }, cfg, NOW).sections.map((s) => s.title)).toEqual(['web', 'db'])
  })

  it('moveSection swaps neighbours and keeps saved keys of hidden sections', () => {
    const { sections } = buildSections(a, view(), cfg, NOW)
    expect(moveSection(sections, ['gone'], 1, -1)).toEqual(['ops', 'core', '', 'gone'])
    expect(moveSection(sections, [], 0, -1)).toEqual([])
    expect(moveSection(sections, [], 2, 1)).toEqual([])
  })
})

describe('label grouping', () => {
  it('groups by a configured label, missing value goes last', () => {
    const a = [alert({ alertname: 'A', owner: 'db' }, H), alert({ alertname: 'B' }, 2 * H), alert({ alertname: 'C', owner: 'web' }, 3 * H)]
    const { sections } = buildSections(a, view({ groupBy: ['label:owner', 'problem'] }), cfg, NOW)
    expect(sections.map((s) => s.title)).toEqual(['db', 'web', 'без «владелец»'])
  })
  it('host comes from the first present host label', () => {
    const { sections } = buildSections([alert({ instance: 'i:9100' }, H), alert({ node: 'n', instance: 'x' }, H)], view(), cfg, NOW)
    expect(sections[0].rows[0].hosts).toEqual(['i:9100', 'n'])
  })
})

describe('buildHistogram', () => {
  it('24h has 24 hourly buckets and counts older alerts separately', () => {
    const a = [alert({}, 30 * 60_000), alert({}, 90 * 60_000), alert({}, 40 * H)]
    const h = buildHistogram(a, '24h', NOW, 0)
    expect(h.buckets).toHaveLength(24)
    expect(h.buckets.reduce((s, b) => s + b.count, 0)).toBe(2)
    expect(h.older).toBe(1)
    expect(h.buckets[23].to).toBeGreaterThanOrEqual(NOW)
  })
  it('6h uses 15 minute buckets, 7d uses 6 hour buckets', () => {
    expect(buildHistogram([], '6h', NOW, 0).buckets).toHaveLength(24)
    expect(buildHistogram([], '7d', NOW, 0).buckets).toHaveLength(28)
  })
})

describe('links', () => {
  it('silenceURL escapes quotes and backslashes', () => {
    const u = silenceURL('http://am:9093/', { alertname: 'A', name: 'say "hi" \\o/' })
    expect(u.startsWith('http://am:9093/#/silences/new?filter=')).toBe(true)
    const filter = decodeURIComponent(u.split('filter=')[1])
    expect(filter).toBe('{alertname="A",name="say \\"hi\\" \\\\o/"}')
  })
  it('commonLabels intersects', () => {
    expect(commonLabels([{ labels: { a: '1', b: '2' } }, { labels: { a: '1', b: '3' } }])).toEqual({ a: '1' })
    expect(commonLabels([])).toEqual({})
  })
  it('renderLink substitutes and encodes labels', () => {
    expect(renderLink('https://g/d?var-node={{node}}&x={{missing}}', { node: 'a b' })).toBe('https://g/d?var-node=a%20b&x=')
  })
})

describe('grafana links', () => {
  const g = { ...cfg, grafana: [{ name: 'grafana', url: 'https://g.example', datasource: 'ds1', orgId: '1' }] }
  const panes = (url: string) => JSON.parse(new URL(url).searchParams.get('panes')!).a

  it('host matcher uses the label hosts come from, none when it is missing or mixed', () => {
    expect(hostSelector([alert({ node: 'db1.dc' }, H)], g)).toBe('node="db1.dc"')
    expect(hostSelector([alert({ node: 'db2' }, H), alert({ node: 'db1.dc', instance: 'x' }, H)], g)).toBe('node=~"db1.dc|db2"')
    expect(hostSelector([alert({ instance: '10.0.0.1:9100' }, H)], g)).toBe('instance="10.0.0.1:9100"')
    expect(hostSelector([alert({ node: 'a' }, H), alert({ instance: 'b' }, H)], g)).toBeNull()
    expect(hostSelector([alert({ node: 'a' }, H), alert({}, H)], g)).toBeNull()
  })

  it('row link has a query per expression, range starts from the oldest', () => {
    const a = [
      alert({ node: 'n1' }, 2 * H, { expr: 'up == 0' }),
      alert({ node: 'n2' }, 10 * H, { expr: 'up == 0' }),
      alert({ node: 'n3' }, H, { expr: 'other' }),
    ]
    const [l] = grafanaLinks(a, g, NOW)
    expect(l.url.startsWith('https://g.example/explore?')).toBe(true)
    const p = panes(l.url)
    expect(p.queries.map((q: { refId: string; expr: string }) => [q.refId, q.expr])).toEqual([
      ['A', 'up{node=~"n1|n2"} == 0'],
      ['B', 'other{node="n3"}'],
    ])
    expect(p.range).toEqual({ from: String(NOW - 11 * H), to: 'now' })
    expect(panes(grafanaLinks([a[0]], g, NOW)[0].url).range.from).toBe('now-6h')
    expect(panes(grafanaLinks([alert({}, 100 * H, { expr: 'x' })], g, NOW)[0].url).range.from).toBe('now-24h')
    expect(panes(grafanaLinks([alert({}, H, { expr: 'up == 0' })], g, NOW)[0].url).queries[0].expr).toBe('up == 0')
    expect(grafanaLinks([alert({}, H)], g, NOW)).toEqual([])
    expect(grafanaLinks(a, cfg, NOW)).toEqual([])
  })
})

describe('prom links', () => {
  const gen = (expr: string) => [
    { name: 'prom', url: `http://prom.example/graph?g0.expr=${encodeURIComponent(expr)}&g0.tab=1` },
    { name: 'prom-b', url: `http://prom-b.example/graph?g0.expr=${encodeURIComponent(expr)}&g0.tab=1` },
  ]
  const expr = (url: string) => new URL(url).searchParams.get('g0.expr')

  it('replace g0.expr with the expression narrowed to the hosts, keep other params', () => {
    const a = [
      alert({ node: 'n1' }, H, { expr: 'up == 0', promLinks: gen('up == 0') }),
      alert({ node: 'n2' }, H, { expr: 'up == 0', promLinks: gen('up == 0') }),
      alert({ node: 'n3' }, H, { expr: 'other', promLinks: gen('other') }),
    ]
    const links = promLinks(a, cfg)
    expect(links.map((l) => l.name)).toEqual(['prom', 'prom-b'])
    expect(links.map((l) => expr(l.url))).toEqual(['up{node=~"n1|n2"} == 0', 'up{node=~"n1|n2"} == 0'])
    const ps = new URL(links[0].url).searchParams
    expect([ps.get('g0.tab'), ps.get('g1.expr'), ps.get('g1.tab'), ps.get('g2.expr')]).toEqual(['1', 'other{node="n3"}', '1', null])
    const withInstance = [
      alert({ node: 'db', instance: 'db:13308' }, H, { expr: 'x > 1', promLinks: gen('x > 1') }),
      alert({ node: 'db2', instance: 'db2:3306' }, H, { expr: 'x > 1', promLinks: gen('x > 1') }),
    ]
    const q = expr(promLinks(withInstance, cfg)[0].url)!
    expect(q).toBe('(x{node=~"db|db2"} > 1) and on(instance) up{instance=~"db2:3306|db:13308"}')
    const byInstance = { ...cfg, hostLabels: ['instance'] }
    expect(expr(promLinks(withInstance, byInstance)[0].url)).toBe('x{instance=~"db2:3306|db:13308"} > 1')
    expect(new URL(links[0].url).searchParams.get('g0.tab')).toBe('1')
    expect(expr(promLinks([a[2]], cfg)[0].url)).toBe('other{node="n3"}')
  })

  it('left as is without a host or an expression', () => {
    const noHost = alert({}, H, { expr: 'up == 0', promLinks: gen('up == 0') })
    expect(expr(promLinks([noHost], cfg)[0].url)).toBe('up == 0')
    const noExpr = alert({ node: 'n' }, H, { promLinks: [{ name: 'prom', url: 'http://p/graph' }] })
    expect(promLinks([noExpr], cfg)).toEqual([{ name: 'prom', url: 'http://p/graph' }])
  })
})
