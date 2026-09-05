'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useBetaFeaturesStore } from '@/src/application/stores/beta-features.store'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  markRightFeatureTourSeen,
  CUSTOM_SUMMARY_CHAPTERS,
  type RightFeatureTourStepId,
  useRightFeatureTourStore,
} from './right-feature-tour.store'

import { getRightTourSteps } from './right-feature-tour.steps'
import { CustomSummaryTourLauncher } from './CustomSummaryTourLauncher'

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

function isWithinViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const margin = 16
  return rect.top >= margin
    && rect.left >= margin
    && rect.bottom <= window.innerHeight - margin
    && rect.right <= window.innerWidth - margin
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
  const kind = useRightFeatureTourStore((state) => state.kind)
  const stepId = useRightFeatureTourStore((state) => state.stepId)
  const openGuide = useRightFeatureTourStore((state) => state.openCustomSummaryGuide)
  const stop = useRightFeatureTourStore((state) => state.stop)
  const setStep = useRightFeatureTourStore((state) => state.setStep)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [usingFallback, setUsingFallback] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const tooltipRef = useRef<HTMLElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const [tooltipHeight, setTooltipHeight] = useState(260)

  const steps = useMemo(
    () => getRightTourSteps(kind, { medical: audience === 'medical', authenticated: Boolean(user), betaEnabled: betaFeaturesEnabled }),
    [audience, betaFeaturesEnabled, kind, user],
  )
  const stepIndex = Math.max(0, steps.findIndex((item) => item.id === stepId))
  const step = steps[stepIndex]
  const chapter = CUSTOM_SUMMARY_CHAPTERS.findLast((item) => (
    steps.findIndex((candidate) => candidate.id === item.step) <= stepIndex
  ))?.step ?? 'custom-summary'

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!active || !step || step.id === stepId) return
    setStep(step.id)
  }, [active, setStep, step, stepId])

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
      // Resolve the highlight before moving the page so a step never flashes
      // at the viewport centre while its real target is already available.
      updateRect()
      if (!isWithinViewport(target)) {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
      }
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
        if (attempts === 0) setTargetRect(null)
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
    // Transforms do not resize the element; refresh after a panel animation.
    window.addEventListener('animationend', updateRect, true)
    window.addEventListener('transitionend', updateRect, true)
    mutationObserver = new MutationObserver(refreshTarget)
    mutationObserver.observe(document.body, { attributes: true, childList: true, subtree: true })
    resolve()
    return () => {
      if (timer) clearTimeout(timer)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('animationend', updateRect, true)
      window.removeEventListener('transitionend', updateRect, true)
    }
  }, [active, step])

  const finish = useCallback(() => {
    if (kind === 'quick') markRightFeatureTourSeen()
    stop()
  }, [kind, stop])

  useEffect(() => {
    if (!active) return
    const previouslyFocused = document.activeElement
    const focusTour = () => nextButtonRef.current?.focus({ preventScroll: true })
    const frame = window.requestAnimationFrame(focusTour)
    // The editor is non-modal during the preview so it cannot hide the tour.
    // Keep keyboard focus in the tour: background fields must not be edited.
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !tooltipRef.current?.contains(event.target)) focusTour()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        finish()
      } else if (event.key === 'Tab') {
        const buttons = Array.from(tooltipRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)') ?? [])
        if (!buttons.length) return
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const nextIndex = event.shiftKey
          ? (index <= 0 ? buttons.length - 1 : index - 1)
          : (index + 1) % buttons.length
        event.preventDefault()
        buttons[nextIndex].focus({ preventScroll: true })
      }
    }
    document.addEventListener('focusin', onFocusIn)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('keydown', onKeyDown, true)
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [active, finish])

  useEffect(() => {
    const tooltip = tooltipRef.current
    if (!active || !tooltip) return
    const observer = new ResizeObserver(() => setTooltipHeight(tooltip.getBoundingClientRect().height))
    observer.observe(tooltip)
    return () => observer.disconnect()
  }, [active])

  const goBack = () => setStep(steps[Math.max(0, stepIndex - 1)].id)
  const goNext = () => {
    if (stepIndex >= steps.length - 1) finish()
    else setStep(steps[stepIndex + 1].id)
  }

  const tooltipStyle = useMemo(() => {
    if (!targetRect || viewport.width === 0 || viewport.height === 0) {
      return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    }
    const margin = 16
    const gap = 16
    // Landscape phones have little vertical room. Use the space beside the
    // editor when it can still fit a readable tooltip, leaving the field clear.
    const sideSpace = Math.max(targetRect.left, viewport.width - targetRect.right) - gap - margin
    const width = Math.min(360, viewport.width - margin * 2,
      viewport.height < 500 && sideSpace >= 240 ? sideSpace : 360)
    const estimatedHeight = tooltipHeight
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
  }, [targetRect, tooltipHeight, viewport])

  if (!active || !step) return <CustomSummaryTourLauncher />

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
            className="pointer-events-none fixed rounded-lg border-2 border-primary transition-all duration-200 motion-reduce:transition-none"
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
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="right-tour-title"
        aria-describedby="right-tour-description"
        className="fixed z-[101] max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border bg-card p-4 shadow-2xl outline-none"
        style={tooltipStyle}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {kind === 'quick' ? 'Quick tour' : (locale === 'en' ? 'Detailed guide' : '詳盡導覽')} · {stepIndex + 1} / {steps.length}
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
        {kind === 'custom-summary' && (
          <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{locale === 'en' ? 'Chapter' : '章節'}</span>
            <select
              aria-label={locale === 'en' ? 'Guide chapter' : '導覽章節'}
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-foreground focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-[44px]"
              value={chapter}
              onChange={(event) => setStep(event.target.value as RightFeatureTourStepId)}
            >
              {CUSTOM_SUMMARY_CHAPTERS.map((item) => <option key={item.step} value={item.step}>{locale === 'en' ? item.en : item.zh}</option>)}
            </select>
          </label>
        )}
        <h2 id="right-tour-title" className="text-base font-semibold leading-snug">
          {localeText(step.title, locale)}
        </h2>
        <p id="right-tour-description" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {localeText(usingFallback && step.fallbackBody ? step.fallbackBody : step.body, locale)}
        </p>
        {kind === 'quick' && step.id === 'finish' && (
          <Button variant="outline" className="mt-3 h-auto min-h-[44px] w-full whitespace-normal" onClick={() => { finish(); openGuide() }}>
            {locale === 'en' ? 'Learn custom summaries next' : '接著學自訂摘要'}
          </Button>
        )}
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
            <Button ref={nextButtonRef} data-tour-control="right-next" size="sm" onClick={goNext} className="gap-1">
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
