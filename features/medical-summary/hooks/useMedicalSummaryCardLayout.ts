"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import type { Audience } from "@/src/application/providers/audience.provider"

export const MEDICAL_SUMMARY_CARD_IDS = [
  "problems",
  "timeline",
  "safety",
  "investigations",
  "medications",
] as const

export type MedicalSummaryCardId = (typeof MEDICAL_SUMMARY_CARD_IDS)[number]
export type MedicalSummaryCardDirection = "up" | "down"

interface MedicalSummaryCardLayout {
  version: number
  order: MedicalSummaryCardId[]
  hidden: MedicalSummaryCardId[]
}

interface UseMedicalSummaryCardLayoutInput {
  audience: Audience
  availableIds: MedicalSummaryCardId[]
}

const STORAGE_KEY_PREFIX = "medical-summary-card-layout:v2"
const STORAGE_CHANGE_EVENT = "medical-summary-card-layout-change"
const LAYOUT_VERSION = 5

const DEFAULT_ORDER_BY_AUDIENCE: Record<Audience, MedicalSummaryCardId[]> = {
  patient: ["problems", "timeline", "investigations", "medications", "safety"],
  medical: ["problems", "timeline", "investigations", "safety", "medications"],
}

const DEFAULT_HIDDEN_BY_AUDIENCE: Record<Audience, MedicalSummaryCardId[]> = {
  patient: [],
  medical: [],
}

function getDefaultLayout(audience: Audience): MedicalSummaryCardLayout {
  return {
    version: LAYOUT_VERSION,
    order: [...DEFAULT_ORDER_BY_AUDIENCE[audience]],
    hidden: [...DEFAULT_HIDDEN_BY_AUDIENCE[audience]],
  }
}

function moveAfter(
  order: MedicalSummaryCardId[],
  id: MedicalSummaryCardId,
  anchor: MedicalSummaryCardId,
) {
  if (!order.includes(id) || !order.includes(anchor)) return order
  const withoutId = order.filter((cardId) => cardId !== id)
  const anchorIndex = withoutId.indexOf(anchor)
  return [
    ...withoutId.slice(0, anchorIndex + 1),
    id,
    ...withoutId.slice(anchorIndex + 1),
  ]
}

function isCardIdForAudience(value: unknown, audience: Audience): value is MedicalSummaryCardId {
  return typeof value === "string" && DEFAULT_ORDER_BY_AUDIENCE[audience].includes(value as MedicalSummaryCardId)
}

function uniqueCardIds(ids: MedicalSummaryCardId[]) {
  return ids.filter((id, index) => ids.indexOf(id) === index)
}

function normalizeLayout(value: unknown, audience: Audience): MedicalSummaryCardLayout {
  const defaults = getDefaultLayout(audience)
  if (!value || typeof value !== "object") return defaults

  const candidate = value as Partial<MedicalSummaryCardLayout>
  const storedOrder = Array.isArray(candidate.order)
    ? candidate.order.filter((id): id is MedicalSummaryCardId => isCardIdForAudience(id, audience))
    : []
  const order = uniqueCardIds(storedOrder)
  let fullOrder = [
    ...order,
    ...defaults.order.filter((id) => !order.includes(id)),
  ]

  // v2 placed patient safety reminders above tests and medication education.
  // Migrate that persisted layout once so existing browsers receive the new
  // patient reading flow; subsequent v3 user reordering remains untouched.
  if (audience === "patient" && candidate.version !== LAYOUT_VERSION) {
    fullOrder = moveAfter(fullOrder, "safety", "medications")
  }
  // v5 places the clinician medication-reconciliation card directly after
  // safety. Apply once to existing layouts; users can freely reorder it after
  // this migration.
  if (audience === "medical" && candidate.version !== LAYOUT_VERSION) {
    fullOrder = moveAfter(fullOrder, "medications", "safety")
  }

  const storedHidden = Array.isArray(candidate.hidden)
    ? candidate.hidden.filter((id): id is MedicalSummaryCardId => isCardIdForAudience(id, audience))
    : []

  return {
    version: LAYOUT_VERSION,
    order: fullOrder,
    hidden: uniqueCardIds(storedHidden),
  }
}

function emitStorageChange(key: string) {
  window.dispatchEvent(new CustomEvent(STORAGE_CHANGE_EVENT, { detail: { key } }))
}

export function useMedicalSummaryCardLayout({
  audience,
  availableIds,
}: UseMedicalSummaryCardLayoutInput) {
  const storageKey = `${STORAGE_KEY_PREFIX}:${audience}`

  const readStoredLayout = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(storageKey)
        if (stored) return normalizeLayout(JSON.parse(stored), audience)
      } catch (error) {
        console.warn("[Medical Summary] Failed to load card layout", error)
      }
    }
    return getDefaultLayout(audience)
  }, [audience, storageKey])

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {}

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) onStoreChange()
    }
    const handleLocalChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail
      if (detail?.key === storageKey) onStoreChange()
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener(STORAGE_CHANGE_EVENT, handleLocalChange)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(STORAGE_CHANGE_EVENT, handleLocalChange)
    }
  }, [storageKey])

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return null
    return window.localStorage.getItem(storageKey)
  }, [storageKey])

  const storedLayout = useSyncExternalStore(subscribe, getSnapshot, () => null)
  const normalizedLayout = useMemo(() => {
    if (!storedLayout) return getDefaultLayout(audience)
    try {
      return normalizeLayout(JSON.parse(storedLayout), audience)
    } catch (error) {
      console.warn("[Medical Summary] Failed to parse card layout", error)
      return getDefaultLayout(audience)
    }
  }, [audience, storedLayout])

  const writeLayout = useCallback((next: MedicalSummaryCardLayout) => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(normalizeLayout(next, audience)))
      emitStorageChange(storageKey)
    } catch (error) {
      console.warn("[Medical Summary] Failed to save card layout", error)
    }
  }, [audience, storageKey])

  const availableSet = useMemo(() => new Set(availableIds), [availableIds])
  const hiddenSet = useMemo(() => new Set(normalizedLayout.hidden), [normalizedLayout.hidden])

  const orderedManageIds = useMemo(
    () => normalizedLayout.order.filter((id) => availableSet.has(id)),
    [availableSet, normalizedLayout.order],
  )

  const orderedVisibleIds = useMemo(
    () => orderedManageIds.filter((id) => !hiddenSet.has(id)),
    [hiddenSet, orderedManageIds],
  )

  const setCardVisible = useCallback((id: MedicalSummaryCardId, visible: boolean) => {
    const current = readStoredLayout()
    const hidden = visible
      ? current.hidden.filter((hiddenId) => hiddenId !== id)
      : current.hidden.includes(id)
        ? current.hidden
        : [...current.hidden, id]
    writeLayout({ ...current, hidden })
  }, [readStoredLayout, writeLayout])

  const moveCard = useCallback((
    id: MedicalSummaryCardId,
    direction: MedicalSummaryCardDirection,
    scopeIds: MedicalSummaryCardId[] = availableIds,
  ) => {
    const current = readStoredLayout()
    const scopedOrder = current.order.filter((cardId) => scopeIds.includes(cardId))
    const index = scopedOrder.indexOf(id)
    const nextIndex = direction === "up" ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= scopedOrder.length) return

    const nextScopedOrder = [...scopedOrder]
    const next = nextScopedOrder[nextIndex]
    nextScopedOrder[nextIndex] = id
    nextScopedOrder[index] = next

    let scopedIndex = 0
    const order = current.order.map((cardId) => {
      if (!scopeIds.includes(cardId)) return cardId
      const replacement = nextScopedOrder[scopedIndex]
      scopedIndex += 1
      return replacement
    })

    writeLayout({ ...current, order })
  }, [availableIds, readStoredLayout, writeLayout])

  const resetLayout = useCallback(() => {
    writeLayout(getDefaultLayout(audience))
  }, [audience, writeLayout])

  return {
    hiddenSet,
    moveCard,
    orderedManageIds,
    orderedVisibleIds,
    resetLayout,
    setCardVisible,
  }
}
