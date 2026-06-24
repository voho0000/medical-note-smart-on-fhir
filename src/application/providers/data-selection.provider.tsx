// Application Provider: Data Selection
//
// Per-consumer profiles (audit: 對話/洞察/IPS). Each of the three clinical-data
// consumers — chat (帶入病歷), clinical insights, and IPS export — owns its own
// {selection, filters, supplementaryNotes, editedClinicalContext}. They're
// seeded IDENTICALLY (the 初診 default), so out of the box all three behave the
// same; the user can then fine-tune any one independently in the 資料選擇 tab.
//
// The data-selection UI edits ONE consumer at a time (`editingConsumer`); the
// convenience getters/setters (selectedData / filters / updateSelection / …)
// all target that consumer, so the editor UI stays simple. The actual consumers
// read their own profile via getProfile(consumer).
"use client"

import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react'
import { StorageService } from '@/src/shared/utils/storage.utils'
import {
  DEFAULT_DATA_SELECTION,
  DEFAULT_DATA_FILTERS,
  DATA_SELECTION_PRESETS,
  STORAGE_KEYS,
  resolveActivePreset,
  type PresetId,
} from '@/src/shared/constants/data-selection.constants'
import type { DataSelection, DataFilters } from '@/src/core/entities/clinical-context.entity'
import type { DocumentMode } from '@/src/core/utils/clinical-documents.utils'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'

ensureCategoriesInitialized()

type DataType = keyof DataSelection
export type DataConsumer = 'chat' | 'insights' | 'ips'
// The 資料選擇 panel drives the "working" AI — chat + insights — as ONE selection,
// always broadcast to both. IPS is configured independently on its own tab
// (per-consumer setters below), so it no longer rides along with the panel.
const MAIN_TARGETS: DataConsumer[] = ['chat', 'insights']

export interface ConsumerProfile {
  selection: DataSelection
  filters: DataFilters
  supplementaryNotes: string
  editedClinicalContext: string | null
  /** Documents are picked per-document, not via scalar filters. */
  documentMode: DocumentMode
  documentIds: string[]
}

interface DataSelectionContextValue {
  // ── 資料選擇 panel convenience — these edit the MAIN target (chat + insights) ──
  selectedData: DataSelection
  setSelectedData: (next: DataSelection) => void
  updateSelection: (dataType: DataType, isSelected: boolean) => void
  resetToDefaults: () => void
  applyPreset: (presetId: PresetId) => void
  /** Which template the current selection matches (derived; catch-all = 通用). */
  activePreset: PresetId
  filters: DataFilters
  setFilters: (next: DataFilters) => void
  isAnySelected: boolean
  supplementaryNotes: string
  setSupplementaryNotes: (notes: string) => void
  editedClinicalContext: string | null
  setEditedClinicalContext: (context: string | null) => void

  // Documents (per-document selection on the main target)
  documentMode: DocumentMode
  documentIds: string[]
  setDocumentMode: (mode: DocumentMode) => void
  setDocumentIds: (ids: string[]) => void

  // ── Per-consumer accessors — the real consumers read these; the IPS tab uses
  //    the *For setters to edit ONLY the 'ips' profile, decoupled from the panel.
  getProfile: (consumer: DataConsumer) => ConsumerProfile
  setNotesFor: (consumer: DataConsumer, notes: string) => void
  setEditedContextFor: (consumer: DataConsumer, context: string | null) => void
  updateSelectionFor: (consumer: DataConsumer, dataType: DataType, value: boolean) => void
  setFiltersFor: (consumer: DataConsumer, next: DataFilters) => void
}

const DataSelectionContext = createContext<DataSelectionContextValue | null>(null)

const storage = new StorageService('localStorage')

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object'
}

function makeDefaultProfile(): ConsumerProfile {
  return {
    selection: { ...DEFAULT_DATA_SELECTION },
    filters: { ...DEFAULT_DATA_FILTERS },
    supplementaryNotes: '',
    editedClinicalContext: null,
    documentMode: 'latestAdmission',
    documentIds: [],
  }
}

// Exported for testing: merges a (possibly stale / partial) stored profile over
// the current defaults without discarding the user's existing choices.
export function coerceProfile(saved: Partial<ConsumerProfile> | undefined): ConsumerProfile {
  const base = makeDefaultProfile()
  if (!saved) return base
  const mode = saved.documentMode
  // MERGE over defaults — a newly-added schema key gets its default while the
  // user's existing choices are preserved. (Previously a single missing key
  // discarded the whole selection/filters → every toggle silently reset to
  // default after any schema change.)
  const selection = { ...DEFAULT_DATA_SELECTION, ...(isObject(saved.selection) ? saved.selection : {}) } as DataSelection
  const filters = { ...DEFAULT_DATA_FILTERS, ...(isObject(saved.filters) ? saved.filters : {}) } as DataFilters
  return {
    selection,
    filters,
    // activePreset/presetMemory are no longer stored — the active-template
    // highlight is derived live from selection/filters. Any such keys on an old
    // stored profile are simply ignored here.
    supplementaryNotes: typeof saved.supplementaryNotes === 'string' ? saved.supplementaryNotes : '',
    editedClinicalContext: typeof saved.editedClinicalContext === 'string' ? saved.editedClinicalContext : null,
    documentMode: mode === 'all' || mode === 'custom' || mode === 'latestAdmission' ? mode : 'latestAdmission',
    documentIds: Array.isArray(saved.documentIds) ? saved.documentIds.filter((x): x is string => typeof x === 'string') : [],
  }
}

type ProfilesState = Record<DataConsumer, ConsumerProfile>

function getInitialProfiles(): ProfilesState {
  const saved = storage.get<Partial<Record<DataConsumer, Partial<ConsumerProfile>>>>(STORAGE_KEYS.DATA_PROFILES)
  return {
    chat: coerceProfile(saved?.chat),
    insights: coerceProfile(saved?.insights),
    ips: coerceProfile(saved?.ips),
  }
}

export function DataSelectionProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ProfilesState>(getInitialProfiles)

  useEffect(() => {
    storage.set(STORAGE_KEYS.DATA_PROFILES, profiles)
  }, [profiles])

  const patchProfile = useCallback(
    (consumer: DataConsumer, patch: Partial<ConsumerProfile>) => {
      setProfiles((prev) => ({ ...prev, [consumer]: { ...prev[consumer], ...patch } }))
    },
    [],
  )

  // Patch the MAIN target (chat + insights) together. The patch may be a value or
  // a per-consumer fn (so a template load can read each profile's own state).
  const patchTargets = useCallback(
    (patch: Partial<ConsumerProfile> | ((p: ConsumerProfile) => Partial<ConsumerProfile>)) => {
      setProfiles((prev) => {
        const out = { ...prev }
        for (const c of MAIN_TARGETS) {
          out[c] = { ...prev[c], ...(typeof patch === 'function' ? patch(prev[c]) : patch) }
        }
        return out
      })
    },
    [],
  )

  // The panel displays the 對話 profile as the shared base (chat === insights,
  // since both are always edited together).
  const current = profiles.chat

  const setSelectedData = useCallback(
    (next: DataSelection) => patchTargets({ selection: next }),
    [patchTargets],
  )

  const updateSelection = useCallback(
    (dataType: DataType, isSelected: boolean) =>
      patchTargets((p) => ({ selection: { ...p.selection, [dataType]: isSelected } })),
    [patchTargets],
  )

  const setFilters = useCallback(
    (next: DataFilters) => patchTargets({ filters: next }),
    [patchTargets],
  )

  // Full reset: back to the 通用 factory baseline.
  const resetToDefaults = useCallback(
    () => patchTargets({
      selection: { ...DEFAULT_DATA_SELECTION },
      filters: { ...DEFAULT_DATA_FILTERS },
    }),
    [patchTargets],
  )

  // Apply a template (one-tap fill): load the preset's factory selection+filters
  // as a starting point. `documents` is a sticky setting (orthogonal to presets),
  // so the user's picked documents survive the template load.
  const applyPreset = useCallback(
    (presetId: PresetId) =>
      patchTargets((cur) => ({
        selection: { ...DATA_SELECTION_PRESETS[presetId].selection, documents: cur.selection.documents },
        filters: { ...DATA_SELECTION_PRESETS[presetId].filters },
      })),
    [patchTargets],
  )

  const setSupplementaryNotes = useCallback(
    (notes: string) => patchTargets({ supplementaryNotes: notes }),
    [patchTargets],
  )

  const setEditedClinicalContext = useCallback(
    (context: string | null) => patchTargets({ editedClinicalContext: context }),
    [patchTargets],
  )

  const setDocumentMode = useCallback(
    (mode: DocumentMode) => patchTargets({ documentMode: mode }),
    [patchTargets],
  )

  const setDocumentIds = useCallback(
    (ids: string[]) => patchTargets({ documentIds: ids }),
    [patchTargets],
  )

  const setNotesFor = useCallback(
    (consumer: DataConsumer, notes: string) => patchProfile(consumer, { supplementaryNotes: notes }),
    [patchProfile],
  )

  const setEditedContextFor = useCallback(
    (consumer: DataConsumer, context: string | null) => patchProfile(consumer, { editedClinicalContext: context }),
    [patchProfile],
  )

  // Per-consumer editing — used by the IPS tab to edit ONLY the 'ips' profile,
  // independent of the panel (which drives chat + insights).
  const updateSelectionFor = useCallback(
    (consumer: DataConsumer, dataType: DataType, value: boolean) =>
      setProfiles((prev) => ({
        ...prev,
        [consumer]: { ...prev[consumer], selection: { ...prev[consumer].selection, [dataType]: value } },
      })),
    [],
  )

  const setFiltersFor = useCallback(
    (consumer: DataConsumer, next: DataFilters) => patchProfile(consumer, { filters: next }),
    [patchProfile],
  )

  const getProfile = useCallback((consumer: DataConsumer): ConsumerProfile => profiles[consumer], [profiles])

  const value = useMemo<DataSelectionContextValue>(
    () => ({
      selectedData: current.selection,
      setSelectedData,
      updateSelection,
      resetToDefaults,
      applyPreset,
      // Derived live (no stored tab) — the highlighted template always reflects
      // the current selection; hand-tuning falls back to 通用 (catch-all).
      activePreset: resolveActivePreset(current.selection, current.filters),
      filters: current.filters,
      setFilters,
      isAnySelected: Object.values(current.selection).some(Boolean),
      supplementaryNotes: current.supplementaryNotes,
      setSupplementaryNotes,
      editedClinicalContext: current.editedClinicalContext,
      setEditedClinicalContext,
      documentMode: current.documentMode,
      documentIds: current.documentIds,
      setDocumentMode,
      setDocumentIds,
      getProfile,
      setNotesFor,
      setEditedContextFor,
      updateSelectionFor,
      setFiltersFor,
    }),
    [
      current, setSelectedData, updateSelection, resetToDefaults, applyPreset,
      setFilters, setSupplementaryNotes, setEditedClinicalContext, setDocumentMode, setDocumentIds,
      getProfile, setNotesFor, setEditedContextFor, updateSelectionFor, setFiltersFor,
    ],
  )

  return <DataSelectionContext.Provider value={value}>{children}</DataSelectionContext.Provider>
}

export function useDataSelection() {
  const context = useContext(DataSelectionContext)
  if (!context) {
    throw new Error('useDataSelection must be used within DataSelectionProvider')
  }
  return context
}
