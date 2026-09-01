// Language Switcher Component
"use client"

import { useLanguage } from '@/src/application/providers/language.provider'
import { getLocaleDisplayName, locales, type Locale } from '@/src/shared/i18n/i18n.config'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Languages } from 'lucide-react'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage()
  const currentLocaleName = getLocaleDisplayName(locale, locale)
  const compactLocaleName = locale === 'zh-TW' ? '中文' : currentLocaleName
  const accessibleLabel = `${t.header.language}: ${currentLocaleName}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={accessibleLabel}
          title={accessibleLabel}
          className="h-9 w-auto gap-2 border-border/40 px-3 hover:bg-accent hover:text-accent-foreground @max-[72rem]:w-9 @max-[72rem]:px-0"
        >
          <Languages className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline @max-[72rem]:hidden">{compactLocaleName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={(value) => setLocale(value as Locale)}>
          {(Object.keys(locales) as Locale[]).map((loc) => (
            <DropdownMenuRadioItem key={loc} value={loc}>
              {getLocaleDisplayName(loc, locale)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
