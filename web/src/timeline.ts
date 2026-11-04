import { startOf } from './group'
import type { Alert, Range } from './types'

const H = 3_600_000

export const RANGE_SPEC: Record<Range, { span: number; step: number }> = {
  '6h': { span: 6 * H, step: H / 4 },
  '24h': { span: 24 * H, step: H },
  '7d': { span: 7 * 24 * H, step: 6 * H },
}

export interface Bucket {
  from: number
  to: number
  count: number
}

export interface Histogram {
  buckets: Bucket[]
  older: number
  max: number
}

/** Buckets are aligned to local time; tzOffsetMs is Date#getTimezoneOffset() in ms. */
export function buildHistogram(
  alerts: Alert[],
  range: Range,
  now: number,
  tzOffsetMs = new Date(now).getTimezoneOffset() * 60_000,
): Histogram {
  const { span, step } = RANGE_SPEC[range]
  const n = span / step
  const end = Math.floor((now - tzOffsetMs) / step) * step + step + tzOffsetMs
  const start = end - n * step
  const buckets: Bucket[] = Array.from({ length: n }, (_, i) => ({
    from: start + i * step,
    to: start + (i + 1) * step,
    count: 0,
  }))
  let older = 0
  for (const a of alerts) {
    const t = startOf(a)
    if (t < start) older++
    else buckets[Math.min(n - 1, Math.floor((t - start) / step))].count++
  }
  return { buckets, older, max: Math.max(0, ...buckets.map((b) => b.count)) }
}
