'use client'

import { Map, PanelLeft, PanelRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useLeftBrowserTourStore } from './left-browser-tour.store'
import { useRightFeatureTourStore } from '@/features/right-feature-tour/right-feature-tour.store'

export function TourHelpButton({ disabled = false }: { disabled?: boolean }) {
  const { locale } = useLanguage()
  const startLeft = useLeftBrowserTourStore((state) => state.start)
  const startRight = useRightFeatureTourStore((state) => state.start)
  const label = locale === 'en' ? 'Guided tour' : '導覽教學'
  const compactLabel = locale === 'en' ? 'Tour' : '導覽'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="hidden h-9 gap-1.5 px-0 sm:inline-flex sm:w-9 lg:w-auto lg:px-3 @max-[72rem]:w-9 @max-[72rem]:px-0"
          title={label}
          aria-label={label}
        >
          <Map className="h-4 w-4" />
          <span className="hidden lg:inline @max-[72rem]:hidden">{compactLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={startLeft} className="gap-2">
          <PanelLeft className="h-4 w-4" />
          {locale === 'en' ? 'Source record tour' : '左側病歷導覽'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={startRight} className="gap-2">
          <PanelRight className="h-4 w-4" />
          {locale === 'en' ? 'Clinical tools tour' : '右側功能導覽'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
