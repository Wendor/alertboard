import { beforeEach, describe, expect, it } from 'vitest'
import { setLocale } from './i18n'
import type { UIConfig, ViewState } from './types'
import { fromConfig, fromHash, sameView, toHash, viewTitle } from './views'

const cfg: UIConfig = {
  alertmanagerURL: '',
  groupLabel: 'severity',
  groups: [],
  staleAfter: '7d',
  freshWithin: '1h',
  hostLabels: ['instance'],
  groupByLabels: [{ label: 'type', title: 'чат' }],
  links: [],
  views: [],
}

beforeEach(() => setLocale('ru'))

describe('views', () => {
  it('config view gets defaults', () => {
    expect(fromConfig({ name: 'x' }, cfg)).toMatchObject({
      groupBy: ['group', 'problem'],
      collapseStale: true,
      staleAfter: '7d',
      range: '24h',
      showSilenced: false,
    })
    expect(fromConfig({ name: 'x', groupBy: ['bogus', 'host'], range: '1y' }, cfg)).toMatchObject({
      groupBy: ['group', 'host'],
      range: '24h',
    })
    expect(fromConfig({ name: 'x', groupBy: ['type', 'label:team'] }, cfg).groupBy).toEqual(['label:type', 'problem'])
  })

  it('config view names are keys shown in the current language', () => {
    const c = { ...cfg, views: [{ name: { ru: 'Всё', en: 'All' } }] }
    expect(fromConfig(c.views[0], c).name).toBe('Всё')
    expect(viewTitle('Всё', c)).toBe('Всё')
    setLocale('en')
    expect(viewTitle('Всё', c)).toBe('All')
    expect(viewTitle('Мой вид', c)).toBe('Мой вид')
  })

  it('old plain section order lists and config lists map to the first grouping level', () => {
    expect(fromConfig({ name: 'x', groupBy: ['host', 'none'], sectionOrder: ['a', 'b'] }, cfg).sectionOrder).toEqual({ host: ['a', 'b'] })
    expect(fromConfig({ name: 'x' }, cfg).sectionOrder).toEqual({})
  })

  it('hash round-trips', () => {
    const v: ViewState = {
      name: 'Базы',
      query: 'instance=~"db.*" disk',
      groupBy: ['problem', 'host'],
      hiddenGroups: ['batch', ''],
      hiddenProblems: ['Мало места на диске', 'A,B'],
      sectionOrder: { problem: ['ops', '', 'core'] },
      showSilenced: true,
      collapseStale: false,
      staleAfter: '3d',
      range: '7d',
      timeFilter: { from: 1000, to: 2000 },
    }
    expect(fromHash(toHash(v), cfg)).toEqual(v)
  })

  it('ignores unrelated hashes', () => {
    expect(fromHash('', cfg)).toBeNull()
    expect(fromHash('#/silences', cfg)).toBeNull()
  })

  it('sameView ignores time filter', () => {
    const a = fromConfig({ name: 'x' }, cfg)
    expect(sameView(a, { ...a, timeFilter: { from: 1, to: 2 } })).toBe(true)
    expect(sameView(a, { ...a, query: 'q' })).toBe(false)
  })
})
