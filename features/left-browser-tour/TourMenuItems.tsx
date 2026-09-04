'use client'

import { BookOpen, PanelLeft, PanelRight } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useRightFeatureTourStore } from '@/features/right-feature-tour/right-feature-tour.store'
import { useLeftBrowserTourStore } from './left-browser-tour.store'

/** The desktop and compact header expose the same catalogue, without submenus. */
export function TourMenuItems({ disabled = false, onStartLeftTour, onStartRightTour }: {
  disabled?: boolean
  onStartLeftTour?: () => void
  onStartRightTour?: () => void
}) {
  const { locale } = useLanguage()
  const english = locale === 'en'
  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{english ? 'Quick tour' : '快速導覽 Quick tour'}</DropdownMenuLabel>
      <DropdownMenuItem disabled={disabled} className="min-h-[44px] gap-2" onSelect={() => {
        useRightFeatureTourStore.getState().stop()
        useRightFeatureTourStore.getState().closeLauncher()
        if (onStartLeftTour) onStartLeftTour()
        else useLeftBrowserTourStore.getState().start()
      }}>
        <PanelLeft className="h-4 w-4" aria-hidden="true" />
        {english ? 'Source record tour' : '病歷瀏覽'}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={disabled} className="min-h-[44px] gap-2" onSelect={() => {
        useLeftBrowserTourStore.getState().stop()
        if (onStartRightTour) onStartRightTour()
        else useRightFeatureTourStore.getState().start()
      }}>
        <PanelRight className="h-4 w-4" aria-hidden="true" />
        {english ? 'Clinical tools tour' : '功能工作區'}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{english ? 'Detailed module guides' : '模組詳盡導覽'}</DropdownMenuLabel>
      <DropdownMenuItem disabled={disabled} className="min-h-[44px] items-start gap-2" onSelect={() => {
        useLeftBrowserTourStore.getState().stop()
        useRightFeatureTourStore.getState().openCustomSummaryGuide()
      }}>
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="block">{english ? 'Custom summaries' : '自訂摘要'}</span>
          <span className="block text-xs text-muted-foreground">{english ? 'Edit, share, and explore templates' : '編輯、分享與範本庫'}</span>
        </span>
      </DropdownMenuItem>
    </>
  )
}
