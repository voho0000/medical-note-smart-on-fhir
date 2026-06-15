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
  STORAGE_KEYS,
  switchPreset,
  resolveActivePreset,
  type PresetId,
  type PresetMemory,
} from '@/src/shared/constants/data-selection.constants'
import type { DataSelection, DataFilters } from '@/src/core/entities/clinical-context.entity'
import type { DocumentMode } from '@/src/core/utils/clinical-documents.utils'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'

ensureCategoriesInitialized()

type DataType = keyof DataSelection
export type DataConsumer = 'chat' | 'insights' | 'ips'
const CONSUMERS: DataConsumer[] = ['chat', 'insights', 'ips']

export interface ConsumerProfile {
  selection: DataSelection
  filters: DataFilters
  /** Which scenario tab is active; its tweaks live in selection/filters above. */
  activePreset: PresetId
  /** Remembered selection/filters for the OTHER (non-active) scenarios. */
  presetMemory: Partial<Record<PresetId, PresetMemory>>
  supplementaryNotes: string
  editedClinicalContext: string | null
  /** Documents are picked per-document, not via scalar filters. */
  documentMode: DocumentMode
  documentIds: string[]
}

interface DataSelectionContextValue {
  /** Which consumer the data-selection UI is currently editing */
  editingConsumer: DataConsumer
  setEditingConsumer: (consumer: DataConsumer) => void

  // ── Editing-consumer convenience (the 資料選擇 UI binds to these) ──────────
  selectedData: DataSelection
  setSelectedData: (next: DataSelection) => void
  updateSelection: (dataType: DataType, isSelected: boolean) => void
  resetToDefaults: () => void
  applyPreset: (presetId: PresetId) => void
  /** Which scenario tab the editing consumer is on (always one of the three). */
  activePreset: PresetId
  filters: DataFilters
  setFilters: (next: DataFilters) => void
  isAnySelected: boolean
  supplementaryNotes: string
  setSupplementaryNotes: (notes: string) => void
  editedClinicalContext: string | null
  setEditedClinicalContext: (context: string | null) => void

  // Documents (per-document selection on the editing consumer)
  documentMode: DocumentMode
  documentIds: string[]
  setDocumentMode: (mode: DocumentMode) => void
  setDocumentIds: (ids: string[]) => void

  /** Copy the editing consumer's whole profile to the other two */
  syncEditingToAll: () => void
  /** True when all three consumers currently share an identical profile */
  allConsumersInSync: boolean

  // ── Per-consumer accessors (the real consumers read these) ────────────────
  getProfile: (consumer: DataConsumer) => ConsumerProfile
  setNotesFor: (consumer: DataConsumer, notes: string) => void
  setEditedContextFor: (consumer: DataConsumer, context: string | null) => void
}

const DataSelectionContext = createContext<DataSelectionContextValue | null>(null)

const storage = new StorageService('localStorage')

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object'
}

const VALID_PRESETS: PresetId[] = ['general', 'newPatient', 'followUp']
function isPresetId(x: unknown): x is PresetId {
  return typeof x === 'string' && (VALID_PRESETS as string[]).includes(x)
}

function makeDefaultProfile(): ConsumerProfile {
  return {
    selection: { ...DEFAULT_DATA_SELECTION },
    filters: { ...DEFAULT_DATA_FILTERS },
    activePreset: 'general',
    presetMemory: {},
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
    // Old profiles have no activePreset — derive it from the saved selection so
    // the highlight matches what they have; their current state becomes that
    // scenario's remembered state on the next switch.
    activePreset: isPresetId(saved.activePreset) ? saved.activePreset : resolveActivePreset(selection, filters),
    presetMemory: isObject(saved.presetMemory) ? (saved.presetMemory as Partial<Record<PresetId, PresetMemory>>) : {},
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

function profilesEqual(a: ConsumerProfile, b: ConsumerProfile): boolean {
  return JSON.stringify({ s: a.selection, f: a.filters }) === JSON.stringify({ s: b.selection, f: b.filters })
}

export function DataSelectionProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ProfilesState>(getInitialProfiles)
  const [editingConsumer, setEditingConsumer] = useState<DataConsumer>('chat')

  useEffect(() => {
    storage.set(STORAGE_KEYS.DATA_PROFILES, profiles)
  }, [profiles])

  const patchProfile = useCallback(
    (consumer: DataConsumer, patch: Partial<ConsumerProfile>) => {
      setProfiles((prev) => ({ ...prev, [consumer]: { ...prev[consumer], ...patch } }))
    },
    [],
  )

  const current = profiles[editingConsumer]

  const setSelectedData = useCallback(
    (next: DataSelection) => patchProfile(editingConsumer, { selection: next }),
    [editingConsumer, patchProfile],
  )

  const updateSelection = useCallback(
    (dataType: DataType, isSelected: boolean) =>
      setProfiles((prev) => ({
        ...prev,
        [editingConsumer]: {
          ...prev[editingConsumer],
          selection: { ...prev[editingConsumer].selection, [dataType]: isSelected },
        },
      })),
    [editingConsumer],
  )

  const setFilters = useCallback(
    (next: DataFilters) => patchProfile(editingConsumer, { filters: next }),
    [editingConsumer, patchProfile],
  )

  // Full reset: back to the 通用 factory baseline and forget all per-preset tweaks.
  const resetToDefaults = useCallback(
    () => patchProfile(editingConsumer, {
      selection: { ...DEFAULT_DATA_SELECTION },
      filters: { ...DEFAULT_DATA_FILTERS },
      activePreset: 'general',
      presetMemory: {},
    }),
    [editingConsumer, patchProfile],
  )

  // Switch scenario tab: snapshot the current preset's tweaks, restore the
  // target's remembered tweaks (or its factory default the first time).
  const applyPreset = useCallback(
    (presetId: PresetId) => {
      setProfiles((prev) => {
        const cur = prev[editingConsumer]
        const next = switchPreset(
          { selection: cur.selection, filters: cur.filters, activePreset: cur.activePreset, presetMemory: cur.presetMemory },
          presetId,
        )
        return { ...prev, [editingConsumer]: { ...cur, ...next } }
      })
    },
    [editingConsumer],
  )

  const setSupplementaryNotes = useCallback(
    (notes: string) => patchProfile(editingConsumer, { supplementaryNotes: notes }),
    [editingConsumer, patchProfile],
  )

  const setEditedClinicalContext = useCallback(
    (context: string | null) => patchProfile(editingConsumer, { editedClinicalContext: context }),
    [editingConsumer, patchProfile],
  )

  const setDocumentMode = useCallback(
    (mode: DocumentMode) => patchProfile(editingConsumer, { documentMode: mode }),
    [editingConsumer, patchProfile],
  )

  const setDocumentIds = useCallback(
    (ids: string[]) => patchProfile(editingConsumer, { documentIds: ids }),
    [editingConsumer, patchProfile],
  )

  const setNotesFor = useCallback(
    (consumer: DataConsumer, notes: string) => patchProfile(consumer, { supplementaryNotes: notes }),
    [patchProfile],
  )

  const setEditedContextFor = useCallback(
    (consumer: DataConsumer, context: string | null) => patchProfile(consumer, { editedClinicalContext: context }),
    [patchProfile],
  )

  const syncEditingToAll = useCallback(() => {
    setProfiles((prev) => {
      const src = prev[editingConsumer]
      const clone = (): ConsumerProfile => ({
        selection: { ...src.selection },
        filters: { ...src.filters },
        activePreset: src.activePreset,
        presetMemory: { ...src.presetMemory },
        supplementaryNotes: src.supplementaryNotes,
        editedClinicalContext: src.editedClinicalContext,
        documentMode: src.documentMode,
        documentIds: [...src.documentIds],
      })
      return { chat: clone(), insights: clone(), ips: clone() }
    })
  }, [editingConsumer])

  // getProfile must be stable yet read fresh state — back it with a ref-free
  // closure over the latest profiles via functional access.
  const getProfile = useCallback((consumer: DataConsumer): ConsumerProfile => profiles[consumer], [profiles])

  const allConsumersInSync = useMemo(
    () => CONSUMERS.every((c) => profilesEqual(profiles[c], profiles.chat)),
    [profiles],
  )

  const value = useMemo<DataSelectionContextValue>(
    () => ({
      editingConsumer,
      setEditingConsumer,
      selectedData: current.selection,
      setSelectedData,
      updateSelection,
      resetToDefaults,
      applyPreset,
      activePreset: current.activePreset,
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
      syncEditingToAll,
      allConsumersInSync,
      getProfile,
      setNotesFor,
      setEditedContextFor,
    }),
    [
      editingConsumer, current, setSelectedData, updateSelection, resetToDefaults, applyPreset,
      setFilters, setSupplementaryNotes, setEditedClinicalContext, setDocumentMode, setDocumentIds,
      syncEditingToAll, allConsumersInSync, getProfile, setNotesFor, setEditedContextFor,
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
