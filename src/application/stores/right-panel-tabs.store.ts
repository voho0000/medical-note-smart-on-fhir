/**
 * Right Panel Tabs Store (Zustand)
 *
 * Persists the user's pin/unpin overrides for right-panel tabs ("customize
 * pinned tabs" in the more menu). The registry stays the source of truth for
 * which features exist and their defaults — this store only layers boolean
 * overrides on top, so newly added features automatically pick up their
 * registry default and overrides for removed features are harmless leftovers.
 * The More menu is rendered only while at least one feature is in overflow.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RightPanelFeatureConfig } from '@/src/shared/config/right-panel-registry'

interface RightPanelTabsState {
  pinOverrides: Record<string, boolean>
  setPinned: (id: string, pinned: boolean) => void
}

export const useRightPanelTabsStore = create<RightPanelTabsState>()(
  persist(
    (set) => ({
      pinOverrides: {},
      setPinned: (id, pinned) => {
        set((state) => ({
          pinOverrides: { ...state.pinOverrides, [id]: pinned },
        }))
      },
    }),
    {
      name: 'right-panel-tabs',
    }
  )
)

/** Effective pinned state: pinLocked wins, then user override, then registry default (true). */
export function isFeaturePinned(
  feature: RightPanelFeatureConfig,
  pinOverrides: Record<string, boolean>
): boolean {
  if (feature.pinLocked) return true
  return pinOverrides[feature.id] ?? feature.pinned !== false
}

export interface RightPanelFeatureGroups {
  lockedFeatures: RightPanelFeatureConfig[]
  unlockedFeatures: RightPanelFeatureConfig[]
  pinnedFeatures: RightPanelFeatureConfig[]
  overflowFeatures: RightPanelFeatureConfig[]
}

/**
 * Registry-driven tab placement. Keeping this pure makes the overflow policy
 * reusable and testable as features are plugged in or user overrides change.
 */
export function groupRightPanelFeatures(
  features: RightPanelFeatureConfig[],
  pinOverrides: Record<string, boolean>,
): RightPanelFeatureGroups {
  const lockedFeatures = features.filter((feature) => feature.pinLocked)
  const unlockedFeatures = features.filter((feature) => !feature.pinLocked)

  return {
    lockedFeatures,
    unlockedFeatures,
    pinnedFeatures: unlockedFeatures.filter((feature) => isFeaturePinned(feature, pinOverrides)),
    overflowFeatures: unlockedFeatures.filter((feature) => !isFeaturePinned(feature, pinOverrides)),
  }
}
