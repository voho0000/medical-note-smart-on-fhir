'use client'

import { ArrowRight, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useLeftBrowserTourStore } from '@/features/left-browser-tour/left-browser-tour.store'
import { CUSTOM_SUMMARY_CHAPTERS, useRightFeatureTourStore } from './right-feature-tour.store'

export function CustomSummaryTourLauncher() {
  const { locale } = useLanguage()
  const open = useRightFeatureTourStore((state) => state.launcherOpen)
  const close = useRightFeatureTourStore((state) => state.closeLauncher)
  const start = useRightFeatureTourStore((state) => state.startCustomSummary)
  const english = locale === 'en'

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className="max-w-md gap-4 p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{english ? 'Custom summaries: detailed guide' : '自訂摘要詳盡導覽'}</DialogTitle>
          <DialogDescription>
            {english ? 'Follow the full guide or jump to a task. We will open the real screens without editing, publishing, or generating content.' : '可以從頭看，或直接選想學的操作。導覽會打開實際畫面，不會修改、發布或產生內容。'}
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y" aria-label={english ? 'Guide chapters' : '教學章節'}>
          {CUSTOM_SUMMARY_CHAPTERS.map((chapter, index) => (
            <Button
              key={chapter.step}
              variant="ghost"
              className="h-auto min-h-[44px] w-full justify-start gap-2 whitespace-normal px-2 py-3 text-left"
              onClick={() => {
                useLeftBrowserTourStore.getState().stop()
                start(chapter.step)
              }}
            >
              {index === 0 ? <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              <span className="flex-1">{english ? chapter.en : chapter.zh}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
