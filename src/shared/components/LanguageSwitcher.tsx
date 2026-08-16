// Language Switcher Component
"use client"

import { useLanguage } from '@/src/application/providers/language.provider'
import { localeNames, type Locale } from '@/src/shared/i18n/i18n.config'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Languages } from 'lucide-react'

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage()
  const compactLocaleName = locale === 'zh-TW' ? '繁中' : localeNames[locale]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={localeNames[locale]}
          title={localeNames[locale]}
          className="h-9 w-auto gap-2 border-border/40 px-3 hover:bg-accent hover:text-accent-foreground @max-[72rem]:w-9 @max-[72rem]:px-0"
        >
          <Languages className="h-4 w-4" />
          <span className="hidden sm:inline @max-[72rem]:hidden">{compactLocaleName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(localeNames) as Locale[]).map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => setLocale(loc)}
            className={locale === loc ? 'bg-accent' : ''}
          >
            {localeNames[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
