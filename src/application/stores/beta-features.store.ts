import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BetaFeaturesState {
  enabledByUser: Record<string, boolean>
  setBetaFeaturesEnabled: (userId: string, enabled: boolean) => void
}

/**
 * Beta features are opt-in per browser. Keeping the default false ensures a
 * first-time visitor never sees experimental clinical tools unless they
 * deliberately enable them in Settings.
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
 * The switch is stored per account, and this helper answers for the browser
 * rather than for one uid because the only surfaces that consult it are
 * themselves behind the Beta-gated tab: an account with the switch off never
 * reaches them, so "some account here turned Beta on" and "the account looking
 * at this turned Beta on" give the same answer where it is read.
 *
 * Read through `getState()` on every call, never cached: the persisted value is
 * restored while this module initialises in the browser, and a user who flips
 * the switch mid-session must get the new answer without a reload.
 */
export function isBetaFeaturesEnabledInBrowser(): boolean {
  return Object.values(useBetaFeaturesStore.getState().enabledByUser).some((on) => on === true)
}
