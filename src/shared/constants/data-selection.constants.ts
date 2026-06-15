// Data Selection Constants
// Default selection / filters + clinical scenario presets for the right-side
// Data Selection panel.

import type { DataSelection, DataFilters } from '@/src/core/entities/clinical-context.entity'

// ── 通用 (general) — the everyday default profile ───────────────────────────
// A broad-but-bounded snapshot for routine use: the full problem/med/allergy
// picture + recent labs/imaging, time-bounded so the AI context stays complete
// without drowning in noise. This is the seed for new profiles and the catch-all
// preset (shown whenever a profile isn't an exact 初診/追蹤 match).
export const DEFAULT_DATA_SELECTION: DataSelection = {
  // Patient group
  patientInfo: true,
  vitalSigns: true,
  problemList: true,
  advanceDirectives: true, // safety-critical (DNR / AD)
  medicalDevices: true,    // implants matter; sparse, so no noise when empty
  carePlans: true,         // active plans only (filter below)

  // Visit group
  encounters: true,

  // Reports group
  labReports: true,
  imagingReports: true,
  procedures: true,
  observations: false,     // Orphan catch-all — low signal, off to cut noise

  // Medication group
  medications: true,
  allergies: true,
  immunizations: true,

  // Documents group
  documents: true,         // On by default; documentMode 'latestAdmission' keeps
                           // it to just the most recent 出院病摘 (bounded).
}

export const DEFAULT_DATA_FILTERS: DataFilters = {
  problemListStatus: 'active',
  // Visits default to the last 6 months (初診 snapshot). The hook still falls
  // back to older visits when none fall inside the range, so stable/elderly
  // patients aren't left with an empty visit history.
  encounterTimeRange: '6m',
  medicationStatus: 'active',
  medicationChronic: 'all',
  // Med refill cycles span many months; keep all so chronic context is preserved.
  // The hook dedups by drug name so this no longer bloats output.
  medicationTimeRange: 'all',
  // Labs default to the FULL trend ('all') so the AI sees trajectories
  // (Cr 1.2 → 1.5 → 2.0 = worsening), bounded by the 6-month window.
  labReportVersion: 'all',
  labReportTimeRange: '6m',
  imagingReportVersion: 'latest',
  imagingReportTimeRange: '1y',
  // Vitals / procedures / immunizations: `latest`-version filter already dedups
  // by name, so volume isn't a concern. Keep `all` so historical data for
  // elderly / stable patients still surfaces.
  vitalSignsVersion: 'latest',
  vitalSignsTimeRange: 'all',
  procedureVersion: 'latest',
  procedureTimeRange: 'all',
  // Orphan observations: dedup to latest-per-analyte by default, all time.
  observationVersion: 'latest',
  observationTimeRange: 'all',
  immunizationTimeRange: 'all',
  carePlanStatus: 'active',
}

// ── 追蹤 (follow-up) — focused profile ──────────────────────────────────────
// For an established patient: what changed in the last 3 months. Active
// problems + active meds + recent labs/vitals/imaging/procedures/visits;
// stable history (vaccines, devices, care plans) trimmed away.
const FOLLOW_UP_SELECTION: DataSelection = {
  patientInfo: true,
  vitalSigns: true,
  problemList: true,
  advanceDirectives: false,
  medicalDevices: false,
  carePlans: false,
  encounters: true,
  labReports: true,
  imagingReports: true,
  procedures: true,
  observations: false,
  medications: true,
  allergies: true,
  immunizations: false,
  documents: false,
}

const FOLLOW_UP_FILTERS: DataFilters = {
  ...DEFAULT_DATA_FILTERS,
  labReportTimeRange: '3m',
  vitalSignsTimeRange: '3m',
  encounterTimeRange: '3m',
  imagingReportTimeRange: '3m',
  procedureTimeRange: '3m',
}

// ── 初診 (new patient) — comprehensive first-visit profile ───────────────────
// Everything in 通用 PLUS the full free-text documents (discharge summaries) and
// the orphan/other observations — i.e. dig into the complete record when meeting
// a patient for the first time. Time ranges inherit 通用's bounds.
const NEW_PATIENT_SELECTION: DataSelection = {
  ...DEFAULT_DATA_SELECTION,
  observations: true, // pull in 其他觀察 (orphan labs/measurements)
  // documents是 sticky 設定（不受 preset 控制），所以不在這裡開關。
}

const NEW_PATIENT_FILTERS: DataFilters = {
  ...DEFAULT_DATA_FILTERS,
}

export type PresetId = 'general' | 'newPatient' | 'followUp'

export interface DataSelectionPreset {
  id: PresetId
  labelKey: string
  selection: DataSelection
  filters: DataFilters
}

export const DATA_SELECTION_PRESETS: Record<PresetId, DataSelectionPreset> = {
  general: {
    id: 'general',
    labelKey: 'dataSelection.presetGeneral',
    selection: DEFAULT_DATA_SELECTION,
    filters: DEFAULT_DATA_FILTERS,
  },
  newPatient: {
    id: 'newPatient',
    labelKey: 'dataSelection.presetNewPatient',
    selection: NEW_PATIENT_SELECTION,
    filters: NEW_PATIENT_FILTERS,
  },
  followUp: {
    id: 'followUp',
    labelKey: 'dataSelection.presetFollowUp',
    selection: FOLLOW_UP_SELECTION,
    filters: FOLLOW_UP_FILTERS,
  },
}

// Per-preset memory: each scenario (通用/初診/追蹤) remembers the user's tweaks
// like a tab. `activePreset` is which one you're on; `presetMemory` holds the
// remembered selection/filters for presets you've left.
export interface PresetMemory {
  selection: DataSelection
  filters: DataFilters
}
export interface PresetSwitchState {
  selection: DataSelection
  filters: DataFilters
  activePreset: PresetId
  presetMemory: Partial<Record<PresetId, PresetMemory>>
}

/**
 * Switch to `target`: snapshot the current active preset's state into memory,
 * then restore `target`'s remembered state — or its factory default if you've
 * never customized it. Switching to the SAME preset is a no-op restore (so a
 * stray click never wipes your tweaks).
 */
export function switchPreset(state: PresetSwitchState, target: PresetId): PresetSwitchState {
  const presetMemory = {
    ...state.presetMemory,
    [state.activePreset]: { selection: state.selection, filters: state.filters },
  }
  const remembered = presetMemory[target]
  const restored: PresetMemory = remembered ?? {
    selection: { ...DATA_SELECTION_PRESETS[target].selection },
    filters: { ...DATA_SELECTION_PRESETS[target].filters },
  }
  return {
    activePreset: target,
    selection: { ...restored.selection },
    filters: { ...restored.filters },
    presetMemory,
  }
}

// Which scenario a selection+filters reflect. 初診/追蹤 require an EXACT match
// (compared only over each preset's own keys, so vestigial keys in older stored
// profiles don't break it); 通用 (general) is the catch-all, returned for the
// baseline AND any hand-tuned state — so exactly one preset is always active.
export function resolveActivePreset(selection: DataSelection, filters: DataFilters): PresetId {
  const sel = selection as unknown as Record<string, unknown>
  const fil = filters as unknown as Record<string, unknown>
  const matches = (id: 'newPatient' | 'followUp'): boolean => {
    const preset = DATA_SELECTION_PRESETS[id]
    const pSel = preset.selection as unknown as Record<string, unknown>
    const pFil = preset.filters as unknown as Record<string, unknown>
    return (
      // `documents` is a sticky setting (orthogonal to presets), so it doesn't
      // affect which scenario is active.
      Object.keys(pSel).filter((k) => k !== 'documents').every((k) => sel[k] === pSel[k]) &&
      Object.keys(pFil).every((k) => fil[k] === pFil[k])
    )
  }
  if (matches('followUp')) return 'followUp'
  if (matches('newPatient')) return 'newPatient'
  return 'general'
}

export const STORAGE_KEYS = {
  DATA_SELECTION: 'clinicalDataSelection',
  DATA_FILTERS: 'clinicalDataFilters',
  DATA_PROFILES: 'clinicalDataProfiles',
  MODEL_SELECTION: 'clinical-note:model',
  API_KEY: 'clinical-note:openai-key',
  GEMINI_KEY: 'clinical-note:gemini-key',
  PERPLEXITY_KEY: 'clinical-note:perplexity-key',
  PROMPT_TEMPLATES: 'medical-chat-prompt-templates',
  CLINICAL_INSIGHTS_PANELS: 'clinical-insights-panels',
  CLINICAL_INSIGHTS_AUTO_GENERATE: 'clinical-insights-auto-generate'
} as const
