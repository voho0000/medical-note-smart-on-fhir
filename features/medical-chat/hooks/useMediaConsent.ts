// One-time consent gate before media leaves the device (audit B4).
//
// Chat images go to OpenAI/Google at full resolution and dictation audio goes
// to Whisper — both un-redacted, and photos/recordings routinely contain
// printed or spoken patient identifiers. The first use of either feature must
// be an informed choice; afterwards the decision is remembered on this browser
// profile.

"use client"

import { useCallback, useState } from 'react'

const CONSENT_KEY = 'llm_media_consent_v1'

function hasStoredConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

export function useMediaConsent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  /** Run the action now if consent is on file, otherwise ask first. */
  const withConsent = useCallback((action: () => void) => {
    if (hasStoredConsent()) {
      action()
      return
    }
    setPendingAction(() => action)
    setDialogOpen(true)
  }, [])

  const accept = useCallback(() => {
    try {
      localStorage.setItem(CONSENT_KEY, '1')
    } catch {
      // Storage unavailable — consent still applies for this interaction
    }
    setDialogOpen(false)
    pendingAction?.()
    setPendingAction(null)
  }, [pendingAction])

  const decline = useCallback(() => {
    setDialogOpen(false)
    setPendingAction(null)
  }, [])

  return { dialogOpen, withConsent, accept, decline }
}
