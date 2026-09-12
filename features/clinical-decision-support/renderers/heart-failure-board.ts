/**
 * The heart-failure status board: what the module list is read through.
 *
 * A heart-failure visit asks three questions in order — can I adjust
 * foundational therapy today (the safety inputs), is anything on the
 * prescription list dangerous (the safety scan), and which of the four pillars
 * is this patient on (the gap) — and the generic module table answered all
 * three only after the reader had opened half the rows. This model pulls those
 * answers out of the pack's own output so the view can put them first.
 *
 * Nothing here is a clinical rule. Every status, title, next step, and
 * evidence value is the pack's; this file only decides which of the pack's
 * facts sit where. The one interpretation it makes — that a therapy fact
 * beginning 「目前用藥中」 means the class is being taken — reads the adapter's
 * fixed wording for that state, not the medication record.
 */
import type {
  CdssFact,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
  CdssResult,
  CdssStatus,
  ClinicalEvidence,
} from '../types'
import { buildDiseaseBoard } from './disease-board'
import { findEvidence, latestSourceDate, metricFromEvidence, TAKING_PATTERN, type ClinicalMetric } from './status-metrics'
export { daysBetween, formatMetricDate } from './status-metrics'
import { buildCareTimeline, type CareTimelineModel } from './care-timeline'

export const HEART_FAILURE_PACK_ID = 'heart-failure-cdss'

const PHENOTYPE_MODULE_ID = 'heart-failure-phenotype'
const FMT_SAFETY_MODULE_ID = 'heart-failure-fmt-safety'
const GDMT_MODULE_ID = 'heart-failure-hfref-gdmt'
const HFPEF_TREATMENT_MODULE_ID = 'heart-failure-hfpef-treatment'
const HFPEF_DIAGNOSIS_MODULE_ID = 'heart-failure-hfpef-diagnosis'

/**
 * The four foundational classes, in the order the guideline lists them.
 *
 * `therapyFactKeys` are the adapter's medication-class facts for the pillar,
 * read when the pack produced no module for it — on the HFrEF pathway the pack
 * can leave a pillar unevaluated while the clinician still wants to see what
 * the patient is on. A tile built that way carries no judgement and says so.
 *
 * `lvefIndependent` marks the two ESC 2026 Recommendation Table 5 recommends
 * 「independent of LVEF」 — an SGLT2 inhibitor and an MRA. The other two name
 * 「symptomatic HFrEF」, so they are not the HFpEF patient's checklist and are
 * not shown on that pathway: a strip of four tiles headed 「四大 FMT 支柱」
 * reads as a list of what is missing, whatever caveat sits above it.
 */
const PILLAR_MODULES = [
  { id: 'heart-failure-ras-inhibition', zh: 'ARNI／ACEI／ARB', en: 'ARNI / ACEI / ARB', therapyFactKeys: ['arniTherapy', 'aceArbTherapy'], lvefIndependent: false },
  { id: 'heart-failure-beta-blocker', zh: '實證 β 阻斷劑', en: 'Evidence-based β-blocker', therapyFactKeys: ['hfEvidenceBetaBlockerTherapy'], lvefIndependent: false },
  { id: 'heart-failure-mra', zh: 'MRA', en: 'MRA', therapyFactKeys: ['mraTherapy'], lvefIndependent: true },
  { id: 'heart-failure-sglt2', zh: 'SGLT2i', en: 'SGLT2i', therapyFactKeys: ['sglt2Therapy'], lvefIndependent: true },
] as const

/**
 * Which set of foundational classes this patient's pathway is read against.
 *
 * `none` is not an empty board: it is a patient the pack opened no treatment
 * pathway for — nobody has said they suspect heart failure, or the phenotype
 * is not settled — and a therapy checklist for them would be answering a
 * question that was never asked.
 */
export type HeartFailurePillarScope = 'hfref-four' | 'lvef-independent' | 'none'

export type HeartFailureMetricKind = 'lab' | 'measure'

/**
 * The inputs every FMT decision reads, in the order a clinician scans them.
 * `kind` says how a missing one is obtained, which is the only thing a reader
 * can do about it.
 */
const STATUS_METRICS: readonly {
  factKey: string
  zh: string
  en: string
  kind: HeartFailureMetricKind
  /** Evidence-table rows that carry this measurement when no fact does. */
  evidenceItemIds?: readonly string[]
}[] = [
  { factKey: 'bloodPressure', zh: '血壓', en: 'BP', kind: 'measure' },
  { factKey: 'heartRate', zh: '心率', en: 'HR', kind: 'measure' },
  { factKey: 'potassium', zh: 'K', en: 'K', kind: 'lab' },
  { factKey: 'eGFR', zh: 'eGFR', en: 'eGFR', kind: 'lab' },
  { factKey: 'sodium', zh: 'Na', en: 'Na', kind: 'lab' },
  { factKey: 'bodyWeight', zh: '體重', en: 'Weight', kind: 'measure' },
  {
    factKey: 'NTproBNP',
    zh: 'NT-proBNP',
    en: 'NT-proBNP',
    kind: 'lab',
    evidenceItemIds: ['congestion:nt-probnp'],
  },
]

export type HeartFailureMetric = ClinicalMetric

export interface HeartFailurePillar {
  id: string
  label: string
  /**
   * The pack's module for this pillar. Absent when the pack did not evaluate
   * it for this phenotype; the tile then shows the therapy fact alone.
   */
  recommendation?: CdssRecommendation
  status?: CdssStatus
  /** `false` when the tile is read from the record without a pack judgement. */
  evaluated: boolean
  /** The class is being taken, read from the adapter's therapy fact. */
  taking: boolean
  /** 「Valsartan 80mg」 — the names after 「目前用藥中：」 when taking. */
  medicationNames?: string
  /** The therapy fact as written, shown when the class is not being taken. */
  therapyText?: string
  therapyDate?: string
  therapyEvidence?: ClinicalEvidence
  nextAction?: string
}

/**
 * One of the sentences that open the board: the pack's own next step for a
 * module that needs the clinician today, with the module it came from so the
 * reader can open it.
 */
export interface HeartFailureHeadline {
  recommendation: CdssRecommendation
  /** The pack's first next action — the sentence, never rephrased. */
  action: string
  /** Why: the module's title, which states the finding the action rests on. */
  reason: string
  moduleName: string
}

export interface HeartFailureBoardModel {
  phenotype?: CdssRecommendation
  /**
   * What to do today, at most three, in the order the clinician should read
   * them: actionable before data-needed, higher priority first, then the
   * pack's module order. Empty when the visit needs nothing — the silent state.
   */
  headlines: readonly HeartFailureHeadline[]
  /** How many modules the pack judged this visit, for the silent line. */
  evaluatedCount: number
  /** Modules per status, for the counts line under today's sentences. */
  statusCounts: Readonly<Record<CdssStatus, number>>
  lvef?: HeartFailureMetric
  metrics: readonly HeartFailureMetric[]
  fmtSafety?: CdssRecommendation
  /** Safety modules the pack marked actionable: read before anything else. */
  alerts: readonly CdssRecommendation[]
  gdmt?: CdssRecommendation
  /**
   * DP-01b, when the pack built it. The board reads it for the one action a
   * clinician came to this screen to take — confirming the diagnosis — and puts
   * that action where it can be seen. The card itself stays in the list, so it
   * is not in `consumedIds`: the criteria are read there, in full.
   */
  hfpEfDiagnosis?: CdssRecommendation
  /**
   * The course behind today: the LVEF trajectory, when HF was coded, and what
   * the patient was prescribed across it. Absent when the record dates fewer
   * than two of them — one point is a label, not a trajectory.
   */
  timeline?: CareTimelineModel
  /** Which foundational classes the tiles below stand for, and why. */
  pillarScope: HeartFailurePillarScope
  pillars: readonly HeartFailurePillar[]
  /** Module ids the board renders itself, so the list does not repeat them. */
  consumedIds: ReadonlySet<string>
}

function pillarFromRecommendation(
  config: (typeof PILLAR_MODULES)[number],
  recommendation: CdssRecommendation,
  isEnglish: boolean,
): HeartFailurePillar {
  const therapyKey = recommendation.overviewEvidenceFactKey
  const therapyEvidence = therapyKey
    ? recommendation.patientEvidence.find((item) => item.factKeys.includes(therapyKey))
    : undefined
  const therapyText = therapyEvidence?.value
  const taking = therapyText !== undefined && TAKING_PATTERN.test(therapyText)
  const medicationNames = taking
    ? therapyText.replace(TAKING_PATTERN, '').replace(/^[：:]\s*/, '').trim() || undefined
    : undefined
  return {
    id: config.id,
    label: isEnglish ? config.en : config.zh,
    recommendation,
    status: recommendation.status,
    evaluated: true,
    taking,
    medicationNames,
    therapyText,
    therapyDate: latestSourceDate(therapyEvidence),
    therapyEvidence,
    nextAction: recommendation.nextActions[0],
  }
}

/**
 * A pillar the pack did not evaluate, read from the adapter's therapy facts.
 * For a pillar with two classes (ARNI or ACEI/ARB) the class being taken
 * wins; otherwise the first fact the record holds.
 */
function pillarFromFacts(
  config: (typeof PILLAR_MODULES)[number],
  facts: CdssPatientProfile['facts'] | undefined,
  isEnglish: boolean,
): HeartFailurePillar | undefined {
  if (!facts) return undefined
  const candidates = (config.therapyFactKeys as readonly string[])
    .map((key) => ({ key, fact: facts[key] as CdssFact | undefined }))
    .filter((entry): entry is { key: string; fact: CdssFact } => Boolean(entry.fact))
  if (candidates.length === 0) return undefined
  const textOf = (fact: CdssFact) => (isEnglish ? fact.en : fact.zh)
  const chosen = candidates.find((entry) => TAKING_PATTERN.test(textOf(entry.fact))) ?? candidates[0]
  const therapyText = textOf(chosen.fact)
  const taking = TAKING_PATTERN.test(therapyText)
  const therapyEvidence: ClinicalEvidence = {
    label: isEnglish ? config.en : config.zh,
    value: therapyText,
    factKeys: [chosen.key],
    sources: chosen.fact.sources,
  }
  return {
    id: config.id,
    label: isEnglish ? config.en : config.zh,
    evaluated: false,
    taking,
    medicationNames: taking
      ? therapyText.replace(TAKING_PATTERN, '').replace(/^[：:]\s*/, '').trim() || undefined
      : undefined,
    therapyText,
    therapyDate: latestSourceDate(therapyEvidence) ?? chosen.fact.date,
    therapyEvidence,
  }
}

/**
 * Reads the board out of a result. `undefined` for any pack that is not the
 * heart-failure pack, so every other pathway keeps the generic module table.
 */
export function buildHeartFailureBoard(
  result: CdssResult,
  locale: CdssLocale,
  now: Date = new Date(),
  /**
   * The profile the pack read, for pillars the pack produced no module for and
   * safety inputs no module carried.
   */
  profileFacts?: CdssPatientProfile['facts'],
): HeartFailureBoardModel | undefined {
  const base = buildDiseaseBoard(result, { packId: HEART_FAILURE_PACK_ID, metrics: STATUS_METRICS }, locale, now, profileFacts)
  if (!base) return undefined
  const { recommendations, byId, metrics, alerts, headlines, statusCounts } = base
  const isEnglish = locale === 'en'

  const phenotype = byId.get(PHENOTYPE_MODULE_ID)
  const lvefEvidence = findEvidence(recommendations, 'LVEF')
  const lvef = lvefEvidence
    ? metricFromEvidence({ factKey: 'LVEF', zh: 'LVEF', en: 'LVEF', kind: 'lab' }, lvefEvidence, isEnglish, now)
    : undefined

  // Which pathway the pack actually opened, read from the modules it built
  // rather than from the phenotype card's wording: a board that matched on
  // 「HFrEF」 in a title would break the first time the title is reworded.
  const pillarScope: HeartFailurePillarScope = byId.has(GDMT_MODULE_ID)
    ? 'hfref-four'
    : byId.has(HFPEF_TREATMENT_MODULE_ID)
      ? 'lvef-independent'
      : 'none'
  const pillarConfigs = pillarScope === 'hfref-four'
    ? PILLAR_MODULES
    : pillarScope === 'lvef-independent'
      ? PILLAR_MODULES.filter((config) => config.lvefIndependent)
      : []
  const pillars = pillarConfigs.flatMap((config) => {
    const recommendation = byId.get(config.id)
    const pillar = recommendation
      ? pillarFromRecommendation(config, recommendation, isEnglish)
      : pillarFromFacts(config, profileFacts, isEnglish)
    return pillar ? [pillar] : []
  })
  const evaluatedPillars = pillars.filter((pillar) => pillar.evaluated)

  const consumedIds = new Set<string>([
    ...alerts.map((item) => item.id),
    ...pillars.map((item) => item.id),
    // The pillar heading is the GDMT module's own title, so its row would say
    // the same thing twice; it stays reachable from the heading.
    ...(evaluatedPillars.length > 0 && byId.has(GDMT_MODULE_ID) ? [GDMT_MODULE_ID] : []),
  ])

  return {
    phenotype,
    headlines,
    evaluatedCount: recommendations.length,
    statusCounts,
    lvef,
    metrics,
    fmtSafety: byId.get(FMT_SAFETY_MODULE_ID),
    alerts,
    gdmt: evaluatedPillars.length > 0 ? byId.get(GDMT_MODULE_ID) : undefined,
    hfpEfDiagnosis: byId.get(HFPEF_DIAGNOSIS_MODULE_ID),
    timeline: buildCareTimeline(profileFacts, isEnglish),
    pillarScope,
    pillars,
    consumedIds,
  }
}

/**
 * The reading order for what the board did not consume: what to do, then
 * what to fetch, then what to judge, then what is done. Status carries the
 * order; priority breaks ties; the pack's own module order settles the rest.
 */
export const HEART_FAILURE_LIST_STATUS_ORDER: readonly CdssStatus[] = [
  'actionable',
  'needs-data',
  'review',
  'no-action',
]
