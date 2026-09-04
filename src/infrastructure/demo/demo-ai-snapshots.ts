// Pre-generated AI snapshots for the DEMO bundle (示範資料, demo-patient-1).
//
// Why: the demo bundle is frozen, so its AI output is effectively a constant —
// re-generating it for every first-time visitor burns two AI calls per visit
// (and the visitor's free-tier quota) to recompute a known answer, and exposes
// the first impression to transient model failures. These snapshots are REAL
// AI-authored raw outputs (same schema the live models produce), written
// against the catalog keys that buildSourceCatalog() derives from
// public/demo/demo-bundle.json.
//
// Provenance (refreshed 2026-09-04): generated with the app's original
// Gemini 3 Flash Preview model through the configured Firebase proxy, against
// the real default (newPatient) data selection after the demo bundle was
// extended through the 2026-09-03 export. Each localized snapshot was audited
// for citation relevance, evidence existence, trend faithfulness and medication
// pharmacology before being frozen here. Editorial corrections preserve the
// verified record direction and distinguish claims from confirmed diagnoses.
// Live patients still use the model-generated path.
// Only the safety results are post-processed by the same
// filterDuplicateFalsePositives guard the live path applies.
//
// They deliberately store the RAW pre-parse shape, NOT the finalized result:
// the hooks feed them through the exact same parse → finalize/verify pipeline
// as a live reply, so citation resolution, verification marking and navigation
// stay honest. If the demo bundle ever changes, stale citations surface as
// amber "unverified" pills — the visible signal to regenerate this file (run
// scripts/validate-demo-snapshots.ts, or just re-author).
//
// Scope guards (enforced by the hooks): demo patient + supported locale + no
// cached result. A retained model preference never causes an automatic live call;
// pressing 重新產生 explicitly still runs the selected model.
import type {
  MedicalSummaryAiResult,
  MedicalSummaryGeneration,
  SummarySourceCatalogEntry,
} from '@/src/core/entities/medical-summary.entity'
import type {
  SafetyScanGeneration,
  SafetyScanResultInput,
} from '@/src/core/entities/safety-alert.entity'
import snapshotDataJson from './demo-ai-snapshots.data.json'

export const DEMO_PATIENT_ID = 'demo-patient-1'

export const DEMO_MEDICAL_SUMMARY_GENERATION = {
  source: 'pre-generated',
  modelId: 'gemini-3-flash-preview',
  modelName: 'Gemini 3 Flash Preview',
} as const satisfies MedicalSummaryGeneration

export const DEMO_SAFETY_SCAN_GENERATION = {
  source: 'pre-generated',
  modelId: 'gemini-3-flash-preview',
  modelName: 'Gemini 3 Flash Preview',
} as const satisfies SafetyScanGeneration

export const DEMO_CLINICAL_INSIGHT_GENERATION = {
  source: 'pre-generated',
  modelId: 'gemini-3-flash-preview',
  modelName: 'Gemini 3 Flash Preview',
  provider: 'gemini',
} as const

type Audience = 'medical' | 'patient'
type SnapshotLocale = 'en' | 'zh-TW'
type LocalizedAudienceSnapshots<T> =
  Record<SnapshotLocale, Record<Audience, T>> &
  Record<Audience, T>

// Snapshot citations are authored against the default demo catalog, whose
// short keys are deterministic only while the selected AI scope is unchanged.
// A retained small-context model may legitimately prioritize the same FHIR
// resources and renumber those keys. Resource ids are the stable bridge that
// lets the bundled snapshot keep pointing at the same evidence in either view.
const DEMO_SNAPSHOT_RESOURCE_ID_BY_KEY: Readonly<Record<string, string>> = {
  D1: 'demo-documentreference-1',
  E1: 'demo-encounter-40',
  E2: 'demo-encounter-41',
  E3: 'demo-encounter-42',
  E4: 'demo-encounter-45',
  E5: 'demo-encounter-43',
  E6: 'demo-encounter-44',
  E7: 'demo-encounter-30',
  E8: 'demo-encounter-31',
  E9: 'demo-encounter-32',
  E10: 'demo-encounter-33',
  E11: 'demo-encounter-34',
  E12: 'demo-encounter-35',
  E13: 'demo-encounter-36',
  E14: 'demo-encounter-37',
  E15: 'demo-encounter-38',
  E16: 'demo-encounter-39',
  E17: 'demo-encounter-29',
  E18: 'demo-encounter-27',
  E19: 'demo-encounter-28',
  E20: 'demo-encounter-25',
  E21: 'demo-encounter-26',
  E22: 'demo-encounter-24',
  E23: 'demo-encounter-9',
  E24: 'demo-encounter-10',
  E25: 'demo-encounter-11',
  E26: 'demo-encounter-1',
  E27: 'demo-encounter-2',
  E28: 'demo-encounter-12',
  E29: 'demo-encounter-13',
  K1: 'demo-careplan-1',
  K2: 'demo-careplan-2',
  L15: 'demo-diagnosticreport-1',
  L26: 'demo-diagnosticreport-3',
  L27: 'demo-diagnosticreport-2',
  L28: 'demo-diagnosticreport-7',
  M1: 'demo-medicationrequest-131',
  M2: 'demo-medicationrequest-132',
  M3: 'demo-medicationrequest-133',
  M4: 'demo-medicationrequest-134',
  M5: 'demo-medicationrequest-135',
  M6: 'demo-medicationrequest-136',
  M7: 'demo-medicationrequest-137',
  M8: 'demo-medicationrequest-138',
  M9: 'demo-medicationrequest-139',
  M10: 'demo-medicationrequest-140',
  M11: 'demo-medicationrequest-107',
  M12: 'demo-medicationrequest-108',
  M13: 'demo-medicationrequest-109',
  O6: 'demo-observation-6',
  O7: 'demo-observation-7',
  O8: 'demo-observation-8',
  O9: 'demo-observation-9',
  O10: 'demo-observation-10',
  O14: 'demo-observation-14',
  O17: 'demo-observation-25',
  O18: 'demo-observation-26',
  O19: 'demo-observation-27',
  O20: 'demo-observation-28',
  O23: 'demo-observation-37',
}

/** Re-key only citation fields; narrative/evidence text remains untouched. */
export function remapDemoSnapshotSourceKeys<T>(
  snapshot: T,
  catalog: SummarySourceCatalogEntry[],
): T {
  const currentKeyByResourceId = new Map(
    catalog.map((source) => [source.resourceId, source.key]),
  )
  const remapKey = (key: string) => {
    const resourceId = DEMO_SNAPSHOT_RESOURCE_ID_BY_KEY[key]
    return resourceId ? currentKeyByResourceId.get(resourceId) ?? key : key
  }
  const visit = (value: unknown, field?: string): unknown => {
    if (Array.isArray(value)) {
      return field === 'sources'
        ? value.map((item) => typeof item === 'string' ? remapKey(item) : item)
        : value.map((item) => visit(item))
    }
    if (!value || typeof value !== 'object') {
      return (field === 'ref' || field === 'source') && typeof value === 'string'
        ? remapKey(value)
        : value
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, visit(item, key)]),
    )
  }
  return visit(snapshot) as T
}

interface DemoSnapshotData {
  medicalSummary: Record<SnapshotLocale, Record<Audience, MedicalSummaryAiResult>>
  clinicalInsights: Record<SnapshotLocale, Record<Audience, Record<string, { prompt: string; text: string }>>>
  safetyScan: Record<SnapshotLocale, Record<Audience, SafetyScanResultInput>>
}

const snapshotData = snapshotDataJson as unknown as DemoSnapshotData

const demoMedicalSummarySnapshotsZhTw = snapshotData.medicalSummary['zh-TW']
const demoMedicalSummarySnapshotsEn = snapshotData.medicalSummary.en

export const demoMedicalSummarySnapshots: LocalizedAudienceSnapshots<MedicalSummaryAiResult> = {
  'zh-TW': demoMedicalSummarySnapshotsZhTw,
  en: demoMedicalSummarySnapshotsEn,
  medical: demoMedicalSummarySnapshotsZhTw.medical,
  patient: demoMedicalSummarySnapshotsZhTw.patient,
}

const demoClinicalInsightSnapshotsZhTw = snapshotData.clinicalInsights['zh-TW']
const demoClinicalInsightSnapshotsEn = snapshotData.clinicalInsights.en

export const demoClinicalInsightSnapshots: LocalizedAudienceSnapshots<Record<string, { prompt: string; text: string }>> = {
  'zh-TW': demoClinicalInsightSnapshotsZhTw,
  en: demoClinicalInsightSnapshotsEn,
  medical: demoClinicalInsightSnapshotsZhTw.medical,
  patient: demoClinicalInsightSnapshotsZhTw.patient,
}

export function getDemoClinicalInsightSnapshot(
  patientId: string,
  audience: Audience,
  locale: SnapshotLocale,
  panelId: string,
) {
  return patientId === DEMO_PATIENT_ID
    ? demoClinicalInsightSnapshots[locale][audience][panelId]
    : undefined
}

const demoSafetyScanSnapshotsZhTw = snapshotData.safetyScan['zh-TW']
const demoSafetyScanSnapshotsEn = snapshotData.safetyScan.en

export const demoSafetyScanSnapshots: LocalizedAudienceSnapshots<SafetyScanResultInput> = {
  'zh-TW': demoSafetyScanSnapshotsZhTw,
  en: demoSafetyScanSnapshotsEn,
  medical: demoSafetyScanSnapshotsZhTw.medical,
  patient: demoSafetyScanSnapshotsZhTw.patient,
}
