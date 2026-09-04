'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenCheck, ChevronLeft, ChevronRight, Map, PanelRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  hasSeenLeftBrowserTour,
  markLeftBrowserTourSeen,
  type LeftBrowserTourStepId,
  useLeftBrowserTourStore,
} from './left-browser-tour.store'

interface TourStep {
  id: LeftBrowserTourStepId
  target: string
  desktopTarget?: string
  fallbackTarget?: string
  highlightPadding?: number
  title: { 'zh-TW': string; en: string }
  body: { 'zh-TW': string; en: string }
  fallbackBody?: { 'zh-TW': string; en: string }
  desktopOnly?: boolean
}

const STEPS: TourStep[] = [
  {
    id: 'overview',
    target: '[data-tour="left-tabs"]',
    title: { 'zh-TW': '從左側找到原始病歷', en: 'Browse the source record on the left' },
    body: {
      'zh-TW': '左側依序整理病人資訊、就診紀錄、報告、用藥與文件。導覽會帶你逐一看看容易錯過的功能。',
      en: 'The left side organises patient information, visits, reports, medications, and documents. This tour highlights the easy-to-miss tools.',
    },
  },
  {
    id: 'visits',
    target: '[data-tour="visit-tour-row"]',
    desktopTarget: '[data-tour="visit-open-right"]',
    fallbackTarget: '[data-tour="visits-card"]',
    highlightPadding: 10,
    title: { 'zh-TW': '就診紀錄與雙欄閱讀', en: 'Visits and split-view reading' },
    body: {
      'zh-TW': '桌面版每列右側的雙欄圖示可把該次就醫細節移到右側閱讀。就診紀錄也能依院所、類型與內容篩選，或向下展開診斷、檢驗、用藥與文件。',
      en: 'On desktop, the split-view icon at the right of each row opens that visit on the right. You can also filter by facility, type, or content, or expand details inline.',
    },
  },
  {
    id: 'reports',
    target: '[data-tour="report-tabs"]',
    fallbackTarget: '[data-tour="left-tab-reports"]',
    title: { 'zh-TW': '報告有多種閱讀方式', en: 'Several ways to read reports' },
    body: {
      'zh-TW': '除了累積報告，也能分別查看全部、檢驗、影像、病理、生命徵象與處置；切到明細後還可以搜尋名稱、結果、院所或日期。',
      en: 'Use cumulative reports or browse all, laboratory, imaging, pathology, vital-sign, and procedure records. Detail views can be searched by name, result, facility, or date.',
    },
  },
  {
    id: 'trend',
    target: '[role="tabpanel"][data-state="active"] [data-tour="report-trend"]',
    fallbackTarget: '[data-tour="report-tabs"]',
    highlightPadding: 10,
    title: { 'zh-TW': '小折線圖就是歷次趨勢', en: 'The small line icon opens history' },
    body: {
      'zh-TW': '點擊折線圖可查看同一項檢驗、生命徵象或同類報告的歷次資料，並在趨勢圖與歷史表格間切換。',
      en: 'Select the line icon to review prior values for the same lab, vital sign, or report type, with both chart and history-table views.',
    },
    fallbackBody: {
      'zh-TW': '這位病人的目前資料沒有可示範的趨勢按鈕；有可比較的歷次紀錄時，報告列旁會出現小折線圖。',
      en: 'This record has no trend action to demonstrate. When comparable history exists, a small line icon appears beside the report row.',
    },
  },
  {
    id: 'imaging-ai',
    target: '[role="tabpanel"][data-state="active"] [data-tour="report-ai-interpretation"]',
    fallbackTarget: '[role="tabpanel"][data-state="active"] [data-tour="report-tour-row"]',
    highlightPadding: 10,
    title: { 'zh-TW': 'AI 幫你看懂報告文字', en: 'AI helps explain report text' },
    body: {
      'zh-TW': '點擊「AI翻譯」後，系統會先在背景處理，完成才在右欄開啟，方便與左側原文對照。它解讀的是報告文字，不是直接判讀影像，也不會在未點擊時自動執行。',
      en: 'Select “Translate” to process the report in the background. The right panel opens only when the result is ready, so you can compare it with the original on the left. It explains the written report, does not interpret image pixels directly, and never runs before you select it.',
    },
    fallbackBody: {
      'zh-TW': '這份資料目前沒有可供 AI 翻譯解讀的報告文字；有文字內容時，報告列旁會出現「AI翻譯」按鈕。',
      en: 'This record has no report text available for AI explanation. When narrative text is present, a “Translate” button appears beside the report.',
    },
  },
  {
    id: 'medications',
    target: '[data-tour="medication-tabs"]',
    fallbackTarget: '[data-tour="left-tab-meds"]',
    title: { 'zh-TW': '用藥、過敏與疫苗集中查看', en: 'Medications, allergies, and vaccines together' },
    body: {
      'zh-TW': '用藥頁分成用藥、過敏與疫苗，並可用中英文藥名、分類、院所或日期搜尋。清單會分開目前使用與歷史用藥。',
      en: 'The medication page contains medications, allergies, and vaccines. Search by bilingual drug name, category, facility, or date, with current and historical use separated.',
    },
  },
  {
    id: 'medication-timeline',
    target: '[data-tour="medication-timeline-switch"]',
    fallbackTarget: '[data-tour="medication-timeline"]',
    highlightPadding: 10,
    title: { 'zh-TW': '用時間軸看處方是否重疊', en: 'See prescription overlap on a timeline' },
    body: {
      'zh-TW': '紫色代表慢箋、灰色代表急性用藥，紅色虛線是今天。可切換 3 個月、6 個月、1 年、3 年或全部紀錄。',
      en: 'Purple bars show chronic prescriptions, grey bars show acute medications, and the red dashed line marks today. Switch from 3 months through the full record.',
    },
    fallbackBody: {
      'zh-TW': '目前沒有可繪製的用藥紀錄；有處方期間時，這裡會以時間軸顯示慢箋、急性用藥與重疊區間。',
      en: 'There are no medication periods to chart. When prescription periods exist, chronic, acute, and overlapping supplies appear here.',
    },
  },
  {
    id: 'right-pane',
    target: '[data-tour="medication-open-right"]',
    fallbackTarget: '[data-tour="right-detail-pane"]',
    highlightPadding: 10,
    title: { 'zh-TW': '保留左邊清單，右邊看細節', en: 'Keep the list left and details right' },
    body: {
      'zh-TW': '雙欄圖示會把內容送到右側，現在左邊保留用藥清單、右邊顯示時間軸。同一個圖示也會出現在就診、報告與文件；按右欄的「關閉」即可返回功能面板。',
      en: 'The split-view icon sends content to the right—here the medication list stays left while the timeline opens right. The same icon appears on visits, reports, and documents. Use Close to return to the feature panel.',
    },
    fallbackBody: {
      'zh-TW': '目前沒有可送到右欄的用藥時間軸；有可用內容時，就診、報告、用藥與文件旁的雙欄圖示都能在桌面版開啟並排閱讀。',
      en: 'There is no medication timeline to dock for this record. When content is available, the split-view icons beside visits, reports, medications, and documents open it side by side on desktop.',
    },
    desktopOnly: true,
  },
  {
    id: 'documents',
    target: '[data-tour="documents-list"]',
    fallbackTarget: '[data-tour="left-tab-documents"]',
    title: {
      'zh-TW': '出院病摘與成人預防保健報告也能直接讀',
      en: 'Read discharge summaries and adult preventive health reports',
    },
    body: {
      'zh-TW': '文件可在原位置向下展開，也能彈出全文或移到右欄並排閱讀。有文字時還會提供按需啟動的 AI 翻譯解讀。',
      en: 'Documents can expand inline, open in a large dialog, or move to the right pane. When text is available, on-demand AI translation and explanation is also offered.',
    },
    fallbackBody: {
      'zh-TW': '這份資料目前沒有文件；匯入內容包含出院病摘、成人預防保健報告或其他臨床文件時，會集中顯示在這個分頁。',
      en: 'This record has no documents. Discharge summaries, adult preventive health reports, and other clinical documents appear in this tab when present.',
    },
  },
  {
    id: 'finish',
    target: '[data-tour="left-tabs"]',
    title: { 'zh-TW': '完成！隨時可以再看一次', en: 'Done—you can replay this anytime' },
    body: {
      'zh-TW': '之後可從頁首的「導覽教學」重新播放。導覽只切換畫面，不會修改病歷，也不會自動呼叫 AI。',
      en: 'Replay this from “Guided tour” in the header. The tour only changes the view; it never edits records or automatically calls AI.',
    },
  },
]

type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number }

function isVisibleTourElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return element.isConnected
    && !element.closest('[hidden], [aria-hidden="true"]')
    && rect.width > 2
    && rect.height > 2
    && style.display !== 'none'
    && style.visibility !== 'hidden'
}

function visibleTarget(selector: string): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
  return candidates.find(isVisibleTourElement) ?? null
}

function rectFromElement(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

function sameRect(left: Rect | null, right: Rect): boolean {
  if (!left) return false
  return Math.abs(left.top - right.top) < 0.5
    && Math.abs(left.left - right.left) < 0.5
    && Math.abs(left.right - right.right) < 0.5
    && Math.abs(left.bottom - right.bottom) < 0.5
}

function localeText(value: { 'zh-TW': string; en: string }, locale: string): string {
  return locale === 'en' ? value.en : value['zh-TW']
}

export function LeftBrowserTour({ eligible }: { eligible: boolean }) {
  const { locale } = useLanguage()
  const active = useLeftBrowserTourStore((state) => state.active)
  const session = useLeftBrowserTourStore((state) => state.session)
  const start = useLeftBrowserTourStore((state) => state.start)
  const stop = useLeftBrowserTourStore((state) => state.stop)
  const setStep = useLeftBrowserTourStore((state) => state.setStep)
  const [offerOpen, setOfferOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [usingFallback, setUsingFallback] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const offeredRef = useRef(false)

  const steps = useMemo(
    () => STEPS.filter((step) => !step.desktopOnly || isDesktop),
    [isDesktop],
  )
  const step = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))]

  useEffect(() => {
    const update = () => {
      setIsDesktop(window.matchMedia('(min-width: 768px)').matches)
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    const timer = window.setTimeout(() => {
      setHydrated(true)
      update()
    }, 0)
    window.addEventListener('resize', update)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (!hydrated || !eligible || active || offeredRef.current || hasSeenLeftBrowserTour()) return
    offeredRef.current = true
    setOfferOpen(true)
  }, [active, eligible, hydrated])

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => {
      setOfferOpen(false)
      setStepIndex(0)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [active, session])

  useEffect(() => {
    if (!active || !step) return
    setStep(step.id)
  }, [active, setStep, step])

  useEffect(() => {
    if (!active || !step) {
      const resetTimer = window.setTimeout(() => setTargetRect(null), 0)
      return () => window.clearTimeout(resetTimer)
    }

    let target: HTMLElement | null = null
    let resizeObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const primarySelector = step.desktopTarget && isDesktop
      ? step.desktopTarget
      : step.target
    // A feature tab and its row content do not mount in the same render. Give
    // the intended control time to appear before accepting a broader fallback;
    // otherwise the tour can permanently lock onto the tab bar even though the
    // trend / split-view icon appears a frame later.
    const fallbackGraceAttempts = 16
    const maxAttempts = 32

    const updateRect = () => {
      if (!target || !isVisibleTourElement(target)) return
      const nextRect = rectFromElement(target)
      setTargetRect((currentRect) => sameRect(currentRect, nextRect) ? currentRect : nextRect)
    }
    const bindTarget = (nextTarget: HTMLElement, fallback: boolean) => {
      if (target === nextTarget) {
        setUsingFallback(fallback)
        updateRect()
        return
      }
      target = nextTarget
      attempts = 0
      setUsingFallback(fallback)
      resizeObserver?.disconnect()
      resizeObserver = new ResizeObserver(updateRect)
      resizeObserver.observe(target)
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
      if (timer) clearTimeout(timer)
      timer = setTimeout(updateRect, 180)
    }
    const resolve = () => {
      const primary = visibleTarget(primarySelector)
      const mayUseFallback = attempts >= fallbackGraceAttempts
      const fallback = primary || !mayUseFallback
        ? null
        : (step.fallbackTarget ? visibleTarget(step.fallbackTarget) : null)
      const nextTarget = primary ?? fallback
      if (!nextTarget) {
        attempts += 1
        if (attempts < maxAttempts) timer = setTimeout(resolve, 75)
        else {
          setTargetRect(null)
          setUsingFallback(true)
        }
        return
      }
      bindTarget(nextTarget, !primary)
    }
    const refreshTarget = () => {
      const primary = visibleTarget(primarySelector)
      if (primary) {
        bindTarget(primary, false)
        return
      }

      const currentMatchesFallback = target
        && isVisibleTourElement(target)
        && !!step.fallbackTarget
        && target.matches(step.fallbackTarget)
      if (currentMatchesFallback) {
        updateRect()
        return
      }

      if (target) {
        target = null
        resizeObserver?.disconnect()
        attempts = 0
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(resolve, 0)
    }
    const onViewportChange = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      updateRect()
    }
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', updateRect, true)
    mutationObserver = new MutationObserver(refreshTarget)
    mutationObserver.observe(document.body, { attributes: true, childList: true, subtree: true })
    timer = setTimeout(() => {
      setTargetRect(null)
      setUsingFallback(false)
      resolve()
    }, 0)
    return () => {
      if (timer) clearTimeout(timer)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [active, isDesktop, step])

  const finish = useCallback(() => {
    markLeftBrowserTourSeen()
    stop()
  }, [stop])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, finish])

  const goBack = () => setStepIndex((index) => Math.max(0, index - 1))
  const goNext = () => {
    if (stepIndex >= steps.length - 1) finish()
    else setStepIndex((index) => Math.min(steps.length - 1, index + 1))
  }
  const begin = () => {
    markLeftBrowserTourSeen()
    setOfferOpen(false)
    start()
  }
  const dismissOffer = () => {
    markLeftBrowserTourSeen()
    setOfferOpen(false)
  }

  const tooltipStyle = useMemo(() => {
    if (!targetRect || viewport.width === 0 || viewport.height === 0) {
      return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    }
    const margin = 16
    const gap = 16
    const width = Math.min(360, viewport.width - margin * 2)
    const estimatedHeight = 250
    let left: number
    let top: number
    if (targetRect.right + gap + width <= viewport.width - margin) {
      left = targetRect.right + gap
      top = targetRect.top + targetRect.height / 2 - estimatedHeight / 2
    } else if (targetRect.left - gap - width >= margin) {
      left = targetRect.left - gap - width
      top = targetRect.top + targetRect.height / 2 - estimatedHeight / 2
    } else if (targetRect.bottom + gap + estimatedHeight <= viewport.height - margin) {
      left = targetRect.left + targetRect.width / 2 - width / 2
      top = targetRect.bottom + gap
    } else {
      left = targetRect.left + targetRect.width / 2 - width / 2
      top = targetRect.top - gap - estimatedHeight
    }
    left = Math.max(margin, Math.min(viewport.width - width - margin, left))
    top = Math.max(margin, Math.min(viewport.height - estimatedHeight - margin, top))
    return { left, top, width }
  }, [targetRect, viewport])

  const highlightPadding = step?.highlightPadding ?? 6
  const paddedRect = targetRect ? {
    top: Math.max(0, targetRect.top - highlightPadding),
    left: Math.max(0, targetRect.left - highlightPadding),
    right: Math.min(viewport.width, targetRect.right + highlightPadding),
    bottom: Math.min(viewport.height, targetRect.bottom + highlightPadding),
  } : null

  return (
    <>
      <Dialog open={offerOpen} onOpenChange={(open) => { if (!open) dismissOffer() }}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Map className="h-5 w-5 text-primary" />
              {locale === 'en' ? 'A one-minute tour of the source record' : '用一分鐘認識左側病歷瀏覽'}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {locale === 'en'
                ? 'See report trends, imaging reports, medication timelines, documents, and the desktop split-view button.'
                : '帶你認識報告趨勢、影像報告、用藥時間軸、文件，以及桌面版的右欄並排功能。'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              {locale === 'en'
                ? 'The tour changes only what is visible. It never edits records or automatically starts AI.'
                : '導覽只會切換顯示畫面，不會修改病歷，也不會自動啟動 AI。'}
            </span>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={dismissOffer}>
              {locale === 'en' ? 'Skip' : '略過'}
            </Button>
            <Button onClick={begin} className="gap-2">
              <Map className="h-4 w-4" />
              {locale === 'en' ? 'Start tour' : '開始導覽'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {active && step && (
        <div className="fixed inset-0 z-[100]" aria-live="polite">
          {paddedRect ? (
            <>
              <div className="fixed left-0 right-0 top-0 bg-black/55" style={{ height: paddedRect.top }} />
              <div className="fixed left-0 bg-black/55" style={{ top: paddedRect.top, width: paddedRect.left, height: paddedRect.bottom - paddedRect.top }} />
              <div className="fixed right-0 bg-black/55" style={{ top: paddedRect.top, left: paddedRect.right, height: paddedRect.bottom - paddedRect.top }} />
              <div className="fixed bottom-0 left-0 right-0 bg-black/55" style={{ top: paddedRect.bottom }} />
              <div
                data-tour-overlay="highlight"
                className="pointer-events-none fixed rounded-lg border-2 border-primary shadow-[0_0_0_4px_rgba(59,130,246,0.18)] transition-all duration-200"
                style={{
                  top: paddedRect.top,
                  left: paddedRect.left,
                  width: paddedRect.right - paddedRect.left,
                  height: paddedRect.bottom - paddedRect.top,
                }}
              />
            </>
          ) : (
            <div className="fixed inset-0 bg-black/55" />
          )}

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="left-tour-title"
            aria-describedby="left-tour-description"
            className="fixed z-[101] max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-4 shadow-2xl outline-none"
            style={tooltipStyle}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {stepIndex + 1} / {steps.length}
              </span>
              <button
                type="button"
                onClick={finish}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={locale === 'en' ? 'Close tour' : '關閉導覽'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h2 id="left-tour-title" className="text-base font-semibold leading-snug">
              {localeText(step.title, locale)}
            </h2>
            <p id="left-tour-description" className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {localeText(usingFallback && step.fallbackBody ? step.fallbackBody : step.body, locale)}
            </p>
            {step.id === 'right-pane' && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/5 px-2.5 py-2 text-xs text-primary">
                <PanelRight className="h-4 w-4 shrink-0" />
                {locale === 'en' ? 'Split view is available from tablet width upward.' : '右欄並排功能從平板寬度以上提供。'}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={finish}>
                {locale === 'en' ? 'Skip' : '略過'}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goBack}
                  disabled={stepIndex === 0}
                  className={cn('gap-1', stepIndex === 0 && 'invisible')}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {locale === 'en' ? 'Back' : '上一步'}
                </Button>
                <Button size="sm" onClick={goNext} className="gap-1">
                  {stepIndex === steps.length - 1
                    ? (locale === 'en' ? 'Finish' : '完成')
                    : (locale === 'en' ? 'Next' : '下一步')}
                  {stepIndex < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
