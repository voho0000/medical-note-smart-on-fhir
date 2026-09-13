"use client"

import {
  LIPID_RISK_FACTOR_IDS,
  type LipidRiskFactorId,
} from '@voho0000/personalized-care'
import { cn } from '@/src/shared/utils/cn.utils'
import { diagnosticSummaryOf, physicianInputRequestsOf } from '../physician-input-contract'
import type { PhysicianInputRequest } from '../physician-input-contract'
import type { CdssFact, CdssRecommendation } from '../types'
import type { ClinicVitalsEntryKey } from '../stores/clinic-vitals.store'
import type { PhysicianDecision } from '../stores/physician-decisions.store'
import { NOT_ASSESSED, type VisitItemAnswerValue } from '../stores/visit-answers.store'
import { ClinicVitalsForm } from '../renderers/ClinicVitalsForm'
import { DiagnosisReading } from '../renderers/DiagnosisReading'
import { decisionLabel, formatDay, formatStamp } from './build-visit-flow'
import { ItemRows } from './controls/ItemRows'
import { SegmentedControl } from './controls/SegmentedControl'
import type {
  CarriedField,
  VisitDecisionKind,
  VisitDecisionReason,
  VisitFlowContext,
  VisitFlowDiseaseConfig,
  VisitFollowUpLine,
  VisitItem,
  VisitItemTag,
  VisitQuestionSpec,
  VisitStepState,
} from './types'

export const DYSLIPIDEMIA_VISIT_FLOW_PACK_ID = 'hyperlipidemia-cdss'

const RISK_MODULE_ID = 'dyslipidemia-risk-and-target'
const THERAPY_MODULE_ID = 'dyslipidemia-lipid-lowering-therapy'
const SEVERE_LDL_MODULE_ID = 'dyslipidemia-severe-ldl'
const SEVERE_TG_MODULE_ID = 'dyslipidemia-severe-triglycerides'
const MONITORING_MODULE_ID = 'dyslipidemia-monitoring-and-markers'

/* -------------------------------------------------------------- 標記三色 */

/**
 * Which rulebook asks for an item.
 *
 * Two independent lists run down this screen — the guideline's risk factors
 * and 健保 表一's — and they do not contain the same things. A clinician
 * answering eight rows has to know which answer moves the guideline target and
 * which moves the coverage tier, so every row carries the tag of the rulebook
 * that asks it. The wording is this file's; the thresholds behind it are the
 * pack's.
 */
const ITEM_TAGS: readonly VisitItemTag[] = [
  {
    id: 'nhi',
    tagZh: '健',
    tagEn: 'N',
    legendZh: '健保 = 健保表一計入的風險因子',
    legendEn: 'N = counted by NHI Table 1',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200',
  },
  {
    id: 'guideline',
    tagZh: '指',
    tagEn: 'G',
    legendZh: '指引 = 僅指引風險分級使用',
    legendEn: 'G = guideline risk category only',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
  },
  {
    id: 'both',
    tagZh: '兩',
    tagEn: 'B',
    legendZh: '兩 = 兩邊都讀',
    legendEn: 'B = read by both',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200',
  },
]

/**
 * The eight risk factors no record in this profile can settle, with the tag
 * that says who reads each and whether it opens with the question or folds
 * behind 「更多」.
 *
 * The list and its order are the pack's `LIPID_RISK_FACTOR_IDS`; the labels
 * are the pack's own option labels, read off the request it raised. The short
 * forms, the tags and the two tiers are this screen's.
 */
const RISK_FACTOR_PRESENTATION: Readonly<Record<LipidRiskFactorId, {
  tag: string
  common: boolean
  shortZh: string
  shortEn: string
}>> = {
  smoking: { tag: 'both', common: true, shortZh: '吸菸', shortEn: 'Smoking' },
  'premature-cad-family-history': { tag: 'both', common: true, shortZh: '家族史', shortEn: 'Family history' },
  'metabolic-waist': { tag: 'nhi', common: true, shortZh: '腰圍', shortEn: 'Waist' },
  acs: { tag: 'both', common: true, shortZh: 'ACS', shortEn: 'ACS' },
  revascularization: { tag: 'both', common: true, shortZh: '血管再通術', shortEn: 'Revascularization' },
  'symptomatic-pad': { tag: 'guideline', common: false, shortZh: 'PAD', shortEn: 'PAD' },
  'multiple-mi': { tag: 'both', common: false, shortZh: '≥2 次 MI', shortEn: '≥2 MIs' },
  'cac-400': { tag: 'nhi', common: false, shortZh: 'CAC ≥400', shortEn: 'CAC ≥400' },
}

/** The two rows 嚴重高膽固醇核對 asks, in the order the pack asks them. */
const SEVERE_LDL_PRESENTATION: Readonly<Record<string, { shortZh: string; shortEn: string }>> = {
  'secondary-causes-excluded': { shortZh: '已排除次發性原因', shortEn: 'Secondary causes excluded' },
  'fh-suspicion': { shortZh: 'FH 疑慮', shortEn: 'FH suspected' },
}

function itemsFromRequest(
  request: PhysicianInputRequest,
  present: Readonly<Record<string, { tag?: string; common?: boolean; shortZh: string; shortEn: string }>>,
): readonly VisitItem[] {
  return (request.options ?? []).map((option) => {
    const meta = present[option.id]
    return {
      term: option.id,
      zh: option.label,
      en: option.label,
      shortZh: meta?.shortZh ?? option.label,
      shortEn: meta?.shortEn ?? option.label,
      side: meta?.tag ?? 'both',
      common: meta?.common ?? true,
    }
  })
}

/* ------------------------------------------------------------- pack reads */

function requestOf(
  recommendation: CdssRecommendation | undefined,
  kind: PhysicianInputRequest['kind'],
): PhysicianInputRequest | undefined {
  if (!recommendation) return undefined
  return physicianInputRequestsOf(recommendation).find((request) => request.kind === kind)
}

function riskFactorsRequest(ctx: VisitFlowContext): PhysicianInputRequest | undefined {
  return requestOf(ctx.byId.get(RISK_MODULE_ID), 'lipid-risk-factors')
}

function statinToleranceRequest(ctx: VisitFlowContext): PhysicianInputRequest | undefined {
  return requestOf(ctx.byId.get(THERAPY_MODULE_ID), 'statin-tolerance')
}

function severeLdlRequest(ctx: VisitFlowContext): PhysicianInputRequest | undefined {
  return requestOf(ctx.byId.get(SEVERE_LDL_MODULE_ID), 'severe-ldl-workup')
}

/* ------------------------------------------------------------- numbering */

/**
 * A question's number, counted over the questions this patient is actually
 * asked.
 *
 * Two of the four appear only where the pack raised them, and a number that
 * stayed put would leave a card headed 「3」 under one headed 「1」. So the
 * numbers are positions in the list this visit shows, and they close up.
 */
function questionNumber(ctx: VisitFlowContext, id: string): string {
  const shown = QUESTION_ORDER.filter((spec) => spec.appliesWhen?.(ctx) ?? true)
  const index = shown.findIndex((spec) => spec.id === id)
  return String(index === -1 ? shown.length + 1 : index + 1)
}

/** 「吸菸：有 · 家族史：無 · 更多 5 項未評估」 — one folded line. */
function itemsAnswerText(
  items: readonly VisitItem[],
  answered: Readonly<Record<string, VisitItemAnswerValue>> | undefined,
  isEnglish: boolean,
): string | undefined {
  const value = (term: string) => answered?.[term]
  const lines = items.flatMap((item) => {
    const answer = value(item.term)
    if (!answer) return []
    const text = answer === 'present'
      ? (isEnglish ? 'yes' : '有')
      : answer === 'absent'
        ? (isEnglish ? 'no' : '無')
        : (isEnglish ? 'not assessed' : '未評估')
    return [`${isEnglish ? item.shortEn : item.shortZh}${isEnglish ? ': ' : '：'}${text}`]
  })
  if (lines.length === 0) return undefined
  const unanswered = items.filter((item) => !value(item.term)).length
  if (unanswered > 0) {
    lines.push(isEnglish ? `${unanswered} more not assessed` : `更多 ${unanswered} 項未評估`)
  }
  return lines.join(' · ')
}

/** A question is answered once every 常見 row in it has an answer. */
function commonItemsAnswered(
  items: readonly VisitItem[],
  answered: Readonly<Record<string, VisitItemAnswerValue>> | undefined,
): boolean {
  const common = items.filter((item) => item.common)
  return common.length > 0 && common.every((item) => Boolean(answered?.[item.term]))
}

/**
 * 「（2026-09-13 你輸入）」 — where a fact this host wrote came from.
 *
 * Stated inside the sentence rather than attached as a source, the way
 * `apply-clinic-vitals.ts` states 「門診輸入」: a number nobody can trace to a
 * record must say where it came from wherever it is printed, and a fact the
 * clinician typed has no resource to point at.
 */
function physicianNote(day: string, isEnglish: boolean): string {
  if (!day) return ''
  return isEnglish ? ` (${day}, entered by you)` : `（${day} 你輸入）`
}

/* -------------------------------------------------------------- questions */

const QUESTION_ORDER: readonly VisitQuestionSpec[] = [
  {
    id: 'lipid-risk-factors',
    derive: (ctx) => {
      const request = riskFactorsRequest(ctx)
      const answer = ctx.visitAnswers?.['lipid-risk-factors']
      const items = request
        ? itemsFromRequest(request, RISK_FACTOR_PRESENTATION)
        : []
      const answered = commonItemsAnswered(items, answer?.items)
      const text = itemsAnswerText(items, answer?.items, ctx.isEnglish)
      return {
        number: questionNumber(ctx, 'lipid-risk-factors'),
        label: request?.label
          ?? (ctx.isEnglish ? 'Cardiovascular risk factors' : '心血管風險因子逐項核對'),
        state: answered ? 'answered' : 'open',
        ...(answered && text
          ? { answerText: text, ...(answer?.modifiedAt ? { modifiedAt: answer.modifiedAt } : {}) }
          : {}),
        hint: ctx.isEnglish
          ? 'Read by the guideline risk category and by NHI Table 1; the tag says which. 「Not assessed」 writes nothing, and a blank row is not 「no」.'
          : '指引風險分級與健保表一都會讀，標記說明哪一邊；「未評估」不寫入，留白不等於「無」。',
        counted: true,
        items,
        tags: ITEM_TAGS,
        showLegend: true,
      }
    },
    render: ({ question, isEnglish, surface, reopen, collapse }) => {
      if (!question.items || !surface.onSaveVisitAnswers) return null
      const save = surface.onSaveVisitAnswers
      const answers = surface.visitAnswers?.['lipid-risk-factors']?.items
      return (
        <div>
          <ItemRows
            questionId={question.id}
            items={question.items}
            tags={question.tags ?? ITEM_TAGS}
            valueOf={(term) => answers?.[term]}
            isEnglish={isEnglish}
            showLegend={question.showLegend === true}
            onAnswer={(term, next) => {
              reopen()
              save({ questionId: 'lipid-risk-factors', items: { [term]: next as VisitItemAnswerValue } })
            }}
            testIdPrefix="cdss-lipid"
            notAssessedValue={NOT_ASSESSED}
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
    },
    /**
     * 每個已答項目一個 `<id>:present` 或 `<id>:absent`；未評估與未答的 id 不
     * 出現，因為 pack 讀不到的 id 就是沒問過的 id。
     */
    toFacts: (answer, { isEnglish }): Record<string, CdssFact> => {
      const items = answer?.items ?? {}
      const matchedTerms = LIPID_RISK_FACTOR_IDS.flatMap((id) => {
        const value = items[id]
        return value === 'present' || value === 'absent' ? [`${id}:${value}`] : []
      })
      if (matchedTerms.length === 0) return {}
      const day = (answer?.modifiedAt ?? '').slice(0, 10)
      const spoken = LIPID_RISK_FACTOR_IDS.flatMap((id) => {
        const value = items[id]
        if (value !== 'present' && value !== 'absent') return []
        const meta = RISK_FACTOR_PRESENTATION[id]
        const label = isEnglish ? meta.shortEn : meta.shortZh
        return [`${label} ${value === 'present' ? (isEnglish ? 'yes' : '有') : (isEnglish ? 'no' : '無')}`]
      })
      return {
        physicianLipidRiskFactors: {
          zh: `醫師核對心血管風險因子：${spoken.join(' · ')}${physicianNote(day, false)}`,
          en: `Cardiovascular risk factors checked by the clinician: ${spoken.join(' · ')}${physicianNote(day, true)}`,
          ...(day ? { date: day } : {}),
          textEvidence: {
            // 有和無各自是答案，整份核對本身不指向任何方向。
            direction: 'unknown',
            matchedTerms,
          },
        } satisfies CdssFact,
      }
    },
  },
  {
    id: 'statin-tolerance',
    appliesWhen: (ctx) => Boolean(statinToleranceRequest(ctx)),
    derive: (ctx) => {
      const request = statinToleranceRequest(ctx)!
      const answer = ctx.visitAnswers?.['statin-tolerance']
      const value = answer?.value
      const label = request.options?.find((option) => option.id === value)?.label
      return {
        number: questionNumber(ctx, 'statin-tolerance'),
        label: request.label,
        state: value ? 'answered' : 'open',
        ...(value
          ? {
            answerText: value === NOT_ASSESSED
              ? (ctx.isEnglish ? 'Not assessed' : '未評估')
              : label ?? value,
            ...(answer?.modifiedAt ? { modifiedAt: answer.modifiedAt } : {}),
          }
          : {}),
        counted: true,
        request,
        recommendationId: THERAPY_MODULE_ID,
        inlineControl: true,
      }
    },
    render: ({ question, isEnglish, surface }) => {
      if (!surface.onSaveVisitAnswers || !question.request) return null
      const save = surface.onSaveVisitAnswers
      const options = [
        ...(question.request.options ?? []).map((option) => ({
          id: option.id,
          text: option.label,
        })),
        { id: NOT_ASSESSED, text: isEnglish ? 'Not assessed' : '未評估' },
      ]
      return (
        <SegmentedControl<string>
          label={question.label}
          options={options}
          value={surface.visitAnswers?.['statin-tolerance']?.value ?? null}
          onSelect={(next) => save({ questionId: 'statin-tolerance', value: next })}
          testId="cdss-lipid-flow-statin-tolerance"
        />
      )
    },
    /**
     * 「可耐受」與每一種不耐受都是答案，各寫各的 fact；「未評估」什麼都不寫。
     */
    toFacts: (answer, { isEnglish }): Record<string, CdssFact> => {
      const value = answer?.value
      if (!value || value === NOT_ASSESSED) return {}
      const day = (answer?.modifiedAt ?? '').slice(0, 10)
      const source = day ? { date: day } : {}
      if (value === 'tolerated') {
        return {
          physicianStatinTolerated: {
            zh: `醫師確認：statin 可耐受${physicianNote(day, false)}`,
            en: `Clinician confirmed: statin tolerated${physicianNote(day, true)}`,
            ...source,
            textEvidence: { direction: 'supports', matchedTerms: ['tolerated'] },
          } satisfies CdssFact,
        }
      }
      if (value !== 'muscle-symptoms' && value !== 'liver-dysfunction' && value !== 'other') return {}
      const spoken = value === 'muscle-symptoms'
        ? (isEnglish ? 'muscle symptoms' : '肌肉症狀')
        : value === 'liver-dysfunction'
          ? (isEnglish ? 'liver dysfunction' : '肝功能異常')
          : (isEnglish ? 'another reason' : '其他原因')
      return {
        physicianStatinIntolerance: {
          zh: `醫師記錄 statin 不耐受：${spoken}${physicianNote(day, false)}`,
          en: `Clinician recorded statin intolerance: ${spoken}${physicianNote(day, true)}`,
          ...source,
          textEvidence: { direction: 'supports', matchedTerms: [value] },
        } satisfies CdssFact,
      }
    },
  },
  {
    id: 'severe-ldl-workup',
    appliesWhen: (ctx) => Boolean(severeLdlRequest(ctx)),
    derive: (ctx) => {
      const request = severeLdlRequest(ctx)!
      const answer = ctx.visitAnswers?.['severe-ldl-workup']
      const items = itemsFromRequest(request, SEVERE_LDL_PRESENTATION)
      const answered = commonItemsAnswered(items, answer?.items)
      const text = itemsAnswerText(items, answer?.items, ctx.isEnglish)
      return {
        number: questionNumber(ctx, 'severe-ldl-workup'),
        label: request.label,
        state: answered ? 'answered' : 'open',
        ...(answered && text
          ? { answerText: text, ...(answer?.modifiedAt ? { modifiedAt: answer.modifiedAt } : {}) }
          : {}),
        counted: true,
        items,
        tags: ITEM_TAGS,
        showLegend: false,
      }
    },
    render: ({ question, isEnglish, surface, reopen, collapse }) => {
      if (!question.items || !surface.onSaveVisitAnswers) return null
      const save = surface.onSaveVisitAnswers
      const answers = surface.visitAnswers?.['severe-ldl-workup']?.items
      return (
        <div>
          <ItemRows
            questionId={question.id}
            items={question.items}
            tags={question.tags ?? ITEM_TAGS}
            valueOf={(term) => answers?.[term]}
            isEnglish={isEnglish}
            showLegend={false}
            onAnswer={(term, next) => {
              reopen()
              save({ questionId: 'severe-ldl-workup', items: { [term]: next as VisitItemAnswerValue } })
            }}
            testIdPrefix="cdss-lipid"
            notAssessedValue={NOT_ASSESSED}
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
    },
    /**
     * 次發性原因只有「有＝已排除」才寫；FH 疑慮有與無各寫一個 term，因為
     * 「一等親沒有」跟「沒問」對級聯篩檢是兩回事。
     */
    toFacts: (answer): Record<string, CdssFact> => {
      const items = answer?.items ?? {}
      const day = (answer?.modifiedAt ?? '').slice(0, 10)
      const source = day ? { date: day } : {}
      const facts: Record<string, CdssFact> = {}
      if (items['secondary-causes-excluded'] === 'present') {
        facts.physicianSecondaryCausesExcluded = {
          zh: `醫師確認：已排除次發性原因（甲狀腺、腎病、肝病、藥物）${physicianNote(day, false)}`,
          en: `Clinician confirmed: secondary causes excluded (thyroid, kidney, liver, medications)${physicianNote(day, true)}`,
          ...source,
          textEvidence: { direction: 'supports', matchedTerms: ['excluded'] },
        }
      }
      const fh = items['fh-suspicion']
      if (fh === 'present' || fh === 'absent') {
        facts.physicianFhSuspicion = {
          zh: `醫師核對：一等親高膽固醇或早發 ASCVD ${fh === 'present' ? '有' : '無'}${physicianNote(day, false)}`,
          en: fh === 'present'
            ? `Clinician checked: high cholesterol or premature ASCVD in a first-degree relative${physicianNote(day, true)}`
            : `Clinician checked: no high cholesterol or premature ASCVD in a first-degree relative${physicianNote(day, true)}`,
          ...source,
          textEvidence: { direction: fh === 'present' ? 'supports' : 'against', matchedTerms: [fh] },
        }
      }
      return facts
    },
  },
  {
    id: 'clinic-vitals',
    derive: (ctx) => {
      const entries = ctx.clinicVitals?.entries
      const systolic = entries?.systolic
      const diastolic = entries?.diastolic
      const weight = entries?.bodyWeight
      const height = entries?.bodyHeight
      const parts = [
        systolic && diastolic ? `${systolic.value}/${diastolic.value} mmHg` : undefined,
        weight ? `${weight.value} kg` : undefined,
        height ? `${height.value} cm` : undefined,
      ].filter(Boolean) as string[]
      const stamp = [systolic?.modifiedAt, diastolic?.modifiedAt, weight?.modifiedAt, height?.modifiedAt]
        .filter((value): value is string => Boolean(value)).sort().at(-1)
      return {
        number: questionNumber(ctx, 'clinic-vitals'),
        label: ctx.isEnglish ? 'Measured in clinic today' : '今日門診量測',
        state: parts.length > 0 ? 'answered' : 'open',
        ...(parts.length > 0
          ? { answerText: parts.join(' · '), ...(stamp ? { modifiedAt: stamp } : {}) }
          : {}),
        hint: ctx.isEnglish
          ? 'The blood pressure the risk module reads, and the height and weight behind a waist judgement. Nothing is written back to the chart.'
          : '風險模組會讀這裡的血壓；身高體重供腰圍判斷參考。不寫回病歷。',
        counted: true,
      }
    },
    render: ({ isEnglish, now, surface, collapse }) => (
      surface.onSaveClinicVitals ? (
        <ClinicVitalsForm
          isEnglish={isEnglish}
          now={now}
          {...(surface.clinicVitals ? { initial: surface.clinicVitals } : {})}
          fields={LIPID_CLINIC_FIELDS}
          testIdPrefix="cdss-lipid"
          onSave={surface.onSaveClinicVitals}
          onClose={collapse}
          footnote={isEnglish
            ? 'Encrypted and kept for this tab session; every module recomputes from it.'
            : '加密保存於本分頁的工作階段；各模組會依此重新判定。'}
        />
      ) : null
    ),
  },
]

const LIPID_CLINIC_FIELDS: readonly ClinicVitalsEntryKey[] = [
  'systolic',
  'diastolic',
  'bodyWeight',
  'bodyHeight',
]

/* --------------------------------------------------------------- 決定理由 */

export const DYSLIPIDEMIA_DECISION_REASONS: readonly VisitDecisionReason[] = [
  // 禁忌
  { id: 'statin-muscle-symptoms', zh: '肌肉症狀', en: 'Muscle symptoms' },
  { id: 'liver-dysfunction', zh: '肝功能異常', en: 'Liver dysfunction' },
  { id: 'pregnancy-or-lactation', zh: '懷孕或哺乳', en: 'Pregnancy or lactation' },
  { id: 'drug-interaction', zh: '藥物交互作用', en: 'Drug interaction' },
  // 暫緩
  { id: 'awaiting-repeat-lipids', zh: '等待複驗血脂', en: 'Awaiting a repeat lipid panel' },
  { id: 'lifestyle-first', zh: '先生活型態調整', en: 'Lifestyle change first' },
  { id: 'secondary-cause-workup', zh: '先查次發性原因', en: 'Secondary-cause work-up first' },
  { id: 'nhi-window-not-met', zh: '健保時程未滿', en: 'NHI interval not yet met' },
  { id: 'specialist-referral', zh: '已轉介脂質專科', en: 'Referred to a lipid specialist' },
  // 病人意願
  { id: 'declined-medication', zh: '拒絕用藥', en: 'Declined the medication' },
  { id: 'cost', zh: '費用考量', en: 'Cost' },
  // 檢驗列暫緩
  { id: 'recent-result-elsewhere', zh: '近期他院已驗', en: 'Recently tested elsewhere' },
  { id: 'other', zh: '其他', en: 'Other' },
]

function decisionReasonIds(
  moduleId: string,
  decisionKind: VisitDecisionKind,
  decision: PhysicianDecision['decision'] | undefined,
): readonly string[] {
  if (decisionKind === 'test') {
    return ['recent-result-elsewhere', 'awaiting-repeat-lipids', 'other']
  }
  if (decision === 'contraindicated') {
    return [
      'statin-muscle-symptoms',
      'liver-dysfunction',
      'pregnancy-or-lactation',
      'drug-interaction',
      'other',
    ]
  }
  if (decision === 'patient-preference') {
    return ['declined-medication', 'cost', 'other']
  }
  if (moduleId === SEVERE_LDL_MODULE_ID) {
    return ['secondary-cause-workup', 'specialist-referral', 'awaiting-repeat-lipids', 'other']
  }
  return [
    'awaiting-repeat-lipids',
    'lifestyle-first',
    'secondary-cause-workup',
    'nhi-window-not-met',
    'specialist-referral',
    'other',
  ]
}

/* ----------------------------------------------------------- 降脂階梯橫幅 */

const LADDER_STEPS: readonly { factKey: string; zh: string; en: string }[] = [
  { factKey: 'statinTherapy', zh: 'Statin', en: 'Statin' },
  { factKey: 'ezetimibeTherapy', zh: 'Ezetimibe', en: 'Ezetimibe' },
  { factKey: 'pcsk9Therapy', zh: 'PCSK9', en: 'PCSK9' },
]

/** The adapter's fixed wording for a class the patient is taking. */
const TAKING_PATTERN = /^(?:目前用藥中|Currently taking)/

function takingOf(recommendation: CdssRecommendation, factKey: string): boolean {
  const evidence = recommendation.patientEvidence.find((item) => item.factKeys.includes(factKey))
  return Boolean(evidence && TAKING_PATTERN.test(evidence.value))
}

/* ------------------------------------------------------------- 下次檢查 */

function addDays(now: Date, days: number): string {
  const at = new Date(now.getTime() + days * 86_400_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/* ---------------------------------------------------------------- 讀數卡 */

function RiskReading({
  recommendation,
  isEnglish,
}: {
  recommendation?: CdssRecommendation
  isEnglish: boolean
}) {
  const summary = recommendation ? diagnosticSummaryOf(recommendation) : undefined
  if (!summary) return null
  const undetermined = summary.criteria.some((criterion) => criterion.state === 'undetermined')
  return (
    <div className="border-b border-border px-3 py-2" data-testid="cdss-lipid-risk-reading">
      <p className="mb-1 text-[11px] font-semibold text-violet-700 dark:text-secondary-foreground/80">
        {isEnglish ? 'Risk category and goal' : '風險分級與目標'}
      </p>
      <DiagnosisReading summary={summary} isEnglish={isEnglish} showScores={false} />
      {undetermined ? (
        <p
          className="mt-1 text-[11px] leading-4 text-muted-foreground"
          data-testid="cdss-lipid-risk-reading-pending"
        >
          {isEnglish
            ? 'Settled once question 1 is answered.'
            : '答第 1 題後可判定。'}
        </p>
      ) : null}
    </div>
  )
}

/** 「現行降脂藥」: four small tiles, display only — not a pillar checklist. */
function CurrentTherapyRow({
  recommendation,
  isEnglish,
}: {
  recommendation?: CdssRecommendation
  isEnglish: boolean
}) {
  if (!recommendation) return null
  const tiles: readonly { factKey: string; label: string }[] = [
    { factKey: 'statinTherapy', label: 'Statin' },
    { factKey: 'ezetimibeTherapy', label: 'Ezetimibe' },
    { factKey: 'pcsk9Therapy', label: isEnglish ? 'PCSK9 inhibitor' : 'PCSK9 抑制劑' },
    { factKey: 'bempedoicAcidTherapy', label: 'Bempedoic acid' },
  ]
  return (
    <div data-testid="cdss-lipid-current-therapy">
      <p className="border-b border-border bg-muted/20 px-3 py-1 text-[11px] font-medium text-muted-foreground">
        {isEnglish ? 'Lipid-lowering medication on record' : '現行降脂藥'}
      </p>
      <div className="grid grid-cols-2 @min-[32rem]:grid-cols-4">
        {tiles.map((tile) => {
          const evidence = recommendation.patientEvidence
            .find((item) => item.factKeys.includes(tile.factKey))
          const taking = Boolean(evidence && TAKING_PATTERN.test(evidence.value))
          const date = (evidence?.sources ?? [])
            .map((source) => source.date)
            .filter((value): value is string => Boolean(value))
            .sort()[0]
          return (
            <div
              key={tile.factKey}
              className="min-w-0 border-b border-r border-border/60 px-3 py-1.5"
              data-testid={`cdss-lipid-therapy-tile-${tile.factKey}`}
              data-taking={taking ? 'true' : undefined}
              title={evidence?.value}
            >
              <div className="truncate text-[11px] font-medium leading-4 text-muted-foreground">
                {tile.label}
              </div>
              <div className={cn(
                'truncate text-xs leading-5',
                taking ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}>
                {taking
                  ? (evidence?.value.replace(TAKING_PATTERN, '').replace(/^[：:]\s*/, '').trim() || tile.label)
                  : (isEnglish ? 'No prescription' : '無處方')}
              </div>
              {taking && date ? (
                <div className="truncate text-[11px] leading-4 tabular-nums text-muted-foreground">
                  {isEnglish ? `earliest seen ${formatDay(date)}` : `最早可見處方 ${formatDay(date)}`}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- the config */

export const DYSLIPIDEMIA_VISIT_FLOW_CONFIG: VisitFlowDiseaseConfig = {
  packId: DYSLIPIDEMIA_VISIT_FLOW_PACK_ID,
  testIdPrefix: 'cdss-lipid',
  questions: QUESTION_ORDER,
  // The risk module is not a row: question 1 answers it, and the reading above
  // the questions prints its two criteria in full.
  consumedModuleIds: [RISK_MODULE_ID],
  leadingModuleIds: [THERAPY_MODULE_ID],
  decisionRules: {
    [THERAPY_MODULE_ID]: { kind: 'medication' },
    [SEVERE_LDL_MODULE_ID]: { kind: 'review' },
    [SEVERE_TG_MODULE_ID]: { kind: 'medication' },
    [MONITORING_MODULE_ID]: { kind: 'test' },
  },
  defaultDecisionKind: (recommendation, group) => {
    if (group === 'no-action') return 'none'
    if (group === 'needs-data') return 'test'
    if (recommendation.domain === 'medication') return 'medication'
    return 'review'
  },
  decisionReasons: DYSLIPIDEMIA_DECISION_REASONS,
  decisionReasonIds,
  coverageLine: true,
  // The lipid pack's semantic policy moves an item a clinician has to judge
  // out of `missingData` into `clinicalReviewItems`; a row that read only the
  // first would print nothing while the card below it listed two checks.
  readsClinicalReviewItems: true,
  recordCard: {
    headlineFactKey: 'LDL',
    order: [
      'LDL', 'nonHDL', 'HDL', 'triglycerides', 'totalCholesterol',
      'apolipoproteinB', 'lipoproteinA', 'eGFR', 'HbA1c', 'bloodPressure',
    ],
    columnsClass: 'grid grid-cols-2 @min-[24rem]:grid-cols-3 @min-[32rem]:grid-cols-5 @min-[40rem]:grid-cols-[11rem_repeat(5,minmax(0,1fr))]',
    // A record with no LDL-C at all still needs the tile: it is the number
    // every target on this screen is read against, and 「紀錄無值」 is what a
    // clinician holding today's report came here to fix.
    extraMetrics: () => [
      { factKey: 'LDL', label: 'LDL-C', unit: 'mg/dL', kind: 'lab', stale: false, entered: false, evaluated: false },
    ],
    // non-HDL-C is the one number on this panel nobody orders: it is TC minus
    // HDL-C on the same day, so a blank tile says how to get it rather than
    // asking for a test that does not exist.
    deriveTile: (metric, metrics, isEnglish) => {
      void metrics
      if (metric.factKey !== 'nonHDL' || metric.value !== undefined) return undefined
      return {
        label: metric.label,
        ...(metric.unit ? { unit: metric.unit } : {}),
        source: isEnglish
          ? 'Derivable from the same-day TC and HDL-C'
          : '同日 TC 與 HDL-C 可算出',
      }
    },
  },
  recordSecondRow: ({ surface, isEnglish }) => (
    <CurrentTherapyRow
      recommendation={surface.recommendationById(THERAPY_MODULE_ID)}
      isEnglish={isEnglish}
    />
  ),
  questionsNote: ({ surface, isEnglish }) => (
    <RiskReading recommendation={surface.recommendationById(RISK_MODULE_ID)} isEnglish={isEnglish} />
  ),
  // 「降脂階梯」 sits where heart failure's four pillars do, and says the same
  // kind of thing: which step of statin → ezetimibe → PCSK9 the record already
  // holds. Display only — the decision is on the row below it.
  rowBanner: (row, group, isEnglish) => {
    if (row.recommendation.id !== THERAPY_MODULE_ID) return null
    void group
    return (
      <div
        className="flex items-center gap-2 border-y border-violet-200 bg-violet-50/80 px-4 py-1.5 dark:border-violet-500/30 dark:bg-violet-500/10"
        data-testid="cdss-lipid-action-subgroup-ladder"
      >
        <span className="text-xs font-bold text-violet-800 dark:text-violet-200">
          {isEnglish ? 'Lipid-lowering ladder' : '降脂階梯'}
        </span>
        <span className="flex items-center gap-1">
          {LADDER_STEPS.map((step, index) => (
            <span key={step.factKey} className="flex items-center gap-1">
              {index > 0 ? (
                <span className="text-[10px] text-violet-500 dark:text-violet-400" aria-hidden="true">→</span>
              ) : null}
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-1.5 text-[10px] font-medium leading-4',
                  takingOf(row.recommendation, step.factKey)
                    ? 'bg-violet-600 text-white dark:bg-violet-500'
                    : 'bg-violet-200 text-violet-800 dark:bg-violet-400/30 dark:text-violet-100',
                )}
                data-testid={`cdss-lipid-ladder-${step.factKey}`}
                data-taking={takingOf(row.recommendation, step.factKey) ? 'true' : undefined}
              >
                {isEnglish ? step.en : step.zh}
              </span>
            </span>
          ))}
        </span>
      </div>
    )
  },
  carriedFields: (ctx) => {
    const { isEnglish, now, visitAnswers, clinicVitals } = ctx
    const carried: CarriedField[] = []
    const push = (label: string, value: string, iso: string | undefined, measuredOn?: string) => {
      const stamp = measuredOn
        ? `${isEnglish ? 'measured' : '量測'} ${formatDay(measuredOn)}`
        : formatStamp(iso, now, isEnglish)
      carried.push({ label, value, date: stamp ?? '' })
    }
    const answerText = (value: VisitItemAnswerValue) => (
      value === 'present'
        ? (isEnglish ? 'yes' : '有')
        : value === 'absent'
          ? (isEnglish ? 'no' : '無')
          : (isEnglish ? 'not assessed' : '未評估')
    )
    const riskAnswer = visitAnswers?.['lipid-risk-factors']
    const riskItems = ctx.questions.find((question) => question.id === 'lipid-risk-factors')?.items ?? []
    for (const item of riskItems) {
      const value = riskAnswer?.items?.[item.term]
      if (!value) continue
      push(isEnglish ? item.en : item.zh, answerText(value), riskAnswer?.modifiedAt)
    }
    const toleranceQuestion = ctx.questions.find((question) => question.id === 'statin-tolerance')
    if (toleranceQuestion?.answerText) {
      push(
        isEnglish ? 'Statin tolerance' : 'Statin 耐受性',
        toleranceQuestion.answerText,
        visitAnswers?.['statin-tolerance']?.modifiedAt,
      )
    }
    const workupAnswer = visitAnswers?.['severe-ldl-workup']
    const workupItems = ctx.questions.find((question) => question.id === 'severe-ldl-workup')?.items ?? []
    for (const item of workupItems) {
      const value = workupAnswer?.items?.[item.term]
      if (!value) continue
      push(isEnglish ? item.en : item.zh, answerText(value), workupAnswer?.modifiedAt)
    }
    const entryLabels: Partial<Record<ClinicVitalsEntryKey, { zh: string; en: string; unit: string }>> = {
      systolic: { zh: '收縮壓', en: 'Systolic', unit: 'mmHg' },
      diastolic: { zh: '舒張壓', en: 'Diastolic', unit: 'mmHg' },
      bodyWeight: { zh: '體重', en: 'Weight', unit: 'kg' },
      bodyHeight: { zh: '身高', en: 'Height', unit: 'cm' },
      LDL: { zh: 'LDL-C', en: 'LDL-C', unit: 'mg/dL' },
      HDL: { zh: 'HDL-C', en: 'HDL-C', unit: 'mg/dL' },
      triglycerides: { zh: 'TG', en: 'TG', unit: 'mg/dL' },
      totalCholesterol: { zh: 'TC', en: 'TC', unit: 'mg/dL' },
      apolipoproteinB: { zh: 'ApoB', en: 'ApoB', unit: 'mg/dL' },
      lipoproteinA: { zh: 'Lp(a)', en: 'Lp(a)', unit: 'nmol/L' },
    }
    for (const [key, entry] of Object.entries(clinicVitals?.entries ?? {})) {
      const meta = entryLabels[key as ClinicVitalsEntryKey]
      if (!entry || !meta) continue
      push(isEnglish ? meta.en : meta.zh, `${entry.value} ${meta.unit}`, entry.modifiedAt, entry.measuredOn)
    }
    return carried
  },
  /**
   * 四段：分級與目標／本次答案／今日決定／追蹤。
   *
   * 每一句臨床字都是畫面上已經印過的：分級與目標是 pack 的 `diagnosticSummary`，
   * 決定句是 pack 的 `nextActions[0]`，處置字是 host 的決定字典。
   */
  summary: (ctx, { chartLayout, isEnglish }) => {
    const risk = ctx.byId.get(RISK_MODULE_ID)
    const summary = risk ? diagnosticSummaryOf(risk) : undefined
    const criterionLine = (id: string) => {
      const criterion = summary?.criteria.find((item) => item.id === id)
      if (!criterion) return undefined
      const state = criterion.state === 'met'
        ? (isEnglish ? 'settled' : '已判定')
        : criterion.state === 'refuted'
          ? (isEnglish ? 'contradicted' : '有反證')
          : (isEnglish ? 'undetermined' : '未判定')
      return `${criterion.label}${isEnglish ? ': ' : '：'}${state}${criterion.detail ? ` — ${criterion.detail}` : ''}`
    }
    const ldl = ctx.board.headlineMetric
    const answers = ctx.questions
      .filter((question) => question.answerText)
      .map((question) => `${question.label.replace(/（[^）]*）/g, '').trim()}${isEnglish ? ': ' : '：'}${question.answerText}`)
    const decidableRows = ctx.actionGroups
      .flatMap((group) => group.rows)
      .filter((row) => row.decisionKind !== 'none')
    const decided = decidableRows.flatMap((row) => {
      if (!row.decision) return []
      const details = [
        ...row.decision.reasons.map((reason) => {
          const found = DYSLIPIDEMIA_DECISION_REASONS.find((item) => item.id === reason)
          return found ? (isEnglish ? found.en : found.zh) : reason
        }),
        row.decision.note,
      ].filter((value): value is string => Boolean(value))
      return [`${row.moduleName}${chartLayout ? ': ' : ' '}${decisionLabel(row.decision.decision, isEnglish)}${details.length ? ` (${details.join('; ')})` : ''}`]
    })
    const undecided = decidableRows.length - ctx.decidedCount
    const followUp = (ctx.followUpLines ?? []).map((line) => `${line.label}${isEnglish ? ': ' : '：'}${line.value}`)
    const followUpLines = [
      ...followUp,
      ...(ctx.followUpNote ? [ctx.followUpNote] : []),
    ]

    if (chartLayout) {
      return [
        [
          'Risk and goal',
          criterionLine('guideline-risk-category'),
          criterionLine('nhi-table1-tier'),
          ldl?.value ? `LDL-C ${ldl.value}${ldl.unit ? ` ${ldl.unit}` : ''}${ldl.date ? ` (${formatDay(ldl.date)})` : ''}` : undefined,
        ].filter(Boolean).join('\n'),
        ['This visit', ...(answers.length ? answers.map((line) => `  ${line}`) : ['  Nothing answered'])].join('\n'),
        ['Management', ...(decided.length ? decided.map((line) => `- ${line}`) : ['- No decisions recorded']),
          ...(undecided > 0 ? [`- Pending decisions: ${undecided}`] : []),
        ].join('\n'),
        ['Follow-up', ...(followUpLines.length ? followUpLines.map((line) => `  ${line}`) : ['  Not set this visit'])].join('\n'),
      ].join('\n\n')
    }
    return [
      [criterionLine('guideline-risk-category'), criterionLine('nhi-table1-tier')]
        .filter(Boolean).join(' · ')
        || (isEnglish ? 'Risk category: undetermined' : '風險分級：未判定'),
      answers.length > 0
        ? answers.join(' · ')
        : (isEnglish ? 'Nothing answered this visit' : '本次尚未作答'),
      [
        decided.length > 0
          ? `${isEnglish ? 'Decisions' : '處置'}：${decided.join(isEnglish ? '; ' : '、')}`
          : `${isEnglish ? 'Decisions' : '處置'}：${isEnglish ? 'none recorded' : '尚未記錄'}`,
        undecided > 0
          ? (isEnglish ? `${undecided} still undecided` : `其餘 ${undecided} 項待決定`)
          : undefined,
      ].filter(Boolean).join(' · '),
      followUpLines.length > 0
        ? followUpLines.join(' · ')
        : (isEnglish ? 'Follow-up: not set this visit' : '追蹤：本次未設定'),
    ].join('\n')
  },
  /**
   * 下次血脂檢查，由今天的決定往後算。
   *
   * 治療調整後 4–12 週複驗是 ACC/AHA 2026 §3.5 的區間；健保 2.6 表一的處方
   * 規定另寫 6–8 週，兩條並列而不合併。沒有決定就不印——一個沒有起點的區間
   * 不是一個日期。
   */
  followUp: (ctx) => {
    const therapy = ctx.actionGroups
      .flatMap((group) => group.rows)
      .find((row) => row.recommendation.id === THERAPY_MODULE_ID)
    const decision = therapy?.decision
    if (!decision || therapy?.decisionSource === 'medication-record') return []
    const isEnglish = ctx.isEnglish
    if (decision.decision === 'prescribed' || decision.decision === 'dose-adjusted') {
      const from = decision.recordedAt ? new Date(decision.recordedAt) : ctx.now
      const at = Number.isNaN(from.getTime()) ? ctx.now : from
      const lines: VisitFollowUpLine[] = [{
        id: 'next-lipid-panel',
        label: isEnglish ? 'Next lipid panel' : '下次血脂檢查',
        value: `${addDays(at, 28)} ${isEnglish ? 'to' : '至'} ${addDays(at, 84)}`,
        source: isEnglish
          ? '4–12 weeks after a treatment change, ACC/AHA 2026 §3.5'
          : '治療調整後 4–12 週，ACC/AHA 2026 §3.5',
      }, {
        id: 'nhi-recheck',
        label: isEnglish ? 'NHI' : '健保',
        value: isEnglish
          ? 'Recheck 6–8 weeks after starting or adjusting'
          : '起始或調整後 6–8 週複檢',
        source: isEnglish ? 'NHI 2.6 Table 1, prescribing rules' : '健保 2.6 表一 處方規定',
      }]
      return lines
    }
    if (decision.decision === 'reviewed' || decision.decision === 'follow-up-arranged') {
      return [{
        id: 'next-lipid-panel',
        label: isEnglish ? 'Next lipid panel' : '下次血脂檢查',
        value: isEnglish ? 'Every 6–12 months' : '每 6–12 個月',
        source: isEnglish
          ? 'At goal with no change this visit'
          : '達標且本次未調整治療',
      }]
    }
    return []
  },
  steps: [
    {
      id: 'confirm',
      label: (isEnglish) => (isEnglish ? 'Confirm the risk category' : '確認風險分級'),
      // Two criteria, two rulebooks, and the step is done only when both are
      // settled: a guideline target with an undetermined coverage tier is half
      // an answer, and the screen should say so.
      derive: (ctx) => {
        const risk = ctx.byId.get(RISK_MODULE_ID)
        const summary = risk ? diagnosticSummaryOf(risk) : undefined
        const criteria = summary?.criteria ?? []
        const settled = criteria.length > 0
          && criteria.every((criterion) => criterion.state !== 'undetermined')
        const detail = criteria.length === 0
          ? (ctx.isEnglish ? 'The pack raised no risk reading' : '本次未產生分級讀數')
          : criteria
            .map((criterion) => `${criterion.label}${ctx.isEnglish ? ': ' : '：'}${criterion.state === 'undetermined' ? (ctx.isEnglish ? 'undetermined' : '未判定') : (ctx.isEnglish ? 'settled' : '已判定')}`)
            .join(' · ')
        return { state: settled ? 'done' : 'current', detail }
      },
    },
    {
      id: 'assess',
      label: (isEnglish) => (isEnglish ? "This visit's assessment" : '本次評估'),
      derive: (ctx) => {
        const done = ctx.openQuestionCount === 0
        const state: VisitStepState = done ? 'done' : 'current'
        const detail = done
          ? (ctx.isEnglish ? `${ctx.answeredQuestionCount} answered` : `${ctx.countedQuestions.length} 題已答`)
          : (ctx.isEnglish ? `${ctx.openQuestionCount} left` : `還有 ${ctx.openQuestionCount} 題`)
        return { state, detail }
      },
    },
    {
      id: 'act',
      label: (isEnglish) => (isEnglish ? "Today's actions" : '今日處置'),
      derive: (ctx) => {
        const done = ctx.decidableCount > 0 && ctx.decidedCount === ctx.decidableCount
        const state: VisitStepState = ctx.decidableCount === 0
          ? 'done'
          : done ? 'done' : 'current'
        const safetyCount = ctx.actionGroups.find((group) => group.id === 'safety')?.rows.length ?? 0
        const detail = ctx.decidableCount === 0
          ? (ctx.isEnglish ? 'Nothing to decide' : '本次無需處理')
          : done
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
        const actDone = ctx.decidableCount === 0 || ctx.decidedCount === ctx.decidableCount
        const everythingDone = actDone && ctx.openQuestionCount === 0
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
