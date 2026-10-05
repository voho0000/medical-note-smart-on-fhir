/** Explicit restoration only; merely viewing history never mutates answers. */
import { z } from 'zod'
import { restoreClinicVitals, toClinicVitals } from './clinic-vitals.store'
import { restoreHfpefInputs, toHfpefInputs } from './hfpef-inputs.store'
import { restorePhenotypeAnswer, parseStoredAnswer } from './phenotype-answer.store'
import { restoreEvidenceOverrides, toOverrides } from './evidence-overrides.store'
import { restoreAfAnswers, toAfAnswers } from './af-answers.store'
import { toVisitAnswerRecord, visitAnswersOf, restoreVisitAnswers } from './visit-answers.store'
import { restorePhysicianDecisions, toDecisions } from './physician-decisions.store'
import { usePreventStore } from './prevent-inputs.store'
import { useNhiLipidReviewStore, type NhiLipidAnswer, type NhiLipidAiRunMetadata } from './nhi-lipid-review.store'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import { buildPatientTextLiterals, scrubFreeText } from '@/src/shared/utils/pii-text-scrub'
import type { CdssHistoryRecord } from '../telemetry/cdss-history'
import { storedTimestampForDisplay } from '@/src/shared/contracts/cdss-stored-save-v2'

const lipidProvenanceSchema = z.object({ source: z.enum(['manual', 'ai']),
  recordState: z.enum(['yes', 'no', 'unknown']).optional(), manualAction: z.enum(['selected', 'modified', 'reviewed']).optional(),
  overrides: z.enum(['record', 'ai']).optional(), confidence: z.enum(['high', 'medium', 'low']).optional(),
  reviewedAt: z.string().optional(), modelId: z.string().optional(), modelName: z.string().optional(),
  generatedAt: z.string().optional(), runId: z.string().optional(), inputSignature: z.string().optional(),
  sourceScopeSignature: z.string().optional(), promptVersion: z.string().optional(),
})
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
/** Ignore bookkeeping times and empty maps; clinical measurement dates still matter. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const entries = Object.entries(object(value)).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, item]) => {
      if (['modifiedAt', 'updatedAt'].includes(key)) return []
      const normalized = canonical(item)
      return normalized === undefined ? [] : [[key, normalized]]
    })
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return value === null || value === undefined ? undefined : value
}
export function assessmentFingerprint(inputs: Record<string, unknown>, decisions: Record<string, unknown>, patient?: PatientEntity): string {
  // visitAnswerRecord preserves dates for restoration, while visitAnswers is today's actual reading.
  const { visitAnswerRecord: _record, ...answers } = inputs
  const literals = patient ? buildPatientTextLiterals(patient) : []
  const content = patient ? JSON.parse(JSON.stringify({ answers, decisions }, (_key, value) =>
    typeof value === 'string' ? scrubFreeText(value, literals) : value)) : { answers, decisions }
  return JSON.stringify(canonical(content)) ?? '{}'
}
function savedVisitRecord(record: CdssHistoryRecord): unknown {
  const inputs = object(record.save.physician_inputs)
  return inputs.visitAnswerRecord ?? Object.fromEntries(Object.entries(object(inputs.visitAnswers)).map(([key, value]) =>
    [key, { value, answeredAt: storedTimestampForDisplay(record.savedAt), packId: record.packId }]))
}
function savedFields(record: CdssHistoryRecord) {
  const inputs = object(record.save.physician_inputs)
  const preventInputs = Object.fromEntries(Object.entries(object(inputs.preventInputs)).filter(([, value]) => typeof value === 'string')) as Record<string, string>
  const nhiLipidReview = Object.fromEntries(Object.entries(object(inputs.nhiLipidReview)).filter(([, value]) => value === 'yes' || value === 'no' || value === 'unknown')) as Record<string, NhiLipidAnswer>
  const nhiLipidReviewProvenance = Object.fromEntries(Object.entries(object(inputs.nhiLipidReviewProvenance)).flatMap(([key, value]) => {
    const parsed = lipidProvenanceSchema.safeParse(value)
    return key in nhiLipidReview && parsed.success ? [[key, parsed.data]] : []
  }))
  const ai = Object.values(nhiLipidReviewProvenance).find(value => value.source === 'ai')
  const lastCompleted: NhiLipidAiRunMetadata | undefined = ai ? {
    runId: ai.runId ?? 'historical', inputSignature: ai.inputSignature ?? 'unverified-historical-source',
    sourceScopeSignature: ai.sourceScopeSignature ?? 'unverified-historical-source', promptVersion: ai.promptVersion ?? 'historical',
    startedAt: ai.generatedAt ?? storedTimestampForDisplay(record.savedAt), completedAt: ai.generatedAt ?? storedTimestampForDisplay(record.savedAt),
    modelId: ai.modelId, modelName: ai.modelName,
  } : undefined
  const visitAnswerRecord = toVisitAnswerRecord(savedVisitRecord(record))
  return { inputs: {
    clinicVitals: toClinicVitals(inputs.clinicVitals), hfpefInputs: toHfpefInputs(inputs.hfpefInputs),
    phenotypeAnswer: parseStoredAnswer(inputs.phenotypeAnswer), evidenceOverrides: toOverrides(inputs.evidenceOverrides),
    afAnswers: toAfAnswers(inputs.afAnswers), preventInputs, nhiLipidReview, nhiLipidReviewProvenance,
    visitAnswerRecord, visitAnswers: visitAnswersOf(visitAnswerRecord),
  }, decisions: toDecisions(record.save.physician_decisions), lastCompleted }
}
export function savedAssessmentFingerprint(record: CdssHistoryRecord, patient?: PatientEntity): string {
  const fields = savedFields(record)
  return assessmentFingerprint(fields.inputs, fields.decisions, patient)
}
export function restoreSavedAssessment(patientId: string, record: CdssHistoryRecord): void {
  const { inputs, decisions, lastCompleted } = savedFields(record)
  restoreClinicVitals(patientId, inputs.clinicVitals)
  restoreHfpefInputs(patientId, inputs.hfpefInputs)
  restorePhenotypeAnswer(patientId, inputs.phenotypeAnswer)
  restoreEvidenceOverrides(patientId, inputs.evidenceOverrides)
  restoreAfAnswers(patientId, inputs.afAnswers)
  // Legacy snapshots contain flattened visit answers; attribute those to the SAVED day.
  restoreVisitAnswers(patientId, inputs.visitAnswerRecord)
  restorePhysicianDecisions(patientId, decisions)
  usePreventStore.setState({ patientId, inputs: inputs.preventInputs })
  useNhiLipidReviewStore.getState().activate(patientId)
  useNhiLipidReviewStore.getState().clear(patientId)
  useNhiLipidReviewStore.setState({ patientId, answers: inputs.nhiLipidReview, provenance: inputs.nhiLipidReviewProvenance,
    aiReview: { ...useNhiLipidReviewStore.getState().aiReview, lastCompleted },
  })
}
