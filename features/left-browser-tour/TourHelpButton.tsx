'use client'

import { Map } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/src/application/providers/language.provider'
import { TourMenuItems } from './TourMenuItems'

export function TourHelpButton({ disabled = false }: { disabled?: boolean }) {
  const { locale } = useLanguage()
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
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
        <TourMenuItems disabled={disabled} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
