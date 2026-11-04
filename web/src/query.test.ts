import { beforeEach, describe, expect, it } from 'vitest'
import { setLocale } from './i18n'
import { matchAlert, parseQuery } from './query'
import type { Alert } from './types'

function alert(labels: Record<string, string>, extra: Partial<Alert> = {}): Alert {
  return {
    fingerprint: 'f',
    alertname: labels.alertname ?? 'X',
    problem: labels.alertname ?? 'X',
    labels,
    annotations: {},
    startsAt: '2026-11-04T09:00:00Z',
    state: 'active',
    silencedBy: [],
    inhibitedBy: [],
    promLinks: [],
    ...extra,
  }
}

const m = (q: string, a: Alert) => matchAlert(a, parseQuery(q).terms)

beforeEach(() => setLocale('ru'))

describe('parseQuery / matchAlert', () => {
  it('regex label matcher is anchored', () => {
    expect(m('node=~db.*', alert({ node: 'db09.dc1.example' }))).toBe(true)
    expect(m('node=~db.*', alert({ node: 'web04.dc2.example' }))).toBe(false)
    expect(m('node=~db', alert({ node: 'db09' }))).toBe(false)
  })

  it('negative matchers', () => {
    expect(m('severity!=info', alert({ severity: 'info' }))).toBe(false)
    expect(m('severity!=info', alert({ severity: 'critical' }))).toBe(true)
    expect(m('severity!=info', alert({}))).toBe(true)
    expect(m('node!~fs.*', alert({ node: 'fs25' }))).toBe(false)
  })

  it('missing label equals empty string', () => {
    expect(m('team=', alert({}))).toBe(true)
  })

  it('free text matches alertname, problem, annotations, label values case-insensitively', () => {
    expect(m('db', alert({ alertname: 'DbTooManyConnections' }))).toBe(true)
    expect(m('диск', alert({ alertname: 'A' }, { problem: 'Мало места на ДИСКЕ' }))).toBe(true)
    expect(m('st9', alert({}, { annotations: { name: 'fs25 mount point /mnt/st9' } }))).toBe(true)
    expect(m('dc1', alert({ node: 'db09.dc1.example' }))).toBe(true)
    expect(m('nothing', alert({ node: 'db09' }))).toBe(false)
  })

  it('free text skips configured labels, label matchers still see them', () => {
    const a = alert({ alertname: 'HighLoad', group: 'app,ssl_certs' })
    const skip = new Set(['group'])
    expect(matchAlert(a, parseQuery('ssl').terms, skip)).toBe(false)
    expect(matchAlert(a, parseQuery('group=~.*ssl.*').terms, skip)).toBe(true)
    expect(matchAlert(a, parseQuery('ssl').terms)).toBe(true)
  })

  it('all terms must match', () => {
    const a = alert({ alertname: 'DbTooManyConnections', node: 'db09' })
    expect(m('toomany node=db09', a)).toBe(true)
    expect(m('toomany node=db10', a)).toBe(false)
  })

  it('quoted values may contain spaces', () => {
    const a = alert({ mountpoint: 'mount point /' })
    expect(m('mountpoint="mount point /"', a)).toBe(true)
    expect(m('"point /"', a)).toBe(true)
  })

  it('invalid regex is reported and never matches', () => {
    const q = parseQuery('node=~[')
    expect(q.errors.length).toBe(1)
    expect(matchAlert(alert({ node: '[' }), q.terms)).toBe(false)
  })

  it('empty query matches everything', () => {
    expect(m('   ', alert({}))).toBe(true)
  })
})
