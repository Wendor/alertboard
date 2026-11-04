import type { Localized } from './i18n'

export interface Alert {
  fingerprint: string
  alertname: string
  problem: string
  labels: Record<string, string>
  annotations: Record<string, string>
  startsAt: string
  state: string
  silencedBy: string[]
  inhibitedBy: string[]
  promLinks: Link[]
}

export interface AlertsResponse {
  fetchedAt: string
  alerts: Alert[]
}

export interface Link {
  name: string
  url: string
}

export interface LinkTemplate {
  name: Localized
  url: string
}

export interface ConfigView {
  name: Localized
  query?: string
  groupBy?: string[]
  hiddenGroups?: string[]
  hiddenProblems?: string[]
  showSilenced?: boolean
  collapseStale?: boolean
  staleAfter?: string
  range?: string
}

export interface UIConfig {
  alertmanagerURL: string
  groupLabel: string
  groups: { name: string; title: Localized }[]
  staleAfter: string
  freshWithin: string
  searchSkipLabels?: string[]
  hostLabels: string[]
  groupByLabels: { label: string; title: Localized }[]
  problemTitles?: Record<string, Localized>
  links: LinkTemplate[]
  views: ConfigView[]
}

// label:<name> groups by a label from ui.group_by_labels
export type GroupKey = 'group' | 'problem' | 'host' | 'none' | `label:${string}`
export const BASE_GROUP_KEYS: GroupKey[] = ['group', 'problem', 'host', 'none']

export type Range = '6h' | '24h' | '7d'
export const RANGES: Range[] = ['6h', '24h', '7d']

export interface TimeFilter {
  from: number
  to: number
}

export interface ViewState {
  name: string
  query: string
  groupBy: [GroupKey, GroupKey]
  hiddenGroups: string[]
  hiddenProblems: string[]
  showSilenced: boolean
  collapseStale: boolean
  staleAfter: string
  range: Range
  timeFilter?: TimeFilter
}
