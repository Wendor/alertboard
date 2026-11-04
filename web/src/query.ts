import { t } from './i18n'
import type { Alert } from './types'

export type Term =
  | { kind: 'text'; value: string }
  | { kind: 'eq' | 'ne'; label: string; value: string }
  | { kind: 're' | 'nre'; label: string; re: RegExp | null }

export interface ParsedQuery {
  terms: Term[]
  errors: string[]
}

function tokenize(q: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let quoted = false
  let has = false
  for (const ch of q) {
    if (ch === '"') {
      quoted = !quoted
      has = true
    } else if (!quoted && /\s/.test(ch)) {
      if (has) tokens.push(cur)
      cur = ''
      has = false
    } else {
      cur += ch
      has = true
    }
  }
  if (has) tokens.push(cur)
  return tokens
}

const MATCHER = /^([A-Za-z_][A-Za-z0-9_]*)(=~|!~|!=|=)(.*)$/s

export function parseQuery(q: string): ParsedQuery {
  const terms: Term[] = []
  const errors: string[] = []
  for (const tok of tokenize(q)) {
    const mm = MATCHER.exec(tok)
    if (!mm) {
      terms.push({ kind: 'text', value: tok.toLowerCase() })
      continue
    }
    const [, label, op, value] = mm
    if (op === '=' || op === '!=') {
      terms.push({ kind: op === '=' ? 'eq' : 'ne', label, value })
      continue
    }
    let re: RegExp | null = null
    try {
      re = new RegExp(`^(?:${value})$`)
    } catch {
      errors.push(t('query.badRegex', { tok }))
    }
    terms.push({ kind: op === '=~' ? 're' : 'nre', label, re })
  }
  return { terms, errors }
}

function textMatch(a: Alert, needle: string, skip: ReadonlySet<string>): boolean {
  const labels = Object.entries(a.labels).flatMap(([k, v]) => (skip.has(k) ? [] : [v]))
  const hay = [a.alertname, a.problem, ...Object.values(a.annotations), ...labels]
  return hay.some((s) => s.toLowerCase().includes(needle))
}

// skipLabels are not searched by free text, label matchers still see them
export function matchAlert(a: Alert, terms: Term[], skipLabels: ReadonlySet<string> = new Set()): boolean {
  return terms.every((t) => {
    if (t.kind === 'text') return textMatch(a, t.value, skipLabels)
    const v = a.labels[t.label] ?? ''
    switch (t.kind) {
      case 'eq':
        return v === t.value
      case 'ne':
        return v !== t.value
      case 're':
        return t.re !== null && t.re.test(v)
      case 'nre':
        return t.re !== null && !t.re.test(v)
    }
  })
}
