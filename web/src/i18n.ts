import { createI18n } from 'vue-i18n'
import en from './locales/en'
import ru from './locales/ru'

export const LOCALES = ['ru', 'en'] as const
export type Locale = (typeof LOCALES)[number]

// config texts: a plain string or a per-language map, e.g. {ru: Диск, en: Disk}
export type Localized = string | Partial<Record<string, string>>

const KEY = 'alertboard.lang'
const DATE_LOCALES: Record<Locale, string> = { ru: 'ru-RU', en: 'en-GB' }

function detect(): Locale {
  const stored = globalThis.localStorage?.getItem(KEY)
  if (LOCALES.includes(stored as Locale)) return stored as Locale
  return globalThis.navigator?.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detect(),
  fallbackLocale: 'en',
  messages: { ru, en },
})

export const t = i18n.global.t
export const locale = (): Locale => i18n.global.locale.value as Locale
export const dateLocale = () => DATE_LOCALES[locale()]

export function setLocale(l: Locale) {
  i18n.global.locale.value = l
  globalThis.localStorage?.setItem(KEY, l)
  if (globalThis.document) document.documentElement.lang = l
}

// stable identifier of a config text: the string itself or its first translation
export const textKey = (v: Localized): string => (typeof v === 'string' ? v : (Object.values(v).find(Boolean) ?? ''))

export function tr(v: Localized | undefined): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return v[locale()] ?? v.en ?? Object.values(v).find(Boolean) ?? ''
}
