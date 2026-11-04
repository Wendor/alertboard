import { groupKeys } from './group'
import { t, textKey, tr } from './i18n'
import { RANGES, type ConfigView, type GroupKey, type Range, type UIConfig, type ViewState } from './types'

const STORAGE_KEY = 'alertboard.views'
const ACTIVE_KEY = 'alertboard.active'

function asGroupKey(s: string | undefined, d: GroupKey, cfg: UIConfig): GroupKey {
  const k = (s === 'type' ? 'label:type' : s) as GroupKey
  return groupKeys(cfg).includes(k) ? k : d
}
const asGroupBy = (g: string[] | undefined, cfg: UIConfig): [GroupKey, GroupKey] => [
  asGroupKey(g?.[0], 'group', cfg),
  asGroupKey(g?.[1], 'problem', cfg),
]
const asRange = (s: string | undefined): Range => (RANGES.includes(s as Range) ? (s as Range) : '24h')

export function fromConfig(v: ConfigView, cfg: UIConfig): ViewState {
  return {
    name: textKey(v.name),
    query: v.query ?? '',
    groupBy: asGroupBy(v.groupBy, cfg),
    hiddenGroups: v.hiddenGroups ?? [],
    hiddenProblems: v.hiddenProblems ?? [],
    showSilenced: v.showSilenced ?? false,
    collapseStale: v.collapseStale ?? true,
    staleAfter: v.staleAfter || cfg.staleAfter,
    range: asRange(v.range),
  }
}

// config views are stored by key and shown in the current language; user-named views as is
export function viewTitle(name: string, cfg: UIConfig): string {
  const v = cfg.views.find((x) => textKey(x.name) === name)
  return v ? tr(v.name) : name
}

export function defaultViews(cfg: UIConfig): ViewState[] {
  const views = cfg.views.map((v) => fromConfig(v, cfg))
  return views.length ? views : [fromConfig({ name: t('views.all') }, cfg)]
}

export function loadViews(cfg: UIConfig): ViewState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ViewState[]
      if (Array.isArray(parsed) && parsed.length) return parsed.map((v) => ({ ...fromConfig({ name: v.name }, cfg), ...v, groupBy: asGroupBy(v.groupBy, cfg), timeFilter: undefined }))
    }
  } catch {
    /* corrupted storage falls back to defaults */
  }
  return defaultViews(cfg)
}

export function saveViews(views: ViewState[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views.map(({ timeFilter: _, ...v }) => v)))
}

export const loadActive = () => localStorage.getItem(ACTIVE_KEY) ?? ''
export const saveActive = (name: string) => localStorage.setItem(ACTIVE_KEY, name)

export function sameView(a: ViewState, b: ViewState): boolean {
  const strip = ({ timeFilter: _, ...v }: ViewState) => JSON.stringify(v)
  return strip(a) === strip(b)
}

export function toHash(v: ViewState): string {
  const p = new URLSearchParams()
  p.set('view', v.name)
  if (v.query) p.set('q', v.query)
  p.set('g', v.groupBy.join(','))
  if (v.hiddenGroups.length) p.set('hg', v.hiddenGroups.join(','))
  if (v.hiddenProblems.length) p.set('hp', v.hiddenProblems.join('|'))
  if (v.showSilenced) p.set('silenced', '1')
  if (!v.collapseStale) p.set('stale', 'show')
  p.set('sa', v.staleAfter)
  p.set('r', v.range)
  if (v.timeFilter) p.set('t', `${v.timeFilter.from}-${v.timeFilter.to}`)
  return '#' + p.toString()
}

export function fromHash(hash: string, cfg: UIConfig): ViewState | null {
  if (!hash.startsWith('#') || !hash.includes('view=')) return null
  const p = new URLSearchParams(hash.slice(1))
  const g = (p.get('g') ?? '').split(',')
  const split = (s: string | null, sep: string) => (s ? s.split(sep) : [])
  const t = /^(\d+)-(\d+)$/.exec(p.get('t') ?? '')
  return {
    ...fromConfig({ name: p.get('view') ?? '' }, cfg),
    query: p.get('q') ?? '',
    groupBy: asGroupBy(g, cfg),
    hiddenGroups: split(p.get('hg'), ','),
    hiddenProblems: split(p.get('hp'), '|'),
    showSilenced: p.get('silenced') === '1',
    collapseStale: p.get('stale') !== 'show',
    staleAfter: p.get('sa') || cfg.staleAfter,
    range: asRange(p.get('r') ?? undefined),
    timeFilter: t ? { from: Number(t[1]), to: Number(t[2]) } : undefined,
  }
}
