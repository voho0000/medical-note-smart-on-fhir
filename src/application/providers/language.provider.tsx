// Language Provider
"use client"

import { createContext, startTransition, useCallback, useContext, useMemo, useState, useEffect, type ReactNode } from 'react'
import { locales, defaultLocale, type Locale } from '@/src/shared/i18n/i18n.config'
import type { Translation } from '@/src/shared/i18n/locales/en'

interface LanguageContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translation
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const LOCALE_STORAGE_KEY = 'medical-note-locale'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale)

  // Load locale from localStorage on mount
  useEffect(() => {
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null
    if (savedLocale && (savedLocale === 'en' || savedLocale === 'zh-TW')) {
      // Restore after hydration so localStorage cannot change the first client
      // render relative to the server-generated markup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(savedLocale)
    } else {
      // Set default locale to zh-TW if no saved preference
      setLocaleState('zh-TW')
    }
  }, [])

  const setLocale = useCallback((newLocale: Locale) => {
    // A locale change updates labels throughout every force-mounted clinical
    // workspace. Treat that broad render as interruptible work so the language
    // menu can close immediately instead of blocking the main thread until all
    // hidden reports, summaries, and chat views have finished translating.
    startTransition(() => {
      setLocaleState(newLocale)
    })
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale)
    document.documentElement.lang = newLocale
  }, [])

  // Every consumer of this context re-renders whenever the value identity
  // changes. A fresh object per provider render made a locale-independent
  // parent re-render cascade through the whole workspace.
  const value = useMemo<LanguageContextType>(
    () => ({ locale, setLocale, t: locales[locale] }),
    [locale, setLocale],
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

/** Locale-only presentation helpers may also render in isolated previews and
 * unit tests that intentionally omit the app provider. They can use this
 * optional hook and retain the product's default Traditional Chinese locale. */
export function useOptionalLanguage() {
  return useContext(LanguageContext)
}
