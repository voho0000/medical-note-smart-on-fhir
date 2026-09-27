/**
 * The eleven synthetic scenario bundles under `app/dev/cdss-scenarios/bundles`,
 * read the way the app reads them: the bundle through the app's own import
 * parser (`LocalBundleService.parse`), the entities through
 * `createFhirCdssPatientProfile`, the host's AF calculators (CrCl,
 * CHA₂DS₂-VA, HAS-BLED) applied as LiveFeature applies them, the every-visit
 * answers through the pack's `applyVisitAnswers`, and the model from the pack's
 * own `buildVisitDecisionModel` — the AF result built alongside as the
 * heart-failure page's companion when the AF pack applies.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  ATRIAL_FIBRILLATION_GUIDELINE_PACK,
  HEART_FAILURE_GUIDELINE_PACK,
  applyVisitAnswers,
  buildVisitDecisionModel,
} from '@voho0000/personalized-care'
import { createFhirCdssPatientProfile } from '@voho0000/personalized-care-fhir'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { applyAfCalculatorResults } from '@/features/clinical-decision-support/utils/af-calculators'
import type {
  CdssPatientProfile,
  CdssResult,
  VisitAnswers,
  VisitDecisionModel,
} from '@/features/clinical-decision-support/types'

/** The visit date every scenario was written against. */
export const SCENARIO_NOW = new Date('2026-09-27T09:00:00+08:00')

const BUNDLE_DIR = path.join(process.cwd(), 'app', 'dev', 'cdss-scenarios', 'bundles')

export type ScenarioId =
  | 'p1-suspected-hfpef' | 'p2-new-hfref' | 'p3-new-af' | 'p4-stable-optimised'
  | 'p5-titrating-af' | 'p6-hyperkalaemia' | 'p7-worsening-congestion' | 'p8-post-discharge'
  | 'p9-hfpef-af-dose' | 'p10-improved-ef' | 'p11-af-dabigatran-renal'

export interface ScenarioRun {
  profile: CdssPatientProfile
  result: CdssResult
  companion?: CdssResult
  model: VisitDecisionModel
}

/** The profile LiveFeature would hand the packs for this bundle, before the answers. */
export function scenarioProfile(id: ScenarioId): CdssPatientProfile {
  const bundle = JSON.parse(fs.readFileSync(path.join(BUNDLE_DIR, `${id}.json`), 'utf8'))
  const parsed = LocalBundleService.parse(bundle)
  if (!parsed) throw new Error(`${id}: the bundle did not parse`)
  const { patient, collection } = parsed
  const record = createFhirCdssPatientProfile({
    patient,
    conditions: collection.conditions,
    encounters: collection.encounters,
    observations: collection.observations,
    medications: collection.medications,
    allergies: collection.allergies,
    carePlans: collection.carePlans,
    procedures: collection.procedures,
    immunizations: collection.immunizations,
    diagnosticReports: collection.diagnosticReports,
    documentReferences: collection.documentReferences,
    now: SCENARIO_NOW,
  })
  return applyAfCalculatorResults(record)
}

/** The model the decision map draws for this scenario on the given page. */
export function scenarioRun(
  id: ScenarioId,
  { page = 'hf', answers = {} }: { page?: 'hf' | 'af'; answers?: VisitAnswers } = {},
): ScenarioRun {
  const profile = applyVisitAnswers(scenarioProfile(id), answers)
  if (page === 'af') {
    const result = ATRIAL_FIBRILLATION_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    return {
      profile,
      result,
      model: buildVisitDecisionModel({ packId: 'atrial-fibrillation-cdss', result, profile, locale: 'zh-TW' }),
    }
  }
  const result = HEART_FAILURE_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
  const companion = ATRIAL_FIBRILLATION_GUIDELINE_PACK.applies(profile)
    ? ATRIAL_FIBRILLATION_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    : undefined
  return {
    profile,
    result,
    ...(companion ? { companion } : {}),
    model: buildVisitDecisionModel({
      packId: 'heart-failure-cdss',
      result,
      profile,
      ...(companion ? { companion } : {}),
      locale: 'zh-TW',
    }),
  }
}
