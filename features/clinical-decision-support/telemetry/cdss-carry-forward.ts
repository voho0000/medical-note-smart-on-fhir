import { z } from 'zod'
import { AF_CLINICAL_QUESTIONS } from '@voho0000/personalized-care'
import type { CdssPatientProfile } from '../types'
import type { CdssHistoryRecord } from './cdss-history'
import { storedTimestampV2 } from '@/src/shared/contracts/cdss-stored-save-v2'
import { CLINIC_VITALS_ENTRY_KEYS, todayIsoDate, useClinicVitalsStore } from '../stores/clinic-vitals.store'
import { useHfpefInputsStore } from '../stores/hfpef-inputs.store'
import { usePhenotypeAnswerStore } from '../stores/phenotype-answer.store'
import { usePhysicianDecisionsStore } from '../stores/physician-decisions.store'
import { useAfAnswersStore } from '../stores/af-answers.store'
import { useNhiLipidReviewStore } from '../stores/nhi-lipid-review.store'

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {}
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value)
const measurement = z.object({ value: z.number().finite().nonnegative(), measuredOn: day, modifiedAt: storedTimestampV2 })
const echo = z.object({ value: z.string().max(120).refine(value => value.trim() !== '' && Number.isFinite(Number(value))), measuredOn: day, modifiedAt: storedTimestampV2 })
// Only echo measurements, never the calculator's current age, medicines or labs.
const echoFacts: Record<string, string> = { averageEe: 'echoEOverEPrime', ee: 'echoEOverEPrime',
  septalE: 'echoSeptalEPrime', lateralE: 'echoLateralEPrime', trv: 'echoTrVmax', pasp: 'echoRvsp',
  gls: 'echoGls', lavi: 'echoLavi', lvmi: 'echoLvmi', rwt: 'echoRwt', wall: 'echoLvWallThickness' }
const clinicFacts: Record<string, string> = { systolic: 'bloodPressure', diastolic: 'bloodPressure',
  bodyHeight: 'bodyMassIndex', bodyWeight: 'bodyWeight', heartRate: 'heartRate', oxygenSaturation: 'oxygenSaturation' }
const phenotype = z.object({ answeredOn: day,
  hfSuspicion: z.enum(['suspected', 'not-suspected']).optional(), diagnosis: z.enum(['hfrEF', 'hfpEF']).optional(),
  choice: z.enum(['reduced', 'preserved', 'unknown']).optional(), lvef: z.number().min(0).max(100).optional(), measuredOn: day.optional(),
  hfpEfConfirmed: z.union([z.boolean(), z.literal('not-assessed')]).optional(),
  diagnosisConfirmation: z.object({ method: z.enum(['current', 'existing']), confirmedAt: storedTimestampV2, basis: z.string().max(10000) }).optional(),
  modifiedAt: z.object({ hfSuspicion: storedTimestampV2.optional(), phenotype: storedTimestampV2.optional(), hfpEfConfirmed: storedTimestampV2.optional() }).optional(),
})

export type CarryForwardChoices = { inputs: boolean; decisions: boolean }

function filledFields(patientId: string): number {
  const af = useAfAnswersStore.getState(), lipid = useNhiLipidReviewStore.getState()
  return Object.keys(useClinicVitalsStore.getState().byPatientId[patientId]?.entries ?? {}).length
    + Object.keys(useHfpefInputsStore.getState().byPatientId[patientId]?.entries ?? {}).length
    + (usePhenotypeAnswerStore.getState().byPatientId[patientId] ? 1 : 0)
    + Object.keys(af.patientId === patientId ? af.answers : {}).length
    + Object.keys(lipid.patientId === patientId ? lipid.answers : {}).length
    + Object.keys(usePhysicianDecisionsStore.getState().byPatientId[patientId] ?? {}).length
}

/** Explicitly confirmed, fill-only carry-forward. Historical results never enter the live evaluation. */
export function carryForwardCdss(patientId: string, record: CdssHistoryRecord, packId: string, packVersion: string,
  currentRecordProfile: CdssPatientProfile, choices: CarryForwardChoices): number {
  if (!patientId || record.save.pack_id !== packId || record.save.result.packVersion !== packVersion)
    throw new Error('cdss_carry_forward_incompatible')
  const before = filledFields(patientId)
  const today = todayIsoDate()
  // Validate every touched store before the first write, including pending hydration.
  if ((choices.decisions && !usePhysicianDecisionsStore.getState().canCarryForward(patientId))
    || (choices.inputs && (!useClinicVitalsStore.getState().canCarryForward(patientId)
      || !useHfpefInputsStore.getState().canCarryForward(patientId)
      || !usePhenotypeAnswerStore.getState().canCarryForward(patientId)
      || useAfAnswersStore.getState().hydratedPatientId !== patientId
      || useNhiLipidReviewStore.getState().patientId !== patientId))) throw new Error('cdss_carry_forward_unavailable')
  if (choices.inputs) {
    const inputs = record.save.physician_inputs
    const facts = currentRecordProfile.facts
    const oldVitals = object(object(inputs.clinicVitals).entries)
    const currentVitals = useClinicVitalsStore.getState().byPatientId[patientId]?.entries ?? {}
    const oldSystolic = measurement.safeParse(oldVitals.systolic), oldDiastolic = measurement.safeParse(oldVitals.diastolic)
    const bpPair = !currentVitals.systolic && !currentVitals.diastolic && oldSystolic.success && oldDiastolic.success
      && oldSystolic.data.measuredOn === oldDiastolic.data.measuredOn
    const entries = Object.fromEntries(CLINIC_VITALS_ENTRY_KEYS.flatMap(key => {
      // Lab numbers and old examinations require a new entry at this visit.
      const fact = clinicFacts[key]
      const parsed = measurement.safeParse(oldVitals[key])
      return fact && !facts[fact] && parsed.success && parsed.data.measuredOn <= today
        && (!['systolic', 'diastolic'].includes(key) || bpPair)
        ? [[key, parsed.data]] : []
    }))
    useClinicVitalsStore.getState().carryForward(patientId, { entries })
    const oldEcho = object(object(inputs.hfpefInputs).entries)
    // A current echo study is kept whole; do not fill its missing parameters from an older study.
    const recordHasEcho = Boolean(facts.LVEF) || Object.values(echoFacts).some(fact => Boolean(facts[fact]))
    const latestEchoDay = Object.keys(echoFacts).flatMap(key => {
      const parsed = echo.safeParse(oldEcho[key])
      return parsed.success && parsed.data.measuredOn <= today ? [parsed.data.measuredOn] : []
    }).sort().at(-1)
    const echoEntries = Object.fromEntries(Object.entries(echoFacts).flatMap(([key, fact]) => {
      const parsed = echo.safeParse(oldEcho[key])
      return !recordHasEcho && !facts[fact] && parsed.success && parsed.data.measuredOn === latestEchoDay
        ? [[key, parsed.data]] : []
    }))
    useHfpefInputsStore.getState().carryForward(patientId, { entries: echoEntries })
    const parsedPhenotype = phenotype.safeParse(inputs.phenotypeAnswer)
    if (parsedPhenotype.success && parsedPhenotype.data.answeredOn <= today) {
      const answer = parsedPhenotype.data
      // An old entered EF must not replace this import's EF.
      if (recordHasEcho) { delete answer.lvef; delete answer.measuredOn; delete answer.choice;
        delete answer.diagnosis; delete answer.diagnosisConfirmation; delete answer.hfpEfConfirmed }
      if (answer.lvef !== undefined && (!answer.measuredOn || answer.measuredOn > today)) delete answer.lvef
      if (answer.hfSuspicion !== undefined || answer.diagnosis !== undefined || answer.choice !== undefined || answer.hfpEfConfirmed !== undefined)
        usePhenotypeAnswerStore.getState().carryForward(patientId, answer)
    }
    const af = useAfAnswersStore.getState()
    if (af.patientId === patientId && af.hydratedPatientId === patientId) {
      const old = object(inputs.afAnswers)
      // Adverse effects and follow-up symptoms are every-visit questions.
      for (const question of AF_CLINICAL_QUESTIONS.filter(question => question.group === 'diagnosis')) {
        if (typeof old[question.id] === 'boolean' && af.answers[question.id] === undefined)
          af.answer(patientId, question.id, old[question.id] as boolean)
      }
    }
    const lipid = useNhiLipidReviewStore.getState()
    if (lipid.patientId === patientId) {
      for (const [id, value] of Object.entries(object(inputs.nhiLipidReview))) {
        const provenance = object(object(inputs.nhiLipidReviewProvenance)[id])
        if (/^[a-z][a-z0-9-]{0,79}$/.test(id) && provenance.source === 'manual'
          && (value === 'yes' || value === 'no' || value === 'unknown') && lipid.answers[id] === undefined
          && storedTimestampV2.safeParse(provenance.reviewedAt).success)
          lipid.answer(patientId, id, value, { source: 'manual', reviewedAt: provenance.reviewedAt as string,
            ...(provenance.manualAction === 'selected' || provenance.manualAction === 'modified' || provenance.manualAction === 'reviewed'
              ? { manualAction: provenance.manualAction } : {}) })
      }
    }
  }
  if (choices.decisions) usePhysicianDecisionsStore.getState().carryForward(patientId, record.save.physician_decisions, packVersion)
  return filledFields(patientId) - before
}
