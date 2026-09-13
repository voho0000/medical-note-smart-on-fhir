"use client"

import { clinicalModuleLabel } from '@voho0000/personalized-care'
import { Button } from '@/components/ui/button'
import type { PhysicianInputRequest } from '../physician-input-contract'
import { diagnosticSummaryOf } from '../physician-input-contract'
import { physicianInputRequestsOf } from '../physician-input-contract'
import type { CdssRecommendation } from '../types'
import {
  NOT_ASSESSED,
  todayIsoDate,
  type ClinicVitals,
  type ClinicVitalsEntryKey,
  type CompensationAnswerValue,
  type NyhaAnswerValue,
  type SignAnswerValue,
} from '../stores/clinic-vitals.store'
import { HFPEF_NOT_CONFIRMED, type PhenotypeAnswer } from '../stores/phenotype-answer.store'
import type { PhysicianDecision } from '../stores/physician-decisions.store'
import type { HeartFailureBoardModel } from '../renderers/heart-failure-board'
import {
  applyHeartFailureMedicationSafety,
  heartFailureMedicationSafetyAssessment,
} from '../renderers/heart-failure-medication-safety'
import { DiagnosisReading } from '../renderers/DiagnosisReading'
import { EchoReportButton } from '../renderers/EchoReportButton'
import { PhysicianInputRequestPanel } from '../renderers/PhysicianInputRequestPanel'
import type { HfpefReading, HfpefScoreId, HfpefScoreReading } from '../utils/hfpef-scores'
import { HFPEF_CALCULATOR_VERSION } from '../utils/hfpef-scores'
import {
  conciseMissingLabel,
  decisionLabel,
  formatDay,
  formatStamp,
  zonedParts,
} from './build-visit-flow'
import { SegmentedControl } from './controls/SegmentedControl'
import { ItemRows } from './controls/ItemRows'
import { focusVisitFlowTarget } from './VisitFlow'
import type {
  CarriedField,
  VisitActionGroupId,
  VisitActionRow,
  VisitDecisionKind,
  VisitDecisionReason,
  VisitFlowContext,
  VisitFlowDiseaseConfig,
  VisitFlowStepContext,
  VisitFlowMetric,
  VisitItem,
  VisitItemTag,
  VisitQuestion,
  VisitQuestionSpec,
  VisitStepState,
} from './types'

export const HEART_FAILURE_VISIT_FLOW_PACK_ID = 'heart-failure-cdss'

const PHENOTYPE_MODULE_ID = 'heart-failure-phenotype'
const HFPEF_DIAGNOSIS_MODULE_ID = 'heart-failure-hfpef-diagnosis'
const GDMT_MODULE_ID = 'heart-failure-hfref-gdmt'

/** The four foundational classes, in the order the guideline lists them. */
export const PILLAR_MODULE_IDS: readonly string[] = [
  'heart-failure-ras-inhibition',
  'heart-failure-beta-blocker',
  'heart-failure-mra',
  'heart-failure-sglt2',
]

/**
 * Which side of the heart a finding speaks for.
 *
 * A one-character tag, and nothing more: it tells a reader why 腳腫 and 端坐
 * 呼吸 are not the same question, and it never reaches the data model. Every
 * answer travels as its own term whatever the tag says.
 */
export type VisitSignSide = 'pulmonary' | 'systemic' | 'both'

export const VISIT_SIDE_LABELS: Readonly<Record<VisitSignSide, {
  tagZh: string
  tagEn: string
  legendZh: string
  legendEn: string
}>> = {
  pulmonary: {
    tagZh: '肺',
    tagEn: 'P',
    legendZh: '肺 = 左心衰竭／肺鬱血',
    legendEn: 'P = left-sided / pulmonary congestion',
  },
  systemic: {
    tagZh: '體',
    tagEn: 'S',
    legendZh: '體 = 右心衰竭／體循環鬱血',
    legendEn: 'S = right-sided / systemic congestion',
  },
  both: {
    tagZh: '兩',
    tagEn: 'B',
    legendZh: '兩 = 兩側皆可',
    legendEn: 'B = either side',
  },
}

const SIDE_TAG_CLASS: Readonly<Record<VisitSignSide, string>> = {
  pulmonary: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200',
  systemic: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
  both: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200',
}

const SIDE_TAGS: readonly VisitItemTag[] = (['pulmonary', 'systemic', 'both'] as const)
  .map((side) => ({ id: side, ...VISIT_SIDE_LABELS[side], className: SIDE_TAG_CLASS[side] }))

/** Question ②: what the patient describes. */
export const VISIT_SYMPTOM_ITEMS: readonly VisitItem[] = [
  { term: 'exertional-dyspnea', zh: '勞力性呼吸困難（exertional dyspnea）', en: 'Exertional dyspnoea', shortZh: '勞力性喘', shortEn: 'Exertional dyspnoea', side: 'pulmonary', common: true },
  { term: 'orthopnea', zh: '端坐呼吸（orthopnea）', en: 'Orthopnoea', shortZh: '端坐呼吸', shortEn: 'Orthopnoea', side: 'pulmonary', common: true },
  { term: 'paroxysmal-nocturnal-dyspnea', zh: '夜間陣發性呼吸困難（paroxysmal nocturnal dyspnea，PND）', en: 'Paroxysmal nocturnal dyspnoea (PND)', shortZh: 'PND', shortEn: 'PND', side: 'pulmonary', common: true },
  { term: 'fatigue-exercise-intolerance', zh: '疲倦／運動耐受下降（fatigue／exercise intolerance）', en: 'Fatigue / reduced exercise tolerance', shortZh: '疲倦', shortEn: 'Fatigue', side: 'pulmonary', common: true },
  { term: 'reported-ankle-swelling', zh: '腳腫（ankle swelling，自述）', en: 'Ankle swelling (reported)', shortZh: '腳腫', shortEn: 'Ankle swelling', side: 'systemic', common: true },
  { term: 'abdominal-bloating', zh: '腹脹／吃一點就飽（abdominal bloating／early satiety）', en: 'Abdominal bloating / early satiety', shortZh: '腹脹', shortEn: 'Bloating', side: 'systemic', common: true },
  { term: 'nocturnal-cough', zh: '夜咳／喘鳴（nocturnal cough／wheeze）', en: 'Nocturnal cough / wheeze', shortZh: '夜咳', shortEn: 'Nocturnal cough', side: 'pulmonary', common: false },
  { term: 'bendopnea', zh: '彎腰呼吸困難（bendopnea）', en: 'Bendopnea', shortZh: '彎腰喘', shortEn: 'Bendopnea', side: 'both', common: false },
  { term: 'reported-weight-gain', zh: '近期體重增加（recent weight gain，自述）', en: 'Recent weight gain (reported)', shortZh: '體重增加', shortEn: 'Weight gain', side: 'both', common: false },
]

/** Question ④: what the clinician finds. */
export const VISIT_EXAM_ITEMS: readonly VisitItem[] = [
  { term: 'rales', zh: '肺部濕囉音（rales）', en: 'Pulmonary rales', shortZh: 'Rales', shortEn: 'Rales', side: 'pulmonary', common: true },
  { term: 'jvp', zh: '頸靜脈怒張（JVP）', en: 'Raised JVP', shortZh: 'JVP', shortEn: 'JVP', side: 'systemic', common: true },
  { term: 'pitting-edema', zh: '凹陷性水腫（pitting edema）', en: 'Pitting edema', shortZh: 'Pitting edema', shortEn: 'Pitting edema', side: 'systemic', common: true },
  { term: 'third-heart-sound', zh: '第三心音（S3）', en: 'Third heart sound (S3)', shortZh: 'S3', shortEn: 'S3', side: 'pulmonary', common: false },
  { term: 'hepatojugular-reflux', zh: '肝頸反流（HJR）', en: 'Hepatojugular reflux', shortZh: 'HJR', shortEn: 'HJR', side: 'systemic', common: false },
  { term: 'ascites', zh: '腹水（ascites）', en: 'Ascites', shortZh: 'Ascites', shortEn: 'Ascites', side: 'systemic', common: false },
  { term: 'hepatomegaly', zh: '肝腫大（hepatomegaly）', en: 'Hepatomegaly', shortZh: 'Hepatomegaly', shortEn: 'Hepatomegaly', side: 'systemic', common: false },
]

/** Which of the two questions a term is asked in, for a link back to it. */
export function visitQuestionForSignTerm(term: string): 'symptoms' | 'signs' {
  return VISIT_SYMPTOM_ITEMS.some((item) => item.term === term) ? 'symptoms' : 'signs'
}

/* --------------------------------------------------------------- readings */

function requestOf(
  recommendation: CdssRecommendation | undefined,
  kind: PhysicianInputRequest['kind'],
): PhysicianInputRequest | undefined {
  if (!recommendation) return undefined
  return physicianInputRequestsOf(recommendation).find((request) => request.kind === kind)
}

function signText(value: SignAnswerValue | null, isEnglish: boolean): string {
  if (value === 'present') return isEnglish ? 'yes' : '有'
  if (value === 'absent') return isEnglish ? 'no' : '無'
  if (value === NOT_ASSESSED) return isEnglish ? 'not assessed' : '未評估'
  return isEnglish ? 'not answered' : '尚未回答'
}

/** Chart notation preserves the distinction between absent and unassessed. */
function chartSignsText(items: readonly VisitItem[], vitals: ClinicVitals | undefined): string {
  const assessed = items.flatMap(item => {
    const value = vitals?.signAnswers?.[item.term]?.value
    return value === 'present' || value === 'absent'
      ? [`  ${item.shortEn} (${value === 'present' ? '+' : '-'})`] : []
  })
  const unassessed = items.filter(item => !['present', 'absent'].includes(vitals?.signAnswers?.[item.term]?.value ?? ''))
  if (unassessed.length) assessed.push(`  Not assessed: ${unassessed.map(item => item.shortEn).join(', ')}`)
  return assessed.join('\n')
}

/** What one question's rows were answered, on one folded line. */
function signItemsText(
  items: readonly VisitItem[],
  vitals: ClinicVitals | undefined,
  isEnglish: boolean,
  useExamSymbols = false,
): string | undefined {
  const answered = items.flatMap((item) => {
    const value = vitals?.signAnswers?.[item.term]?.value
    if (!value) return []
    const answer = useExamSymbols && value === 'present'
      ? '+'
      : useExamSymbols && value === 'absent'
        ? '−'
        : signText(value, isEnglish)
    return [`${isEnglish ? item.shortEn : item.shortZh}${isEnglish ? ': ' : '：'}${answer}`]
  })
  const unanswered = items.filter((item) => !vitals?.signAnswers?.[item.term]?.value).length
  if (answered.length === 0) return undefined
  if (unanswered > 0) {
    answered.push(isEnglish ? `${unanswered} more not assessed` : `更多 ${unanswered} 項未評估`)
  }
  return answered.join(' · ')
}

/** A question is answered once every 常見 row in it has an answer. */
function signItemsAnswered(
  items: readonly VisitItem[],
  vitals: ClinicVitals | undefined,
): boolean {
  return items
    .filter((item) => item.common)
    .every((item) => Boolean(vitals?.signAnswers?.[item.term]?.value))
}

/**
 * 「肺鬱血 n · 體循環 n」: how many terms were seen on each side.
 *
 * Counted across the symptoms and the examination together, because a patient
 * whose only pulmonary finding is 勞力性呼吸困難 has pulmonary congestion the
 * clinician reported rather than found. 「兩」 is counted on neither side: a
 * finding that could be either cannot settle which.
 */
function sideTallyOf(vitals: ClinicVitals | undefined): { pulmonary: number; systemic: number } {
  let pulmonary = 0
  let systemic = 0
  for (const item of [...VISIT_SYMPTOM_ITEMS, ...VISIT_EXAM_ITEMS]) {
    if (vitals?.signAnswers?.[item.term]?.value !== 'present') continue
    if (item.side === 'pulmonary') pulmonary += 1
    if (item.side === 'systemic') systemic += 1
  }
  return { pulmonary, systemic }
}

/** Positive bedside congestion findings belong beside the imported evidence. */
function congestionAssessmentBasis(
  vitals: ClinicVitals | undefined,
  isEnglish: boolean,
): string[] {
  const positiveLabels = (items: readonly VisitItem[]) => items
    .filter((item) => vitals?.signAnswers?.[item.term]?.value === 'present')
    .map((item) => isEnglish ? item.shortEn : item.shortZh)
  const symptoms = positiveLabels(VISIT_SYMPTOM_ITEMS)
  const exam = positiveLabels(VISIT_EXAM_ITEMS)
  return [
    ...(symptoms.length > 0
      ? [`${isEnglish ? 'Symptoms: ' : '症狀：'}${symptoms.join(isEnglish ? ', ' : '、')}`]
      : []),
    ...(exam.length > 0
      ? [`PE${isEnglish ? ': ' : '：'}${exam.join(isEnglish ? ', ' : '、')}`]
      : []),
  ]
}

function entryText(
  vitals: ClinicVitals | undefined,
  isEnglish: boolean,
): string | undefined {
  const value = (key: ClinicVitalsEntryKey) => vitals?.entries?.[key]?.value
  const parts: string[] = []
  const systolic = value('systolic')
  const diastolic = value('diastolic')
  if (systolic !== undefined && diastolic !== undefined) parts.push(`${systolic}/${diastolic}`)
  const heartRate = value('heartRate')
  if (heartRate !== undefined) parts.push(`${heartRate} bpm`)
  const oxygenSaturation = value('oxygenSaturation')
  if (oxygenSaturation !== undefined) parts.push(`SpO₂ ${oxygenSaturation}%`)
  const bodyWeight = value('bodyWeight')
  if (bodyWeight !== undefined) parts.push(`${bodyWeight} kg`)
  const bodyHeight = value('bodyHeight')
  if (bodyHeight !== undefined) parts.push(`${bodyHeight} cm`)
  if (parts.length === 0) return undefined
  return parts.join(isEnglish ? ' · ' : ' · ')
}

/** The most recent stamp across the fields one question writes. */
function latestStamp(...stamps: (string | undefined)[]): string | undefined {
  return stamps.filter((stamp): stamp is string => Boolean(stamp)).sort().at(-1)
}

/**
 * What this visit already knows about the pathway, read once per build.
 *
 * The questions below each need the same four answers — is heart failure
 * suspected, did the pack raise the LVEF gate, is this an established HFrEF,
 * and what does a locked question say — so they are worked out here rather
 * than six times.
 */
interface HeartFailureState {
  board: HeartFailureBoardModel
  phenotypeCard?: CdssRecommendation
  diagnosisCard?: CdssRecommendation
  suspicionRequest: PhysicianInputRequest
  lvefRequest?: PhysicianInputRequest
  hfpEfRequest?: PhysicianInputRequest
  establishedHfrEF: boolean
  suspicion: PhenotypeAnswer['hfSuspicion']
  suspected: boolean
  notSuspected: boolean
  suspicionLabel: string
  suspicionAnswerText?: string
  lockedReason: string
  gated: (state: VisitQuestion['state']) => VisitQuestion['state']
}

function heartFailureState(ctx: VisitFlowContext): HeartFailureState {
  const { isEnglish, phenotypeAnswer, recommendations, byId } = ctx
  const board = ctx.board as HeartFailureBoardModel
  const phenotypeCard = byId.get(PHENOTYPE_MODULE_ID)
  const diagnosisCard = byId.get(HFPEF_DIAGNOSIS_MODULE_ID)

  // The visit always starts with this answer, even when the pack already
  // knows the phenotype and therefore has no diagnostic question to ask.
  // Keep that visit input usable without changing the pack's clinical gates.
  const suspicionRequest: PhysicianInputRequest = requestOf(phenotypeCard, 'hf-suspicion') ?? {
    kind: 'hf-suspicion',
    label: isEnglish ? 'Do you suspect heart failure in this patient?' : '您懷疑這位病人有心衰竭嗎？',
    selection: 'single',
    options: [
      { id: 'suspected', label: isEnglish ? 'Yes, heart failure is suspected' : '是，懷疑心衰竭' },
      { id: 'not-suspected', label: isEnglish ? 'No, not suspected at this visit' : '否，本次不懷疑' },
    ],
  }
  const lvefRequest = requestOf(phenotypeCard, 'lvef-phenotype')
  const hfpEfRequest = requestOf(diagnosisCard, 'hfpef-diagnosis-confirmation')

  const establishedHeartFailure = recommendations
    .flatMap((recommendation) => recommendation.patientEvidence)
    .some((evidence) => evidence.factKeys.includes('heartFailureDiagnosis'))
  const lvefValue = Number.parseFloat(board.lvef?.value ?? '')
  const establishedHfrEF = establishedHeartFailure
    && Number.isFinite(lvefValue)
    && lvefValue < 50
  const suspicion = establishedHfrEF ? 'suspected' : phenotypeAnswer?.hfSuspicion
  const suspected = suspicion === 'suspected'
  const notSuspected = suspicion === 'not-suspected'

  const suspicionLabel = suspicionRequest?.label
    ?? (isEnglish ? 'Do you suspect heart failure in this patient?' : '您懷疑這位病人有心衰竭嗎？')
  const suspicionAnswerText = establishedHfrEF
    ? (isEnglish ? 'Established heart failure in the record' : '病歷已有心衰竭診斷')
    : suspicion
    ? suspicionRequest?.options?.find((option) => option.id === suspicion)?.label
      ?? (suspected
        ? (isEnglish ? 'Yes' : '是，懷疑心衰竭')
        : (isEnglish ? 'No' : '否，本次不懷疑'))
    : undefined

  // 2–6 are questions about a heart-failure patient. Until someone says this
  // is one they are a form put to the wrong person, and once someone says it
  // is not, they are a form nobody has to fill in.
  const lockedReason = notSuspected
    ? (isEnglish
      ? 'Heart failure is not suspected this visit; the remaining questions are skipped.'
      : '本次不懷疑心衰竭，其餘題目略過。')
    : (isEnglish ? 'Opens once question 1 is answered' : '回答第 1 題後開放')

  return {
    board,
    ...(phenotypeCard ? { phenotypeCard } : {}),
    ...(diagnosisCard ? { diagnosisCard } : {}),
    suspicionRequest,
    ...(lvefRequest ? { lvefRequest } : {}),
    ...(hfpEfRequest ? { hfpEfRequest } : {}),
    establishedHfrEF,
    suspicion,
    suspected,
    notSuspected,
    suspicionLabel,
    ...(suspicionAnswerText ? { suspicionAnswerText } : {}),
    lockedReason,
    gated: (state) => (suspected ? state : 'locked'),
  }
}

/* -------------------------------------------------------------- questions */

const questions: readonly VisitQuestionSpec[] = [
  {
    id: 'hf-suspicion',
    appliesWhen: (ctx) => !heartFailureState(ctx).establishedHfrEF,
    derive: (ctx) => {
      const hf = heartFailureState(ctx)
      return {
        number: '1',
        label: hf.suspicionLabel,
        state: hf.suspicion ? 'answered' : 'open',
        ...(hf.suspicionAnswerText ? { answerText: hf.suspicionAnswerText } : {}),
        ...(ctx.phenotypeAnswer?.modifiedAt?.hfSuspicion
          ? { modifiedAt: ctx.phenotypeAnswer.modifiedAt.hfSuspicion }
          : {}),
        hint: ctx.isEnglish
          ? 'Answering 「no」 folds the rest away and leaves only the safety alerts.'
          : '答「否」後其餘題目與處置收起，只留安全警訊。',
        counted: true,
        request: hf.suspicionRequest,
        recommendationId: PHENOTYPE_MODULE_ID,
        inlineControl: true,
      }
    },
    render: ({ question, isEnglish, now, surface }) => (
      question.request && surface.onAnswerPhenotype && question.recommendationId ? (
        <PhysicianInputRequestPanel
          inline
          requests={[question.request]}
          recommendationId={question.recommendationId}
          isEnglish={isEnglish}
          answer={surface.phenotypeAnswer}
          onAnswer={surface.onAnswerPhenotype}
          now={now}
        />
      ) : null
    ),
  },
  // 1b appears only where the pack actually raised it. The host does not
  // decide that a phenotype is missing — the pack does, by asking.
  {
    id: 'lvef-phenotype',
    appliesWhen: (ctx) => {
      const hf = heartFailureState(ctx)
      return Boolean(hf.lvefRequest && hf.phenotypeCard)
    },
    derive: (ctx) => {
      const hf = heartFailureState(ctx)
      const answer = ctx.phenotypeAnswer
      return {
        number: '1b',
        label: hf.lvefRequest!.label,
        state: answer?.choice ? 'answered' : 'open',
        ...(answer?.choice
          ? {
            answerText: [
              hf.lvefRequest!.options?.find((option) => option.id === answer.choice)?.label
                ?? answer.choice,
              answer.lvef === undefined ? undefined : `LVEF ${answer.lvef}%`,
              formatDay(answer.measuredOn),
            ].filter(Boolean).join(' · '),
          }
          : {}),
        ...(answer?.modifiedAt?.phenotype ? { modifiedAt: answer.modifiedAt.phenotype } : {}),
        counted: false,
        // A patient this clinician has said the pathway is not for should not
        // be sent back to a gate they have already declined.
        ...(hf.notSuspected ? { skipAsNextStep: true } : {}),
        request: hf.lvefRequest!,
        recommendationId: hf.phenotypeCard!.id,
        inlineControl: true,
      }
    },
    render: ({ question, isEnglish, now, surface }) => (
      question.request && surface.onAnswerPhenotype && question.recommendationId ? (
        <PhysicianInputRequestPanel
          inline
          requests={[question.request]}
          recommendationId={question.recommendationId}
          isEnglish={isEnglish}
          answer={surface.phenotypeAnswer}
          onAnswer={surface.onAnswerPhenotype}
          now={now}
        />
      ) : null
    ),
  },
  // ② 症狀 — what the patient says, before anything the clinician looks for.
  {
    id: 'symptoms',
    derive: (ctx) => {
      const hf = heartFailureState(ctx)
      const stamp = latestStamp(...VISIT_SYMPTOM_ITEMS.map(
        (item) => ctx.clinicVitals?.signAnswers?.[item.term]?.modifiedAt,
      ))
      const text = signItemsText(VISIT_SYMPTOM_ITEMS, ctx.clinicVitals, ctx.isEnglish)
      const answered = signItemsAnswered(VISIT_SYMPTOM_ITEMS, ctx.clinicVitals)
      return {
        number: hf.establishedHfrEF ? '1' : '2',
        label: ctx.isEnglish ? 'Symptoms the patient describes' : '病人描述的症狀',
        state: hf.gated(answered ? 'answered' : 'open'),
        ...(answered && text
          ? { answerText: text, ...(stamp ? { modifiedAt: stamp } : {}) }
          : {}),
        ...(hf.suspected ? {} : { lockedReason: hf.lockedReason }),
        counted: true,
        items: VISIT_SYMPTOM_ITEMS,
        tags: SIDE_TAGS,
        showLegend: true,
      }
    },
    render: signItemsRenderer,
  },
  // ③ 徵象 — what the clinician examined for. Kept apart from ② because the
  // source differs and so does what 「無」 means: 「問了說沒有」 is not 「看了
  // 沒有」, and a rule that cannot tell them apart cannot weigh either.
  {
    id: 'signs',
    derive: (ctx) => {
      const hf = heartFailureState(ctx)
      const stamp = latestStamp(...VISIT_EXAM_ITEMS.map(
        (item) => ctx.clinicVitals?.signAnswers?.[item.term]?.modifiedAt,
      ))
      const text = signItemsText(VISIT_EXAM_ITEMS, ctx.clinicVitals, ctx.isEnglish, true)
      const answered = signItemsAnswered(VISIT_EXAM_ITEMS, ctx.clinicVitals)
      const tally = sideTallyOf(ctx.clinicVitals)
      return {
        number: hf.establishedHfrEF ? '2' : '3',
        label: ctx.isEnglish ? 'Signs you found on examination' : '你檢查到的徵象',
        state: hf.gated(answered ? 'answered' : 'open'),
        ...(answered && text
          ? { answerText: text, ...(stamp ? { modifiedAt: stamp } : {}) }
          : {}),
        ...(hf.suspected ? {} : { lockedReason: hf.lockedReason }),
        counted: true,
        items: VISIT_EXAM_ITEMS,
        tags: SIDE_TAGS,
        showLegend: false,
        sideTally: tally,
        // 「肺鬱血 0 · 體循環 0」 is not a reading; a tally of nothing prints
        // no chip at all.
        ...(tally.pulmonary === 0 && tally.systemic === 0
          ? {}
          : {
            answerBadgeText: ctx.isEnglish
              ? `Pulmonary ${tally.pulmonary} · Systemic ${tally.systemic}`
              : `肺鬱血 ${tally.pulmonary} · 體循環 ${tally.systemic}`,
          }),
      }
    },
    render: signItemsRenderer,
  },
  {
    id: 'nyha',
    derive: (ctx) => {
      const hf = heartFailureState(ctx)
      const nyha = ctx.clinicVitals?.nyhaClass
      return {
        number: hf.establishedHfrEF ? '3' : '4',
        label: ctx.isEnglish ? "Today's NYHA class?" : '今天的 NYHA 分級？',
        state: hf.gated(nyha ? 'answered' : 'open'),
        ...(nyha
          ? {
            answerText: nyha.value === NOT_ASSESSED
              ? (ctx.isEnglish ? 'Not assessed' : '未評估')
              : `NYHA ${nyha.value}`,
            modifiedAt: nyha.modifiedAt,
          }
          : {}),
        hint: ctx.isEnglish
          ? `Graded from the symptoms in question ${hf.establishedHfrEF ? '1' : '2'} and the activity limitation; never inferred from LVEF or a diagnosis code.`
          : `依第 ${hf.establishedHfrEF ? '1' : '2'} 題的症狀與活動限制選擇；不由 LVEF 或診斷碼推定。`,
        ...(hf.suspected ? {} : { lockedReason: hf.lockedReason }),
        counted: true,
        inlineControl: true,
      }
    },
    render: ({ question, isEnglish, surface }) => (
      surface.onSaveClinicVitals ? (
        <SegmentedControl<NyhaAnswerValue>
          equalWidth
          label={question.label}
          tooltipPrefix="NYHA"
          options={[
            { id: 'I', text: 'I', description: isEnglish ? 'Activity is unrestricted; usual daily exertion does not provoke undue fatigue, palpitations or breathlessness.' : '日常活動不受限制；一般活動不會引起明顯疲倦、心悸或呼吸困難。' },
            { id: 'II', text: 'II', description: isEnglish ? 'Mild activity restriction: comfortable at rest, but usual daily exertion brings on fatigue, palpitations or breathlessness.' : '活動輕度受限；休息時舒適，但一般日常活動會引起疲倦、心悸或呼吸困難。' },
            { id: 'III', text: 'III', description: isEnglish ? 'Substantial activity restriction: comfortable at rest, but symptoms develop with lighter-than-usual daily exertion.' : '活動明顯受限；休息時舒適，但低於一般日常活動的程度就會引起症狀。' },
            { id: 'IV', text: 'IV', description: isEnglish ? 'Heart failure symptoms occur at rest, and any physical exertion increases discomfort.' : '休息時也有心衰竭症狀，任何身體活動都會增加不適。' },
            { id: NOT_ASSESSED, text: isEnglish ? 'Not assessed' : '未評估' },
          ]}
          value={surface.clinicVitals?.nyhaClass?.value ?? null}
          onSelect={(next) => surface.onSaveClinicVitals?.({ nyhaClass: next })}
          testId="cdss-hf-flow-nyha"
        />
      ) : null
    ),
  },
  {
    id: 'compensation',
    derive: (ctx) => {
      const hf = heartFailureState(ctx)
      const compensation = ctx.clinicVitals?.compensationStatus
      return {
        number: hf.establishedHfrEF ? '4' : '5',
        label: ctx.isEnglish
          ? 'Compensated or decompensated today?'
          : '今天是代償還是失代償？',
        state: hf.gated(compensation ? 'answered' : 'open'),
        ...(compensation
          ? {
            answerText: compensation.value === NOT_ASSESSED
              ? (ctx.isEnglish ? 'Not assessed' : '未評估')
              : compensation.value === 'decompensated'
                ? (ctx.isEnglish ? 'Decompensated' : '失代償')
                : (ctx.isEnglish ? 'Compensated' : '代償'),
            modifiedAt: compensation.modifiedAt,
          }
          : {}),
        hint: ctx.isEnglish
          ? 'Kept apart from any admission in the record; the current rules do not read this answer yet.'
          : '與紀錄中的住院史分開存放；目前規則尚未讀取此答案。',
        ...(hf.suspected ? {} : { lockedReason: hf.lockedReason }),
        counted: true,
        inlineControl: true,
      }
    },
    render: ({ question, isEnglish, surface }) => (
      surface.onSaveClinicVitals ? (
        <SegmentedControl<CompensationAnswerValue>
          equalWidth
          label={question.label}
          options={[
            { id: 'compensated', text: isEnglish ? 'Compensated' : '代償' },
            { id: 'decompensated', text: isEnglish ? 'Decompensated' : '失代償' },
            { id: NOT_ASSESSED, text: isEnglish ? 'Not assessed' : '未評估' },
          ]}
          value={surface.clinicVitals?.compensationStatus?.value ?? null}
          onSelect={(next) => surface.onSaveClinicVitals?.({ compensationStatus: next })}
          testId="cdss-hf-flow-compensation"
        />
      ) : null
    ),
  },
  // ⑥ The HFpEF confirmation, last because it reads questions ② and ④ to judge
  // criterion (i): a card that asked for the conclusion before the findings
  // were in sent the clinician back up the page to answer them.
  {
    id: 'hfpef-confirmation',
    appliesWhen: (ctx) => {
      const hf = heartFailureState(ctx)
      return Boolean(hf.hfpEfRequest && hf.diagnosisCard)
    },
    derive: (ctx) => {
      const hf = heartFailureState(ctx)
      const confirmation = ctx.phenotypeAnswer?.hfpEfConfirmed
      // `false` is the original board's 「取消確認」, which returns the question
      // to unanswered. Only 「暫不確認」 is an answer with no finding in it.
      const answered = confirmation === true || confirmation === HFPEF_NOT_CONFIRMED
      return {
        number: '6',
        label: hf.hfpEfRequest!.label,
        state: hf.gated(answered ? 'answered' : 'open'),
        ...(!answered
          ? {}
          : {
            answerText: confirmation === true
              ? (ctx.isEnglish ? 'HFpEF confirmed' : 'HFpEF 已確認')
              : (ctx.isEnglish ? 'Not confirmed this visit' : '暫不確認'),
            ...(ctx.phenotypeAnswer?.modifiedAt?.hfpEfConfirmed
              ? { modifiedAt: ctx.phenotypeAnswer.modifiedAt.hfpEfConfirmed }
              : {}),
          }),
        ...(hf.suspected ? {} : { lockedReason: hf.lockedReason }),
        counted: true,
        request: hf.hfpEfRequest!,
        recommendationId: hf.diagnosisCard!.id,
      }
    },
    render: ({ isEnglish, now, surface }) => {
      if (!surface.onAnswerPhenotype) return null
      const board = surface.board as HeartFailureBoardModel
      const diagnosisCard = board.hfpEfDiagnosis
      return (
        <HfpEfConfirmation
          summary={diagnosisCard ? diagnosticSummaryOf(diagnosisCard) : undefined}
          isEnglish={isEnglish}
          now={now}
          answer={surface.phenotypeAnswer}
          onAnswer={surface.onAnswerPhenotype}
          hfpefReading={surface.hfpefReading as HfpefReading | undefined}
          onOpenCalculator={surface.onOpenCalculator as ((id?: HfpefScoreId) => void) | undefined}
        />
      )
    },
  },
]

function signItemsRenderer({ question, isEnglish, surface, reopen, collapse }: {
  question: VisitQuestion
  isEnglish: boolean
  surface: { clinicVitals?: ClinicVitals; onSaveClinicVitals?: (patch: { signAnswers: Record<string, SignAnswerValue> }) => void }
  reopen: () => void
  collapse: () => void
}) {
  if (!question.items || !surface.onSaveClinicVitals) return null
  const save = surface.onSaveClinicVitals
  return (
    <div>
      <ItemRows
        questionId={question.id}
        items={question.items}
        tags={question.tags ?? SIDE_TAGS}
        valueOf={(term) => surface.clinicVitals?.signAnswers?.[term]?.value}
        isEnglish={isEnglish}
        showLegend={question.showLegend === true}
        onAnswer={(term, next) => {
          reopen()
          save({ signAnswers: { [term]: next as SignAnswerValue } })
        }}
        testIdPrefix="cdss-hf"
      />
      {question.state === 'answered' ? (
        <button
          type="button"
          className="mt-2 min-h-8 text-xs font-medium text-primary hover:underline"
          onClick={collapse}
        >
          {isEnglish ? 'Collapse' : '收合'}
        </button>
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------- HFpEF confirmation */

/**
 * The two scores, as the host's own calculator computed them.
 *
 * Printed from the calculator rather than waited for from the pack, because
 * the calculator is the only thing that scores: the pack reads the same
 * numbers off the facts this host wrote. A score with parameters missing is
 * never printed as a bare total — what is still unreported, and how much it
 * could still add, is on the line under it.
 */
function HfpEfScoreLine({
  reading,
  isEnglish,
  onComplete,
}: {
  reading?: HfpefReading
  isEnglish: boolean
  onComplete?: (id?: HfpefScoreId) => void
}) {
  const scores = [reading?.hfaPeff, reading?.h2fpef]
    .filter((score): score is HfpefScoreReading => Boolean(score))
  const date = scores.map((score) => score.date).filter(Boolean).sort().at(-1)
  const missing = scores.find((score) => score.missing.length > 0)
  return (
    <div
      className="rounded-md border border-border bg-muted/[0.12] px-2.5 py-2"
      data-testid="cdss-hf-hfpef-scores"
    >
      {scores.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isEnglish
            ? 'The calculator has no score yet: the record does not carry enough of the parameters.'
            : '目前的輸入不足，計算機尚無分數。'}
        </p>
      ) : (
        <>
          {scores.map((score) => (
            <p
              key={score.id}
              className="flex flex-wrap items-baseline gap-x-2 text-xs"
              data-testid={`cdss-hf-hfpef-score-${score.id}`}
            >
              {onComplete ? <button type="button" className="min-h-8 w-[5.5rem] shrink-0 text-left font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary" aria-label={`${isEnglish ? 'Open' : '開啟'} ${score.name}`} onClick={() => onComplete(score.id)}>{score.name}</button> : <span className="w-[5.5rem] shrink-0 font-semibold text-foreground">{score.name}</span>}
              <span className="font-semibold tabular-nums text-foreground">
                {score.score}
                {isEnglish ? '/' : '／'}
                {score.maximum}
              </span>
              <span className="text-muted-foreground">
                {isEnglish ? score.bandEn : score.bandZh}
              </span>
            </p>
          ))}
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {isEnglish
              ? `By calculator ${HFPEF_CALCULATOR_VERSION}${date ? ` · echo ${date}` : ''}`
              : `依計算機 ${HFPEF_CALCULATOR_VERSION}${date ? ` · 心超 ${date}` : ''}`}
          </p>
          {missing ? (
            <p
              className="mt-0.5 text-[11px] leading-4 text-amber-800 dark:text-amber-300"
              data-testid="cdss-hf-hfpef-score-missing"
            >
              {isEnglish
                ? `Not reported: ${missing.missingEn.join(', ')} (at most +${missing.upper - missing.score})`
                : `報告未提供：${missing.missingZh.join('、')}（最多再 +${missing.upper - missing.score}）`}
            </p>
          ) : null}
        </>
      )}

    </div>
  )
}

/**
 * Question ⑥: the HFpEF conclusion, with the three criteria beside it.
 *
 * Which button leads depends on what is missing. While criterion (i) is
 * undetermined the useful action is not 「確認」 but 「去答第 2 題」, because the
 * symptoms are what would settle it; a screen that led with the confirmation
 * invited a conclusion drawn over an unread criterion. 「暫不確認」 is the third
 * state and the reason this question can be finished at all: it says the
 * question was put and no diagnosis was made today, and it writes no fact —
 * 「先不確認」 is not a statement that the patient has no HFpEF.
 */
function HfpEfConfirmation({
  summary,
  isEnglish,
  now,
  answer,
  onAnswer,
  hfpefReading,
  onOpenCalculator,
}: {
  summary: ReturnType<typeof diagnosticSummaryOf>
  isEnglish: boolean
  now: Date
  answer?: PhenotypeAnswer
  onAnswer: (answer: PhenotypeAnswer) => void
  hfpefReading?: HfpefReading
  onOpenCalculator?: (id?: HfpefScoreId) => void
}) {
  const symptomsState = summary?.criteria
    .find((criterion) => criterion.id === 'symptoms-signs')?.state
  const symptomsUndetermined = symptomsState === 'undetermined'
  const record = (value: true | typeof HFPEF_NOT_CONFIRMED) => onAnswer({
    ...(answer ?? {}),
    answeredOn: todayIsoDate(now),
    hfpEfConfirmed: value,
  })
  return (
    <div className="space-y-2" data-testid="cdss-hf-hfpef-confirmation">
      <DiagnosisReading summary={summary} isEnglish={isEnglish} showScores={false} />
      <HfpEfScoreLine
        reading={hfpefReading}
        isEnglish={isEnglish}
        {...(onOpenCalculator ? { onComplete: onOpenCalculator } : {})}
      />
      <div className="flex flex-wrap items-center gap-2">
        {symptomsUndetermined ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => focusVisitFlowTarget({ kind: 'question', questionId: 'symptoms' })}
            data-testid="cdss-hf-hfpef-go-to-symptoms"
          >
            {isEnglish ? 'Go to question 2' : '前往第 2 題'}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={symptomsUndetermined ? 'outline' : 'default'}
          className="h-8"
          onClick={() => record(true)}
          data-testid="cdss-hf-hfpef-confirm"
        >
          {isEnglish ? 'Confirm the HFpEF diagnosis' : '確認 HFpEF 診斷'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => record(HFPEF_NOT_CONFIRMED)}
          data-testid="cdss-hf-hfpef-defer"
        >
          {isEnglish ? 'Not confirming today' : '暫不確認'}
        </Button>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {isEnglish
          ? 'Encrypted and kept for this tab session only; carrying it to the next visit is phase 2, and nothing is written to the chart or to any claim. The HFpEF treatment recommendations appear under today’s actions once it is confirmed.'
          : '加密保存於本分頁的工作階段，跨次就診沿用為第二階段；不寫回病歷，也不做健保申報。確認後 HFpEF 治療建議才會出現在今日處置。'}
      </p>
    </div>
  )
}

/* ----------------------------------------------------------------- rules */

/** This generic record-retrieval reminder is not a decision for today's visit. */
function isGenericMonitoringReminder(item: CdssRecommendation): boolean {
  return item.id === 'heart-failure-monitoring' && [
    '先查找院內近期病歷與出院計畫，再補齊病人自述與量測資料。',
    'Retrieve recent institutional notes and the discharge plan first, then complete patient-reported and measured data.',
  ].includes(item.nextActions[0] ?? '')
}

/** State the result of a negative medication-safety scan instead of when to scan again. */
function visitActionHeadline(
  recommendation: CdssRecommendation,
  isEnglish: boolean,
): string | undefined {
  if (recommendation.id === 'heart-failure-fmt-safety') {
    const missing = (recommendation.missingData ?? []).map(conciseMissingLabel)
    const stale = recommendation.patientEvidence
      .filter((item) => /超過\s*\d+\s*天窗|stale|exceeds?.*window|out(?:side| of).*window/i.test(item.value))
      .map((item) => item.label)
    const uniqueMissing = [...new Set(missing)]
    const uniqueStale = [...new Set(stale)]
    if (isEnglish) {
      const actions = [
        ...(uniqueMissing.length > 0 ? [`complete ${uniqueMissing.join(', ')}`] : []),
        ...(uniqueStale.length > 0 ? [`repeat ${uniqueStale.join(', ')}`] : []),
      ]
      return actions.length > 0
        ? `${actions.join(' and ')}, then reassess medication adjustment.`
        : 'Review symptoms, vital signs, and laboratory results before adjusting medication.'
    }
    const actions = [
      ...(uniqueMissing.length > 0 ? [`補齊${uniqueMissing.join('、')}`] : []),
      ...(uniqueStale.length > 0 ? [`複驗${uniqueStale.join('、')}`] : []),
    ]
    return actions.length > 0
      ? `${actions.join('並')}，再評估藥物調整。`
      : '確認症狀、生命徵象與檢驗後，再評估藥物調整。'
  }
  if (recommendation.id === 'heart-failure-mra') {
    return isEnglish ? 'Assess starting MRA.' : '評估啟用 MRA。'
  }
  if (recommendation.id === 'heart-failure-congestion-diuretic') {
    return isEnglish
      ? 'For HF with signs or symptoms of congestion, adjust loop diuretics to volume status.'
      : '有鬱血症狀或徵象時，依容量狀態調整 loop 利尿劑。'
  }
  if (recommendation.id === 'heart-failure-medication-safety' && recommendation.status === 'no-action') {
    return isEnglish
      ? 'Medication review found no recorded NSAID or COX-2 inhibitor use.'
      : '本次用藥掃描未發現 NSAID 或 COX-2 抑制劑使用紀錄。'
  }
  return undefined
}

/** Match the task itself, not the severity/group in which it happens to appear. */
function defaultDecisionKind(
  recommendation: CdssRecommendation,
  group: VisitActionGroupId,
): VisitDecisionKind {
  if (group === 'no-action') return 'none'
  if (recommendation.id === 'cardiac-rehabilitation-safety') return 'exercise-safety'
  if (recommendation.id === 'cardiac-rehabilitation') return 'rehabilitation'
  if (recommendation.id === 'heart-failure-fmt-safety') return 'measurement'
  if (group === 'needs-data') return 'test'
  if (recommendation.id === 'heart-failure-monitoring' || recommendation.id === 'cardiac-rehabilitation-response') return 'follow-up'
  if (
    recommendation.id === 'heart-failure-hfimpEF-therapy'
  ) return 'review'
  if (recommendation.domain === 'medication') return 'medication'
  return 'review'
}

/** The reasons a deferral or a contraindication can be recorded under. */
export const DECISION_REASONS: readonly VisitDecisionReason[] = [
  { id: 'high-potassium', zh: 'K 偏高', en: 'Potassium high' },
  { id: 'mra-hyperkalemia', zh: 'K ≥ 5.0 mmol/L', en: 'Potassium ≥ 5.0 mmol/L' },
  { id: 'mra-renal-threshold', zh: 'eGFR ≤ 30 mL/min/1.73m²', en: 'eGFR ≤ 30 mL/min/1.73m²' },
  { id: 'addison-disease', zh: 'Addison disease', en: 'Addison disease' },
  { id: 'duplicate-mra', zh: '重複使用 MRA（如併用 eplerenone）', en: 'Duplicate MRA therapy (e.g. concomitant eplerenone)' },
  { id: 'symptomatic-hypotension', zh: '症狀性低血壓', en: 'Symptomatic hypotension' },
  { id: 'low-egfr', zh: 'eGFR 不足', en: 'eGFR too low' },
  { id: 'bradycardia', zh: '心率過慢', en: 'Heart rate too low' },
  { id: 'drug-hypersensitivity', zh: '對本藥嚴重過敏', en: 'Serious drug hypersensitivity' },
  { id: 'angioedema-history', zh: 'ACEI／ARB 相關血管性水腫史', en: 'History of ACEI/ARB-related angioedema' },
  { id: 'pregnancy', zh: '懷孕', en: 'Pregnancy' },
  { id: 'acei-arni-overlap', zh: 'ACEI 併用／停藥未滿 36 小時', en: 'Concomitant ACEI or washout under 36 hours' },
  { id: 'arni-aliskiren-diabetes', zh: 'ARNI 併用 aliskiren（糖尿病）', en: 'ARNI with aliskiren in diabetes' },
  { id: 'high-grade-av-block', zh: '二／三度 AV block（無節律器）', en: 'Second-/third-degree AV block without a pacemaker' },
  { id: 'severe-bradycardia', zh: '嚴重心搏過緩', en: 'Severe bradycardia' },
  { id: 'cardiogenic-shock', zh: '心因性休克／需靜脈強心劑', en: 'Cardiogenic shock / IV inotrope required' },
  { id: 'bronchial-asthma', zh: '支氣管氣喘／嚴重支氣管痙攣', en: 'Bronchial asthma / severe bronchospasm' },
  { id: 'acute-decompensation', zh: '急性失代償／尚未穩定', en: 'Acute decompensation / not yet stable' },
  { id: 'anuria', zh: '無尿', en: 'Anuria' },
  { id: 'no-congestion', zh: '無鬱血／已達乾體重', en: 'No congestion / at dry weight' },
  { id: 'electrolyte-depletion', zh: '低血鉀／低血鈉', en: 'Hypokalaemia / hyponatraemia' },
  { id: 'worsening-renal-function', zh: '腎功能惡化／少尿', en: 'Worsening renal function / oliguria' },
  { id: 'drug-intolerance', zh: '不耐受', en: 'Intolerance' },
  { id: 'volume-depletion', zh: '容量不足／症狀性低血壓', en: 'Volume depletion / symptomatic hypotension' },
  { id: 'ketoacidosis', zh: '酮酸中毒／疑似 DKA', en: 'Ketoacidosis / suspected DKA' },
  { id: 'acute-illness-fasting-surgery', zh: '急性病／禁食／手術', en: 'Acute illness / fasting / surgery' },
  { id: 'low-egfr-initiation', zh: 'eGFR 低於起始門檻', en: 'eGFR below initiation threshold' },
  { id: 'patient-refused', zh: '病人拒絕', en: 'Patient declined' },
  { id: 'cost', zh: '費用／給付', en: 'Cost / coverage' },
  { id: 'other', zh: '其他', en: 'Other' },
]

/** Reasons shown for this decision; diuretics use volume-status and renal safety reasons. */
export function decisionReasonIds(
  moduleId: string,
  decisionKind: VisitDecisionKind,
  decision: PhysicianDecision['decision'] | undefined,
): readonly string[] {
  if (moduleId === 'heart-failure-ras-inhibition') {
    return decision === 'contraindicated'
      ? [
          'angioedema-history',
          'pregnancy',
          'acei-arni-overlap',
          'arni-aliskiren-diabetes',
          'drug-hypersensitivity',
          'other',
        ]
      : [
          'symptomatic-hypotension',
          'high-potassium',
          'worsening-renal-function',
          'drug-intolerance',
          'patient-refused',
          'cost',
          'other',
        ]
  }
  if (moduleId === 'heart-failure-beta-blocker') {
    return decision === 'contraindicated'
      ? [
          'high-grade-av-block',
          'severe-bradycardia',
          'cardiogenic-shock',
          'bronchial-asthma',
          'drug-hypersensitivity',
          'other',
        ]
      : [
          'acute-decompensation',
          'bradycardia',
          'symptomatic-hypotension',
          'drug-intolerance',
          'patient-refused',
          'cost',
          'other',
        ]
  }
  if (moduleId === 'heart-failure-mra') {
    return decision === 'contraindicated'
      ? [
          'mra-hyperkalemia',
          'mra-renal-threshold',
          'addison-disease',
          'duplicate-mra',
          'drug-hypersensitivity',
          'other',
        ]
      : [
          'symptomatic-hypotension',
          'worsening-renal-function',
          'acute-illness-fasting-surgery',
          'drug-intolerance',
          'patient-refused',
          'cost',
          'other',
        ]
  }
  if (moduleId === 'heart-failure-congestion-diuretic') {
    return decision === 'contraindicated'
      ? ['anuria', 'drug-hypersensitivity', 'other']
      : [
          'no-congestion',
          'volume-depletion',
          'electrolyte-depletion',
          'worsening-renal-function',
          'drug-intolerance',
          'patient-refused',
          'other',
        ]
  }
  if (moduleId === 'heart-failure-sglt2') {
    return decision === 'contraindicated'
      ? ['drug-hypersensitivity', 'other']
      : [
          'volume-depletion',
          'ketoacidosis',
          'acute-illness-fasting-surgery',
          'low-egfr-initiation',
          'drug-intolerance',
          'patient-refused',
          'cost',
          'other',
        ]
  }
  return decisionKind === 'medication'
    ? (decision === 'contraindicated'
        ? ['drug-hypersensitivity', 'other']
        : ['drug-intolerance', 'patient-refused', 'cost', 'other'])
    : ['patient-refused', 'cost', 'other']
}

/* ----------------------------------------------------------------- steps */

function decidableRowsOf(ctx: VisitFlowStepContext): readonly VisitActionRow[] {
  return ctx.actionGroups.flatMap((group) => group.rows).filter((row) => row.decisionKind !== 'none')
}

/* --------------------------------------------------------------- summary */

/**
 * The four lines a clinician pastes into the note: what the phenotype is, what
 * was judged in the room, what was measured, and what was decided.
 *
 * Plain text on purpose — it is going into a chart field, not a document — and
 * every clinical phrase in it is one the screen already showed.
 */
function buildVisitSummaryText(input: {
  chartLayout?: boolean
  board: HeartFailureBoardModel
  isEnglish: boolean
  now: Date
  phenotypeTitle?: string
  suspicionAnswerText?: string
  suspicionModifiedAt?: string
  nyhaText: string
  symptomsText: string
  signsText: string
  hfpEfText?: string
  compensationText: string
  vitalsText?: string
  decidableRows: readonly VisitActionRow[]
  decidedCount: number
  followUpNote?: string
}): string {
  const {
    board, isEnglish, now, phenotypeTitle, suspicionAnswerText, suspicionModifiedAt,
    nyhaText, symptomsText, signsText, hfpEfText, compensationText, vitalsText,
    decidableRows, decidedCount, followUpNote,
  } = input
  const recordedStamp = suspicionModifiedAt ? zonedParts(suspicionModifiedAt) : undefined
  const suspicionStamp = input.chartLayout
    ? (recordedStamp ? `${recordedStamp.date}${suspicionModifiedAt!.length > 10 ? ` ${recordedStamp.time}` : ''}` : undefined)
    : formatStamp(suspicionModifiedAt, now, isEnglish)
  const lines: string[] = []

  lines.push([
    suspicionAnswerText
      ? `${isEnglish ? 'Heart-failure suspicion' : '懷疑心衰竭'}：${suspicionAnswerText}${suspicionStamp ? `（${suspicionStamp}）` : ''}`
      : undefined,
    phenotypeTitle,
    board.lvef?.value
      ? `LVEF ${board.lvef.value}${board.lvef.date ? `（${formatDay(board.lvef.date)}）` : ''}`
      : undefined,
    hfpEfText,
  ].filter(Boolean).join(' · '))

  lines.push([
    `NYHA${isEnglish ? ': ' : '：'}${nyhaText}`,
    `${isEnglish ? 'Symptoms' : '症狀'}${isEnglish ? ': ' : '：'}${symptomsText}`,
    `${isEnglish ? 'Signs' : '徵象'}${isEnglish ? ': ' : '：'}${signsText}`,
    `${isEnglish ? 'Compensation' : '代償狀態'}${isEnglish ? ': ' : '：'}${compensationText}`,
  ].join(' · '))

  lines.push(vitalsText
    ? `${isEnglish ? 'Clinic measurements' : '門診量測'}：${vitalsText}`
    : `${isEnglish ? 'Clinic measurements' : '門診量測'}：${isEnglish ? 'none entered' : '未輸入'}`)

  const decided = decidableRows.flatMap((row) => {
    if (!row.decision) return []
    const safety = ['dose-adjusted', 'deferred'].includes(row.decision.decision)
      ? heartFailureMedicationSafetyAssessment(row.recommendation)
      : undefined
    const details = [
      safety ? (isEnglish ? safety.summaryReasonEn : safety.summaryReasonZh) : undefined,
      ...row.decision.reasons.map(reason => {
        const found = DECISION_REASONS.find((item) => item.id === reason)
        return found ? (isEnglish ? found.en : found.zh) : reason
      }),
      row.decision.note,
    ].filter((value): value is string => Boolean(value))
    return [`${row.moduleName}${input.chartLayout ? ': ' : ' '}${decisionLabel(row.decision.decision, isEnglish)}${details.length ? ` (${details.join('; ')})` : ''}${row.decisionSource === 'medication-record' ? (isEnglish ? ' (from current medication record)' : '（依目前用藥紀錄）') : ''}`]
  })
  const undecided = decidableRows.length - decidedCount
  lines.push([
    decided.length > 0
      ? `${isEnglish ? 'Decisions' : '處置'}：${decided.join(isEnglish ? '; ' : '、')}`
      : `${isEnglish ? 'Decisions' : '處置'}：${isEnglish ? 'none recorded' : '尚未記錄'}`,
    undecided > 0
      ? (isEnglish ? `${undecided} still undecided` : `其餘 ${undecided} 項待決定`)
      : undefined,
    followUpNote,
  ].filter(Boolean).join(isEnglish ? ' · ' : ' · '))

  if (input.chartLayout) {
    return [
      [
        'Assessment',
        suspicionAnswerText ? `Heart-failure suspicion: ${suspicionAnswerText}${suspicionStamp ? ` (${suspicionStamp})` : ''}` : undefined,
        phenotypeTitle,
        board.lvef?.value ? `LVEF ${board.lvef.value}${board.lvef.date ? ` (${formatDay(board.lvef.date)})` : ''}` : undefined,
        hfpEfText,
        `NYHA: ${nyhaText}`,
        `Compensation: ${compensationText}`,
      ].filter(Boolean).join('\n'),
      `Symptoms\n${symptomsText}`,
      `Signs\n${signsText}`,
      `Clinic measurements\n${vitalsText ? vitalsText.split(' · ').map(value => `  ${value}`).join('\n') : '  None entered'}`,
      ['Management', ...(decided.length ? decided.map(value => `- ${value}`) : ['- No decisions recorded']),
        ...(undecided > 0 ? [`- Pending decisions: ${undecided}`] : []),
      ].join('\n'),
    ].join('\n\n')
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------ the config */

export const HEART_FAILURE_VISIT_FLOW_CONFIG: VisitFlowDiseaseConfig = {
  packId: HEART_FAILURE_VISIT_FLOW_PACK_ID,
  testIdPrefix: 'cdss-hf',
  normalizeRecommendation: applyHeartFailureMedicationSafety,
  questions,
  // The phenotype gate and the HFpEF confirmation are questions 1, 1b and 6;
  // listing them again as things to do is the duplication this screen removes.
  consumedModuleIds: [
    PHENOTYPE_MODULE_ID,
    HFPEF_DIAGNOSIS_MODULE_ID,
    // The four medication-class rows already ask for the concrete decisions.
    // A separate generic medication-reconciliation row repeats that work.
    GDMT_MODULE_ID,
    // The diagnosis question and HFpEF calculator already present the same
    // eligibility evidence; a second read-only treatment card adds no action.
    'heart-failure-hfpef-treatment',
    // Each additional therapy already has its own evidence table and physician
    // fields. The umbrella card only asks the clinician to repeat that work.
    'heart-failure-additional-medical-therapy',
    // Exercise clearance belongs to the rehabilitation assessment, not this HF visit.
    'cardiac-rehabilitation-safety',
  ],
  isExcluded: (item, ctx) => {
    if (isGenericMonitoringReminder(item)) return true
    // Answering 「不懷疑心衰竭」 closes the visit down to what is dangerous
    // whatever the diagnosis: a prescription the record already holds does not
    // stop being an interaction because this clinician is not asking about HF.
    const hf = heartFailureState(ctx)
    if (!hf.notSuspected) return false
    return !ctx.board.alerts.some((alert) => alert.id === item.id)
  },
  leadingModuleIds: PILLAR_MODULE_IDS,
  decisionRules: {},
  defaultDecisionKind,
  decisionReasons: DECISION_REASONS,
  decisionReasonIds,
  headline: visitActionHeadline,
  extraBasis: (recommendation, ctx) => (
    recommendation.id === 'heart-failure-congestion-diuretic'
      ? congestionAssessmentBasis(ctx.clinicVitals, ctx.isEnglish)
      : []
  ),
  coverageLine: false,
  defaultDoseMedication: (moduleId) => (
    moduleId === 'heart-failure-congestion-diuretic' ? 'Furosemide' : undefined
  ),
  recordCard: {
    headlineFactKey: 'LVEF',
    order: ['LVEF', 'NTproBNP', 'eGFR', 'potassium', 'sodium', 'hemoglobin', 'bloodPressure', 'heartRate', 'oxygenSaturation', 'bodyWeight', 'bodyHeight'],
    // The three the board does not carry and the clinician can still complete:
    // an LVEF no module named, the saturation, and a height 健保雲端 often has
    // no record of at all.
    extraMetrics: (surface) => {
      const isEnglish = surface.isEnglish
      const extras: VisitFlowMetric[] = [
        { factKey: 'LVEF', label: 'LVEF', unit: '%', kind: 'measure', stale: false, entered: false, evaluated: false },
      ]
      for (const [key, label, unit] of [
        ['oxygenSaturation', 'SpO₂', '%'],
        ['bodyHeight', isEnglish ? 'Height' : '身高', 'cm'],
      ] as const) {
        const entry = surface.clinicVitals?.entries?.[key as ClinicVitalsEntryKey]
        extras.push({
          factKey: key,
          label,
          unit,
          ...(entry ? { value: String(entry.value) } : {}),
          ...(entry?.measuredOn ? { date: entry.measuredOn } : {}),
          kind: 'measure',
          stale: false,
          entered: Boolean(entry),
          evaluated: false,
        })
      }
      return extras
    },
    // The BMI a titration reads is derived from the height and the weight; the
    // height tile is where a reader looks for it, so that is where it goes.
    deriveTile: (metric, metrics, isEnglish) => {
      if (metric.factKey !== 'bodyHeight') return undefined
      const weightMetric = metrics.find((item) => item.factKey === 'bodyWeight')
      const heightMetric = metrics.find((item) => item.factKey === 'bodyHeight')
      const weight = Number.parseFloat(weightMetric?.value ?? '')
      const height = Number.parseFloat(heightMetric?.value ?? '')
      const bmi = Number.isFinite(weight) && weight > 0 && Number.isFinite(height) && height > 0
        ? (weight / (height / 100) ** 2).toFixed(1)
        : undefined
      return {
        label: 'BMI',
        unit: 'kg/m²',
        ...(bmi ? { value: bmi } : {}),
        source: isEnglish ? 'Calculated from height & weight' : '由身高、體重計算',
        title: `${weightMetric?.value ?? '—'} kg (${weightMetric?.date ?? '—'}) / ${heightMetric?.value ?? '—'} cm (${heightMetric?.date ?? '—'})`,
      }
    },
    renderTileExtra: (metric, isEnglish) => (
      metric.factKey === 'LVEF'
        ? <EchoReportButton metric={metric as never} isEnglish={isEnglish} />
        : null
    ),
  },
  carriedFields: (ctx) => {
    const hf = heartFailureState(ctx)
    const { isEnglish, now, clinicVitals, phenotypeAnswer } = ctx
    const carried: CarriedField[] = []
    const push = (label: string, value: string, iso: string | undefined, measuredOn?: string) => {
      const stamp = measuredOn
        ? `${isEnglish ? 'measured' : '量測'} ${formatDay(measuredOn)}`
        : formatStamp(iso, now, isEnglish)
      carried.push({ label, value, date: stamp ?? '' })
    }
    if (hf.suspicionAnswerText) {
      push(
        isEnglish ? 'Suspicion' : '心衰竭懷疑',
        hf.suspicionAnswerText,
        phenotypeAnswer?.modifiedAt?.hfSuspicion,
      )
    }
    const nyha = clinicVitals?.nyhaClass
    if (nyha) {
      push(
        'NYHA',
        nyha.value === NOT_ASSESSED ? (isEnglish ? 'Not assessed' : '未評估') : nyha.value,
        nyha.modifiedAt,
      )
    }
    for (const item of [...VISIT_SYMPTOM_ITEMS, ...VISIT_EXAM_ITEMS]) {
      const answer = clinicVitals?.signAnswers?.[item.term]
      if (!answer) continue
      push(isEnglish ? item.en : item.zh, signText(answer.value, isEnglish), answer.modifiedAt)
    }
    const hfpEfAnswerText = ctx.questions
      .find((question) => question.id === 'hfpef-confirmation')?.answerText
    if (hfpEfAnswerText) {
      push('HFpEF', hfpEfAnswerText, phenotypeAnswer?.modifiedAt?.hfpEfConfirmed)
    }
    const compensation = clinicVitals?.compensationStatus
    if (compensation) {
      push(
        isEnglish ? 'Compensation' : '代償狀態',
        compensation.value === NOT_ASSESSED
          ? (isEnglish ? 'Not assessed' : '未評估')
          : compensation.value === 'decompensated'
            ? (isEnglish ? 'Decompensated' : '失代償')
            : (isEnglish ? 'Compensated' : '代償'),
        compensation.modifiedAt,
      )
    }
    const entryLabels: Readonly<Record<ClinicVitalsEntryKey, { zh: string; en: string; unit: string }>> = {
      systolic: { zh: '收縮壓', en: 'Systolic', unit: 'mmHg' },
      diastolic: { zh: '舒張壓', en: 'Diastolic', unit: 'mmHg' },
      heartRate: { zh: '心率', en: 'Heart rate', unit: 'bpm' },
      oxygenSaturation: { zh: 'SpO₂', en: 'SpO₂', unit: '%' },
      bodyWeight: { zh: '體重', en: 'Weight', unit: 'kg' },
      bodyHeight: { zh: '身高', en: 'Height', unit: 'cm' },
      potassium: { zh: 'K', en: 'K', unit: 'mmol/L' },
      eGFR: { zh: 'eGFR', en: 'eGFR', unit: 'mL/min/1.73m²' },
      sodium: { zh: 'Na', en: 'Na', unit: 'mmol/L' },
      NTproBNP: { zh: 'NT-proBNP', en: 'NT-proBNP', unit: 'pg/mL' },
      hemoglobin: { zh: 'Hb', en: 'Hb', unit: 'g/dL' },
    }
    for (const [key, entry] of Object.entries(clinicVitals?.entries ?? {})) {
      if (!entry) continue
      const meta = entryLabels[key as ClinicVitalsEntryKey]
      push(
        isEnglish ? meta.en : meta.zh,
        `${entry.value} ${meta.unit}`,
        entry.modifiedAt,
        entry.measuredOn,
      )
    }
    return carried
  },
  summary: (ctx, { chartLayout, isEnglish }) => {
    const hf = heartFailureState(ctx)
    const { clinicVitals, phenotypeAnswer, now } = ctx
    const board = hf.board
    const nyha = clinicVitals?.nyhaClass
    const compensation = clinicVitals?.compensationStatus
    const decidableRows = decidableRowsOf(ctx)
    const phenotypeTitle = board.phenotype?.title
    const symptomsText = signItemsText(VISIT_SYMPTOM_ITEMS, clinicVitals, ctx.isEnglish)
    const signsText = signItemsText(VISIT_EXAM_ITEMS, clinicVitals, ctx.isEnglish, true)
    const hfpEfAnswerText = ctx.questions
      .find((question) => question.id === 'hfpef-confirmation')?.answerText
    if (!chartLayout) {
      return buildVisitSummaryText({
        board,
        isEnglish,
        now,
        ...(phenotypeTitle ? { phenotypeTitle } : {}),
        ...(hf.suspicionAnswerText ? { suspicionAnswerText: hf.suspicionAnswerText } : {}),
        ...(phenotypeAnswer?.modifiedAt?.hfSuspicion
          ? { suspicionModifiedAt: phenotypeAnswer.modifiedAt.hfSuspicion }
          : {}),
        nyhaText: nyha
          ? (nyha.value === NOT_ASSESSED ? (isEnglish ? 'not assessed' : '未評估') : `NYHA ${nyha.value}`)
          : (isEnglish ? 'not answered' : '尚未回答'),
        symptomsText: symptomsText ?? (isEnglish ? 'not answered' : '尚未回答'),
        signsText: signsText ?? (isEnglish ? 'not answered' : '尚未回答'),
        ...(hfpEfAnswerText ? { hfpEfText: hfpEfAnswerText } : {}),
        compensationText: compensation
          ? (compensation.value === NOT_ASSESSED
            ? (isEnglish ? 'not assessed' : '未評估')
            : compensation.value === 'decompensated'
              ? (isEnglish ? 'decompensated' : '失代償')
              : (isEnglish ? 'compensated' : '代償'))
          : (isEnglish ? 'not answered' : '尚未回答'),
        ...(entryText(clinicVitals, isEnglish) ? { vitalsText: entryText(clinicVitals, isEnglish)! } : {}),
        decidableRows,
        decidedCount: ctx.decidedCount,
        ...(ctx.followUpNote ? { followUpNote: ctx.followUpNote } : {}),
      })
    }
    const englishPhenotype = phenotypeTitle?.match(/HF(?:imp|mr|p|r)EF/i)?.[0]
      ? `${phenotypeTitle.match(/HF(?:imp|mr|p|r)EF/i)![0]} pathway` : undefined
    return buildVisitSummaryText({
      chartLayout: true,
      board,
      isEnglish: true,
      now,
      ...(englishPhenotype ? { phenotypeTitle: englishPhenotype } : {}),
      suspicionAnswerText: hf.suspicion
        ? (hf.suspected ? 'Yes' : 'No, not suspected at this visit')
        : 'Not assessed',
      ...(phenotypeAnswer?.modifiedAt?.hfSuspicion
        ? { suspicionModifiedAt: phenotypeAnswer.modifiedAt.hfSuspicion }
        : {}),
      nyhaText: nyha && nyha.value !== NOT_ASSESSED ? String(nyha.value) : 'not assessed',
      symptomsText: chartSignsText(VISIT_SYMPTOM_ITEMS, clinicVitals),
      signsText: chartSignsText(VISIT_EXAM_ITEMS, clinicVitals),
      ...(phenotypeAnswer?.hfpEfConfirmed === true
        ? { hfpEfText: 'HFpEF confirmed' }
        : phenotypeAnswer?.hfpEfConfirmed === HFPEF_NOT_CONFIRMED
          ? { hfpEfText: 'HFpEF not confirmed this visit' }
          : {}),
      compensationText: compensation && compensation.value !== NOT_ASSESSED ? compensation.value : 'not assessed',
      ...(entryText(clinicVitals, true) ? { vitalsText: entryText(clinicVitals, true)! } : {}),
      decidableRows: decidableRows.map(row => ({
        ...row,
        moduleName: clinicalModuleLabel(row.recommendation.id, 'en', row.recommendation.id),
      })),
      decidedCount: ctx.decidedCount,
    })
  },
  /**
   * What the record already holds that bears on question 1.
   *
   * Read off the board rather than computed: an LVEF the pack printed and a
   * phenotype card it built are the two clues a clinician uses to decide whether
   * to open the pathway, and neither is a new judgement by the host.
   */
  firstOpenHint: (ctx, question) => {
    if (question.id !== 'hf-suspicion') return undefined
    const hf = heartFailureState(ctx)
    if (hf.suspicion) return undefined
    const board = hf.board
    const clues: string[] = []
    if (board.lvef?.value) {
      clues.push(`LVEF ${board.lvef.value}${board.lvef.date ? `（${formatDay(board.lvef.date)}）` : ''}`)
    }
    if (board.phenotype?.title) clues.push(board.phenotype.title)
    if (clues.length === 0) return undefined
    return ctx.isEnglish
      ? `The record holds ${clues.join(' · ')}, which may help; only you can decide whether to open the heart-failure pathway.`
      : `紀錄有 ${clues.join(' · ')}，可協助判斷；但只有你能決定是否啟動心衰竭路徑。`
  },
  actionCategory: (row, isEnglish) => {
    const safetyAssessment = heartFailureMedicationSafetyAssessment(row.recommendation)
    const safetyHeadline = safetyAssessment
      ? (isEnglish ? safetyAssessment.headlineEn : safetyAssessment.headlineZh)
      : undefined
    if (row.recommendation.id === 'heart-failure-ras-inhibition') {
      return {
        label: isEnglish ? 'ARNI / ACEI / ARB' : 'ARNI／ACEI／ARB',
        headline: safetyHeadline ?? (isEnglish ? 'Assess initiation or optimization.' : '評估建立或最佳化。'),
      }
    }
    if (row.recommendation.id === 'heart-failure-beta-blocker') {
      return {
        label: isEnglish ? 'Beta-blocker' : 'β 阻斷劑',
        headline: safetyHeadline ?? (isEnglish ? 'Assess initiation or optimization.' : '評估建立或最佳化。'),
      }
    }
    if (row.recommendation.id === 'heart-failure-mra') {
      return { label: 'MRA', headline: safetyHeadline ?? (isEnglish ? 'Assess initiation.' : '評估啟用。') }
    }
    if (row.recommendation.id === 'heart-failure-sglt2') {
      return {
        label: 'SGLT2i',
        headline: safetyHeadline ?? (isEnglish
          ? 'Continue at the highest tolerated dose with follow-up data.'
          : '依最高耐受劑量與追蹤資料持續治療。'),
      }
    }
    if (row.recommendation.id === 'heart-failure-congestion-diuretic') {
      return {
        label: isEnglish ? 'Loop diuretic' : 'Loop 利尿劑',
        headline: isEnglish
          ? 'When congestion signs or symptoms are present, adjust to volume status.'
          : '有鬱血症狀或徵象時，依容量狀態調整。',
      }
    }
    return undefined
  },
  rowBanner: (row, group, isEnglish) => {
    const moduleId = row.recommendation.id
    const pillarRows = group.id === 'actionable'
      ? group.rows.filter((item) => PILLAR_MODULE_IDS.includes(item.recommendation.id))
      : []
    const showFourPillars = pillarRows.length === 4
    const decidedPillars = pillarRows.filter((item) => item.decision).length
    return (
      <>
        {showFourPillars && moduleId === pillarRows[0]?.recommendation.id ? (
          <div
            className="flex items-center gap-2 border-y border-violet-200 bg-violet-50/80 px-4 py-1.5 dark:border-violet-500/30 dark:bg-violet-500/10"
            data-testid="cdss-hf-action-subgroup-pillars"
          >
            <span className="text-xs font-bold text-violet-800 dark:text-violet-200">
              {isEnglish ? 'Four pillars of HFrEF' : 'HFrEF 四大支柱'}
            </span>
            <span className="flex gap-1" aria-hidden="true">
              {pillarRows.map((pillar) => (
                <span
                  key={pillar.recommendation.id}
                  className={
                    pillar.decision
                      ? 'h-1.5 w-5 rounded-full bg-violet-600'
                      : 'h-1.5 w-5 rounded-full bg-violet-200 dark:bg-violet-400/30'
                  }
                />
              ))}
            </span>
            <span className="ml-auto text-[11px] tabular-nums text-violet-700 dark:text-violet-300">
              {isEnglish
                ? `${decidedPillars} / 4 decided`
                : `已決定 ${decidedPillars} / 4`}
            </span>
          </div>
        ) : null}
        {moduleId === 'heart-failure-congestion-diuretic' ? (
          <div
            className="border-y border-border bg-muted/25 px-4 py-1.5 text-xs font-semibold text-muted-foreground"
            data-testid="cdss-hf-action-subgroup-symptom-control"
          >
            {isEnglish ? 'Symptom control' : '症狀控制'}
          </div>
        ) : null}
      </>
    )
  },
  rowClassName: (row, group) => {
    if (group.id !== 'actionable') return undefined
    const pillarRows = group.rows.filter((item) => PILLAR_MODULE_IDS.includes(item.recommendation.id))
    if (pillarRows.length !== 4) return undefined
    return PILLAR_MODULE_IDS.includes(row.recommendation.id)
      ? 'bg-violet-50/20 dark:bg-violet-500/[0.03]'
      : undefined
  },
  steps: [
    {
      id: 'confirm',
      label: (isEnglish) => (isEnglish ? 'Confirm heart failure' : '確認心衰竭'),
      // ① is done once the clinician has said they suspect heart failure and
      // the LVEF gate the pack raised has an answer. The HFpEF confirmation is
      // not part of it: it reads this visit's symptoms and signs, so it belongs
      // to ② and a step bar that waited for it left ① 「進行中」 for the whole
      // consultation. `na` is the other settled state: a patient this clinician
      // is not asking about.
      derive: (ctx) => {
        const hf = heartFailureState(ctx)
        const phenotypeSettled = hf.suspected
          && (!hf.lvefRequest || Boolean(ctx.phenotypeAnswer?.choice))
        const state: VisitStepState = hf.notSuspected
          ? 'na'
          : phenotypeSettled
            ? 'done'
            : 'current'
        const board = hf.board
        const detail = hf.establishedHfrEF
          ? [
            'HFrEF',
            board.lvef?.value ? `LVEF ${board.lvef.value}` : undefined,
            ctx.isEnglish ? 'established HF diagnosis in record' : '病歷已有心衰竭診斷',
          ].filter(Boolean).join(' · ')
          : hf.notSuspected
          ? (ctx.isEnglish ? 'Not suspected this visit' : '本次不懷疑')
          : hf.suspected
            ? [ctx.isEnglish ? 'Yes' : '是', board.phenotype?.title, board.lvef?.value ? `LVEF ${board.lvef.value}` : undefined]
              .filter(Boolean).join(' · ')
            : (ctx.isEnglish ? 'Not answered' : '尚未回答')
        return { state, detail }
      },
    },
    {
      id: 'assess',
      label: (isEnglish) => (isEnglish ? "This visit's assessment" : '本次評估'),
      derive: (ctx) => {
        const hf = heartFailureState(ctx)
        const assessDone = hf.suspected && ctx.openQuestionCount === 0
        const state: VisitStepState = hf.notSuspected
          ? 'na'
          : !hf.suspected
            ? 'todo'
            : assessDone
              ? 'done'
              : 'current'
        const detail = hf.notSuspected
          ? (ctx.isEnglish ? 'Skipped' : '已略過')
          : !hf.suspected
            ? (ctx.isEnglish ? 'Opens after 「yes」' : '答「是」後開放')
            : assessDone
              ? (ctx.isEnglish ? `${ctx.answeredQuestionCount} answered` : `${ctx.countedQuestions.length} 題已答`)
              : (ctx.isEnglish ? `${ctx.openQuestionCount} left` : `還有 ${ctx.openQuestionCount} 題`)
        return { state, detail }
      },
    },
    {
      id: 'act',
      label: (isEnglish) => (isEnglish ? "Today's actions" : '今日處置'),
      // There is something to decide from the moment a row carries a decision —
      // a safety alert is decidable before anyone has answered question 1 — so
      // this step is 「進行中」 whenever a row is still undecided.
      derive: (ctx) => {
        const hf = heartFailureState(ctx)
        const actDone = ctx.decidableCount > 0 && ctx.decidedCount === ctx.decidableCount
        const state: VisitStepState = ctx.decidableCount === 0
          ? (hf.suspicion ? 'done' : 'todo')
          : actDone
            ? 'done'
            : 'current'
        const safetyCount = ctx.actionGroups.find((group) => group.id === 'safety')?.rows.length ?? 0
        const detail = ctx.decidableCount === 0
          ? (hf.suspicion
            ? (ctx.isEnglish ? 'Nothing to decide' : '本次無需處理')
            : (ctx.isEnglish ? 'Waiting on question 1' : '等待第 1 題'))
          : actDone
            ? (ctx.isEnglish ? `${ctx.decidedCount} decided` : `${ctx.decidedCount} 項已決定`)
            : [
              ctx.isEnglish ? `${ctx.decidableCount} recommendations` : `${ctx.decidableCount} 項建議`,
              safetyCount > 0
                ? (ctx.isEnglish ? `${safetyCount} safety alerts` : `${safetyCount} 項安全警訊`)
                : undefined,
            ].filter(Boolean).join(' · ')
        return { state, detail }
      },
    },
    {
      id: 'record',
      label: (isEnglish) => (isEnglish ? 'Record and follow-up' : '紀錄與追蹤'),
      derive: (ctx) => {
        const hf = heartFailureState(ctx)
        const actDone = ctx.decidableCount > 0 && ctx.decidedCount === ctx.decidableCount
        const assessDone = hf.suspected && ctx.openQuestionCount === 0
        const phenotypeSettled = hf.suspected
          && (!hf.lvefRequest || Boolean(ctx.phenotypeAnswer?.choice))
        const confirmState: VisitStepState = hf.notSuspected
          ? 'na'
          : phenotypeSettled ? 'done' : 'current'
        const everythingDone = actDone && assessDone && confirmState !== 'current'
        return {
          state: everythingDone ? 'current' : 'todo',
          detail: everythingDone
            ? [ctx.isEnglish ? 'Copy the summary' : '複製摘要', ctx.followUpNote].filter(Boolean).join(' · ')
            : (ctx.isEnglish ? 'Copy the summary once answered' : '答完後可複製摘要'),
        }
      },
    },
  ],
}
