'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useBetaFeaturesStore } from '@/src/application/stores/beta-features.store'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  markRightFeatureTourSeen,
  type RightFeatureTourStepId,
  useRightFeatureTourStore,
} from './right-feature-tour.store'

interface TourStep {
  id: RightFeatureTourStepId
  target: string
  fallbackTarget?: string
  fallbackGraceAttempts?: number
  lockTargetOnceResolved?: boolean
  highlightPadding?: number
  medicalOnly?: boolean
  betaOnly?: boolean
  title: { 'zh-TW': string; en: string }
  body: { 'zh-TW': string; en: string }
  fallbackBody?: { 'zh-TW': string; en: string }
}

const STEPS: TourStep[] = [
  {
    id: 'overview',
    target: '[data-tour="right-tabs"]',
    title: { 'zh-TW': '右側是臨床工作區', en: 'The right side is your clinical workspace' },
    body: {
      'zh-TW': '上方分頁依使用身份集中醫療摘要、臨床對話、計算機、匯出與設定；登入後可從設定中自行開啟 Beta 功能。取消釘選的功能會收進「更多」選單。',
      en: 'The tabs bring together the medical summary, clinical chat, calculators, export, and settings. After signing in, Beta features can be enabled in Settings. Unpinned tools move into More.',
    },
  },
  {
    id: 'summary',
    target: '[data-tour="medical-summary-card-nav"]',
    fallbackTarget: '[data-tour="right-tab-medical-summary"]',
    fallbackGraceAttempts: 0,
    lockTargetOnceResolved: true,
    highlightPadding: 4,
    title: { 'zh-TW': '先用醫療摘要掌握重點', en: 'Start with the medical summary' },
    body: {
      'zh-TW': '摘要把問題、歷程、檢查趨勢、安全提醒與用藥整理成固定卡片；上方捷徑可直接跳到指定區塊。內容由 AI 協助整理，仍需由醫療人員核對。',
      en: 'The summary organises problems, timeline, investigation trends, safety alerts, and medications into fixed cards. Jump directly with the shortcuts above, and always clinically verify AI-assisted content.',
    },
    fallbackBody: {
      'zh-TW': '摘要產生完成後，上方會出現問題、歷程、檢查趨勢、安全提醒與用藥捷徑，可直接跳到指定區塊。',
      en: 'After the summary is generated, shortcuts for problems, timeline, investigation trends, safety alerts, and medications appear above for direct navigation.',
    },
  },
  {
    id: 'summary-settings',
    target: '[data-tour="medical-summary-controls"]',
    fallbackTarget: '[data-tour="right-tab-medical-summary"]',
    highlightPadding: 8,
    title: { 'zh-TW': '摘要模型與資料範圍都在這裡', en: 'Choose the summary model and data scope here' },
    body: {
      'zh-TW': '點模型名稱可選擇這份摘要使用的 AI 模型；點右側齒輪「設定」，再選「資料範圍」，即可決定哪些病歷資料要納入摘要。',
      en: 'Select the model name to choose the AI model for this summary. Open the Settings gear, then Data scope, to decide which records are included.',
    },
    fallbackBody: {
      'zh-TW': '目前尚未顯示摘要控制列；載入病人資料後，可從醫療摘要右上方選擇模型，並在齒輪「設定」中調整資料範圍。',
      en: 'Summary controls are not available yet. After loading patient data, choose a model at the top right and adjust Data scope from Settings.',
    },
  },
  {
    id: 'chat',
    target: '[data-tour="medical-chat-controls"]',
    fallbackTarget: '[data-tour="right-tab-medical-chat"]',
    highlightPadding: 8,
    title: { 'zh-TW': '先認識臨床對話與上方工具', en: 'Get to know Clinical chat and its controls' },
    body: {
      'zh-TW': '可直接詢問目前病人的診斷、用藥、檢驗或照護問題，AI 會依問題查詢已載入的病歷。上方可查看對話紀錄、切換不保留本次內容的無痕模式、選擇 AI 模型，或開始新對話；登入後才能保存與查看歷史對話。回答仍需由醫療人員核對。',
      en: 'Ask directly about the current patient’s diagnoses, medications, tests, or care; AI queries the loaded record as needed. The controls above open chat history, enable a temporary unsaved chat, switch AI models, or start a new conversation. Sign in to save and revisit past chats, and clinically verify every answer.',
    },
    fallbackBody: {
      'zh-TW': '進入臨床對話後，可直接詢問目前病歷；登入後還能查看對話紀錄、使用無痕模式、切換 AI 模型或開始新對話。',
      en: 'In Clinical chat, ask about the current record. After signing in, you can also revisit chat history, use temporary mode, switch AI models, or start a new conversation.',
    },
  },
  {
    id: 'chat-compose',
    target: '[data-tour="medical-chat-composer"]',
    fallbackTarget: '[data-tour="right-tab-medical-chat"]',
    highlightPadding: 8,
    title: { 'zh-TW': '用文字、圖片、語音或範本開始對話', en: 'Start with text, images, voice, or a template' },
    body: {
      'zh-TW': '可在輸入框直接輸入問題，也能貼上或上傳圖片，或點麥克風使用語音輸入。輸入「/」可搜尋快捷範本，也可以直接點上方的範本按鈕帶入內容，再送出問題。',
      en: 'Type a question, paste or upload an image, or use the microphone for voice input. Type “/” to search shortcut templates, or click a template above the input to insert it before sending.',
    },
    fallbackBody: {
      'zh-TW': '進入臨床對話後，可用文字、圖片、語音或「/」快捷範本輸入問題。',
      en: 'In Clinical chat, enter questions with text, images, voice, or “/” shortcut templates.',
    },
  },
  {
    id: 'chat-template',
    target: '[data-tour="chat-template-tools"]',
    fallbackTarget: '[data-tour="right-tab-medical-chat"]',
    highlightPadding: 8,
    title: { 'zh-TW': '從範本庫挑選，也能建立自己的範本', en: 'Browse the library or create your own templates' },
    body: {
      'zh-TW': '點「範本庫」可瀏覽並加入現成範本；點「管理範本」可新增或編輯名稱、內容與快捷指令，也能調整順序並設為預設範本。',
      en: 'Open the Template library to browse and add ready-made templates. Use Manage templates to add or edit names, content, and shortcuts, reorder items, or choose a default.',
    },
    fallbackBody: {
      'zh-TW': '進入臨床對話後，可從輸入區上方開啟範本庫，或使用「管理範本」建立與編輯自訂範本。',
      en: 'In Clinical chat, open the Template library above the input area or use Manage templates to create and edit your own.',
    },
  },
  {
    id: 'calculator',
    target: '[data-tour="right-tab-medical-calculator"]',
    highlightPadding: 10,
    title: { 'zh-TW': '計算機會優先帶入現有資料', en: 'Calculators can use available patient data' },
    body: {
      'zh-TW': '可搜尋臨床量表與公式；「此病人」會優先顯示目前資料可協助計算的項目。使用結果前請核對帶入值與資料日期。',
      en: 'Search clinical scores and formulas. “For this patient” prioritises tools supported by loaded data; verify every value and date before using a result.',
    },
  },
  {
    id: 'guidance',
    target: '[data-tour="right-tab-clinical-decision-support"]',
    highlightPadding: 10,
    medicalOnly: true,
    betaOnly: true,
    title: { 'zh-TW': '個人化指引對照病人狀況', en: 'Guidance connects recommendations to patient context' },
    body: {
      'zh-TW': '依病人條件整理符合的臨床指引、建議與依據，協助快速檢查照護缺口；它是決策支援，不會取代醫療人員判斷。',
      en: 'Match patient context with applicable guidance, recommendations, and evidence to review care gaps. It supports—but never replaces—clinical judgement.',
    },
  },
  {
    id: 'export',
    target: '[data-tour="right-tab-ips-export"]',
    highlightPadding: 10,
    title: { 'zh-TW': '匯出前先預覽並調整範圍', en: 'Preview and adjust scope before export' },
    body: {
      'zh-TW': '可先預覽整理後的病歷內容、調整納入範圍，再複製或下載 Markdown／JSON。需要 AI 推論的項目必須由你主動啟動與確認。',
      en: 'Preview the organised record, adjust its scope, then copy or download Markdown or JSON. Any AI-inferred item requires your explicit request and confirmation.',
    },
  },
  {
    id: 'settings',
    target: '[data-tour="right-tab-settings"]',
    highlightPadding: 10,
    title: { 'zh-TW': '設定集中管理模型、金鑰與顯示', en: 'Manage models, keys, and display settings' },
    body: {
      'zh-TW': '可設定各功能使用的 AI 模型與連線方式，也能調整主題、字級與查看版本資訊；登入後還可開啟 Beta 功能。敏感金鑰只會在你設定後使用。',
      en: 'Choose AI models and connections for each feature, adjust theme and text size, and view version information. After signing in, you can also enable Beta features. Sensitive keys are used only after you configure them.',
    },
  },
  {
    id: 'finish',
    target: '[data-tour="right-tabs"]',
    title: { 'zh-TW': '完成！右側工具都能隨時切換', en: 'Done—right-side tools are always within reach' },
    body: {
      'zh-TW': '之後可從頁首的「導覽教學」選擇右側功能導覽重新播放。導覽只會切換畫面，不會送出對話、產生內容或匯出資料。',
      en: 'Replay this from Guided tour in the header. The tour only changes what is visible; it never sends chat, generates content, or exports data.',
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
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisibleTourElement) ?? null
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

export function RightFeatureTour() {
  const { locale } = useLanguage()
  const { audience } = useAudience()
  const { user } = useAuth()
  const betaFeaturesEnabled = useBetaFeaturesStore((state) => (
    user ? state.enabledByUser[user.uid] === true : false
  ))
  const active = useRightFeatureTourStore((state) => state.active)
  const session = useRightFeatureTourStore((state) => state.session)
  const stop = useRightFeatureTourStore((state) => state.stop)
  const setStep = useRightFeatureTourStore((state) => state.setStep)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [usingFallback, setUsingFallback] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  const steps = useMemo(
    () => STEPS.filter((step) => (
      (!step.medicalOnly || audience === 'medical')
      && (!step.betaOnly || (Boolean(user) && betaFeaturesEnabled))
    )),
    [audience, betaFeaturesEnabled, user],
  )
  const step = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))]

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setStepIndex(0), 0)
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
    const fallbackGraceAttempts = step.fallbackGraceAttempts ?? 16
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
      const primary = visibleTarget(step.target)
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
      if (step.lockTargetOnceResolved && target && isVisibleTourElement(target)) {
        updateRect()
        return
      }

      const primary = visibleTarget(step.target)
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
  }, [active, step])

  const finish = useCallback(() => {
    markRightFeatureTourSeen()
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

  const tooltipStyle = useMemo(() => {
    if (!targetRect || viewport.width === 0 || viewport.height === 0) {
      return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    }
    const margin = 16
    const gap = 16
    const width = Math.min(360, viewport.width - margin * 2)
    const estimatedHeight = 260
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

  if (!active || !step) return null

  const highlightPadding = step.highlightPadding ?? 6
  const paddedRect = targetRect ? {
    top: Math.max(0, targetRect.top - highlightPadding),
    left: Math.max(0, targetRect.left - highlightPadding),
    right: Math.min(viewport.width, targetRect.right + highlightPadding),
    bottom: Math.min(viewport.height, targetRect.bottom + highlightPadding),
  } : null

  return (
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {paddedRect ? (
        <>
          <div className="fixed left-0 right-0 top-0 bg-black/55" style={{ height: paddedRect.top }} />
          <div className="fixed left-0 bg-black/55" style={{ top: paddedRect.top, width: paddedRect.left, height: paddedRect.bottom - paddedRect.top }} />
          <div className="fixed right-0 bg-black/55" style={{ top: paddedRect.top, left: paddedRect.right, height: paddedRect.bottom - paddedRect.top }} />
          <div className="fixed bottom-0 left-0 right-0 bg-black/55" style={{ top: paddedRect.bottom }} />
          <div
            data-tour-overlay="right-highlight"
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
        aria-labelledby="right-tour-title"
        aria-describedby="right-tour-description"
        className="fixed z-[101] max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-4 shadow-2xl outline-none"
        style={tooltipStyle}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {stepIndex + 1} / {steps.length}
          </span>
          <button
            type="button"
            data-tour-control="right-close"
            onClick={finish}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={locale === 'en' ? 'Close tour' : '關閉導覽'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 id="right-tour-title" className="text-base font-semibold leading-snug">
          {localeText(step.title, locale)}
        </h2>
        <p id="right-tour-description" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {localeText(usingFallback && step.fallbackBody ? step.fallbackBody : step.body, locale)}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            {locale === 'en' ? 'Skip' : '略過'}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              data-tour-control="right-back"
              variant="outline"
              size="sm"
              onClick={goBack}
              disabled={stepIndex === 0}
              className={cn('gap-1', stepIndex === 0 && 'invisible')}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {locale === 'en' ? 'Back' : '上一步'}
            </Button>
            <Button data-tour-control="right-next" size="sm" onClick={goNext} className="gap-1">
              {stepIndex === steps.length - 1
                ? (locale === 'en' ? 'Finish' : '完成')
                : (locale === 'en' ? 'Next' : '下一步')}
              {stepIndex < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
