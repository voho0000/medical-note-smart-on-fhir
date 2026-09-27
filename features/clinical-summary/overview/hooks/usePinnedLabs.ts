"use client"

// 我的固定檢驗 rows for the overview: the clinician's own pin list resolved
// against ALL loaded observations. Deliberately independent of the overview's
// date window — the latest NT-proBNP is the latest one even when it is six
// months old, and it shows with that date.

import { useMemo } from 'react'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'
import { categorizeObservation } from '@/src/shared/utils/lab-categories'
import {
  findPinnableLab,
  isPinnedLabReminder,
  pinnedLabId,
  pinnedLabReminderLabel,
  resolvePinnedLab,
  type ResolvedPinnedLab,
} from '@/src/shared/utils/pinned-labs'
import { OVERVIEW_PINNED_ANALYTES } from '../utils/overview-selectors'

export interface PinnedLabRow {
  id: string
  kind: 'lab' | 'reminder' | 'unknown'
  /** Short clinical label (CREA, HbA1c). */
  label: string
  /** Long-form name in the UI language, when there is one. */
  subLabel?: string
  categoryId?: string
  testKey?: string
  resolved?: ResolvedPinnedLab
}

/** The system 「常用」 list as individual pins — the starting point the editor
 *  offers before a clinician has saved a list of their own. */
export function systemDefaultPinnedLabIds(): string[] {
  const ids: string[] = []
  for (const [categoryId, keys] of Object.entries(OVERVIEW_PINNED_ANALYTES)) {
    for (const key of keys) {
      const id = pinnedLabId(categoryId, key)
      if (findPinnableLab(id)) ids.push(id)
    }
  }
  return ids
}

export function usePinnedLabs(enabled: boolean, ids: string[]) {
  const { observations = [] } = useClinicalData()
  const { locale } = useLanguage()
  // Built only while the pinned view is on screen: this pivot covers the whole
  // chart, not the overview window.
  const pivots = useMemo(
    () => (enabled ? buildLabPivots(Array.isArray(observations) ? observations : []) : null),
    [enabled, observations],
  )

  const rows = useMemo<PinnedLabRow[]>(() => ids.map((id) => {
    if (isPinnedLabReminder(id)) return { id, kind: 'reminder', label: pinnedLabReminderLabel(id) }
    const entry = findPinnableLab(id)
    if (!entry) return { id, kind: 'unknown', label: id.slice(id.indexOf(':') + 1) }
    return {
      id,
      kind: 'lab',
      label: entry.short,
      subLabel: locale === 'zh-TW' ? entry.nameZh : entry.nameEn,
      categoryId: entry.categoryId,
      testKey: entry.testKey,
      resolved: pivots ? resolvePinnedLab(pivots, id) : undefined,
    }
  }), [ids, locale, pivots])

  // Any categorised Observation is a valid landing point for the cumulative
  // report; the category and analyte key carry the actual destination.
  const navResourceId = useMemo(() => {
    if (!enabled) return undefined
    for (const observation of (Array.isArray(observations) ? observations : []) as any[]) {
      if (typeof observation?.id === 'string' && categorizeObservation(observation)) return observation.id as string
    }
    return undefined
  }, [enabled, observations])

  return { rows, navResourceId }
}
