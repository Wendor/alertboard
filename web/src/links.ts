const quote = (v: string) => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'

export function silenceURL(base: string, labels: Record<string, string>): string {
  const matchers = Object.entries(labels)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${quote(v)}`)
  return `${base.replace(/\/+$/, '')}/#/silences/new?filter=${encodeURIComponent(`{${matchers.join(',')}}`)}`
}

export function commonLabels(alerts: { labels: Record<string, string> }[]): Record<string, string> {
  if (alerts.length === 0) return {}
  const out: Record<string, string> = { ...alerts[0].labels }
  for (const a of alerts.slice(1)) {
    for (const k of Object.keys(out)) if (a.labels[k] !== out[k]) delete out[k]
  }
  return out
}

export function renderLink(tpl: string, labels: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, k) => encodeURIComponent(labels[k] ?? ''))
}
