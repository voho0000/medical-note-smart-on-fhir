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
