'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useLanguage } from '@/src/application/providers/language.provider'
import {
  useReportInterpretation,
  type UseReportInterpretationArgs,
} from '@/src/application/hooks/report-interpretation/use-report-interpretation.hook'

interface ReportInterpretationRequestRunnerProps extends UseReportInterpretationArgs {
  onReady: () => void
  onFailed: () => void
}

/**
 * Runs one requested interpretation without mounting its visible result panel.
 * The originating list and the current right-panel content stay untouched until
 * a complete result has landed in the shared report cache.
 */
export function ReportInterpretationRequestRunner({
  onReady,
  onFailed,
  ...args
}: ReportInterpretationRequestRunnerProps) {
  const { locale } = useLanguage()
  const {
    result,
    isGenerating,
    error,
    isHydrated,
    generate,
    regenerate,
  } = useReportInterpretation(args)
  const startedRef = useRef(isGenerating)
  const settledRef = useRef(false)
  const onReadyRef = useRef(onReady)
  const onFailedRef = useRef(onFailed)

  useEffect(() => {
    onReadyRef.current = onReady
    onFailedRef.current = onFailed
  }, [onFailed, onReady])

  useEffect(() => {
    if (settledRef.current) return

    if (result) {
      settledRef.current = true
      onReadyRef.current()
      return
    }

    if (!isHydrated || isGenerating) return

    if (!startedRef.current) {
      startedRef.current = true
      void (error ? regenerate() : generate())
      return
    }

    settledRef.current = true
    const fallback = locale === 'zh-TW'
      ? 'AI 翻譯失敗，請稍後再試一次。'
      : 'AI translation failed. Please try again in a moment.'
    toast.error(error && error !== 'PARSE_FAILED' ? error : fallback)
    onFailedRef.current()
  }, [error, generate, isGenerating, isHydrated, locale, regenerate, result])

  return null
}
