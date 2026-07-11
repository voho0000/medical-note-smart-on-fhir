// Mobile-only header overflow menu.
//
// On desktop (≥640px) Audience + Language live as visible chips in the
// header, so there's nothing left to collapse — this component renders
// nothing. On mobile the chips would clip, so we collapse them into a
// kebab `⋯` menu alongside a link into Settings → 顯示與關於 (which
// houses theme, connection info, feedback, and about).
//
// Pattern: Radix DropdownMenu wrapping an icon-only trigger. The whole wrapper
// carries `sm:hidden` so desktop doesn't even mount the trigger.
'use client'

import {
  MoreHorizontal,
  Palette,
  Stethoscope,
  User as UserIcon,
  Languages,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience, type Audience } from '@/src/application/providers/audience.provider'
import { useRightPanel } from '@/src/application/providers/right-panel.provider'
import { localeNames, type Locale } from '@/src/shared/i18n/i18n.config'

const AUDIENCE_ORDER: Audience[] = ['medical', 'patient']

export function HeaderOverflowMenu() {
  const { t, locale, setLocale } = useLanguage()
  const { audience, setAudience } = useAudience()
  const { setActiveTab } = useRightPanel()

  return (
    // `sm:hidden` — desktop hides the whole menu. The Audience/Language
    // chips that this menu replaces are visible at the same breakpoint.
    <div className="sm:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label={(t.header as any)?.moreMenu ?? '更多'}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t.audience.switcherLabel}
          </DropdownMenuLabel>
          {AUDIENCE_ORDER.map((value) => {
            const ItemIcon = value === 'medical' ? Stethoscope : UserIcon
            const label = value === 'medical' ? t.audience.medical : t.audience.patient
            return (
              <DropdownMenuItem
                key={value}
                onClick={() => setAudience(value)}
                className={`gap-2 ${audience === value ? 'bg-accent' : ''}`}
              >
                <ItemIcon className="h-4 w-4" />
                {label}
              </DropdownMenuItem>
            )
          })}

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Languages className="h-4 w-4" />
              {localeNames[locale]}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {(Object.keys(localeNames) as Locale[]).map((loc) => (
                <DropdownMenuItem
                  key={loc}
                  onClick={() => setLocale(loc)}
                  className={locale === loc ? 'bg-accent' : ''}
                >
                  {localeNames[loc]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* All the other formerly-header items (theme, connection info,
              feedback, version) now live in this Settings sub-tab. */}
          <DropdownMenuItem
            onClick={() => setActiveTab('settings', 'display')}
            className="gap-2"
          >
            <Palette className="h-4 w-4" />
            {(t.settings as any).display ?? '顯示與關於'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
