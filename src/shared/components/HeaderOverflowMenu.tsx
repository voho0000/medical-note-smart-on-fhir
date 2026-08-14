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
  PanelLeft,
  PanelRight,
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

export function HeaderOverflowMenu({
  tourDisabled = false,
  onStartLeftTour,
  onStartRightTour,
}: {
  tourDisabled?: boolean
  onStartLeftTour?: () => void
  onStartRightTour?: () => void
}) {
  const { t, locale, setLocale } = useLanguage()
  const { audience, setAudience } = useAudience()
  const { setActiveTab } = useRightPanel()

  return (
    // Keep the compact menu through tablet widths; the full Audience/Language
    // controls return only once the two-panel workspace has desktop room.
    <div className="lg:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-[44px] w-[44px] shadow-none hover:shadow-none"
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

          <DropdownMenuItem
            onClick={onStartLeftTour}
            disabled={tourDisabled || !onStartLeftTour}
            className="gap-2"
          >
            <PanelLeft className="h-4 w-4" />
            {locale === 'en' ? 'Source record tour' : '左側病歷導覽'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onStartRightTour}
            disabled={tourDisabled || !onStartRightTour}
            className="gap-2"
          >
            <PanelRight className="h-4 w-4" />
            {locale === 'en' ? 'Clinical tools tour' : '右側功能導覽'}
          </DropdownMenuItem>

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
