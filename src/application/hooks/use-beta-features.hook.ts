'use client'

// One answer to "does this visitor get Beta features?", for every surface that
// asks: the right-panel tab gate, the Settings switch, and the guided tour.
//
// Two rules live here rather than in each caller.
//
// 1. No sign-in requirement. The switch in 設定 → 顯示與關於 is the whole gate
//    (owner decision, 2026-09). A not-signed-in visitor stores the answer under
//    the anonymous Firebase uid when there is one, and under a fixed guest key
//    when there is not, so the switch remembers itself either way.
//
// 2. The unattended Medcloud hand-off is outside the Beta term entirely — that
//    route must show no experimental tab and no opt-in switch, whatever a
//    tester left turned on in this browser earlier. The care-pack composition
//    root already refuses it; this keeps the tab and the switch in step.
//
// Both facts are client-only (persisted browser state, and the current URL), so
// they are resolved after hydration: reading them during the first render would
// make it diverge from the prerendered HTML.

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import { isMedcloudLaunchRoute } from '@/src/application/launch/medcloud-launch-route'
import {
  resolveBetaFeaturesKey,
  useBetaFeaturesStore,
} from '@/src/application/stores/beta-features.store'

export interface BetaFeaturesPreference {
  /** Whether Beta features are on for this visitor, on this route, right now. */
  enabled: boolean
  /** Whether the opt-in switch may be shown at all (false on the Medcloud route). */
  offered: boolean
  /** The `enabledByUser` key this visitor's answer is stored under. */
  storageKey: string
  setEnabled: (enabled: boolean) => void
}

export function useBetaFeatures(): BetaFeaturesPreference {
  const { user, anonymousUid } = useAuth()
  const storageKey = resolveBetaFeaturesKey(user?.uid, anonymousUid)
  const storedEnabled = useBetaFeaturesStore((state) => state.enabledByUser[storageKey] === true)
  const setBetaFeaturesEnabled = useBetaFeaturesStore((state) => state.setBetaFeaturesEnabled)
  // One state object, one commit: "the client is running" and "this route
  // allows Beta" are decided together and are never separately true.
  const [route, setRoute] = useState<{ resolved: boolean; allowsBeta: boolean }>({
    resolved: false,
    allowsBeta: false,
  })

  useEffect(() => {
    // Resolving client-only state after hydration is exactly what this effect
    // is for; it cannot run during render without diverging from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoute({ resolved: true, allowsBeta: !isMedcloudLaunchRoute() })
  }, [])

  const setEnabled = useCallback((enabled: boolean) => {
    setBetaFeaturesEnabled(storageKey, enabled)
  }, [setBetaFeaturesEnabled, storageKey])

  return {
    enabled: route.resolved && route.allowsBeta && storedEnabled,
    offered: route.resolved && route.allowsBeta,
    storageKey,
    setEnabled,
  }
}
