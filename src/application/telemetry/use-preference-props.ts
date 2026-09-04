// Preference user properties.
//
// These three answer "who is this, set up how" for every event in the session:
// whether the summary runs itself, which language the UI is in, and whether the
// user brought their own key or is on the built-in proxy. All three are already
// non-identifying booleans/enums; none of them is derived from patient data.
//
// Same shape as the `audience` property in audience.provider: one effect per
// value, re-sent whenever it changes, so a mid-session toggle is reflected.
'use client'

import { useEffect } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'
import { useApiKey, useClaudeKey, useGeminiKey } from '@/src/application/stores/ai-config.store'
import { setUserProps } from '@/src/application/telemetry/usage-analytics'

export function usePreferenceProps(): void {
  const autoGenerate = useSummaryPrefsStore((state) => state.autoGenerate)
  const { locale } = useLanguage()
  const openAiKey = useApiKey()
  const geminiKey = useGeminiKey()
  const claudeKey = useClaudeKey()
  // Any one key is enough to leave the free proxy — which is the distinction
  // that matters for reading quota and reliability numbers.
  const keyMode = openAiKey || geminiKey || claudeKey ? 'own' : 'proxy'

  useEffect(() => {
    setUserProps({ auto_summary: autoGenerate ? 'on' : 'off' })
  }, [autoGenerate])

  useEffect(() => {
    setUserProps({ locale })
  }, [locale])

  useEffect(() => {
    setUserProps({ key_mode: keyMode })
  }, [keyMode])
}
