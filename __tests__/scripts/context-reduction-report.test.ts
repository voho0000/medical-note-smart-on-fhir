/**
 * Model-capacity-aware clinical record reduction — measurement harness.
 *
 * NOT a regression test. It is a measurement report and is skipped unless
 * CONTEXT_REDUCTION_REPORT=1, so the default `npm test` run is unaffected.
 *
 *   TZ=Asia/Taipei CONTEXT_REDUCTION_REPORT=1 npx jest --runInBand \
 *     __tests__/scripts/context-reduction-report.test.ts --silent=false
 *
 * Environment:
 *   CONTEXT_REDUCTION_REPORT=1  required; without it the suite is skipped.
 *   CONTEXT_REDUCTION_FIXTURE   absolute bundle path, or several joined by ';'
 *                               (one describe block each). A bare filename
 *                               still resolves inside artifacts/synthetic-
 *                               oncology/. An absolute path is EXTERNAL: it may
 *                               hold a real chart, so its report is aggregates
 *                               only — no record labels, no free text.
 *   CONTEXT_REDUCTION_AS_OF     ISO date to pin "now" to. For an external
 *                               fixture it otherwise defaults to the latest
 *                               record date found in that bundle.
 *   CONTEXT_REDUCTION_OUT_DIR   report directory (default artifacts/context-
 *                               reduction/). Point it outside the repo whenever
 *                               the fixture is external.
 *   CONTEXT_REDUCTION_WIDEN=1   also measure the widened labs + imaging profile.
 *
 * It replays exactly the tier ladder that
 * `src/application/hooks/ai-generation/use-clinical-ai-input.hook.ts` walks
 * (lines ~250-347): scopeClinicalDataForAi → buildClinicalContextFitCandidate →
 * useClinicalContext(profile, override, documentTokenBudget) →
 * getFullClinicalContext() → estimateTokens(). The context builder is a tree of
 * React hooks, so the ladder is driven through @testing-library/react's
 * renderHook rather than a plain Node script; no AI call is ever made.
 */
import fs from 'node:fs'
import path from 'node:path'
import { renderHook } from '@testing-library/react'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import {
  DEFAULT_DATA_FILTERS,
  DEFAULT_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'
import {
  buildClinicalContextFitCandidate,
  fitClinicalContextTextToTokenBudget,
  nextPrioritizedContextBudget,
  selectBestClinicalContextFitTier,
  type ClinicalContextFitTier,
  type ClinicalContextProfile,
} from '@/src/core/utils/adaptive-clinical-context.utils'
import { prioritizeClinicalDataForTokenBudget } from '@/src/core/utils/prioritized-clinical-context.utils'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import {
  extractDocumentKeySections,
  listClinicalDocuments,
  resolveSelectedDocuments,
} from '@/src/core/utils/clinical-documents.utils'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import { inferGroupFromDiagnosticReport } from '@/src/shared/utils/report-grouping-helpers'
import { filterAiExcludedClinicalDomains } from '@/src/core/utils/ai-clinical-domain-filter.utils'
import { buildProblemTimelineLines } from '@/src/core/utils/problem-timeline.utils'
import { isObservationAbnormal } from '@/src/shared/utils/interpretation-helpers'
import {
  isMedicationCurrentlyInUse,
  procedureDate,
} from '@/src/core/utils/clinical-context-selection.utils'
import { expandObservationValues, observationDisplayValue } from '@/src/core/utils/observation-value.utils'
import { pickAiMedicationName } from '@/src/shared/utils/fhir-display-helpers'
import { formatValue, getLabPivotTestIdentity } from '@/src/shared/utils/lab-pivot.utils'
import { normalizeAnalyteUnit } from '@/src/shared/utils/unit-scale'
import { categorizeObservation } from '@/src/shared/utils/lab-categories'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'
import {
  VGHBRAIN_CLINICAL_TOKEN_LIMIT,
} from '@/src/shared/utils/vghbrain-context-policy'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import type { ClinicalData } from '@/src/application/hooks/clinical-context/types'
import type { ConsumerProfile } from '@/src/application/providers/data-selection.provider'

// The synthetic fixture is dated 2018-2026 with asOf 2026-09-03; pin "now" to
// that date so relative windows (6m / 1y / 3m) are reproducible across calendar
// days. An external fixture carries its own history, so beforeAll re-pins the
// clock to CONTEXT_REDUCTION_AS_OF or to that bundle's latest record date. The
// name is `mock`-prefixed so the hoisted jest.mock factory may close over it.
const SYNTHETIC_NOW_MS = Date.parse('2026-09-03T00:00:00Z')
let mockNowMs = SYNTHETIC_NOW_MS

let mockPatient: any = null
let mockCollection: any = null
let mockProfile: any = null

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: mockPatient }),
}))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockCollection,
}))
jest.mock('@/src/application/providers/data-selection.provider', () => ({
  useDataSelection: () => ({ getProfile: () => mockProfile }),
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'en' }),
}))
jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))
jest.mock('@/src/shared/hooks/use-now.hook', () => ({
  useNow: () => mockNowMs,
}))

const TIERS: ClinicalContextFitTier[] = ['full', 'trimmed', 'compact', 'tight', 'prioritized']

const CATEGORY_KEYS = [
  'encounters',
  'conditions',
  'medications',
  'allergies',
  'immunizations',
  'procedures',
  'labReports',
  'imagingReports',
  'imagingStudies',
  'labObservations',
  'vitalSigns',
  'carePlans',
  'devices',
  'consents',
  'documents',
] as const
type CategoryKey = (typeof CATEGORY_KEYS)[number]

type IdIndex = Record<CategoryKey, string[]>

/**
 * A fact is retained when every group has at least one alias present in the
 * tier text (AND of ORs). Aliases exist because the same analyte is rendered
 * under its canonical pivot label at labDepth 3/8/all and under its raw source
 * label at labDepth `latest`, and numeric values may be unit-normalized.
 */
interface Fact {
  category: string
  label: string
  groups: string[][]
}

interface TierMeasurement {
  tier: ClinicalContextFitTier
  tokens: number
  /** Prioritizer builds spent converging this rung onto the target. */
  passes: number
  formattedTokens: number
  chars: number
  ms: number
  counts: Record<CategoryKey, number>
  dropped: Record<CategoryKey, string[]>
  /** Records the selector kept but the outbound domain filter removed again. */
  domainFilterDelta: Partial<Record<CategoryKey, number>>
  retained: Record<string, number>
  factTotals: Record<string, number>
  lostFacts: Fact[]
  truncatedChars?: { head: number; tail: number; removed: number }
}

interface RunResult {
  label: string
  targetTokens: number
  allowTextTruncation: boolean
  /** The rung the app would actually send, by the hook's own selection rule. */
  chosenTier: ClinicalContextFitTier
  /** False when no rung fits and `prioritized` is only the terminal fallback. */
  chosenTierFits: boolean
  tiers: TierMeasurement[]
}

/**
 * Replicate the rung `use-clinical-ai-input.hook.ts` settles on, rather than
 * re-inventing a rule here: `full` short-circuits when it already fits, and
 * otherwise the largest reduced rung that still fits wins (the ladder is not
 * monotone, so the first fit is usually not the chosen one). Reduced rungs the
 * hook skips measuring are nested inside one that fits, so measuring them here
 * cannot change the outcome.
 */
function chooseTier(
  measurements: TierMeasurement[],
  targetTokens: number,
): ClinicalContextFitTier {
  const measuredTokens: Partial<Record<ClinicalContextFitTier, number>> = {}
  for (const measurement of measurements) measuredTokens[measurement.tier] = measurement.tokens
  if (measuredTokens.full !== undefined && measuredTokens.full <= targetTokens) return 'full'
  return selectBestClinicalContextFitTier(measuredTokens, targetTokens)
}

function idsOf(list: any[] | undefined, prefix: string): string[] {
  return (list ?? []).map((item, index) => String(item?.id ?? `${prefix}#${index}`))
}

function buildIdIndex(
  scoped: Partial<ClinicalDataCollection>,
  includedDocumentIds: string[],
): IdIndex {
  const reports = (scoped.diagnosticReports ?? []) as any[]
  const vitalIds = new Set(idsOf(scoped.vitalSigns as any[], 'vital'))
  const labObs = (scoped.observations ?? []).filter(
    (obs: any, index: number) => !vitalIds.has(String(obs?.id ?? `vital#${index}`)),
  )
  return {
    encounters: idsOf(scoped.encounters as any[], 'enc'),
    conditions: idsOf(scoped.conditions as any[], 'cond'),
    medications: idsOf(scoped.medications as any[], 'med'),
    allergies: idsOf(scoped.allergies as any[], 'alg'),
    immunizations: idsOf(scoped.immunizations as any[], 'imm'),
    procedures: idsOf(scoped.procedures as any[], 'proc'),
    labReports: idsOf(
      reports.filter((r) => inferGroupFromDiagnosticReport(r) !== 'imaging'),
      'labrpt',
    ),
    imagingReports: idsOf(
      reports.filter((r) => inferGroupFromDiagnosticReport(r) === 'imaging'),
      'imgrpt',
    ),
    imagingStudies: idsOf(scoped.imagingStudies as any[], 'study'),
    labObservations: idsOf(labObs as any[], 'obs'),
    vitalSigns: idsOf(scoped.vitalSigns as any[], 'vital'),
    carePlans: idsOf(scoped.carePlans as any[], 'plan'),
    devices: idsOf(scoped.devices as any[], 'dev'),
    consents: idsOf(scoped.consents as any[], 'consent'),
    documents: [...includedDocumentIds],
  }
}

/** Deterministic even sample so a 20k-strong fact category stays scannable. */
function sample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const step = items.length / max
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)])
}

const MAX_FACTS_PER_CATEGORY = 300

function conceptText(concept: any): string {
  return (
    concept?.text
    || concept?.coding?.find((c: any) => c?.display)?.display
    || concept?.coding?.[0]?.code
    || ''
  )
}

function localDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString() : ''
}

/** Every label under which the lab renderers may print this analyte. */
function labNameAliases(observation: any): string[] {
  const aliases = new Set<string>()
  const raw = conceptText(observation?.code)
  if (raw) aliases.add(raw)
  for (const coding of observation?.code?.coding ?? []) {
    if (coding?.display) aliases.add(String(coding.display))
  }
  try {
    const identity = getLabPivotTestIdentity(observation, categorizeObservation(observation)?.id)
    if (identity.displayName && identity.displayName !== 'UNKNOWN') aliases.add(identity.displayName)
  } catch {
    /* identity resolution is best-effort */
  }
  return [...aliases]
}

/** Raw and unit-normalized renderings of one numeric result. */
function labValueAliases(observation: any): string[] {
  const aliases = new Set<string>()
  const display = observationDisplayValue(observation)
  if (display?.value) aliases.add(String(display.value))
  const formatted = formatValue(observation)
  if (formatted.value) aliases.add(String(formatted.value))
  if (formatted.numericValue !== undefined) {
    const quantity = observation?.valueQuantity
    const conversionUnit = quantity?.system === 'http://unitsofmeasure.org'
      ? quantity.code || formatted.unit
      : formatted.unit
    const loincCode = observation?.code?.coding?.find(
      (coding: any) => coding?.system === 'http://loinc.org',
    )?.code
    const testKey = getLabPivotTestIdentity(
      observation,
      categorizeObservation(observation)?.id,
    ).testKey
    const normalized = normalizeAnalyteUnit(testKey, formatted.numericValue, conversionUnit, { loincCode })
    if (normalized) aliases.add(String(normalized.value))
  }
  return [...aliases]
}

/** Key facts derived automatically from the `full`-tier scoped data. */
function buildFacts(
  fullScoped: Partial<ClinicalDataCollection>,
  fullDocumentIds: string[],
  collection: any,
): Fact[] {
  const facts: Fact[] = []

  for (const allergy of (fullScoped.allergies ?? []) as any[]) {
    const name = conceptText(allergy.code)
    if (name) facts.push({ category: 'allergies', label: name, groups: [[name]] })
  }

  for (const condition of (fullScoped.conditions ?? []) as any[]) {
    const coding = condition.code?.coding ?? []
    const icd = coding.find((c: any) => c.system?.toLowerCase?.().includes('icd')) || coding[0]
    const display = conceptText(condition.code)
    const aliases = [icd?.code, display].filter(Boolean).map(String)
    if (aliases.length > 0) {
      facts.push({
        category: 'activeProblems',
        label: `${icd?.code ?? ''} ${display}`.trim(),
        groups: [aliases],
      })
    }
  }

  // Every claims problem the `full` tier put on a timeline line. Retention here
  // asks whether the narrower tier still names that problem at all — the
  // timeline is the only section that carries a problem the encounter window
  // has aged out.
  for (const line of buildProblemTimelineLines(
    {
      conditions: (fullScoped.conditions ?? []) as any[],
      encounters: (fullScoped.encounters ?? []) as any[],
    },
    { locale: 'en' },
  ).lines) {
    facts.push({ category: 'problemTimeline', label: line.label, groups: [[line.label]] })
  }

  const medNames = new Set<string>()
  for (const med of (fullScoped.medications ?? []) as any[]) {
    if (!isMedicationCurrentlyInUse(med, mockNowMs)) continue
    const name = pickAiMedicationName(med.medicationCodeableConcept, med.medicationReference?.display)
    if (name) medNames.add(name)
  }
  for (const name of medNames) {
    facts.push({ category: 'currentMedications', label: name, groups: [[name]] })
  }

  const abnormal: Fact[] = []
  const latestByCode = new Map<string, { date: string; label: string; aliases: string[] }>()
  for (const observation of (fullScoped.observations ?? []) as any[]) {
    for (const value of expandObservationValues(observation)) {
      const display = observationDisplayValue(value)
      if (!display || display.value === '') continue
      const names = labNameAliases(value)
      if (names.length === 0) continue
      const key = names[0]
      const date = String(value?.effectiveDateTime ?? '')
      const previous = latestByCode.get(key)
      if (!previous || date > previous.date) {
        latestByCode.set(key, { date, label: `${key} @ ${date.slice(0, 10)}`, aliases: names })
      }
      if (isObservationAbnormal(value)) {
        abnormal.push({
          category: 'abnormalLabs',
          label: `${key} = ${display.value} (${date.slice(0, 10)})`,
          groups: [names, labValueAliases(value)],
        })
      }
    }
  }
  facts.push(...sample(abnormal, MAX_FACTS_PER_CATEGORY))
  for (const entry of latestByCode.values()) {
    facts.push({ category: 'latestLabPerCode', label: entry.label, groups: [entry.aliases] })
  }

  const documentsById = new Map(
    listClinicalDocuments(collection).map((document) => [document.id, document]),
  )
  for (const id of fullDocumentIds) {
    const document = documentsById.get(id)
    if (!document) continue
    const date = localDate(document.date)
    facts.push({
      category: 'dischargeSummaries',
      label: `${document.title}${date ? ` (${date})` : ''}`,
      // formatDocumentsSection emits exactly this header line.
      groups: [[`Document title: ${document.title}${date ? ` (${date})` : ''}`]],
    })
  }

  for (const procedure of sample((fullScoped.procedures ?? []) as any[], MAX_FACTS_PER_CATEGORY)) {
    const name = conceptText(procedure.code) || 'Procedure'
    const performed = procedureDate(procedure)
    const label = `${name}${performed ? ` (${localDate(performed)})` : ''}`
    facts.push({ category: 'procedures', label, groups: [[label]] })
  }

  return facts
}

interface TierBuild {
  tokens: number
  /** Rendered tokens before any last-resort text truncation. */
  rawTokens: number
  formattedTokens: number
  chars: number
  ms: number
  /** Prioritizer builds spent on this rung (always 1 for the other rungs). */
  passes: number
  scoped: Partial<ClinicalDataCollection>
  rendered: Partial<ClinicalDataCollection>
  includedDocumentIds: string[]
  text: string
  truncatedChars?: { head: number; tail: number; removed: number }
}

/**
 * Mirror the hook's convergence loop (the `current.tier === 'prioritized'`
 * branch of `use-clinical-ai-input.hook.ts`): the prioritizer budgets records
 * by a dataset-wide estimate ratio, so re-aim it at a smaller budget whenever
 * its rendered result overshoots, and keep the first candidate that fits.
 */
function measureTier(
  tier: ClinicalContextFitTier,
  baseProfile: ClinicalContextProfile,
  baseScoped: Partial<ClinicalDataCollection>,
  targetTokens: number,
  allowTextTruncation: boolean,
  originalTokens: number,
): TierBuild {
  let build = measureTierOnce(
    tier, baseProfile, baseScoped, targetTokens, allowTextTruncation, originalTokens, targetTokens,
  )
  if (tier !== 'prioritized') return build
  let budget = targetTokens
  let previousRawTokens: number | undefined
  let passes = 0
  for (;;) {
    const nextBudget = nextPrioritizedContextBudget(
      budget, build.rawTokens, targetTokens, passes, previousRawTokens,
    )
    if (nextBudget === null) return { ...build, passes: passes + 1 }
    previousRawTokens = build.rawTokens
    budget = nextBudget
    passes += 1
    const next = measureTierOnce(
      tier, baseProfile, baseScoped, targetTokens, allowTextTruncation, originalTokens, budget,
    )
    build = { ...next, ms: build.ms + next.ms }
  }
}

function measureTierOnce(
  tier: ClinicalContextFitTier,
  baseProfile: ClinicalContextProfile,
  baseScoped: Partial<ClinicalDataCollection>,
  targetTokens: number,
  allowTextTruncation: boolean,
  originalTokens: number,
  prioritizerBudget: number,
): TierBuild {
  const started = performance.now()
  const candidate = buildClinicalContextFitCandidate(baseProfile, tier, targetTokens)
  const prioritized = tier === 'prioritized'
    ? prioritizeClinicalDataForTokenBudget(
        baseScoped,
        prioritizerBudget,
        originalTokens,
        mockNowMs,
        { preserveDocuments: false },
      )
    : null
  const documentTokenBudget = allowTextTruncation
    ? prioritized?.documentTokenBudget ?? candidate.documentTokenBudget
    : undefined
  const view = renderHook(() =>
    useClinicalContext('insights', {
      profile: candidate.profile as ConsumerProfile,
      clinicalDataOverride: (prioritized?.data ?? undefined) as ClinicalData | undefined,
      documentTokenBudget,
    }),
  )
  const raw = view.result.current.getFullClinicalContext()
  const formattedRaw = view.result.current.getFormattedClinicalContext()
  const includedDocumentIds = [...view.result.current.includedDocumentIds]
  const rawTokens = estimateTokens(raw)
  let text = raw
  let truncatedChars: { head: number; tail: number; removed: number } | undefined
  if (allowTextTruncation && tier === 'prioritized' && rawTokens > targetTokens) {
    text = fitClinicalContextTextToTokenBudget(raw, targetTokens)
    const markerIndex = text.indexOf('[... older or lower-priority clinical context omitted')
    const head = markerIndex >= 0 ? markerIndex : text.length
    const tail = markerIndex >= 0 ? text.length - markerIndex : 0
    truncatedChars = { head, tail, removed: raw.length - text.length }
  }
  const formatted = allowTextTruncation && tier === 'prioritized'
      && estimateTokens(formattedRaw) > targetTokens
    ? fitClinicalContextTextToTokenBudget(formattedRaw, targetTokens)
    : formattedRaw
  const ms = performance.now() - started
  view.unmount()

  const scoped = prioritized
    ? prioritized.data
    : scopeClinicalDataForAi(
        mockCollection as Partial<ClinicalDataCollection>,
        candidate.profile.selection,
        candidate.profile.filters,
        includedDocumentIds,
        mockNowMs,
      )

  return {
    tokens: estimateTokens(text),
    rawTokens,
    formattedTokens: estimateTokens(formatted),
    chars: text.length,
    ms,
    passes: 1,
    scoped,
    // At tiers 0-3 useClinicalContext runs the outbound AI domain filter over
    // the WHOLE queried collection (as scopeClinicalDataForAi already did), so
    // `scoped` is what renders. At the prioritized tier it runs over the
    // already-reduced override instead, and procedures whose linked encounter
    // fell outside the encounter window lose their inpatient evidence and are
    // filtered out a second time — so that tier needs the extra pass here.
    rendered: tier === 'prioritized'
      ? filterAiExcludedClinicalDomains(scoped as never) as Partial<ClinicalDataCollection>
      : scoped,
    includedDocumentIds,
    text,
    truncatedChars,
  }
}

function difference(base: string[], current: string[]): string[] {
  const kept = new Set(current)
  return base.filter((id) => !kept.has(id))
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return 'n/a'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

/**
 * A fixture is EXTERNAL when it was named by absolute path — it may be a real
 * chart rather than generated data, so the report written for it is restricted
 * to aggregates (counts, tokens, percentages).
 */
interface FixtureCase {
  name: string
  file: string
  external: boolean
}

function resolveFixtures(): FixtureCase[] {
  const syntheticDir = path.join(process.cwd(), 'artifacts', 'synthetic-oncology')
  const override = (process.env.CONTEXT_REDUCTION_FIXTURE ?? '').trim()
  if (override === '') {
    const file = path.join(syntheticDir, 'synthetic-cloud-oncology-v2-1100000-tokens.fhir.json')
    return [{ name: path.basename(file), file, external: false }]
  }
  return override
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => (path.isAbsolute(entry)
      // Absolute → external, and its report stays aggregate-only.
      ? { name: path.basename(entry), file: path.resolve(entry), external: true }
      // Bare filename → the historical "pick another generated stress bundle".
      : { name: entry, file: path.join(syntheticDir, entry), external: false }))
}

/** Clinical instants a FHIR resource may date itself by; the newest wins. */
const RECORD_DATE_FIELDS = [
  'effectiveDateTime', 'effectiveInstant', 'issued', 'occurrenceDateTime',
  'authoredOn', 'performedDateTime', 'recordedDate', 'onsetDateTime', 'date',
  'started', 'created',
] as const
const RECORD_PERIOD_FIELDS = [
  'effectivePeriod', 'period', 'performedPeriod', 'occurrencePeriod',
] as const

/**
 * "now" for an external fixture. Relative windows (6m labs, 1y imaging) mean
 * nothing measured against today's calendar date on a chart captured months
 * ago, so the clock is pinned to the newest clinical record in the bundle.
 * Provenance is skipped: it dates the conversion run, not the care.
 */
function latestRecordMs(bundle: any): number | null {
  let latest: number | null = null
  for (const entry of (bundle?.entry ?? []) as any[]) {
    const resource = entry?.resource
    if (!resource || resource.resourceType === 'Provenance') continue
    const candidates: unknown[] = RECORD_DATE_FIELDS.map((field) => resource[field])
    for (const field of RECORD_PERIOD_FIELDS) {
      candidates.push(resource[field]?.start, resource[field]?.end)
    }
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue
      const ms = Date.parse(candidate)
      if (Number.isNaN(ms)) continue
      if (latest === null || ms > latest) latest = ms
    }
  }
  return latest
}

function resolveAsOfMs(bundle: any, external: boolean): number {
  const override = (process.env.CONTEXT_REDUCTION_AS_OF ?? '').trim()
  if (override !== '') {
    const ms = Date.parse(override)
    if (Number.isNaN(ms)) throw new Error(`CONTEXT_REDUCTION_AS_OF is not a date: ${override}`)
    return ms
  }
  if (!external) return SYNTHETIC_NOW_MS
  return latestRecordMs(bundle) ?? Date.now()
}

const FIXTURES = resolveFixtures()
const enabled = process.env.CONTEXT_REDUCTION_REPORT === '1'
const suite = enabled ? describe.each(FIXTURES) : describe.skip.each(FIXTURES)

suite('clinical context reduction measurement — $name', ({ name, file, external }: FixtureCase) => {
  let facts: Fact[] = []
  let factTotals: Record<string, number> = {}
  let baseProfile: ClinicalContextProfile
  let baseScoped: Partial<ClinicalDataCollection>
  let baseIndex: IdIndex
  let fixtureName = ''
  let fixtureBytes = 0
  let resourceCount = 0
  let documentStats = { selected: 0, keySections: 0, fullText: 0 }
  let allDataTokens = 0
  let allDataMs = 0
  let allDataIndex: IdIndex
  const runs: RunResult[] = []
  const sectionRuns: Array<{
    label: string
    total: number
    sections: Array<{ title: string; items: number; tokens: number }>
  }> = []

  beforeAll(() => {
    ensureCategoriesInitialized()
    if (!fs.existsSync(file)) {
      throw new Error(
        `Fixture not found: ${file}.`
        + (external
          ? ''
          : ' Generate it with `node scripts/generate-cloud-oncology-stress-bundle.cjs`.'),
      )
    }
    fixtureName = name
    fixtureBytes = fs.statSync(file).size
    const bundle = JSON.parse(fs.readFileSync(file, 'utf8'))
    resourceCount = bundle.entry?.length ?? 0
    mockNowMs = resolveAsOfMs(bundle, external)
    const parsed = LocalBundleService.parse(bundle)
    if (!parsed) throw new Error('LocalBundleService.parse returned null')
    mockPatient = parsed.patient
    mockCollection = parsed.collection

    // The defaults the hook reads: makeDefaultProfile() in
    // data-selection.provider.tsx = DEFAULT_DATA_SELECTION + DEFAULT_DATA_FILTERS
    // + documentMode 'deduplicatedAdmissions' + no manual document ids.
    baseProfile = {
      selection: { ...DEFAULT_DATA_SELECTION },
      filters: { ...DEFAULT_DATA_FILTERS },
      documentMode: 'deduplicatedAdmissions',
      documentIds: [],
    }
    mockProfile = baseProfile

    const baseDocumentIds = resolveSelectedDocuments(
      listClinicalDocuments(mockCollection),
      baseProfile.documentMode,
      baseProfile.documentIds,
    ).map((document) => document.id)
    baseScoped = scopeClinicalDataForAi(
      mockCollection as Partial<ClinicalDataCollection>,
      baseProfile.selection,
      baseProfile.filters,
      baseDocumentIds,
      mockNowMs,
    )
    // How the documents section is actually built for the `insights` consumer:
    // automatic document modes go through key-section extraction, and a note
    // whose headings the extractor does not recognise keeps its whole text.
    const documentsById = new Map(
      listClinicalDocuments(mockCollection).map((document) => [document.id, document]),
    )
    documentStats = { selected: baseDocumentIds.length, keySections: 0, fullText: 0 }
    for (const id of baseDocumentIds) {
      const text = documentsById.get(id)?.text ?? ''
      if (text !== '' && extractDocumentKeySections(text).extracted) documentStats.keySections += 1
      else documentStats.fullText += 1
    }
    baseIndex = buildIdIndex(baseScoped, baseDocumentIds)
    facts = buildFacts(baseScoped, baseDocumentIds, mockCollection)
    factTotals = {}
    for (const fact of facts) factTotals[fact.category] = (factTotals[fact.category] ?? 0) + 1

    // Upper bound: what "select everything, all time" would send. Not a tier —
    // it is the unreduced ceiling the default profile is already measured against.
    const allProfile: ClinicalContextProfile = {
      selection: { ...ALL_DATA_SELECTION },
      filters: { ...ALL_DATA_FILTERS },
      documentMode: 'all',
      documentIds: [],
    }
    const allDocumentIds = resolveSelectedDocuments(
      listClinicalDocuments(mockCollection),
      'all',
      [],
    ).map((document) => document.id)
    const allScoped = scopeClinicalDataForAi(
      mockCollection as Partial<ClinicalDataCollection>,
      allProfile.selection,
      allProfile.filters,
      allDocumentIds,
      mockNowMs,
    )
    const allStarted = performance.now()
    const allView = renderHook(() =>
      useClinicalContext('insights', { profile: allProfile as ConsumerProfile }),
    )
    const allText = allView.result.current.getFullClinicalContext()
    allDataTokens = estimateTokens(allText)
    allDataMs = Math.round(performance.now() - allStarted)
    allDataIndex = buildIdIndex(allScoped, [...allView.result.current.includedDocumentIds])
    allView.unmount()
  }, 900_000)

  // ── Per-section cost of the untruncated (`full`) tier ─────────────────────
  // The tier ladder above answers "does it fit"; this answers "what is it
  // spending the tokens on", which is what a formatting change is judged by.
  // The widened profile is the "what does more history buy" control: it is a
  // throwaway view (labs deeper + further back, every imaging version) and
  // never touches the saved defaults. Enable it with CONTEXT_REDUCTION_WIDEN=1.
  const measureSections = (profile: ClinicalContextProfile) => {
    const view = renderHook(() =>
      useClinicalContext('insights', { profile: profile as ConsumerProfile }),
    )
    const sections = view.result.current.getClinicalContext().map((section) => ({
      title: section.title,
      items: section.items.length,
      tokens: estimateTokens(view.result.current.formatClinicalContext([section])),
    }))
    const total = estimateTokens(view.result.current.getFullClinicalContext())
    view.unmount()
    return { total, sections }
  }

  it('measures the per-section cost of the full tier', () => {
    sectionRuns.push({ label: 'default filters', ...measureSections(baseProfile) })
    if (process.env.CONTEXT_REDUCTION_WIDEN === '1') {
      sectionRuns.push({
        label: 'widened labs + imaging (labDepth 16 / labs 3y / all imaging versions 3y)',
        ...measureSections({
          ...baseProfile,
          filters: {
            ...baseProfile.filters,
            labDepth: '16',
            labReportTimeRange: '3y',
            imagingReportVersion: 'all',
            imagingReportTimeRange: '3y',
          },
        }),
      })
    }
    expect(sectionRuns[0].sections.length).toBeGreaterThan(0)
  }, 1_800_000)

  const configurations: Array<{ label: string; target: number; truncate: boolean }> = [
    { label: `VGHBrain ${VGHBRAIN_CLINICAL_TOKEN_LIMIT / 1000}K (no text truncation)`, target: VGHBRAIN_CLINICAL_TOKEN_LIMIT, truncate: false },
    { label: '150K clinical budget (no text truncation)', target: 150_000, truncate: false },
    { label: `VGHBrain ${VGHBRAIN_CLINICAL_TOKEN_LIMIT / 1000}K (text truncation allowed)`, target: VGHBRAIN_CLINICAL_TOKEN_LIMIT, truncate: true },
    // Small-window control: the only configuration in which the ladder is
    // actually forced onto the prioritized tier, so the last-resort head/tail
    // text fitting can be observed.
    { label: '4K clinical budget (text truncation allowed)', target: 4_000, truncate: true },
  ]

  it.each(configurations)('measures the tier ladder for $label', ({ label, target, truncate }) => {
    const measurements: TierMeasurement[] = []
    let originalTokens = 0

    for (const tier of TIERS) {
      const built = measureTier(tier, baseProfile, baseScoped, target, truncate, originalTokens)
      if (tier === 'full') originalTokens = built.tokens
      const selectedIndex = buildIdIndex(built.scoped, built.includedDocumentIds)
      const index = buildIdIndex(built.rendered, built.includedDocumentIds)
      const counts = {} as Record<CategoryKey, number>
      const dropped = {} as Record<CategoryKey, string[]>
      const domainFilterDelta: Partial<Record<CategoryKey, number>> = {}
      for (const key of CATEGORY_KEYS) {
        counts[key] = index[key].length
        dropped[key] = difference(baseIndex[key], index[key])
        const delta = selectedIndex[key].length - index[key].length
        if (delta !== 0) domainFilterDelta[key] = delta
      }
      const retained: Record<string, number> = {}
      const lost: Fact[] = []
      for (const fact of facts) {
        const present = fact.groups.every((aliases) =>
          aliases.some((alias) => built.text.includes(alias)),
        )
        if (present) retained[fact.category] = (retained[fact.category] ?? 0) + 1
        else lost.push(fact)
      }
      measurements.push({
        tier,
        tokens: built.tokens,
        passes: built.passes,
        formattedTokens: built.formattedTokens,
        chars: built.chars,
        ms: Math.round(built.ms),
        counts,
        dropped,
        domainFilterDelta,
        retained,
        factTotals,
        lostFacts: lost,
        truncatedChars: built.truncatedChars,
      })
    }
    const chosenTier = chooseTier(measurements, target)
    const chosenTierFits =
      (measurements.find((tier) => tier.tier === chosenTier)?.tokens ?? Infinity) <= target
    runs.push({
      label,
      targetTokens: target,
      allowTextTruncation: truncate,
      chosenTier,
      chosenTierFits,
      tiers: measurements,
    })
    expect(measurements.length).toBeGreaterThan(0)
  }, 1_800_000)

  afterAll(() => {
    if (runs.length === 0) return
    const lines: string[] = []
    lines.push(`# Clinical context reduction — ${fixtureName}`)
    lines.push('')
    lines.push(
      `- Generated: ${new Date().toISOString()} (no AI call)`
      + (external
        ? ' — EXTERNAL fixture: aggregates only; no record labels or free text are written here'
        : ' — synthetic fixture'),
    )
    lines.push(`- Fixture: \`${external ? fixtureName : `artifacts/synthetic-oncology/${fixtureName}`}\` — ${(fixtureBytes / 1024 / 1024).toFixed(1)} MB, ${resourceCount.toLocaleString()} bundle entries`)
    lines.push('- Data selection: application defaults (DEFAULT_DATA_SELECTION + DEFAULT_DATA_FILTERS, documentMode `deduplicatedAdmissions`, no manual document ids)')
    lines.push(`- Clock pinned to ${new Date(mockNowMs).toISOString()} (${external ? 'the latest record date in this bundle, unless CONTEXT_REDUCTION_AS_OF was set' : 'the synthetic fixture asOf'}) so relative windows are reproducible`)
    lines.push('- Tokens are `estimateTokens(getFullClinicalContext())` — the same number the hook compares against the target')
    lines.push('')
    lines.push('## Original context (before any tier reduction)')
    lines.push('')
    lines.push('`all-data` is the ceiling the user could ask for (every category, every version, all time, every document). `full` is tier 0 of the ladder: the saved default profile, unreduced.')
    lines.push('')
    lines.push(`| Scope | Tokens | ms | ${CATEGORY_KEYS.join(' | ')} |`)
    lines.push(`| --- | ---: | ---: | ${CATEGORY_KEYS.map(() => '---:').join(' | ')} |`)
    lines.push(`| all-data (not a tier) | ${allDataTokens.toLocaleString()} | ${allDataMs} | ${CATEGORY_KEYS.map((key) => allDataIndex[key].length).join(' | ')} |`)
    const fullTier = runs[0].tiers[0]
    lines.push(`| full (defaults) | ${fullTier.tokens.toLocaleString()} | ${fullTier.ms} | ${CATEGORY_KEYS.map((key) => fullTier.counts[key]).join(' | ')} |`)
    lines.push('')
    if (allDataIndex.medications.length > 0 && fullTier.counts.medications === 0) {
      lines.push(`> All ${allDataIndex.medications.length} MedicationRequests are excluded by the default \`medicationStatus: active\` + \`medicationTimeRange: 6m\` filters at the pinned clock, so the currentMedications fact category is empty on this fixture.`)
      lines.push('')
    }
    lines.push('Key-fact totals derived from the `full` tier:')
    lines.push('')
    lines.push('| Fact category | Facts |')
    lines.push('| --- | ---: |')
    for (const [category, total] of Object.entries(factTotals)) {
      lines.push(`| ${category} | ${total} |`)
    }
    lines.push('')
    lines.push(`Documents selected by the default \`deduplicatedAdmissions\` mode: ${documentStats.selected} — ${documentStats.keySections} reduced by key-section extraction, ${documentStats.fullText} sent whole (the extractor recognised no headings, or the document carried no text).`)
    lines.push('')

    for (const run of sectionRuns) {
      lines.push(`## Section cost — full tier, ${run.label}`)
      lines.push('')
      lines.push(`Total ${run.total.toLocaleString()} tokens. Per-section tokens are \`estimateTokens(formatClinicalContext([section]))\`, so they include the section title and bullet prefixes and sum to slightly less than the whole (blank separators between sections).`)
      lines.push('')
      lines.push('| Section | Items | Tokens |')
      lines.push('| --- | ---: | ---: |')
      for (const section of run.sections) {
        lines.push(`| ${section.title.replace(/\|/g, '\\|')} | ${section.items} | ${section.tokens.toLocaleString()} |`)
      }
      lines.push('')
    }

    for (const run of runs) {
      lines.push(`## ${run.label}`)
      lines.push('')
      lines.push(`Target: ${run.targetTokens.toLocaleString()} tokens · allowTextTruncation=${run.allowTextTruncation} · chosen tier: **${run.chosenTier}**${run.chosenTierFits ? '' : ' (no tier fits; `prioritized` is the terminal fallback)'}`)
      lines.push('')
      lines.push('The chosen tier is `selectBestClinicalContextFitTier` — the same best-fit rule `use-clinical-ai-input.hook.ts` applies, with `full` short-circuiting when it already fits — not the first tier that happens to fit.')
      lines.push('')
      lines.push('| Tier | Tokens | vs target | ms | Docs | Enc | Cond | Meds | Labs(obs) | LabRpt | ImgRpt | Proc | Allergy |')
      lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
      for (const tier of run.tiers) {
        lines.push([
          `| ${tier.tier}`,
          tier.tokens.toLocaleString(),
          `${((tier.tokens / run.targetTokens) * 100).toFixed(0)}%`,
          tier.ms,
          tier.counts.documents,
          tier.counts.encounters,
          tier.counts.conditions,
          tier.counts.medications,
          tier.counts.labObservations,
          tier.counts.labReports,
          tier.counts.imagingReports,
          tier.counts.procedures,
          `${tier.counts.allergies} |`,
        ].join(' | '))
      }
      lines.push('')
      lines.push('Dropped vs `full` (record counts):')
      lines.push('')
      lines.push(`| Tier | ${CATEGORY_KEYS.join(' | ')} |`)
      lines.push(`| --- | ${CATEGORY_KEYS.map(() => '---:').join(' | ')} |`)
      for (const tier of run.tiers) {
        lines.push(`| ${tier.tier} | ${CATEGORY_KEYS.map((key) => tier.dropped[key].length).join(' | ')} |`)
      }
      lines.push('')
      const factCategories = Object.keys(factTotals)
      lines.push('Key-fact retention (share of `full`-tier facts literally present in the tier text):')
      lines.push('')
      lines.push(`| Tier | ${factCategories.join(' | ')} |`)
      lines.push(`| --- | ${factCategories.map(() => '---:').join(' | ')} |`)
      for (const tier of run.tiers) {
        lines.push(`| ${tier.tier} | ${factCategories.map((category) => pct(tier.retained[category] ?? 0, factTotals[category])).join(' | ')} |`)
      }
      lines.push('')
      const deltas = run.tiers.filter((tier) => Object.keys(tier.domainFilterDelta).length > 0)
      if (deltas.length > 0) {
        lines.push('Selector-vs-renderer mismatch — records the tier selected that `filterAiExcludedClinicalDomains` removed again inside `useClinicalContext` (these are counted as dropped above, but a source catalog built from the selected collection would still list them):')
        lines.push('')
        for (const tier of deltas) {
          lines.push(`- \`${tier.tier}\`: ${Object.entries(tier.domainFilterDelta).map(([key, value]) => `${key} −${value}`).join(', ')}`)
        }
        lines.push('')
      }
      const stop = run.tiers.find((tier) => tier.tier === run.chosenTier) ?? run.tiers[run.tiers.length - 1]
      if (stop.truncatedChars) {
        lines.push(`Text truncation at \`${stop.tier}\`: head ${stop.truncatedChars.head.toLocaleString()} chars + tail ${stop.truncatedChars.tail.toLocaleString()} chars, ${stop.truncatedChars.removed.toLocaleString()} chars removed.`)
        lines.push('')
      } else if (run.allowTextTruncation) {
        lines.push('Text truncation was permitted but never engaged: the ladder settled before the prioritized tier, or the prioritized tier already fitted.')
        lines.push('')
      }
      lines.push(`Facts lost at the chosen tier (\`${stop.tier}\`) — ${stop.lostFacts.length} of ${facts.length}:`)
      lines.push('')
      const byCategory = new Map<string, string[]>()
      for (const fact of stop.lostFacts) {
        const list = byCategory.get(fact.category) ?? []
        list.push(fact.label)
        byCategory.set(fact.category, list)
      }
      if (byCategory.size === 0) lines.push('- (none)')
      for (const [category, labels] of byCategory) {
        // A fact label IS a rendered clinical value — analyte and result, drug
        // name, diagnosis text, document title. For an external fixture only
        // the count may be written down.
        lines.push(external
          ? `- **${category}**: ${labels.length} (labels withheld — external fixture)`
          : `- **${category}** (${labels.length}): ${labels.slice(0, 40).join('; ')}${labels.length > 40 ? ` … +${labels.length - 40} more` : ''}`)
      }
      lines.push('')
    }

    const outDir = process.env.CONTEXT_REDUCTION_OUT_DIR
      ? path.resolve(process.env.CONTEXT_REDUCTION_OUT_DIR)
      : path.join(process.cwd(), 'artifacts', 'context-reduction')
    fs.mkdirSync(outDir, { recursive: true })
    // The widened profile is a second measurement of the same fixture; keep
    // both reports rather than letting one run overwrite the other.
    const variant = process.env.CONTEXT_REDUCTION_WIDEN === '1' ? '-widened' : ''
    const outFile = path.join(outDir, `${fixtureName.replace(/\.(fhir\.)?json$/, '')}${variant}.md`)
    fs.writeFileSync(outFile, lines.join('\n'), 'utf8')

    const stdout: string[] = ['', `Context reduction report → ${outFile}`, '']
    for (const run of runs) {
      stdout.push(`${run.label} (target ${run.targetTokens.toLocaleString()}, chosen=${run.chosenTier}${run.chosenTierFits ? '' : ' (no fit)'})`)
      stdout.push('  tier          tokens  pass      ms   docs  enc  cond  meds   labs  labRpt imgRpt proc')
      for (const tier of run.tiers) {
        stdout.push(
          `  ${tier.tier.padEnd(12)} ${String(tier.tokens).padStart(9)} ${String(tier.passes).padStart(4)} ${String(tier.ms).padStart(7)}`
          + ` ${String(tier.counts.documents).padStart(5)} ${String(tier.counts.encounters).padStart(4)}`
          + ` ${String(tier.counts.conditions).padStart(5)} ${String(tier.counts.medications).padStart(5)}`
          + ` ${String(tier.counts.labObservations).padStart(6)} ${String(tier.counts.labReports).padStart(6)}`
          + ` ${String(tier.counts.imagingReports).padStart(6)} ${String(tier.counts.procedures).padStart(5)}`,
        )
      }
      stdout.push('')
    }
    console.info(stdout.join('\n'))
  })
})
