import type ru from './ru'

const en: typeof ru = {
  app: {
    configError: 'Failed to load config: {error}',
    loading: 'Loading…',
  },
  board: {
    amDown: 'Alertmanager is unavailable: {error}',
    staleData: ' · showing data from {time}',
    loading: 'Loading alerts…',
  },
  views: { all: 'All' },
  groupBy: {
    group: 'group',
    problem: 'problem',
    host: 'host',
    none: 'no grouping',
  },
  group: {
    noGroup: 'no group',
    noLabel: 'no “{title}”',
    noHost: 'no host',
    all: 'All alerts',
  },
  age: {
    lt1: '<1 min',
    min: '{n} min',
    h: '{n} h',
    d: '{n} d',
    mo: '{n} mo',
  },
  num: { sep: '.', m: '{n}M', b: '{n}B', t: '{n}T' },
  query: { badRegex: 'invalid regex: {tok}' },
  row: {
    started: 'started: {time}',
    range: 'newest: {newest}\noldest: {oldest}',
    silenced: 'silenced',
    silence: 'silence',
    silenceAll: 'silence all',
    hide: 'hide',
    hideTitle: 'Hide this problem in the current view',
    labels: 'labels',
  },
  list: {
    empty: 'No alerts match the current filters',
    stale: 'stale (older than {d})',
    moveUp: 'Move up',
    moveDown: 'Move down',
  },
  toolbar: {
    search: 'search: host, alert, text… or instance=~db.*  severity!=info',
    groupBy: 'group by',
    then: 'then',
    showSilenced: 'show silenced',
    collapseOlder: 'collapse older than',
    showAgain: 'Show again',
    hidden: 'hidden: {p}',
  },
  timeline: {
    starts: 'alert starts',
    older: '· earlier: {n}',
    clear: 'Clear time filter',
  },
  header: {
    unsaved: 'unsaved changes',
    unnamed: 'unnamed',
    newViewName: 'new view name',
    newName: 'new name',
    ok: 'ok',
    save: 'save',
    saveTitle: 'Save changes to the current view',
    newView: '+ new view',
    rename: 'Rename',
    remove: 'Delete view',
    refresh: 'Refresh now',
    theme: 'Theme',
    themes: { system: '◐ auto', light: '☀ light', dark: '☾ dark' },
    language: 'Language',
  },
}

export default en
