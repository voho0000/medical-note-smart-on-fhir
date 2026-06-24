// Data Selection Constants
// Default selection / filters + clinical scenario presets for the right-side
// Data Selection panel.

import type { DataSelection, DataFilters } from '@/src/core/entities/clinical-context.entity'

// ── 初診 (new patient) — the default profile ────────────────────────────────
// A broad-but-bounded first-look snapshot: the full problem/med/allergy picture
// + recent lab trends/imaging, time-bounded so the AI context stays complete
// without drowning in noise. This is the seed for new profiles and for the
// user's Custom template slot.
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
  observations: false,     // Legacy hidden field; standalone results fold into labReports

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
  // Problem list defaults to all time (a problem list is the standing set of
  // active problems, not a recent-events window); the range is offered so it can
  // be narrowed when desired.
  problemListTimeRange: 'all',
  // Visits default to the last 6 months (初診 snapshot). The hook still falls
  // back to older visits when none fall inside the range, so stable/elderly
  // patients aren't left with an empty visit history.
  encounterTimeRange: '6m',
  medicationStatus: 'active',
  medicationChronic: 'all',
  // Meds default to the last 6 months; the hook dedups by drug name so chronic
  // refills still collapse to one current row.
  medicationTimeRange: '6m',
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
  // Procedures: no latest/all dedup filter (removed from the UI) — show every
  // procedure within the time range.
  procedureVersion: 'all',
  procedureTimeRange: 'all',
  // Legacy hidden observation filters retained for saved-profile compatibility.
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
const NEW_PATIENT_SELECTION: DataSelection = {
  ...DEFAULT_DATA_SELECTION,
  // documents是 sticky 設定（不受 preset 控制），所以不在這裡開關。
}

const NEW_PATIENT_FILTERS: DataFilters = {
  ...DEFAULT_DATA_FILTERS,
}

export type BuiltInPresetId = 'newPatient' | 'followUp'
export type PresetId = BuiltInPresetId | 'custom'

export interface DataSelectionPreset {
  id: BuiltInPresetId
  labelKey: string
  selection: DataSelection
  filters: DataFilters
}

export interface DataSelectionTemplate {
  selection: DataSelection
  filters: DataFilters
}

export const DATA_SELECTION_PRESETS: Record<BuiltInPresetId, DataSelectionPreset> = {
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

export const CUSTOM_TEMPLATE_DEFAULT: DataSelectionTemplate = {
  selection: NEW_PATIENT_SELECTION,
  filters: NEW_PATIENT_FILTERS,
}

// Fallback only, used when migrating old storage that predates the explicit
// active-template state. Runtime activePreset is stored in the provider.
export function resolveActivePreset(selection: DataSelection, filters: DataFilters): PresetId {
  const sel = selection as unknown as Record<string, unknown>
  const fil = filters as unknown as Record<string, unknown>
  const matches = (id: BuiltInPresetId): boolean => {
    const preset = DATA_SELECTION_PRESETS[id]
    const pSel = preset.selection as unknown as Record<string, unknown>
    const pFil = preset.filters as unknown as Record<string, unknown>
    return (
      // `documents` is sticky and `observations` is a hidden legacy key, so
      // neither should affect template migration/highlighting.
      Object.keys(pSel).filter((k) => k !== 'documents' && k !== 'observations').every((k) => sel[k] === pSel[k]) &&
      Object.keys(pFil).every((k) => fil[k] === pFil[k])
    )
  }
  if (matches('followUp')) return 'followUp'
  if (matches('newPatient')) return 'newPatient'
  return 'custom'
}

export const STORAGE_KEYS = {
  DATA_SELECTION: 'clinicalDataSelection',
  DATA_FILTERS: 'clinicalDataFilters',
  DATA_PROFILES: 'clinicalDataProfiles',
  DATA_ACTIVE_PRESET: 'clinicalDataActivePreset',
  DATA_CUSTOM_PRESET: 'clinicalDataCustomPreset',
  MODEL_SELECTION: 'clinical-note:model',
  API_KEY: 'clinical-note:openai-key',
  GEMINI_KEY: 'clinical-note:gemini-key',
  PERPLEXITY_KEY: 'clinical-note:perplexity-key',
  PROMPT_TEMPLATES: 'medical-chat-prompt-templates',
  CLINICAL_INSIGHTS_PANELS: 'clinical-insights-panels',
  CLINICAL_INSIGHTS_AUTO_GENERATE: 'clinical-insights-auto-generate'
} as const
