'use client'

// The current visitor's 門診偏好 — pinned analytes and copy formats — with the
// storage key resolved the same way as the Beta switch: signed-in account,
// then the anonymous session, then one shared guest key.

import { useCallback, useMemo } from 'react'
import { useAuth } from '@/src/application/providers/auth.provider'
import {
  EMPTY_OUTPATIENT_PREFS,
  resolveOutpatientPrefsKey,
  useOutpatientPrefsStore,
  type EmrCustomFormat,
  type EmrHandoffMode,
  type OutpatientPrefs,
  type OverviewLabMode,
} from '@/src/application/stores/outpatient-prefs.store'

export interface OutpatientPrefsApi extends OutpatientPrefs {
  /** 'account' when a signed-in account owns these settings; otherwise they
   *  belong to this browser's anonymous or guest session. */
  scope: 'account' | 'browser'
  setPinnedLabs: (ids: string[] | null) => void
  setLabMode: (mode: OverviewLabMode) => void
  saveFormat: (format: EmrCustomFormat) => void
  deleteFormat: (id: string) => void
  setActiveFormat: (id: string) => void
  setHandoffMode: (mode: EmrHandoffMode) => void
}

export function useOutpatientPrefs(): OutpatientPrefsApi {
  const { user, anonymousUid } = useAuth()
  const key = resolveOutpatientPrefsKey(user?.uid, anonymousUid)
  const prefs = useOutpatientPrefsStore((state) => state.byUser[key]) ?? EMPTY_OUTPATIENT_PREFS
  const update = useOutpatientPrefsStore((state) => state.update)

  const setPinnedLabs = useCallback((ids: string[] | null) => update(key, { pinnedLabs: ids }), [key, update])
  const setLabMode = useCallback((mode: OverviewLabMode) => update(key, { labMode: mode }), [key, update])
  const setHandoffMode = useCallback((mode: EmrHandoffMode) => update(key, { handoffMode: mode }), [key, update])
  const setActiveFormat = useCallback((id: string) => update(key, { activeFormatId: id }), [key, update])

  const saveFormat = useCallback((format: EmrCustomFormat) => {
    const current = useOutpatientPrefsStore.getState().byUser[key] ?? EMPTY_OUTPATIENT_PREFS
    const exists = current.formats.some((f) => f.id === format.id)
    const formats = exists
      ? current.formats.map((f) => (f.id === format.id ? format : f))
      : [...current.formats, format]
    update(key, { formats, activeFormatId: format.id })
  }, [key, update])

  const deleteFormat = useCallback((id: string) => {
    const current = useOutpatientPrefsStore.getState().byUser[key] ?? EMPTY_OUTPATIENT_PREFS
    const formats = current.formats.filter((f) => f.id !== id)
    update(key, {
      formats,
      activeFormatId: current.activeFormatId === id ? formats[0]?.id ?? null : current.activeFormatId,
    })
  }, [key, update])

  return useMemo(() => ({
    ...prefs,
    scope: user?.uid ? 'account' : 'browser',
    setPinnedLabs,
    setLabMode,
    saveFormat,
    deleteFormat,
    setActiveFormat,
    setHandoffMode,
  }), [prefs, user?.uid, setPinnedLabs, setLabMode, saveFormat, deleteFormat, setActiveFormat, setHandoffMode])
}
