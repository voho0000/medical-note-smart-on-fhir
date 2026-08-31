import { categorizeObservation, getTestDisplayName } from '@/src/shared/utils/lab-categories'
import { getOriginalAnalyteDisplayForObs } from '@/src/shared/utils/lab-normalize'
import { getLabPivotTestIdentity } from '@/src/shared/utils/lab-pivot.utils'

export type MicrobiologyFamily = 'bacteriology' | 'mycobacteriology' | 'mycology'

export type MicrobiologyStage =
  | 'directExam'
  | 'molecular'
  | 'culture'
  | 'identification'
  | 'susceptibility'
  | 'other'

export type MicrobiologyResultState =
  | 'noGrowth'
  | 'notDetected'
  | 'normalFlora'
  | 'mixedFlora'
  | 'contaminated'
  | 'detected'
  | 'pending'
  | 'narrative'

export type MicrobiologySpecimenConfidence = 'source' | 'inferred' | 'missing'

export interface MicrobiologySusceptibility {
  antibiotic: string
  result: 'S' | 'I' | 'R'
}

export interface MicrobiologyCumulativeResult {
  id: string
  date: string
  effectiveDateTime: string
  family: MicrobiologyFamily
  stage: MicrobiologyStage
  standardizedName: string
  originalName: string
  specimen: string
  specimenConfidence: MicrobiologySpecimenConfidence
  organization?: string
  value: string
  state: MicrobiologyResultState
  sourceOrderCode?: string
  sourceRoleConflict: boolean
  susceptibilities: MicrobiologySusceptibility[]
}

export interface MicrobiologyCumulativeTrack {
  key: string
  family: MicrobiologyFamily
  specimen: string
  specimenConfidence: MicrobiologySpecimenConfidence
  dates: string[]
  stages: MicrobiologyStage[]
  results: MicrobiologyCumulativeResult[]
}

export interface MicrobiologyCumulativeModel {
  tracks: MicrobiologyCumulativeTrack[]
  resultCount: number
  missingSpecimenCount: number
}

export const MICROBIOLOGY_STAGE_ORDER: MicrobiologyStage[] = [
  'directExam',
  'molecular',
  'culture',
  'identification',
  'susceptibility',
  'other',
]

const FAMILY_ORDER: MicrobiologyFamily[] = [
  'bacteriology',
  'mycobacteriology',
  'mycology',
]

const NHI_ORDER_SYSTEM_FRAGMENTS = ['nhi-medical-order-code', 'nhi-lab-code', 'nhi.lab.code']

const NHI_STAGE_BY_CODE: Record<string, MicrobiologyStage> = {
  '13006C': 'directExam',
  '13007C': 'culture',
  '13008C': 'culture',
  '13009C': 'susceptibility',
  '13013C': 'identification',
  '13015C': 'susceptibility',
  '13016B': 'culture',
  '13023C': 'susceptibility',
  '13025C': 'directExam',
  '13026C': 'culture',
}

const NHI_STANDARDIZED_NAME_BY_CODE: Record<string, string> = {
  '13009C': '抗生素藥敏試驗',
  '13013C': '抗酸菌鑑定',
  '13015C': '抗酸菌藥敏試驗',
  '13016B': 'Blood Culture',
  '13023C': '抗生素藥敏試驗',
  '13025C': '抗酸菌染色',
  '13026C': '抗酸菌培養',
}

function normalizedText(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ')
    : ''
}

function observationLabels(obs: any): string {
  const codings = Array.isArray(obs?.code?.coding) ? obs.code.coding : []
  return [obs?.code?.text, ...codings.flatMap((coding: any) => [coding?.display, coding?.code])]
    .map(normalizedText)
    .filter(Boolean)
    .join(' ')
}

function isNhiOrderSystem(system: unknown): boolean {
  const normalized = normalizedText(system).toLowerCase()
  return NHI_ORDER_SYSTEM_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

function localObservationLabels(obs: any): string {
  const codings = Array.isArray(obs?.code?.coding) ? obs.code.coding : []
  return [
    obs?.code?.text,
    ...codings
      .filter((coding: any) => !isNhiOrderSystem(coding?.system))
      .flatMap((coding: any) => [coding?.display, coding?.code]),
  ]
    .map(normalizedText)
    .filter(Boolean)
    .join(' ')
}

function getNhiOrderCode(obs: any): string | undefined {
  const codings = Array.isArray(obs?.code?.coding) ? obs.code.coding : []
  for (const coding of codings) {
    if (!isNhiOrderSystem(coding?.system)) continue
    const code = normalizedText(coding?.code).toUpperCase()
    if (code) return code
  }
  return undefined
}

function textStages(labels: string): Set<MicrobiologyStage> {
  const stages = new Set<MicrobiologyStage>()
  if (/GRAM|ACID[ -]?FAST|AFB|STAIN|SMEAR|KOH|INDIA INK|染色|抹片|鏡檢/i.test(labels)) {
    stages.add('directExam')
  }
  if (/PCR|NAAT|NUCLEIC|MOLECULAR|核酸|分子檢測/i.test(labels)) stages.add('molecular')
  if (/CULTUR|培養/i.test(labels)) stages.add('culture')
  if (/IDENTIF|鑑定/i.test(labels)) stages.add('identification')
  if (/SUSCEPT|SENSITIV|RESIST|ANTIBIOGRAM|藥敏|敏感性|抗藥/i.test(labels)) {
    stages.add('susceptibility')
  }
  return stages
}

function classifyStage(obs: any, labels: string): {
  stage: MicrobiologyStage
  sourceRoleConflict: boolean
  sourceOrderCode?: string
} {
  const sourceOrderCode = getNhiOrderCode(obs)
  const sourceStage = sourceOrderCode ? NHI_STAGE_BY_CODE[sourceOrderCode] : undefined
  const stagesFromText = textStages(labels)
  if (sourceStage) {
    const stagesFromLocalText = textStages(localObservationLabels(obs))
    return {
      stage: sourceStage,
      sourceOrderCode,
      sourceRoleConflict: stagesFromLocalText.size > 0 && !stagesFromLocalText.has(sourceStage),
    }
  }
  const stage = MICROBIOLOGY_STAGE_ORDER.find((candidate) => stagesFromText.has(candidate)) ?? 'other'
  return { stage, sourceRoleConflict: false, sourceOrderCode }
}

function classifyFamily(labels: string, sourceOrderCode?: string): MicrobiologyFamily {
  if (sourceOrderCode && ['13013C', '13015C', '13025C', '13026C'].includes(sourceOrderCode)) {
    return 'mycobacteriology'
  }
  if (/MYCOBACT|TUBERC|ACID[ -]?FAST|\bAFB\b|結核|分枝桿菌|抗酸菌/i.test(labels)) {
    return 'mycobacteriology'
  }
  if (/FUNG|YEAST|MOLD|MOULD|KOH|INDIA INK|黴菌|真菌|酵母/i.test(labels)) {
    return 'mycology'
  }
  return 'bacteriology'
}

function observationValue(obs: any): string {
  if (obs?.valueString !== undefined && obs.valueString !== null) {
    return normalizedText(obs.valueString) || '—'
  }
  if (obs?.valueCodeableConcept) {
    const concept = obs.valueCodeableConcept
    return normalizedText(concept.text)
      || normalizedText(concept.coding?.[0]?.display)
      || normalizedText(concept.coding?.[0]?.code)
      || '—'
  }
  if (obs?.valueQuantity?.value !== undefined && obs.valueQuantity?.value !== null) {
    return `${obs.valueQuantity.value}${obs.valueQuantity.unit ? ` ${obs.valueQuantity.unit}` : ''}`
  }
  return '—'
}

function classifyResultState(value: string, status: unknown): MicrobiologyResultState {
  const normalizedStatus = normalizedText(status).toLowerCase()
  if (!value || value === '—' || ['registered', 'preliminary'].includes(normalizedStatus)) return 'pending'
  if (/NO\s+GROWTH|WITHOUT\s+GROWTH|無生長|未生長|未培養出/i.test(value)) return 'noGrowth'
  if (/SALIVA\s+CONTAMINATION|CONTAMINAT|污染/i.test(value)) return 'contaminated'
  if (/NORMAL\s+(?:FLORA|MICROORGANISMS?)|正常菌叢/i.test(value)) return 'normalFlora'
  if (/MIXED\s+FLORA|MIXED\s+GROWTH|混合菌/i.test(value)) return 'mixedFlora'
  if (/NOT\s+(?:FOUND|DETECTED|SEEN|ISOLATED)|NONE\s+(?:FOUND|SEEN)|NO\s+(?:BACTERIA|FUNGUS|AEROBIC\s+PATHOGEN|ANAEROBIC\s+PATHOGEN)|NEGATIVE|未檢出|未發現|陰性|無抗酸菌/i.test(value)) {
    return 'notDetected'
  }
  // NHI free-text reports name the isolate as `菌名:...`; a named organism is
  // a positive result even when no growth keyword appears.
  if (/\bPOSITIVE\b|\bDETECTED\b|\bISOLATED\b|GROWTH\s+OF|長菌|檢出|培養出|陽性|菌名\d*\s*[:：]\s*\S/i.test(value)) {
    return 'detected'
  }
  return 'narrative'
}

function susceptibilityResult(value: string): 'S' | 'I' | 'R' | null {
  const normalized = value.normalize('NFKC').trim().toUpperCase()
  if (/^(S|SENSITIVE|SUSCEPTIBLE|敏感)$/.test(normalized)) return 'S'
  if (/^(I|INTERMEDIATE|中介)$/.test(normalized)) return 'I'
  if (/^(R|RESISTANT|RESISTANCE|抗藥)$/.test(normalized)) return 'R'
  return null
}

function extractSusceptibilities(obs: any): MicrobiologySusceptibility[] {
  const components = Array.isArray(obs?.component) ? obs.component : []
  return components.flatMap((component: any) => {
    const antibiotic = normalizedText(component?.code?.text)
      || normalizedText(component?.code?.coding?.[0]?.display)
    const rawResult = normalizedText(component?.valueCodeableConcept?.text)
      || normalizedText(component?.valueCodeableConcept?.coding?.[0]?.code)
      || normalizedText(component?.valueString)
    const result = susceptibilityResult(rawResult)
    return antibiotic && result ? [{ antibiotic, result }] : []
  })
}

function resolveSpecimen(obs: any, labels: string): {
  specimen: string
  confidence: MicrobiologySpecimenConfidence
} {
  const explicit = normalizedText(obs?.specimen?.display)
    || normalizedText(obs?.bodySite?.text)
    || normalizedText(obs?.bodySite?.coding?.[0]?.display)
  if (explicit) return { specimen: explicit, confidence: 'source' }
  if (/BLOOD\s+CULTURE|血液培養/i.test(labels)) return { specimen: 'Blood', confidence: 'inferred' }
  return { specimen: 'unknown', confidence: 'missing' }
}

function resultId(obs: any, index: number): string {
  return normalizedText(obs?.id) || `microbiology-result-${index}`
}

export function buildMicrobiologyCumulativeModel(
  observations: any[],
): MicrobiologyCumulativeModel {
  const results: MicrobiologyCumulativeResult[] = []

  observations.forEach((obs, index) => {
    if (categorizeObservation(obs)?.id !== 'microbio') return
    const effectiveDateTime = normalizedText(obs?.effectiveDateTime)
      || normalizedText(obs?.issued)
    const date = effectiveDateTime.slice(0, 10)
    if (!date) return

    const labels = observationLabels(obs)
    const stageInfo = classifyStage(obs, labels)
    // Family classification must not consume the NHI order's explanatory
    // display text. For example, 13007C says 「抗酸菌除外」 and would otherwise
    // be promoted into the mycobacterial family merely because the excluded
    // organism name appears in that sentence.
    const family = classifyFamily(localObservationLabels(obs), stageInfo.sourceOrderCode)
    const specimen = resolveSpecimen(obs, labels)
    const identity = getLabPivotTestIdentity(obs, 'microbio', 'standardized')
    const originalName = getOriginalAnalyteDisplayForObs(obs)
      || getTestDisplayName(obs)
      || identity.displayName
    const value = observationValue(obs)
    const susceptibilities = extractSusceptibilities(obs)

    results.push({
      id: resultId(obs, index),
      date,
      effectiveDateTime,
      family,
      stage: susceptibilities.length > 0 && stageInfo.stage === 'other'
        ? 'susceptibility'
        : stageInfo.stage,
      standardizedName: stageInfo.sourceOrderCode
        ? (NHI_STANDARDIZED_NAME_BY_CODE[stageInfo.sourceOrderCode] ?? identity.displayName)
        : identity.displayName,
      originalName,
      specimen: specimen.specimen,
      specimenConfidence: specimen.confidence,
      organization: normalizedText(obs?.performer?.[0]?.display) || undefined,
      value,
      state: classifyResultState(value, obs?.status),
      sourceOrderCode: stageInfo.sourceOrderCode,
      sourceRoleConflict: stageInfo.sourceRoleConflict,
      susceptibilities,
    })
  })

  // A single 13006C microscopy report is often flattened into several
  // Observations. Some component rows say "Sputum" while Gram-stain rows from
  // that same report omit specimen. Propagate only within the exact same
  // hospital, date and NHI order, and only when there is one unambiguous source
  // specimen. We deliberately do not infer across culture/stain order codes.
  const reportGroups = new Map<string, MicrobiologyCumulativeResult[]>()
  results.forEach((result) => {
    if (!result.sourceOrderCode || !result.organization) return
    const key = [result.date, result.organization, result.sourceOrderCode, result.family].join('|')
    const group = reportGroups.get(key) ?? []
    group.push(result)
    reportGroups.set(key, group)
  })
  reportGroups.forEach((group) => {
    const sourceSpecimens = [...new Set(
      group
        .filter((result) => result.specimenConfidence === 'source')
        .map((result) => result.specimen),
    )]
    if (sourceSpecimens.length !== 1) return
    group.forEach((result) => {
      if (result.specimenConfidence !== 'missing') return
      result.specimen = sourceSpecimens[0]
      result.specimenConfidence = 'inferred'
    })
  })

  // Bridges can emit both the local-name and LOINC-normalized copy of the same
  // report. Collapse only semantically identical rows; different values or
  // hospitals remain visible as separate source results.
  const seenResultKeys = new Set<string>()
  const uniqueResults = results.filter((result) => {
    const key = [
      result.effectiveDateTime,
      result.organization ?? '',
      result.sourceOrderCode ?? '',
      result.family,
      result.stage,
      result.standardizedName,
      result.specimen,
      result.value,
    ].map((part) => normalizedText(part).toLowerCase()).join('|')
    if (seenResultKeys.has(key)) return false
    seenResultKeys.add(key)
    return true
  })

  const tracksByKey = new Map<string, MicrobiologyCumulativeResult[]>()
  uniqueResults.forEach((result) => {
    const specimenKey = result.specimen.normalize('NFKC').trim().toLowerCase()
    const key = `${result.family}|${specimenKey}`
    const trackResults = tracksByKey.get(key) ?? []
    trackResults.push(result)
    tracksByKey.set(key, trackResults)
  })

  const tracks = [...tracksByKey.entries()].map(([key, trackResults]) => {
    trackResults.sort((left, right) => right.effectiveDateTime.localeCompare(left.effectiveDateTime))
    const confidence: MicrobiologySpecimenConfidence = trackResults.some((result) => result.specimenConfidence === 'missing')
      ? 'missing'
      : trackResults.some((result) => result.specimenConfidence === 'inferred')
        ? 'inferred'
        : 'source'
    return {
      key,
      family: trackResults[0].family,
      specimen: trackResults[0].specimen,
      specimenConfidence: confidence,
      dates: [...new Set(trackResults.map((result) => result.date))].sort((a, b) => b.localeCompare(a)),
      stages: MICROBIOLOGY_STAGE_ORDER.filter((stage) => trackResults.some((result) => result.stage === stage)),
      results: trackResults,
    }
  })

  tracks.sort((left, right) => {
    const leftFamily = FAMILY_ORDER.indexOf(left.family)
    const rightFamily = FAMILY_ORDER.indexOf(right.family)
    if (leftFamily !== rightFamily) return leftFamily - rightFamily
    if (left.specimenConfidence !== right.specimenConfidence) {
      const confidenceOrder: MicrobiologySpecimenConfidence[] = ['source', 'inferred', 'missing']
      return confidenceOrder.indexOf(left.specimenConfidence) - confidenceOrder.indexOf(right.specimenConfidence)
    }
    if (left.specimen === 'Blood' && right.specimen !== 'Blood') return -1
    if (right.specimen === 'Blood' && left.specimen !== 'Blood') return 1
    return left.specimen.localeCompare(right.specimen)
  })

  return {
    tracks,
    resultCount: uniqueResults.length,
    missingSpecimenCount: uniqueResults.filter((result) => result.specimenConfidence === 'missing').length,
  }
}

/**
 * Display columns of the date-per-row cumulative table. Identification is the
 * outcome of a culture, so both share one column; molecular and free-text
 * "other" results only earn a column when the patient actually has them.
 */
export type MicrobiologyStageColumn =
  | 'directExam'
  | 'molecular'
  | 'culture'
  | 'susceptibility'
  | 'other'

export const MICROBIOLOGY_STAGE_COLUMN_ORDER: MicrobiologyStageColumn[] = [
  'directExam',
  'molecular',
  'culture',
  'susceptibility',
  'other',
]

export function microbiologyStageColumn(stage: MicrobiologyStage): MicrobiologyStageColumn {
  return stage === 'identification' ? 'culture' : stage
}

export interface MicrobiologyEvent {
  key: string
  date: string
  specimen: string
  specimenConfidence: MicrobiologySpecimenConfidence
  family: MicrobiologyFamily
  organization?: string
  results: MicrobiologyCumulativeResult[]
  resultsByColumn: Partial<Record<MicrobiologyStageColumn, MicrobiologyCumulativeResult[]>>
}

const RESULT_STATE_PRIORITY: Record<MicrobiologyResultState, number> = {
  detected: 0,
  contaminated: 1,
  pending: 2,
  mixedFlora: 3,
  narrative: 4,
  normalFlora: 5,
  notDetected: 6,
  noGrowth: 7,
}

/**
 * Smear-context items (WBC / epithelial cells / neutrophil counts) grade the
 * specimen instead of naming an organism; the table demotes them to one muted
 * quality line under the organism findings.
 */
export function isSmearContextResult(result: MicrobiologyCumulativeResult): boolean {
  const names = `${result.standardizedName} ${result.originalName}`
  return /\bW\.?B\.?C\b|EPITH|EP\.?\s?CELL|NEUTROPHIL|白血球|上皮/i.test(names)
}

/** A graded-negative narrative line such as `Gram(-) coccus:-`. */
export function hasNegativeGradeValue(value: string): boolean {
  return /[:：]\s*[-−]\s*$/.test(value.normalize('NFKC').trim())
}

/**
 * Clinical scan order inside one cell: significant states first, organism
 * findings before graded negatives, specimen-quality lines last.
 */
export function compareMicrobiologyCellResults(
  left: MicrobiologyCumulativeResult,
  right: MicrobiologyCumulativeResult,
): number {
  const contextDifference = Number(isSmearContextResult(left)) - Number(isSmearContextResult(right))
  if (contextDifference !== 0) return contextDifference
  // Workflow order inside a merged column (culture before its identification).
  const stageDifference = MICROBIOLOGY_STAGE_ORDER.indexOf(left.stage)
    - MICROBIOLOGY_STAGE_ORDER.indexOf(right.stage)
  if (stageDifference !== 0) return stageDifference
  const stateDifference = RESULT_STATE_PRIORITY[left.state] - RESULT_STATE_PRIORITY[right.state]
  if (stateDifference !== 0) return stateDifference
  const gradeDifference = Number(hasNegativeGradeValue(left.value)) - Number(hasNegativeGradeValue(right.value))
  if (gradeDifference !== 0) return gradeDifference
  return left.standardizedName.localeCompare(right.standardizedName)
}

/** Organism named inside a susceptibility report free text, e.g. `菌名:...`. */
export function extractSusceptibilityOrganism(value: string): string | null {
  const match = value.normalize('NFKC').match(
    /(?:菌名|Organism|Isolate)\s*[:：]\s*([^:：]+?)(?=\s+\S+[:：]|$)/i,
  )
  const organism = match?.[1]?.trim()
  return organism || null
}

export interface SusceptibilityEntry {
  antibiotic: string
  /** Verbatim result token: S/I/R, other letters (N, D), MIC (`<=0.25`), or letter+MIC (`S(≦0.12)`). */
  result: string
}

export interface SusceptibilityIsolate {
  organism: string | null
  /** 菌量／長菌量 when the report states one. */
  quantity: string | null
  entries: SusceptibilityEntry[]
}

export interface ParsedSusceptibilityText {
  /**
   * Some hospitals report several organisms in one flattened value using
   * numbered slots (`菌名1:… 菌名2:…`); each slot keeps its own drug panel.
   */
  isolates: SusceptibilityIsolate[]
  /** Any text the parser could not account for; must stay visible verbatim. */
  leftover: string
}

const SUSCEPTIBILITY_KEY_PATTERN = /^(菌名\d*|菌量\d*|長菌量\d*)[:：](.*)$/
// Result token grammar seen in real reports: S/I/R and other single letters
// (敏盛 uses N), letter with parenthesized MIC (`S(≦0.12)`), or a bare
// MIC/dilution with an optional comparator (`<=0.25`, `≧8`, `2/38`).
const SUSCEPTIBILITY_RESULT = '[A-Za-z]{1,2}(?:\\([^()]{1,16}\\))?|[<>=≦≧≤≥]{0,2}\\d+(?:\\.\\d+)?(?:\\/\\d+(?:\\.\\d+)?)?'
const SUSCEPTIBILITY_ENTRY_PATTERN = new RegExp(`^(.*[A-Za-z].*?)[:：](${SUSCEPTIBILITY_RESULT})$`)

/** `S(≦0.12)` → letter S + detail ≦0.12; `<=0.25` → MIC-only detail. */
export function splitSusceptibilityResult(result: string): { letter: string | null; detail: string | null } {
  const letterWithDetail = result.match(/^([A-Za-z]{1,2})\(([^()]+)\)$/)
  if (letterWithDetail) return { letter: letterWithDetail[1], detail: letterWithDetail[2] }
  if (/^[A-Za-z]{1,2}$/.test(result)) return { letter: result, detail: null }
  return { letter: null, detail: result }
}

/**
 * NHI exports flatten a whole antibiogram into one line:
 * `菌名:Escherichia coli 菌量:Light AN:S CTX:I … TZP:D`.
 * Split it back into isolates and drug results for display. Result tokens
 * stay verbatim (including non-S/I/R letters such as N or D) and any
 * unrecognized text is returned as `leftover` — this is layout only, never
 * value rewriting. Titers such as `1:80` never match the drug grammar (a drug
 * needs a letter), so serology narratives fall through untouched. Returns
 * null when the text is not clearly an antibiogram.
 */
export function parseSusceptibilityFreeText(value: string): ParsedSusceptibilityText | null {
  const tokens = value.normalize('NFKC').trim().split(/\s+/)
  const isolates: SusceptibilityIsolate[] = []
  const leftoverTokens: string[] = []
  // Which multi-token field is currently collecting trailing words
  // (e.g. `菌名:Escherichia` followed by the bare token `coli`).
  let collecting: 'organism' | 'quantity' | null = null

  const currentIsolate = (): SusceptibilityIsolate => {
    if (isolates.length === 0) isolates.push({ organism: null, quantity: null, entries: [] })
    return isolates[isolates.length - 1]
  }

  for (const token of tokens) {
    const key = token.match(SUSCEPTIBILITY_KEY_PATTERN)
    if (key) {
      const rest = key[2].trim()
      if (key[1].startsWith('菌名')) {
        // A new organism slot starts a new isolate once the previous one has
        // any content of its own.
        if (isolates.length === 0 || isolates[isolates.length - 1].organism !== null) {
          isolates.push({ organism: null, quantity: null, entries: [] })
        }
        collecting = 'organism'
        currentIsolate().organism = rest || null
      } else {
        collecting = 'quantity'
        currentIsolate().quantity = rest || null
      }
      continue
    }
    const entry = token.match(SUSCEPTIBILITY_ENTRY_PATTERN)
    if (entry) {
      collecting = null
      currentIsolate().entries.push({ antibiotic: entry[1], result: entry[2] })
      continue
    }
    if (collecting === 'organism') {
      const isolate = currentIsolate()
      isolate.organism = isolate.organism ? `${isolate.organism} ${token}` : token
      continue
    }
    if (collecting === 'quantity') {
      const isolate = currentIsolate()
      isolate.quantity = isolate.quantity ? `${isolate.quantity} ${token}` : token
      continue
    }
    leftoverTokens.push(token)
  }

  const totalEntries = isolates.reduce((sum, isolate) => sum + isolate.entries.length, 0)
  if (totalEntries < 3) return null
  return { isolates, leftover: leftoverTokens.join(' ') }
}

const EVENT_SPECIMEN_UNKNOWN = 'unknown'

function eventSpecimenRank(specimen: string, confidence: MicrobiologySpecimenConfidence): number {
  if (confidence === 'missing' || specimen === EVENT_SPECIMEN_UNKNOWN) return 2
  return specimen.toLowerCase() === 'blood' ? 0 : 1
}

/**
 * One row of the cumulative table: everything reported for one collection date
 * of one specimen and organism family at one hospital. Newest first; within a
 * date blood cultures lead, named specimens follow, missing-specimen rows go
 * last so the timeline stays scannable.
 */
export function buildMicrobiologyEvents(model: MicrobiologyCumulativeModel): MicrobiologyEvent[] {
  const byKey = new Map<string, MicrobiologyEvent>()
  for (const track of model.tracks) {
    for (const result of track.results) {
      const key = [result.date, result.family, result.specimen, result.organization ?? ''].join('|')
      let event = byKey.get(key)
      if (!event) {
        event = {
          key,
          date: result.date,
          specimen: result.specimen,
          specimenConfidence: result.specimenConfidence,
          family: result.family,
          organization: result.organization,
          results: [],
          resultsByColumn: {},
        }
        byKey.set(key, event)
      }
      event.results.push(result)
      if (result.specimenConfidence === 'missing') event.specimenConfidence = 'missing'
      const column = microbiologyStageColumn(result.stage)
      const cell = event.resultsByColumn[column] ?? []
      cell.push(result)
      event.resultsByColumn[column] = cell
    }
  }
  const events = [...byKey.values()]
  for (const event of events) {
    for (const cell of Object.values(event.resultsByColumn)) {
      cell.sort(compareMicrobiologyCellResults)
    }
  }
  events.sort((left, right) => {
    if (left.date !== right.date) return right.date.localeCompare(left.date)
    const familyDifference = FAMILY_ORDER.indexOf(left.family) - FAMILY_ORDER.indexOf(right.family)
    if (familyDifference !== 0) return familyDifference
    const specimenDifference = eventSpecimenRank(left.specimen, left.specimenConfidence)
      - eventSpecimenRank(right.specimen, right.specimenConfidence)
    if (specimenDifference !== 0) return specimenDifference
    if (left.specimen !== right.specimen) return left.specimen.localeCompare(right.specimen)
    return (left.organization ?? '').localeCompare(right.organization ?? '')
  })
  return events
}
