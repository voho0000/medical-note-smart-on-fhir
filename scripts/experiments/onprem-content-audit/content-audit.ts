import crypto from 'node:crypto'

export type ContentAuditPhase = 'summary' | 'custom-summary' | 'chat'

export const CONTENT_AUDIT_THRESHOLDS = Object.freeze({
  minimumPrimaryReviewsPerAnswer: 2,
  minimumFactAccuracy: 0.95,
  minimumRequiredFactCoverage: 0.90,
  minimumUsefulnessScore: 4,
  minimumUsableWithoutMajorEditRate: 0.90,
  maximumCriticalErrors: 0,
  maximumFabricatedCoreFacts: 0,
  maximumUnresolvedBinaryDisagreements: 0,
})

export const REVIEW_COLUMNS = [
  'review_id',
  'phase',
  'case_id',
  'prompt',
  'source_evidence',
  'required_fact_checklist',
  'risk_focus',
  'candidate_response',
  'reviewer_id',
  'reviewer_role',
  'fact_claims_total',
  'fact_claims_supported',
  'required_facts_total',
  'required_facts_covered',
  'factual_correctness_score',
  'completeness_score',
  'relevance_score',
  'clarity_score',
  'actionability_score',
  'uncertainty_safety_score',
  'critical_error',
  'fabricated_core_fact',
  'major_omission',
  'usable_without_major_edit',
  'notes',
] as const

export type ReviewColumn = typeof REVIEW_COLUMNS[number]
export type ReviewTemplateRow = Record<ReviewColumn, string>

export interface ReviewCandidate {
  phase: ContentAuditPhase
  caseId: string
  prompt: string
  sourceEvidence: string
  requiredFacts: string[]
  riskFocus: string
  candidateResponse: string
  model: string
  strategy?: string
  repetition: number
  sourceFile: string
  outputSha256: string
}

export interface ReviewKeyRow {
  reviewId: string
  phase: ContentAuditPhase
  caseId: string
  model: string
  strategy?: string
  repetition: number
  sourceFile: string
  outputSha256: string
  requiredFactsTotal: number
  reviewContentSha256: string
}

export interface ReviewKey {
  version: 1
  createdAt: string
  thresholds: typeof CONTENT_AUDIT_THRESHOLDS
  rows: ReviewKeyRow[]
}

export interface ReviewPacket {
  rows: ReviewTemplateRow[]
  key: ReviewKey
}

export interface ValidatedReview {
  reviewId: string
  reviewerId: string
  reviewerRole: string
  factClaimsTotal: number
  factClaimsSupported: number
  requiredFactsTotal: number
  requiredFactsCovered: number
  factualCorrectnessScore: number
  completenessScore: number
  relevanceScore: number
  clarityScore: number
  actionabilityScore: number
  uncertaintySafetyScore: number
  criticalError: boolean
  fabricatedCoreFact: boolean
  majorOmission: boolean
  usableWithoutMajorEdit: boolean
  notes: string
}

export interface ContentAuditMetrics {
  answers: number
  reviews: number
  factAccuracy: number | null
  requiredFactCoverage: number | null
  usefulnessScore: number | null
  usableWithoutMajorEditRate: number
  criticalErrors: number
  fabricatedCoreFacts: number
  majorOmissions: number
  averageScores: {
    factualCorrectness: number | null
    completeness: number | null
    relevance: number | null
    clarity: number | null
    actionability: number | null
    uncertaintySafety: number | null
  }
}

export interface AgreementMetrics {
  criticalErrorKappa: number | null
  fabricatedCoreFactKappa: number | null
  majorOmissionKappa: number | null
  usableWithoutMajorEditKappa: number | null
  ordinalWithinOnePointRate: number | null
}

export interface ContentAuditScore {
  passed: boolean
  failures: string[]
  metrics: ContentAuditMetrics
  agreement: AgreementMetrics
  insufficientReviewIds: string[]
  unresolvedDisagreementIds: string[]
  modelMetrics: Array<{ model: string; metrics: ContentAuditMetrics }>
  caseMetrics: Array<{ caseId: string; metrics: ContentAuditMetrics }>
}

function shuffled<T>(values: readonly T[], randomInt: (max: number) => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    const temporary = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = temporary
  }
  return result
}

function checklist(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n')
}

function reviewContentSha256(row: ReviewTemplateRow): string {
  const immutableContent = [
    row.review_id,
    row.phase,
    row.case_id,
    row.prompt,
    row.source_evidence,
    row.required_fact_checklist,
    row.risk_focus,
    row.candidate_response,
  ].map((value) => value.replace(/\r\n?/g, '\n').normalize('NFC'))
  return crypto.createHash('sha256').update(JSON.stringify(immutableContent)).digest('hex')
}

export function createReviewPacket(
  candidates: readonly ReviewCandidate[],
  options: {
    createdAt?: string
    randomId?: () => string
    randomInt?: (max: number) => number
  } = {},
): ReviewPacket {
  if (candidates.length === 0) throw new Error('No review candidates were supplied')
  const randomId = options.randomId ?? (() => crypto.randomUUID())
  const randomInt = options.randomInt ?? ((max) => crypto.randomInt(max))
  const seenIds = new Set<string>()
  const entries = candidates.map((candidate) => {
    let reviewId = randomId()
    while (!reviewId || seenIds.has(reviewId)) reviewId = randomId()
    seenIds.add(reviewId)
    const row: ReviewTemplateRow = {
      review_id: reviewId,
      phase: candidate.phase,
      case_id: candidate.caseId,
      prompt: candidate.prompt,
      source_evidence: candidate.sourceEvidence,
      required_fact_checklist: checklist(candidate.requiredFacts),
      risk_focus: candidate.riskFocus,
      candidate_response: candidate.candidateResponse,
      reviewer_id: '',
      reviewer_role: '',
      fact_claims_total: '',
      fact_claims_supported: '',
      required_facts_total: String(candidate.requiredFacts.length),
      required_facts_covered: '',
      factual_correctness_score: '',
      completeness_score: '',
      relevance_score: '',
      clarity_score: '',
      actionability_score: '',
      uncertainty_safety_score: '',
      critical_error: '',
      fabricated_core_fact: '',
      major_omission: '',
      usable_without_major_edit: '',
      notes: '',
    }
    const key: ReviewKeyRow = {
      reviewId,
      phase: candidate.phase,
      caseId: candidate.caseId,
      model: candidate.model,
      ...(candidate.strategy ? { strategy: candidate.strategy } : {}),
      repetition: candidate.repetition,
      sourceFile: candidate.sourceFile,
      outputSha256: candidate.outputSha256,
      requiredFactsTotal: candidate.requiredFacts.length,
      reviewContentSha256: reviewContentSha256(row),
    }
    return { row, key }
  })
  const randomizedEntries = shuffled(entries, randomInt)
  return {
    rows: randomizedEntries.map((entry) => entry.row),
    key: {
      version: 1,
      createdAt: options.createdAt ?? new Date().toISOString(),
      thresholds: CONTENT_AUDIT_THRESHOLDS,
      rows: randomizedEntries.map((entry) => entry.key),
    },
  }
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function encodeReviewCsv(rows: readonly ReviewTemplateRow[]): string {
  const lines = [
    REVIEW_COLUMNS.join(','),
    ...rows.map((row) => REVIEW_COLUMNS.map((column) => escapeCsvCell(row[column])).join(',')),
  ]
  // UTF-8 BOM keeps Traditional Chinese readable when opened directly in Excel.
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function parseReviewCsv(text: string): ReviewTemplateRow[] {
  const input = text.replace(/^\uFEFF/, '')
  const records: string[][] = []
  let record: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        value += character
      }
      continue
    }
    if (character === '"') {
      quoted = true
    } else if (character === ',') {
      record.push(value)
      value = ''
    } else if (character === '\n') {
      record.push(value.replace(/\r$/, ''))
      if (record.some((cell) => cell !== '')) records.push(record)
      record = []
      value = ''
    } else {
      value += character
    }
  }
  if (quoted) throw new Error('Review CSV has an unterminated quoted field')
  if (value || record.length > 0) {
    record.push(value.replace(/\r$/, ''))
    if (record.some((cell) => cell !== '')) records.push(record)
  }
  const header = records.shift()
  if (!header) return []
  if (header.join('\u0000') !== REVIEW_COLUMNS.join('\u0000')) {
    throw new Error('Review CSV columns do not match the required template')
  }
  return records.map((cells, rowIndex) => {
    if (cells.length !== REVIEW_COLUMNS.length) {
      throw new Error(`Review CSV row ${rowIndex + 2} has ${cells.length} columns; expected ${REVIEW_COLUMNS.length}`)
    }
    return Object.fromEntries(
      REVIEW_COLUMNS.map((column, columnIndex) => [column, cells[columnIndex]]),
    ) as ReviewTemplateRow
  })
}

function requiredText(row: ReviewTemplateRow, column: ReviewColumn): string {
  const value = row[column].trim()
  if (!value) throw new Error(`${row.review_id || '(missing review id)'}: ${column} is required`)
  return value
}

function integerInRange(
  row: ReviewTemplateRow,
  column: ReviewColumn,
  minimum: number,
  maximum: number,
): number {
  const text = requiredText(row, column)
  const value = Number(text)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${row.review_id}: ${column} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

function yesNo(row: ReviewTemplateRow, column: ReviewColumn): boolean {
  const value = requiredText(row, column).toLowerCase()
  if (value === 'yes') return true
  if (value === 'no') return false
  throw new Error(`${row.review_id}: ${column} must be yes or no`)
}

export function validateReviews(key: ReviewKey, rows: readonly ReviewTemplateRow[]): ValidatedReview[] {
  if (key.version !== 1) throw new Error(`Unsupported review key version: ${String(key.version)}`)
  const keyById = new Map(key.rows.map((row) => [row.reviewId, row]))
  const seen = new Set<string>()
  return rows.map((row) => {
    const reviewId = requiredText(row, 'review_id')
    const keyRow = keyById.get(reviewId)
    if (!keyRow) throw new Error(`${reviewId}: review_id is absent from the private key`)
    const reviewerId = requiredText(row, 'reviewer_id')
    if (reviewContentSha256(row) !== keyRow.reviewContentSha256) {
      throw new Error(`${reviewId}: source, prompt, candidate response, or checklist was modified`)
    }
    const duplicateKey = `${reviewId}\u0000${reviewerId}`
    if (seen.has(duplicateKey)) throw new Error(`${reviewId}: duplicate review from ${reviewerId}`)
    seen.add(duplicateKey)
    const factClaimsTotal = integerInRange(row, 'fact_claims_total', 0, 10_000)
    const factClaimsSupported = integerInRange(row, 'fact_claims_supported', 0, factClaimsTotal)
    const requiredFactsTotal = integerInRange(row, 'required_facts_total', 0, 10_000)
    if (requiredFactsTotal !== keyRow.requiredFactsTotal) {
      throw new Error(`${reviewId}: required_facts_total must remain ${keyRow.requiredFactsTotal}`)
    }
    const requiredFactsCovered = integerInRange(row, 'required_facts_covered', 0, requiredFactsTotal)
    return {
      reviewId,
      reviewerId,
      reviewerRole: requiredText(row, 'reviewer_role'),
      factClaimsTotal,
      factClaimsSupported,
      requiredFactsTotal,
      requiredFactsCovered,
      factualCorrectnessScore: integerInRange(row, 'factual_correctness_score', 1, 5),
      completenessScore: integerInRange(row, 'completeness_score', 1, 5),
      relevanceScore: integerInRange(row, 'relevance_score', 1, 5),
      clarityScore: integerInRange(row, 'clarity_score', 1, 5),
      actionabilityScore: integerInRange(row, 'actionability_score', 1, 5),
      uncertaintySafetyScore: integerInRange(row, 'uncertainty_safety_score', 1, 5),
      criticalError: yesNo(row, 'critical_error'),
      fabricatedCoreFact: yesNo(row, 'fabricated_core_fact'),
      majorOmission: yesNo(row, 'major_omission'),
      usableWithoutMajorEdit: yesNo(row, 'usable_without_major_edit'),
      notes: row.notes.trim(),
    }
  })
}

function mean(values: readonly number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

function metricsFor(reviews: readonly ValidatedReview[]): ContentAuditMetrics {
  const factClaimsTotal = reviews.reduce((sum, review) => sum + review.factClaimsTotal, 0)
  const factsSupported = reviews.reduce((sum, review) => sum + review.factClaimsSupported, 0)
  const requiredFactsTotal = reviews.reduce((sum, review) => sum + review.requiredFactsTotal, 0)
  const requiredFactsCovered = reviews.reduce((sum, review) => sum + review.requiredFactsCovered, 0)
  const usefulnessScores = reviews.map((review) => (
    review.relevanceScore + review.clarityScore + review.actionabilityScore
  ) / 3)
  return {
    answers: new Set(reviews.map((review) => review.reviewId)).size,
    reviews: reviews.length,
    factAccuracy: ratio(factsSupported, factClaimsTotal),
    requiredFactCoverage: ratio(requiredFactsCovered, requiredFactsTotal),
    usefulnessScore: mean(usefulnessScores),
    usableWithoutMajorEditRate: reviews.length > 0
      ? reviews.filter((review) => review.usableWithoutMajorEdit).length / reviews.length
      : 0,
    criticalErrors: reviews.filter((review) => review.criticalError).length,
    fabricatedCoreFacts: reviews.filter((review) => review.fabricatedCoreFact).length,
    majorOmissions: reviews.filter((review) => review.majorOmission).length,
    averageScores: {
      factualCorrectness: mean(reviews.map((review) => review.factualCorrectnessScore)),
      completeness: mean(reviews.map((review) => review.completenessScore)),
      relevance: mean(reviews.map((review) => review.relevanceScore)),
      clarity: mean(reviews.map((review) => review.clarityScore)),
      actionability: mean(reviews.map((review) => review.actionabilityScore)),
      uncertaintySafety: mean(reviews.map((review) => review.uncertaintySafetyScore)),
    },
  }
}

function pairs<T>(values: readonly T[]): Array<[T, T]> {
  const result: Array<[T, T]> = []
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      result.push([values[left], values[right]])
    }
  }
  return result
}

function binaryKappa(
  groups: ReadonlyMap<string, ValidatedReview[]>,
  select: (review: ValidatedReview) => boolean,
): number | null {
  const reviewerMaps = new Map<string, Map<string, ValidatedReview>>()
  groups.forEach((reviews, reviewId) => reviews
    .filter((review) => review.reviewerRole.toLowerCase() !== 'adjudicator')
    .forEach((review) => {
      const reviewerMap = reviewerMaps.get(review.reviewerId) ?? new Map<string, ValidatedReview>()
      reviewerMap.set(reviewId, review)
      reviewerMaps.set(review.reviewerId, reviewerMap)
    }))
  const kappas = pairs([...reviewerMaps.entries()]).flatMap(([[, leftMap], [, rightMap]]) => {
    const comparisons = [...leftMap.entries()].flatMap(([reviewId, left]) => {
      const right = rightMap.get(reviewId)
      return right ? [[left, right] as [ValidatedReview, ValidatedReview]] : []
    })
    if (comparisons.length === 0) return []
    const observed = comparisons.filter(([left, right]) => select(left) === select(right)).length /
      comparisons.length
    const leftYes = comparisons.filter(([left]) => select(left)).length / comparisons.length
    const rightYes = comparisons.filter(([, right]) => select(right)).length / comparisons.length
    const expected = leftYes * rightYes + (1 - leftYes) * (1 - rightYes)
    const kappa = expected === 1 ? (observed === 1 ? 1 : null) : (observed - expected) / (1 - expected)
    return kappa === null ? [] : [kappa]
  })
  return mean(kappas)
}

function ordinalWithinOnePointRate(groups: ReadonlyMap<string, ValidatedReview[]>): number | null {
  const selectors: Array<(review: ValidatedReview) => number> = [
    (review) => review.factualCorrectnessScore,
    (review) => review.completenessScore,
    (review) => review.relevanceScore,
    (review) => review.clarityScore,
    (review) => review.actionabilityScore,
    (review) => review.uncertaintySafetyScore,
  ]
  const differences = [...groups.values()].flatMap((reviews) => {
    const primaryPairs = pairs(
      reviews.filter((review) => review.reviewerRole.toLowerCase() !== 'adjudicator'),
    )
    return primaryPairs.flatMap(([left, right]) => selectors.map((select) => (
      Math.abs(select(left) - select(right))
    )))
  })
  return differences.length > 0
    ? differences.filter((difference) => difference <= 1).length / differences.length
    : null
}

function hasBinaryDisagreement(reviews: readonly ValidatedReview[]): boolean {
  const primaries = reviews.filter((review) => review.reviewerRole.toLowerCase() !== 'adjudicator')
  const selectors: Array<(review: ValidatedReview) => boolean> = [
    (review) => review.criticalError,
    (review) => review.fabricatedCoreFact,
    (review) => review.majorOmission,
    (review) => review.usableWithoutMajorEdit,
  ]
  return selectors.some((select) => new Set(primaries.map(select)).size > 1)
}

function effectiveReviews(groups: ReadonlyMap<string, ValidatedReview[]>): ValidatedReview[] {
  return [...groups.values()].flatMap((reviews) => {
    const primaries = reviews.filter((review) => review.reviewerRole.toLowerCase() !== 'adjudicator')
    const adjudicators = reviews.filter((review) => review.reviewerRole.toLowerCase() === 'adjudicator')
    const adjudicator = adjudicators[0]
    if (!adjudicator) return primaries
    // An adjudicator resolves only the binary release decisions. Independent
    // primary scores and claim counts remain part of the aggregate metrics.
    return primaries.map((review) => ({
      ...review,
      criticalError: adjudicator.criticalError,
      fabricatedCoreFact: adjudicator.fabricatedCoreFact,
      majorOmission: adjudicator.majorOmission,
      usableWithoutMajorEdit: adjudicator.usableWithoutMajorEdit,
    }))
  })
}

export function scoreContentAudit(key: ReviewKey, rows: readonly ReviewTemplateRow[]): ContentAuditScore {
  const reviews = validateReviews(key, rows)
  const groups = new Map<string, ValidatedReview[]>()
  reviews.forEach((review) => groups.set(
    review.reviewId,
    [...(groups.get(review.reviewId) ?? []), review],
  ))
  const duplicateAdjudicatorIds = [...groups.entries()]
    .filter(([, answerReviews]) => answerReviews.filter(
      (review) => review.reviewerRole.toLowerCase() === 'adjudicator',
    ).length > 1)
    .map(([reviewId]) => reviewId)
  if (duplicateAdjudicatorIds.length > 0) {
    throw new Error(`${duplicateAdjudicatorIds.join(', ')}: only one adjudicator is allowed per answer`)
  }
  const unnecessaryAdjudicatorIds = [...groups.entries()]
    .filter(([, answerReviews]) => answerReviews.some(
      (review) => review.reviewerRole.toLowerCase() === 'adjudicator',
    ) && !hasBinaryDisagreement(answerReviews))
    .map(([reviewId]) => reviewId)
  if (unnecessaryAdjudicatorIds.length > 0) {
    throw new Error(`${unnecessaryAdjudicatorIds.join(', ')}: adjudication requires a primary-reviewer binary disagreement`)
  }
  const insufficientReviewIds = key.rows
    .filter((row) => (groups.get(row.reviewId) ?? []).filter(
      (review) => review.reviewerRole.toLowerCase() !== 'adjudicator',
    ).length < CONTENT_AUDIT_THRESHOLDS.minimumPrimaryReviewsPerAnswer)
    .map((row) => row.reviewId)
  const unresolvedDisagreementIds = key.rows
    .filter((row) => {
      const answerReviews = groups.get(row.reviewId) ?? []
      return hasBinaryDisagreement(answerReviews) && !answerReviews.some(
        (review) => review.reviewerRole.toLowerCase() === 'adjudicator',
      )
    })
    .map((row) => row.reviewId)
  const effective = effectiveReviews(groups)
  const metrics = metricsFor(effective)
  const failures: string[] = []
  if (insufficientReviewIds.length > 0) failures.push(
    `${insufficientReviewIds.length} answer(s) have fewer than ${CONTENT_AUDIT_THRESHOLDS.minimumPrimaryReviewsPerAnswer} primary reviews`,
  )
  if (unresolvedDisagreementIds.length > CONTENT_AUDIT_THRESHOLDS.maximumUnresolvedBinaryDisagreements) {
    failures.push(`${unresolvedDisagreementIds.length} answer(s) have unresolved binary disagreements`)
  }
  if (metrics.factAccuracy === null || metrics.factAccuracy < CONTENT_AUDIT_THRESHOLDS.minimumFactAccuracy) {
    failures.push(`fact accuracy is ${metrics.factAccuracy === null ? 'n/a' : metrics.factAccuracy.toFixed(3)}`)
  }
  if (
    metrics.requiredFactCoverage === null ||
    metrics.requiredFactCoverage < CONTENT_AUDIT_THRESHOLDS.minimumRequiredFactCoverage
  ) {
    failures.push(`required fact coverage is ${metrics.requiredFactCoverage === null ? 'n/a' : metrics.requiredFactCoverage.toFixed(3)}`)
  }
  if (
    metrics.usefulnessScore === null ||
    metrics.usefulnessScore < CONTENT_AUDIT_THRESHOLDS.minimumUsefulnessScore
  ) {
    failures.push(`usefulness score is ${metrics.usefulnessScore === null ? 'n/a' : metrics.usefulnessScore.toFixed(2)}`)
  }
  if (
    metrics.usableWithoutMajorEditRate <
    CONTENT_AUDIT_THRESHOLDS.minimumUsableWithoutMajorEditRate
  ) {
    failures.push(`usable-without-major-edit rate is ${metrics.usableWithoutMajorEditRate.toFixed(3)}`)
  }
  if (metrics.criticalErrors > CONTENT_AUDIT_THRESHOLDS.maximumCriticalErrors) {
    failures.push(`${metrics.criticalErrors} critical error review(s)`)
  }
  if (metrics.fabricatedCoreFacts > CONTENT_AUDIT_THRESHOLDS.maximumFabricatedCoreFacts) {
    failures.push(`${metrics.fabricatedCoreFacts} fabricated-core-fact review(s)`)
  }
  const keyById = new Map(key.rows.map((row) => [row.reviewId, row]))
  const groupedMetrics = (field: 'model' | 'caseId') => {
    const values = new Map<string, ValidatedReview[]>()
    effective.forEach((review) => {
      const keyRow = keyById.get(review.reviewId)
      if (!keyRow) return
      const value = keyRow[field]
      values.set(value, [...(values.get(value) ?? []), review])
    })
    return [...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
      ([value, groupedReviews]) => ({ [field]: value, metrics: metricsFor(groupedReviews) }),
    )
  }
  return {
    passed: failures.length === 0,
    failures,
    metrics,
    agreement: {
      criticalErrorKappa: binaryKappa(groups, (review) => review.criticalError),
      fabricatedCoreFactKappa: binaryKappa(groups, (review) => review.fabricatedCoreFact),
      majorOmissionKappa: binaryKappa(groups, (review) => review.majorOmission),
      usableWithoutMajorEditKappa: binaryKappa(groups, (review) => review.usableWithoutMajorEdit),
      ordinalWithinOnePointRate: ordinalWithinOnePointRate(groups),
    },
    insufficientReviewIds,
    unresolvedDisagreementIds,
    modelMetrics: groupedMetrics('model') as ContentAuditScore['modelMetrics'],
    caseMetrics: groupedMetrics('caseId') as ContentAuditScore['caseMetrics'],
  }
}

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

function decimal(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(2)
}

export function createContentAuditReport(score: ContentAuditScore, generatedAt: string): string {
  const lines = [
    '# On-prem clinical content audit',
    '',
    `Generated: ${generatedAt}`,
    '',
    `Release gate: **${score.passed ? 'PASS' : 'FAIL'}**`,
    '',
    '| Metric | Result | Gate |',
    '|---|---:|---:|',
    `| Fact accuracy | ${percent(score.metrics.factAccuracy)} | >= ${percent(CONTENT_AUDIT_THRESHOLDS.minimumFactAccuracy)} |`,
    `| Required-fact coverage | ${percent(score.metrics.requiredFactCoverage)} | >= ${percent(CONTENT_AUDIT_THRESHOLDS.minimumRequiredFactCoverage)} |`,
    `| Usefulness | ${decimal(score.metrics.usefulnessScore)} / 5 | >= ${CONTENT_AUDIT_THRESHOLDS.minimumUsefulnessScore.toFixed(1)} |`,
    `| Usable without major edit | ${percent(score.metrics.usableWithoutMajorEditRate)} | >= ${percent(CONTENT_AUDIT_THRESHOLDS.minimumUsableWithoutMajorEditRate)} |`,
    `| Critical-error reviews | ${score.metrics.criticalErrors} | 0 |`,
    `| Fabricated-core-fact reviews | ${score.metrics.fabricatedCoreFacts} | 0 |`,
    `| Unresolved binary disagreements | ${score.unresolvedDisagreementIds.length} | 0 |`,
    `| Answers lacking two primary reviews | ${score.insufficientReviewIds.length} | 0 |`,
    '',
    '## Reviewer agreement',
    '',
    `- Critical error Cohen's kappa (mean pairwise): ${decimal(score.agreement.criticalErrorKappa)}`,
    `- Fabricated core fact Cohen's kappa (mean pairwise): ${decimal(score.agreement.fabricatedCoreFactKappa)}`,
    `- Major omission Cohen's kappa (mean pairwise): ${decimal(score.agreement.majorOmissionKappa)}`,
    `- Usable without major edit Cohen's kappa (mean pairwise): ${decimal(score.agreement.usableWithoutMajorEditKappa)}`,
    `- Likert scores within one point: ${percent(score.agreement.ordinalWithinOnePointRate)}`,
    '',
    '## Model results',
    '',
    '| Model | Answers | Fact accuracy | Required coverage | Usefulness | Usable | Critical | Fabricated |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...score.modelMetrics.map(({ model, metrics }) => (
      `| ${model} | ${metrics.answers} | ${percent(metrics.factAccuracy)} | ${percent(metrics.requiredFactCoverage)} | ${decimal(metrics.usefulnessScore)} | ${percent(metrics.usableWithoutMajorEditRate)} | ${metrics.criticalErrors} | ${metrics.fabricatedCoreFacts} |`
    )),
    '',
  ]
  if (score.failures.length > 0) {
    lines.push('## Gate failures', '', ...score.failures.map((failure) => `- ${failure}`), '')
  }
  lines.push(
    'This report measures blinded human review results. It does not replace local clinical governance, incident review, or specialty-specific validation.',
    '',
  )
  return lines.join('\n')
}
