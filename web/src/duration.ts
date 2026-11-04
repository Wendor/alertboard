import { dateLocale, t } from './i18n'

const UNITS: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 }

export function parseDuration(s: string): number | null {
  const re = /(\d+)([dhms])/g
  let total = 0
  let consumed = 0
  for (const m of s.trim().matchAll(re)) {
    total += Number(m[1]) * UNITS[m[2]]
    consumed += m[0].length
  }
  return consumed > 0 && consumed === s.trim().length ? total : null
}

export function formatAge(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return t('age.lt1')
  if (min < 60) return t('age.min', { n: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('age.h', { n: h })
  const d = Math.floor(h / 24)
  if (d < 60) return t('age.d', { n: d })
  return t('age.mo', { n: Math.floor(d / 30) })
}

export function formatTime(ms: number, now: number): string {
  const d = new Date(ms)
  const hm = d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  if (new Date(now).toDateString() === d.toDateString()) return hm
  return `${d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' })} ${hm}`
}
