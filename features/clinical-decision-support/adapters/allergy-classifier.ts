import type { AllergyEntity } from '@/src/core/entities/clinical-data.entity'
import type {
  CdssFactSource,
  CdssMedicationAllergyState,
  CdssMedicationClassId,
} from '../types'
import { medicationClassesFromEvidence } from './medication-classifier'

const EXCLUDED_CLINICAL_STATUS = new Set(['inactive', 'resolved', 'entered-in-error'])
const EXCLUDED_VERIFICATION_STATUS = new Set(['refuted', 'entered-in-error'])

export interface MedicationClassAllergyAssessment {
  state: CdssMedicationAllergyState
  allergyNames: readonly string[]
  sources: readonly CdssFactSource[]
}

function dateOnly(value?: string): string | undefined {
  if (!value || Number.isNaN(Date.parse(value))) return undefined
  return value.slice(0, 10)
}

function allergyDisplayName(allergy: AllergyEntity): string {
  return allergy.code?.text
    ?? allergy.code?.coding?.find((coding) => coding.display)?.display
    ?? allergy.reaction?.find((reaction) => reaction.substance?.text)?.substance?.text
    ?? '未命名過敏／不耐受'
}

function allergySource(allergy: AllergyEntity): CdssFactSource {
  return {
    resourceType: 'AllergyIntolerance',
    resourceId: allergy.id,
    date: dateOnly(allergy.recordedDate ?? allergy.onsetDateTime),
    status: allergy.clinicalStatus,
    coding: [
      ...(allergy.code?.coding ?? []),
      ...(allergy.reaction ?? []).flatMap((reaction) => reaction.substance?.coding ?? []),
    ],
    facility: allergy.encounter?.display ?? allergy.recorder?.display,
    sourceSystem: allergy.sourceSystem,
  }
}

function governedAllergies(allergies: readonly AllergyEntity[]): AllergyEntity[] {
  return allergies.filter((allergy) => (
    Boolean(allergy.id)
    && !EXCLUDED_CLINICAL_STATUS.has((allergy.clinicalStatus ?? '').toLowerCase())
    && !EXCLUDED_VERIFICATION_STATUS.has((allergy.verificationStatus ?? '').toLowerCase())
  ))
}

export function assessMedicationClassAllergies(
  allergies: readonly AllergyEntity[],
): Readonly<Record<CdssMedicationClassId, MedicationClassAllergyAssessment>> {
  const matches = new Map<CdssMedicationClassId, AllergyEntity[]>()

  for (const allergy of governedAllergies(allergies)) {
    const codings = [
      ...(allergy.code?.coding ?? []),
      ...(allergy.reaction ?? []).flatMap((reaction) => reaction.substance?.coding ?? []),
    ]
    const texts = [
      allergy.code?.text,
      ...(allergy.code?.coding ?? []).map((coding) => coding.display),
      ...(allergy.reaction ?? []).flatMap((reaction) => [
        reaction.substance?.text,
        ...(reaction.substance?.coding ?? []).map((coding) => coding.display),
      ]),
    ]
    for (const classId of medicationClassesFromEvidence({ texts, codings })) {
      matches.set(classId, [...(matches.get(classId) ?? []), allergy])
    }
  }

  const assessmentFor = (
    classId: CdssMedicationClassId,
  ): MedicationClassAllergyAssessment => {
    const matched = matches.get(classId) ?? []
    return {
      state: matched.length > 0 ? 'documented' : 'not-found',
      allergyNames: [...new Set(matched.map(allergyDisplayName))],
      sources: matched.map(allergySource),
    }
  }
  return {
    insulin: assessmentFor('insulin'),
    sulfonylurea: assessmentFor('sulfonylurea'),
    'sglt2-inhibitor': assessmentFor('sglt2-inhibitor'),
    arni: assessmentFor('arni'),
    'hf-evidence-based-beta-blocker': assessmentFor('hf-evidence-based-beta-blocker'),
    'loop-diuretic': assessmentFor('loop-diuretic'),
    statin: assessmentFor('statin'),
    ezetimibe: assessmentFor('ezetimibe'),
    'pcsk9-inhibitor': assessmentFor('pcsk9-inhibitor'),
    'bempedoic-acid': assessmentFor('bempedoic-acid'),
    fibrate: assessmentFor('fibrate'),
    'prescription-omega-3': assessmentFor('prescription-omega-3'),
    'ace-inhibitor-or-arb': assessmentFor('ace-inhibitor-or-arb'),
    'calcium-channel-blocker': assessmentFor('calcium-channel-blocker'),
    'thiazide-or-thiazide-like-diuretic': assessmentFor('thiazide-or-thiazide-like-diuretic'),
    'beta-blocker': assessmentFor('beta-blocker'),
    'nonselective-beta-blocker': assessmentFor('nonselective-beta-blocker'),
    'mineralocorticoid-receptor-antagonist': assessmentFor('mineralocorticoid-receptor-antagonist'),
    lactulose: assessmentFor('lactulose'),
    rifaximin: assessmentFor('rifaximin'),
    finerenone: assessmentFor('finerenone'),
    'calcium-based-phosphate-binder': assessmentFor('calcium-based-phosphate-binder'),
    'non-calcium-phosphate-binder': assessmentFor('non-calcium-phosphate-binder'),
    // Hypersensitivity matters most for intravenous iron, which the guideline
    // says to give only where an acute reaction can be managed.
    'iron-therapy': assessmentFor('iron-therapy'),
    'erythropoiesis-stimulating-agent': assessmentFor('erythropoiesis-stimulating-agent'),
    'hif-phi': assessmentFor('hif-phi'),
  }
}
