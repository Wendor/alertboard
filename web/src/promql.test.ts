import { describe, expect, it } from 'vitest'
import { addMatcher, hostMatcher } from './promql'

const m = (e: string) => addMatcher(e, 'node="h"')

describe('addMatcher', () => {
  it('adds to existing braces and bare metric names', () => {
    expect(m('up{alert_group!~"x",node!~"mfs.*"} != 1')).toBe('up{alert_group!~"x",node!~"mfs.*",node="h"} != 1')
    expect(m('up == 0')).toBe('up{node="h"} == 0')
    expect(m('up{}')).toBe('up{node="h"}')
    expect(m('up{a="b", }')).toBe('up{a="b",node="h"}')
    expect(m('{__name__="up"}')).toBe('{__name__="up",node="h"}')
    expect(m('job:up:sum > 1e+06')).toBe('job:up:sum{node="h"} > 1e+06')
  })

  it('leaves functions, aggregations, label lists, strings and ranges alone', () => {
    expect(m('node_load1{group!~".*(a|b).*"} > (2 * count without (cpu) (count without (mode) (node_cpu_seconds_total{group!~"x"})))')).toBe(
      'node_load1{group!~".*(a|b).*",node="h"} > (2 * count without (cpu) (count without (mode) (node_cpu_seconds_total{group!~"x",node="h"})))',
    )
    expect(m('absent(kafka_consumergroup_lag) == 1')).toBe('absent(kafka_consumergroup_lag{node="h"}) == 1')
    expect(m('sum by (job) (up{job=~"a"}) < 2')).toBe('sum by (job) (up{job=~"a",node="h"}) < 2')
    expect(m('sum(up) by (job)')).toBe('sum(up{node="h"}) by (job)')
    expect(m('rate(x{device!="tap77"}[5m]) / y')).toBe('rate(x{device!="tap77",node="h"}[5m]) / y{node="h"}')
    expect(m('time() - mtime{file=~".*/k.prom"} > 300')).toBe('time() - mtime{file=~".*/k.prom",node="h"} > 300')
    expect(m('a and on(cluster) b unless ignoring(x) c')).toBe('a{node="h"} and on(cluster) b{node="h"} unless ignoring(x) c{node="h"}')
    expect(m('a * on(x) group_left(y, z) b')).toBe('a{node="h"} * on(x) group_left(y, z) b{node="h"}')
    expect(m('label_replace(up, "a", "$1", "b", "(.*)")')).toBe('label_replace(up{node="h"}, "a", "$1", "b", "(.*)")')
    expect(m('quantile(0.8, d{ACCOUNT_ID!=""}) > 1')).toBe('quantile(0.8, d{ACCOUNT_ID!="",node="h"}) > 1')
    expect(m('max_over_time(up[1h:5m]) offset 5m')).toBe('max_over_time(up{node="h"}[1h:5m]) offset 5m')
    expect(m('up == bool 1')).toBe('up{node="h"} == bool 1')
    expect(m('x{a="}{"} > 0')).toBe('x{a="}{",node="h"} > 0')
  })

  it('builds the matcher', () => {
    expect(hostMatcher('node', ['db1.dc'])).toBe('node="db1.dc"')
    expect(hostMatcher('node', ['db1.dc', 'a"b'])).toBe('node=~"db1\\\\.dc|a\\"b"')
  })
})
