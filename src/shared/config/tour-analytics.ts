// Guided-tour usage analytics.
//
// WHY IT LIVES IN src/shared/config: this observes two FEATURE stores. Both
// `src/application/**` and the rest of `src/shared/**` are forbidden by eslint
// from importing `@/features/*` ("features consume application hooks, not the
// reverse"); `src/shared/config` is the sanctioned composition root that wires
// features together (see feature-registry.ts / right-panel-registry.ts).
//
// WHY A SUBSCRIPTION rather than a trackEvent call inside the tour components:
// the tour components are being edited elsewhere right now, and a store
// subscription needs no change in them at all. The trade-off is that the
// START SOURCE (auto-offer on first visit vs. the help menu) is not
// distinguishable here — both call the same `start()`. Add a parameter to the
// store's action if that distinction is ever needed.
'use client'

import { useEffect } from 'react'
// The STORE modules, not the feature barrels: the barrels also export the
// tour components, which reach the auth provider and the whole Firebase SDK —
// none of which belongs in this provider-level module graph.
import { useLeftBrowserTourStore } from '@/features/left-browser-tour/left-browser-tour.store'
import { useRightFeatureTourStore } from '@/features/right-feature-tour/right-feature-tour.store'
import { trackEvent, type AnalyticsTour } from '@/src/application/telemetry/usage-analytics'

/** Steps whose presence at close time means the user reached the end. */
// The right tour store gains a `kind` field with the custom-summary guide; until
// then every right tour is the quick tour.
function kindOf(state: unknown): string | undefined {
  return (state as { kind?: string }).kind
}

const FINISH_STEP_IDS: ReadonlySet<string> = new Set(['finish', 'custom-summary-finish'])

function reportEnd(tour: AnalyticsTour, previousStepId: string | null): void {
  trackEvent('tour_end', {
    tour,
    // `tour_outcome`, not `outcome`: GA4 registers custom dimensions per
    // parameter NAME, and `ai_result.outcome` is a different value space.
    tour_outcome: previousStepId && FINISH_STEP_IDS.has(previousStepId) ? 'finish' : 'abandon',
    // `stop()` nulls stepId in the same set as `active: false`, so the step the
    // user actually closed on only exists in the PREVIOUS state.
    step: previousStepId ?? 'unknown',
  })
}

/**
 * Subscribe to both tour stores for the lifetime of the app. Mount exactly
 * once — a second mount would double-count every tour.
 */
export function useTourAnalytics(): void {
  useEffect(() => {
    // End is checked before start so a close-and-restart landing in one set
    // still reports in the order the user experienced it.
    const unsubscribeLeft = useLeftBrowserTourStore.subscribe((state, previous) => {
      if (previous.active && !state.active) reportEnd('left', previous.stepId)
      if (state.session > previous.session) trackEvent('tour_start', { tour: 'left' })
    })

    const unsubscribeRight = useRightFeatureTourStore.subscribe((state, previous) => {
      // `openCustomSummaryGuide()` sets active:false without bumping session —
      // an end only when a tour was actually running.
      if (previous.active && !state.active) {
        reportEnd(kindOf(previous) === 'custom-summary' ? 'custom-summary' : 'right', previous.stepId)
      }
      if (state.session > previous.session) {
        trackEvent('tour_start', {
          tour: kindOf(state) === 'custom-summary' ? 'custom-summary' : 'right',
        })
      }
    })

    return () => {
      unsubscribeLeft()
      unsubscribeRight()
    }
  }, [])
}
