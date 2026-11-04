import { describe, expect, it } from 'vitest'
import { parseConfig, parseDuration, readTLS, splitHostPort } from './config.js'
import { Enricher } from './enrich.js'

const enricher = () =>
  new Enricher(
    [
      { match: '.*DiskSpaceLessThan.*|TmpFSSpace.*', title: 'Мало места на диске' },
      { match: '.*TargetIsDown.*', title: 'Таргет недоступен' },
      { match: 'Db', title: 'DB' },
    ],
    [
      { name: 'prom', url: 'http://prom-a.example:9090' },
      { name: 'prom-b', url: 'http://prom-b.example:9090' },
    ],
  )

describe('Enricher', () => {
  it('problem: first anchored match wins, unmatched keeps alertname', () => {
    const e = enricher()
    expect(e.problem('FS_DiskSpaceLessThan10Percentages')).toBe('Мало места на диске')
    expect(e.problem('TmpFSSpaceLessThan20Percentages')).toBe('Мало места на диске')
    expect(e.problem('FS_PrometheusTargetIsDownFor1min')).toBe('Таргет недоступен')
    expect(e.problem('Unknown')).toBe('Unknown')
    expect(e.problem('DbTooManyConnections')).toBe('DbTooManyConnections')
  })

  it('promLinks rewrites host for every prometheus', () => {
    expect(enricher().promLinks('http://3f2a1c9e0b7d:9090/graph?g0.expr=up&g0.tab=1')).toEqual([
      { name: 'prom', url: 'http://prom-a.example:9090/graph?g0.expr=up&g0.tab=1' },
      { name: 'prom-b', url: 'http://prom-b.example:9090/graph?g0.expr=up&g0.tab=1' },
    ])
    expect(enricher().promLinks('')).toEqual([])
    expect(enricher().promLinks('::bad')).toEqual([])
  })

  it('promLinks keeps base path', () => {
    const e = new Enricher([], [{ name: 'p', url: 'https://prom.example/sub/' }])
    expect(e.promLinks('http://x:9090/graph?a=1')[0].url).toBe('https://prom.example/sub/graph?a=1')
  })

  it('promLinks without prometheus returns original url', () => {
    expect(new Enricher([], []).promLinks('http://x:9090/graph?a=1')).toEqual([{ name: 'prom', url: 'http://x:9090/graph?a=1' }])
  })

  it('expr is taken from generatorURL', () => {
    const e = new Enricher([], [], [{ name: 'grafana', url: 'https://grafana.example', datasource: 'ds1', orgId: '1' }])
    expect(e.expr('http://x:9090/graph?g0.expr=up%7Bjob%3D%22node%22%7D+%3D%3D+0&g0.tab=1')).toBe('up{job="node"} == 0')
    expect(e.expr('http://x:9090/graph')).toBe('')
    expect(e.expr('')).toBe('')
    expect(() => new Enricher([], [], [{ name: 'g', url: 'https://g', datasource: '', orgId: '1' }])).toThrow(/datasource/)
  })

  it('constructor errors', () => {
    expect(() => new Enricher([{ match: '[', title: 'x' }], [])).toThrow()
    expect(() => new Enricher([], [{ name: '', url: 'http://x' }])).toThrow(/name is required/)
    expect(() => new Enricher([], [{ name: 'x', url: 'nohost' }])).toThrow(/invalid/)
  })
})

describe('config', () => {
  it('parseDuration', () => {
    expect(parseDuration('5s')).toBe(5000)
    expect(parseDuration('7d')).toBe(7 * 86_400_000)
    expect(parseDuration('1h30m')).toBe(5_400_000)
    expect(parseDuration('500ms')).toBe(500)
    expect(() => parseDuration('5x')).toThrow()
    expect(() => parseDuration('')).toThrow()
  })

  it('splitHostPort', () => {
    expect(splitHostPort('127.0.0.1:8080')).toEqual({ host: '127.0.0.1', port: 8080 })
    expect(splitHostPort(':8080')).toEqual({ host: '0.0.0.0', port: 8080 })
    expect(splitHostPort('[::1]:8080')).toEqual({ host: '::1', port: 8080 })
    expect(() => splitHostPort('localhost')).toThrow()
  })

  it('defaults, prometheus links and views', () => {
    const c = parseConfig(`
alertmanager: { url: http://am:9093 }
prometheus:
  url: http://p1:8090
  extra: [{ name: p2, url: http://p2:8090 }]
ui:
  views:
    - { name: A, group_by: [group, problem], collapse_stale: false }
`)
    expect(c.listen).toBe('127.0.0.1:8080')
    expect(c.cacheTtlMs).toBe(5000)
    expect(c.alertmanager.publicUrl).toBe('http://am:9093')
    expect(c.prometheus).toEqual([
      { name: 'prom', url: 'http://p1:8090' },
      { name: 'p2', url: 'http://p2:8090' },
    ])
    expect(c.ui).toMatchObject({ groupLabel: 'severity', staleAfter: '7d', freshWithin: '1h', groups: [], links: [], searchSkipLabels: [], hostLabels: ['instance'], groupByLabels: [], problemTitles: {} })
    expect(JSON.parse(JSON.stringify(c.ui.views))).toEqual([
      { name: 'A', groupBy: ['group', 'problem'], showSilenced: false, collapseStale: false },
    ])
  })

  it('titles may be per-language maps, problem key is the first translation', () => {
    const c = parseConfig(`
alertmanager: { url: http://am }
problems:
  - { match: 'Disk.*', title: { ru: Диск, en: Disk } }
  - { match: 'Load.*', title: Нагрузка }
ui:
  groups: [{ name: ops, title: { ru: Опсы, en: Ops } }]
  views: [{ name: { ru: Всё, en: All } }]
`)
    expect(c.ui.problemTitles).toEqual({ Диск: { ru: 'Диск', en: 'Disk' } })
    expect(c.ui.groups[0].title).toEqual({ ru: 'Опсы', en: 'Ops' })
    expect(c.ui.views[0].name).toEqual({ ru: 'Всё', en: 'All' })
    const e = new Enricher(c.problems, [])
    expect(e.problem('DiskFull')).toBe('Диск')
    expect(e.problem('LoadHigh')).toBe('Нагрузка')
  })

  it('tls paths are resolved against the config directory and must be set together', () => {
    const base = 'alertmanager: { url: http://am }\n'
    expect(parseConfig(base).tls).toBeUndefined()
    expect(parseConfig(base + 'tls: { cert: certs/a.crt, key: /etc/k.key }', 'c', '/srv/ab').tls).toEqual({
      cert: '/srv/ab/certs/a.crt',
      key: '/etc/k.key',
    })
    expect(() => parseConfig(base + 'tls: { cert: a.crt }')).toThrow(/must be set together/)
    expect(() => readTLS({ cert: '/nonexistent.crt', key: '/nonexistent.key' })).toThrow(/tls.cert/)
  })

  it('validation errors', () => {
    expect(() => parseConfig('listen: x')).toThrow(/alertmanager.url is required/)
    expect(() => parseConfig('alertmanager: {url: http://a}\nui: {stale_after: week}')).toThrow(/invalid duration/)
  })
})
