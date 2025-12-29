// i18n configuration
import { en } from './locales/en'
import { zhTW } from './locales/zh-TW'

export type Locale = 'en' | 'zh-TW'

export const locales: Record<Locale, typeof en> = {
  'en': en,
  'zh-TW': zhTW,
}

export const defaultLocale: Locale = 'zh-TW'

export const localeNames: Record<Locale, string> = {
  'en': 'English',
  'zh-TW': '繁體中文',
}
