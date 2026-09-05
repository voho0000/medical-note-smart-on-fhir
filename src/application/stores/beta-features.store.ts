import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BetaFeaturesState {
  enabledByUser: Record<string, boolean>
  setBetaFeaturesEnabled: (userId: string, enabled: boolean) => void
}

/**
 * The key a browser with no signed-in account stores its answer under.
 *
 * Anonymous Firebase sessions (the free tier) do have a uid, and it survives
 * reloads, so it is preferred when there is one — but it is disposable, and a
 * browser where anonymous sign-in is unavailable has none at all. Falling back
 * to one fixed key is what keeps the switch from silently forgetting itself.
 */
export const GUEST_BETA_FEATURES_KEY = 'guest'

/**
 * Which entry of `enabledByUser` this visitor's answer lives under: the signed-in
 * account first, the anonymous session second, the shared guest key last.
 */
export function resolveBetaFeaturesKey(
  signedInUid?: string | null,
  anonymousUid?: string | null,
): string {
  return signedInUid || anonymousUid || GUEST_BETA_FEATURES_KEY
}

/**
 * Beta features are opt-in per browser. Keeping the default false ensures a
 * first-time visitor never sees experimental clinical tools unless they
 * deliberately enable them in Settings.
 *
 * Signing in is NOT part of the gate: a visitor can switch Beta on and reach
 * the experimental tabs without an account (owner decision, 2026-09).
 */
export const useBetaFeaturesStore = create<BetaFeaturesState>()(
  persist(
    (set) => ({
      enabledByUser: {},
      setBetaFeaturesEnabled: (userId, enabled) => set((state) => ({
        enabledByUser: {
          ...state.enabledByUser,
          [userId]: enabled,
        },
      })),
    }),
    {
      name: 'mediprisma-beta-features',
    },
  ),
)

/**
 * Beta state for the code that runs outside React — the care-pack composition
 * root decides pack visibility in a plain function, so it cannot subscribe.
 *
 * The switch is stored per session key (account, anonymous uid, or guest), and
 * this helper answers for the browser rather than for one key because the only
 * surfaces that consult it are themselves behind the Beta-gated tab: a visitor
 * with the switch off never reaches them, so "some session here turned Beta on"
 * and "the session looking at this turned Beta on" give the same answer where
 * it is read.
 *
 * Read through `getState()` on every call, never cached: the persisted value is
 * restored while this module initialises in the browser, and a user who flips
 * the switch mid-session must get the new answer without a reload.
 */
export function isBetaFeaturesEnabledInBrowser(): boolean {
  return Object.values(useBetaFeaturesStore.getState().enabledByUser).some((on) => on === true)
}
