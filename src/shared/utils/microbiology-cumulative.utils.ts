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
  '13013C': 'identification',
  '13016B': 'culture',
  '13023C': 'susceptibility',
  '13025C': 'directExam',
  '13026C': 'culture',
}

const NHI_STANDARDIZED_NAME_BY_CODE: Record<string, string> = {
  '13013C': '抗酸菌鑑定',
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
  if (sourceOrderCode && ['13013C', '13025C', '13026C'].includes(sourceOrderCode)) {
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
  if (/\bPOSITIVE\b|\bDETECTED\b|\bISOLATED\b|GROWTH\s+OF|檢出|培養出|陽性/i.test(value)) {
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
