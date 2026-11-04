import { beforeEach, describe, expect, it } from 'vitest'
import { apiURL } from './api'
import { formatAge, parseDuration } from './duration'
import { setLocale, tr } from './i18n'
import { buildSections, filterAlerts } from './group'
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
