// Clipboard helper with transient "copied" feedback (audit D2)
"use client"

import { useCallback, useEffect, useRef, useState } from 'react'

export function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setCopied(false), resetMs)
        return true
      } catch {
        // Clipboard API unavailable (http, permissions) — caller surfaces the failure
        return false
      }
    },
    [resetMs]
  )

  return { copied, copy }
}
