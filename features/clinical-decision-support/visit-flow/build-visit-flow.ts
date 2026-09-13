/**
 * The visit, read out of a pack result and what this browser has recorded.
 *
 * This is the part of the screen a test should be able to ask about without
 * mounting a tree: which step the clinician is on, which single next step
 * outranks the rest, what today's actions group into, and what goes in the
 * chart. None of it is a clinical rule — every headline, module name and
 * evidence value is the pack's — and none of it is about one disease. The
 * disease arrives as a `VisitFlowDiseaseConfig`.
 *
 * Pure and React-free on purpose.
 */
import type {
  CarriedField,
  VisitActionGroup,
  VisitActionGroupId,
  VisitActionRow,
  VisitCoverage,
  VisitDecisionKind,
  VisitFlowContext,
  VisitFlowDiseaseConfig,
  VisitFlowInput,
  VisitFlowModel,
  VisitFlowStepContext,
  VisitNextStep,
  VisitQuestion,
  VisitStep,
} from './types'
import type { CdssRecommendation } from '../types'
import type { PhysicianDecision } from '../stores/physician-decisions.store'

/* ------------------------------------------------------------------ dates */

/**
 * Clinic time, in the calendar the clinic keeps.
 *
 * A visit is dated by the room it happened in, so every stamp on this screen
 * is read in Asia/Taipei whatever the browser is set to — a value saved at
 * 00:30 in Taipei must not read as yesterday because the machine is on UTC.
 */
const CLINIC_TIME_ZONE = 'Asia/Taipei'

export function zonedParts(iso: string): { date: string; time: string } | undefined {
  const at = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(at.getTime())) return undefined
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return {
    date: `${value('year')}/${value('month')}/${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  }
}

/**
 * A stamp as a clinician reads it: `今日 14:07` for something recorded in this
 * visit, `2026/08/14` for anything carried in from an earlier one.
 */
export function formatStamp(
  iso: string | undefined,
  now: Date,
  isEnglish: boolean,
): string | undefined {
  if (!iso) return undefined
  const stamp = zonedParts(iso)
  const today = zonedParts(now.toISOString())
  if (!stamp || !today) return undefined
  if (stamp.date !== today.date) return stamp.date
  // A date-only value recorded today has no clock to show.
  if (iso.length === 10) return isEnglish ? 'Today' : '今日'
  return isEnglish ? `Today ${stamp.time}` : `今日 ${stamp.time}`
}

/** A plain day, `2026/08/14`, with no 「今日」 shorthand. */
export function formatDay(iso: string | undefined): string | undefined {
  return iso ? zonedParts(iso)?.date : undefined
}

/* ------------------------------------------------------------------ basis */

export function conciseMissingLabel(label: string): string {
  return label
    .replace(/^此決策可用的\s*/, '')
    .replace(/（目前資料完全沒有這一項）/g, '')
    .trim()
}

/**
 * 「LDL-C 128 mg/dL · 缺：Lp(a)」 — the evidence the pack itself pointed at as
 * the basis of this row, and the first thing it says is still missing.
 *
 * The missing item is read from `missingData` and from `clinicalReviewItems`:
 * a pack's semantic policy moves an item a clinician has to judge out of the
 * first list into the second, and a row that read only the first would print
 * 「缺：—」 while the card below it listed two things to check.
 */
export function basisOf(
  recommendation: CdssRecommendation,
  isEnglish: boolean,
  readsClinicalReviewItems = false,
): string | undefined {
  const keys = recommendation.overviewEvidenceFactKeys
    ?? (recommendation.overviewEvidenceFactKey ? [recommendation.overviewEvidenceFactKey] : [])
  const seen = new Set<string>()
  const parts = keys.flatMap((factKey) => {
    const evidence = recommendation.patientEvidence.find((item) => item.factKeys.includes(factKey))
    if (!evidence) return []
    const label = evidence.label.trim()
    const value = evidence.value.trim()
    const repeatsLabel = value.toLocaleLowerCase().startsWith(`${label.toLocaleLowerCase()} `)
    const text = repeatsLabel ? value : `${label}${isEnglish ? ': ' : '：'}${value}`
    if (seen.has(text)) return []
    seen.add(text)
    return [text]
  })
  const missing = recommendation.missingData?.[0]
    ?? (readsClinicalReviewItems ? recommendation.clinicalReviewItems?.[0] : undefined)
  if (missing) {
    const conciseMissing = conciseMissingLabel(missing)
    parts.push(isEnglish ? `Missing: ${conciseMissing}` : `缺：${conciseMissing}`)
  }
  return parts.length > 0 ? parts.join(' · ') : undefined
}

/** 「…落在表一條件內；目標 <70 mg/dL。」 — what a heading has room for. */
function firstSentence(text: string): string {
  const full = text.trim()
  const zhEnd = full.indexOf('。')
  if (zhEnd >= 0) return full.slice(0, zhEnd + 1)
  const enEnd = full.match(/^[\s\S]*?\.(?=\s|$)/)
  return enEnd ? enEnd[0] : full
}

/**
 * The pack's own 健保給付 verdict for one row, where it wrote one.
 *
 * `not-applicable` is dropped: a card the coverage rules have nothing to say
 * about should not carry an empty 健保 line, and the pack says so itself.
 */
export function coverageOf(recommendation: CdssRecommendation): VisitCoverage | undefined {
  const source = (recommendation.sourceAssessments ?? [])
    .find((item) => item.sourceKind === 'coverage')
  if (!source || source.status === 'not-applicable') return undefined
  if (!source.summary || source.summary.trim().length === 0) return undefined
  return {
    status: source.status,
    sourceLabel: source.sourceLabel,
    version: source.version,
    summary: source.summary,
    firstSentence: firstSentence(source.summary),
    ...(source.missingData && source.missingData.length > 0
      ? { missingData: source.missingData }
      : {}),
  }
}

/* ------------------------------------------------------------------ build */

const GROUP_ORDER: readonly VisitActionGroupId[] = [
  'safety',
  'actionable',
  'needs-data',
  'review',
  'no-action',
]

const GROUP_LABELS: Readonly<Record<VisitActionGroupId, { zh: string; en: string }>> = {
  safety: { zh: '安全警訊', en: 'Safety alerts' },
  actionable: { zh: '藥物與處置', en: 'Medication & actions' },
  'needs-data': { zh: '檢驗與量測', en: 'Tests & measurements' },
  review: { zh: '需判斷', en: 'Judgement' },
  'no-action': { zh: '目前無需處理', en: 'No action needed' },
}

const PRIORITY_RANK: Readonly<Record<CdssRecommendation['priority'], number>> = {
  high: 0,
  medium: 1,
  routine: 2,
}

export function buildVisitFlow(
  input: VisitFlowInput,
  config: VisitFlowDiseaseConfig,
): VisitFlowModel {
  const { board, result, isEnglish, decisions } = input
  const readOnly = !input.patientId

  const recommendations = [
    ...result.recommendations,
    ...(result.automatedChecks ?? [])
      .map((check) => check.recommendation)
      .filter((item): item is CdssRecommendation => Boolean(item)),
  ].map((item) => config.normalizeRecommendation?.(item) ?? item)
  const byId = new Map(recommendations.map((item) => [item.id, item]))
  const ctx: VisitFlowContext = { ...input, recommendations, byId, readOnly }

  /* ---------------------------------------------------------- questions */

  const questions: VisitQuestion[] = config.questions
    .filter((spec) => spec.appliesWhen?.(ctx) ?? true)
    .map((spec) => ({ id: spec.id, ...spec.derive(ctx) }))

  const countedQuestions = questions.filter((question) => question.counted)
  const openQuestionCount = countedQuestions.filter((question) => question.state === 'open').length
  const answeredQuestionCount = countedQuestions
    .filter((question) => question.state === 'answered').length

  /* ------------------------------------------------------------ actions */

  const alertIds = new Set(board.alerts.map((item) => item.id))
  const leadingIds = config.leadingModuleIds ?? []
  const leadingPresent = new Set<string>(leadingIds.filter((id) => byId.has(id)))
  const leadingRank = (id: string): number => {
    const index = leadingIds.indexOf(id)
    return index === -1 ? leadingIds.length : index
  }

  const groupOf = (recommendation: CdssRecommendation): VisitActionGroupId => {
    if (alertIds.has(recommendation.id)) return 'safety'
    if (leadingPresent.has(recommendation.id)) return 'actionable'
    return recommendation.status
  }

  const pillarMedications = new Map(
    board.pillars.map((pillar) => [pillar.id, pillar.medicationNames]),
  )

  const consumed = new Set(config.consumedModuleIds)
  const listed = recommendations.filter((item) => (
    !consumed.has(item.id) && !(config.isExcluded?.(item, ctx) ?? false)
  ))

  const decisionKindOf = (
    recommendation: CdssRecommendation,
    group: VisitActionGroupId,
  ): VisitDecisionKind => {
    if (group === 'no-action') return 'none'
    const rule = config.decisionRules[recommendation.id]
    if (rule) return rule.kind
    return config.defaultDecisionKind(recommendation, group)
  }

  let index = 0
  const actionGroups: VisitActionGroup[] = GROUP_ORDER.flatMap((groupId) => {
    const rows = listed
      .filter((item) => groupOf(item) === groupId)
      .sort((a, b) => (
        // The leading rows head 藥物與處置 in the guideline's own order;
        // anything else follows on the pack's priority.
        (groupId === 'actionable' ? leadingRank(a.id) - leadingRank(b.id) : 0)
        || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        || (a.moduleOrder ?? Number.MAX_SAFE_INTEGER) - (b.moduleOrder ?? Number.MAX_SAFE_INTEGER)
      ))
      .map((recommendation): VisitActionRow => {
        const decisionKind = decisionKindOf(recommendation, groupId)
        if (decisionKind !== 'none') index += 1
        const medications = pillarMedications.get(recommendation.id)
        const recordedDecision = decisions[recommendation.id]
        // An existing drug does not fulfil a recommendation to switch or adjust it.
        const defaultPrescribed = !recordedDecision && decisionKind === 'medication'
          && recommendation.status === 'no-action'
          && board.pillars.some((pillar) => pillar.id === recommendation.id && pillar.taking)
        const packBasis = basisOf(recommendation, isEnglish, config.readsClinicalReviewItems)
        const basis = [
          ...(config.extraBasis?.(recommendation, ctx) ?? []),
          ...(packBasis ? [packBasis] : []),
        ].join(' · ')
        const coverage = config.coverageLine ? coverageOf(recommendation) : undefined
        return {
          ...(decisionKind === 'none' ? {} : { index }),
          recommendation,
          headline: config.headline?.(recommendation, isEnglish)
            ?? recommendation.nextActions[0]
            ?? recommendation.title,
          moduleName: recommendation.moduleName ?? recommendation.id,
          status: recommendation.status,
          isSafety: groupId === 'safety',
          ...(medications ? { medications } : {}),
          ...(basis ? { basis } : {}),
          ...(coverage ? { coverage } : {}),
          decisionKind,
          ...(recordedDecision ? { decision: recordedDecision } : defaultPrescribed ? {
            decision: { decision: 'prescribed', reasons: [], recordedAt: '', packVersion: result.packVersion },
            decisionSource: 'medication-record',
          } : {}),
        }
      })
    if (rows.length === 0) return []
    return [{
      id: groupId,
      label: isEnglish ? GROUP_LABELS[groupId].en : GROUP_LABELS[groupId].zh,
      rows,
      collapsedByDefault: groupId === 'no-action',
      ...(groupId === 'no-action'
        ? { summary: rows.map((row) => row.moduleName).join(' · ') }
        : {}),
    }]
  })

  const decidableRows = actionGroups
    .flatMap((group) => group.rows)
    .filter((row) => row.decisionKind !== 'none')
  const decidableCount = decidableRows.length
  const decidedCount = decidableRows.filter((row) => row.decision).length
  const undecidedSafety = actionGroups
    .find((group) => group.id === 'safety')?.rows
    .find((row) => !row.decision)
  const firstUndecided = decidableRows.find((row) => !row.decision)

  const followUpNote = recommendations
    .filter((item) => item.domain === 'monitoring' || item.domain === 'safety')
    .flatMap((item) => item.nextActions)
    .find((action) => /追蹤|回診|週後|個月後|follow[- ]up|recheck/i.test(action))

  /* -------------------------------------------------------------- steps */

  const stepContext: VisitFlowStepContext = {
    ...ctx,
    questions,
    countedQuestions,
    openQuestionCount,
    answeredQuestionCount,
    actionGroups,
    decidableCount,
    decidedCount,
    ...(followUpNote ? { followUpNote } : {}),
  }

  const steps: readonly VisitStep[] = config.steps.map((spec, position) => {
    const { state, detail } = spec.derive(stepContext)
    return { id: spec.id, index: position + 1, label: spec.label(isEnglish), state, detail }
  })

  /* ---------------------------------------------------------- next step */

  const firstOpenQuestion = questions.find(
    (question) => question.state === 'open' && !question.skipAsNextStep,
  )
  const nextStep: VisitNextStep = ((): VisitNextStep => {
    // A safety alert nobody has answered outranks everything, including an
    // unanswered question 1: a harmful prescription is harmful whether or not
    // this clinician is asking about this disease today.
    if (undecidedSafety) {
      return {
        tone: 'safety',
        message: isEnglish
          ? `Handle the safety alert first: ${undecidedSafety.recommendation.title}`
          : `先處理安全警訊：${undecidedSafety.recommendation.title}`,
        actionLabel: isEnglish
          ? `Go to row ${undecidedSafety.index}`
          : `看第 ${undecidedSafety.index} 列`,
        target: {
          kind: 'action',
          moduleId: undecidedSafety.recommendation.id,
          index: undecidedSafety.index ?? 1,
        },
      }
    }
    if (firstOpenQuestion) {
      // On the first open, say what the record already holds that bears on
      // the question — the reader should not have to hunt for it to answer.
      const hint = config.firstOpenHint?.(ctx, firstOpenQuestion)
      return {
        tone: 'primary',
        message: isEnglish
          ? `Next: ${firstOpenQuestion.label}`
          : `接下來：${firstOpenQuestion.label}`,
        actionLabel: isEnglish
          ? `Go to question ${firstOpenQuestion.number}`
          : `前往第 ${firstOpenQuestion.number} 題`,
        target: { kind: 'question', questionId: firstOpenQuestion.id },
        ...(hint ? { hint } : {}),
      }
    }
    if (firstUndecided) {
      return {
        tone: 'primary',
        message: isEnglish
          ? `Next: ${firstUndecided.headline}`
          : `接下來：${firstUndecided.headline}`,
        actionLabel: isEnglish ? `Go to row ${firstUndecided.index}` : `看第 ${firstUndecided.index} 列`,
        target: {
          kind: 'action',
          moduleId: firstUndecided.recommendation.id,
          index: firstUndecided.index ?? 1,
        },
      }
    }
    return {
      tone: 'ok',
      message: isEnglish
        ? `This visit is complete: copy the summary into the chart${followUpNote ? `, ${followUpNote}` : ''}`
        : `本次完成：複製摘要到病歷${followUpNote ? `，${followUpNote}` : ''}`,
      actionLabel: isEnglish ? 'Copy English summary' : '複製英文摘要',
      target: { kind: 'copy' },
    }
  })()

  /* ------------------------------------------------------- record card */

  const carriedFields: CarriedField[] = [...config.carriedFields(stepContext)]
  for (const row of decidableRows) {
    const decision = row.decision
    if (!decision || row.decisionSource === 'medication-record') continue
    carriedFields.push({
      label: row.moduleName,
      value: decisionLabel(decision.decision, isEnglish),
      date: formatStamp(decision.recordedAt, input.now, isEnglish) ?? '',
    })
  }

  const followUpLines = config.followUp?.(stepContext) ?? []

  const summaryText = config.summary(stepContext, { chartLayout: false, isEnglish })
  // Build chart text from structured answers, independently of the UI/pack
  // language, then normalise the punctuation a chart field expects.
  const englishSummaryText = config
    .summary(stepContext, { chartLayout: true, isEnglish: true })
    .replace(/：/g, ': ')
    .replace(/（/g, ' (')
    .replace(/）/g, ')')

  return {
    steps,
    nextStep,
    metrics: [...(board.headlineMetric ? [board.headlineMetric] : []), ...board.metrics],
    questions,
    openQuestionCount,
    answeredQuestionCount,
    countedQuestionCount: countedQuestions.length,
    actionGroups,
    decidedCount,
    decidableCount,
    summaryText,
    englishSummaryText,
    carriedFields,
    ...(result.clinicalHandoff ? { handoff: result.clinicalHandoff } : {}),
    ...(followUpNote ? { followUpNote } : {}),
    followUpLines,
    readOnly,
  }
}

/* --------------------------------------------------------------- decisions */

export const VISIT_DECISIONS: Readonly<
  Record<VisitDecisionKind, readonly PhysicianDecision['decision'][]>
> = {
  medication: ['prescribed', 'dose-adjusted', 'contraindicated', 'deferred', 'patient-preference'],
  test: ['ordered', 'deferred'],
  measurement: ['measurements-completed', 'deferred'],
  'follow-up': ['follow-up-arranged', 'reviewed', 'deferred', 'patient-preference'],
  rehabilitation: ['referred', 'deferred', 'patient-preference'],
  'exercise-safety': ['exercise-cleared', 'supervised-exercise', 'deferred'],
  review: ['reviewed', 'deferred', 'patient-preference'],
  none: [],
}

export const DECISION_LABELS: Readonly<
  Record<PhysicianDecision['decision'], { zh: string; en: string }>
> = {
  prescribed: { zh: '已開立', en: 'Prescribed' },
  'dose-adjusted': { zh: '劑量調整', en: 'Dose adjusted' },
  contraindicated: { zh: '禁忌', en: 'Contraindicated' },
  deferred: { zh: '暫緩', en: 'Deferred' },
  'patient-preference': { zh: '病人意願', en: "Patient's preference" },
  ordered: { zh: '已開單', en: 'Ordered' },
  'measurements-completed': { zh: '已量測', en: 'Measured' },
  'follow-up-arranged': { zh: '已安排追蹤', en: 'Follow-up arranged' },
  referred: { zh: '已轉介', en: 'Referred' },
  'exercise-cleared': { zh: '可運動', en: 'Cleared for exercise' },
  'supervised-exercise': { zh: '需監測下運動', en: 'Supervised exercise' },
  reviewed: { zh: '已評估', en: 'Reviewed' },
}

export function decisionLabel(
  decision: PhysicianDecision['decision'],
  isEnglish: boolean,
): string {
  return isEnglish ? DECISION_LABELS[decision].en : DECISION_LABELS[decision].zh
}

/** One config's wording for a reason id, or the id when it names none. */
export function decisionReasonLabel(
  reasons: readonly { id: string; zh: string; en: string }[],
  id: string,
  isEnglish: boolean,
): string {
  const reason = reasons.find((item) => item.id === id)
  if (!reason) return id
  return isEnglish ? reason.en : reason.zh
}
