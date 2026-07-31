'use client'

import { Map } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useLeftBrowserTourStore } from './left-browser-tour.store'

export function TourHelpButton({ disabled = false }: { disabled?: boolean }) {
  const { locale } = useLanguage()
  const start = useLeftBrowserTourStore((state) => state.start)
  const label = locale === 'en' ? 'Guided tour' : '導覽教學'

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={start}
      disabled={disabled}
      className="hidden h-9 gap-1.5 px-0 sm:inline-flex sm:w-9 lg:w-auto lg:px-3"
      title={label}
      aria-label={label}
    >
      <Map className="h-4 w-4" />
      <span className="hidden lg:inline">{label}</span>
    </Button>
  )
}
