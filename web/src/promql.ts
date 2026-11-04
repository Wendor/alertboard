// Adds a label matcher to every vector selector of a PromQL expression, so Prometheus
// loads only the matching series. A small scanner, not a full parser: it skips strings,
// comments, ranges and label lists of by/without/on/ignoring/group_left/group_right.

const KEYWORDS = new Set(['and', 'or', 'unless', 'by', 'without', 'on', 'ignoring', 'group_left', 'group_right', 'bool', 'offset', 'inf', 'nan'])
const LABEL_LISTS = new Set(['by', 'without', 'on', 'ignoring', 'group_left', 'group_right'])
const IDENT = /[A-Za-z_:][A-Za-z0-9_:]*/y
// hex, durations (5m, 1h30m), floats (0.8, 1e+06)
const NUMBER = /0x[0-9a-f]+|(?:[0-9]+(?:ms|[smhdwy]))+|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:e[+-]?[0-9]+)?/iy

export function addMatcher(expr: string, matcher: string): string {
  let out = ''
  let i = 0
  const n = expr.length
  const skipSpace = (j: number) => {
    while (j < n && /\s/.test(expr[j])) j++
    return j
  }
  // end index (exclusive) of a quoted string starting at j
  const stringEnd = (j: number) => {
    const q = expr[j]
    j++
    while (j < n && expr[j] !== q) j += q !== '`' && expr[j] === '\\' ? 2 : 1
    return j + 1
  }
  // end index (exclusive) of a balanced block opened at j, honouring strings inside
  const blockEnd = (j: number, open: string, close: string) => {
    let depth = 0
    while (j < n) {
      const c = expr[j]
      if (c === '"' || c === "'" || c === '`') {
        j = stringEnd(j)
        continue
      }
      if (c === open) depth++
      else if (c === close && --depth === 0) return j + 1
      j++
    }
    return n
  }
  const wordAt = (j: number) => {
    IDENT.lastIndex = j
    return IDENT.exec(expr)?.[0] ?? ''
  }
  // {a="b", } -> {a="b", <matcher>}
  const withMatcher = (braces: string) => {
    const inner = braces.slice(1, -1).replace(/[\s,]*$/, '')
    return `{${inner ? `${inner},` : ''}${matcher}}`
  }

  while (i < n) {
    const c = expr[i]
    if (c === '"' || c === "'" || c === '`') {
      const e = stringEnd(i)
      out += expr.slice(i, e)
      i = e
    } else if (c === '#') {
      const e = expr.indexOf('\n', i)
      const end = e < 0 ? n : e
      out += expr.slice(i, end)
      i = end
    } else if (c === '[') {
      const e = blockEnd(i, '[', ']')
      out += expr.slice(i, e)
      i = e
    } else if (c === '{') {
      const e = blockEnd(i, '{', '}')
      out += withMatcher(expr.slice(i, e))
      i = e
    } else if (/[0-9.]/.test(c)) {
      NUMBER.lastIndex = i
      const m = NUMBER.exec(expr)
      const e = m && m[0] ? i + m[0].length : i + 1
      out += expr.slice(i, e)
      i = e
    } else if (/[A-Za-z_:]/.test(c)) {
      const word = wordAt(i)
      const e = i + word.length
      const next = skipSpace(e)
      const lower = word.toLowerCase()
      out += word
      i = e
      if (LABEL_LISTS.has(lower)) {
        // copy "by (a, b)" untouched
        if (expr[next] === '(') {
          const end = blockEnd(next, '(', ')')
          out += expr.slice(e, end)
          i = end
        }
      } else if (KEYWORDS.has(lower) || expr[next] === '(') {
        // operator, modifier or function call
      } else if (LABEL_LISTS.has(wordAt(next).toLowerCase())) {
        // aggregation written as "sum by (x) (...)"
      } else if (expr[next] === '{') {
        const end = blockEnd(next, '{', '}')
        out += expr.slice(e, next) + withMatcher(expr.slice(next, end))
        i = end
      } else {
        out += `{${matcher}}`
      }
    } else {
      out += c
      i++
    }
  }
  return out
}

const promString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// label="v" for one value, label=~"a|b" for several
export function hostMatcher(label: string, values: string[]): string {
  return values.length === 1 ? `${label}=${promString(values[0])}` : `${label}=~${promString(values.map(reEscape).join('|'))}`
}

const MARK = 'alertboard_keep'

// Keeps only result series whose label matches one of the values, without touching selectors:
// matching series get a temporary label, "and" drops the rest, the outer label_replace removes it.
// Cheap only on an already narrowed expression, since it filters after evaluation.
export function keepSeries(expr: string, label: string, values: string[]): string {
  const re = promString(values.map(reEscape).join('|'))
  const marked = `label_replace((${expr}), "${MARK}", "1", ${promString(label)}, ${re})`
  return `label_replace(${marked} and on(${MARK}) label_replace(vector(1), "${MARK}", "1", "", ""), "${MARK}", "", "", "")`
}
