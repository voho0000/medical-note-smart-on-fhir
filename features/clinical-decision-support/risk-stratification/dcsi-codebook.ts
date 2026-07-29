import type {
  ConditionEntity,
  EncounterEntity,
  ProcedureEntity,
} from '@/src/core/entities/clinical-data.entity'
import type {
  CdssDcsiDomainContext,
  CdssFact,
  CdssFactSource,
  DcsiDomainId,
} from '../types'

/**
 * Deterministic DCSI rule set. Keep this versioned independently from the UI so
 * a hospital can replace the value sets without changing the clinical module.
 */
export const DCSI_CODEBOOK_VERSION = 'dcsi-icd10-fhir-2017-v1'
export const DCSI_OBSERVATION_WINDOW_DAYS = 365

const ICD10_SYSTEMS = new Set([
  'http://hl7.org/fhir/sid/icd-10',
  'http://hl7.org/fhir/sid/icd-10-cm',
  'urn:oid:2.16.840.1.113883.6.90',
  'https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/icd-10-cm-2021-tw',
])

const ACCEPTED_CONDITION_STATUS = new Set(['active', 'recurrence', 'relapse'])
const EXCLUDED_CONDITION_STATUS = new Set(['inactive', 'resolved', 'entered-in-error'])
const EXCLUDED_VERIFICATION_STATUS = new Set(['refuted', 'entered-in-error'])
const EXCLUDED_ENCOUNTER_STATUS = new Set(['cancelled', 'entered-in-error'])
const ACCEPTED_PROCEDURE_STATUS = new Set(['completed', 'in-progress'])

type CodingLike = { system?: string; code?: string; display?: string }
type EvidenceKind = 'diagnosis' | 'laboratory' | 'procedure'

interface DcsiRule {
  domain: DcsiDomainId
  score: 1 | 2
  code: RegExp
  zh: string
  en: string
}

interface EvidenceCandidate {
  domain: DcsiDomainId
  score: 1 | 2
  kind: EvidenceKind
  diabetesAttribution: 'explicit' | 'not-established'
  zh: string
  en: string
  source: CdssFactSource
}

const DIABETES = 'E(?:08|09|10|11|13)'

/**
 * ICD-10-CM translation of the seven updated DCSI domains. Score-2 rules are
 * evaluated first so a specific severe code is never reduced by a broad
 * category rule.
 */
export const DCSI_ICD10_RULES: readonly DcsiRule[] = [
  // Ophthalmic
  {
    domain: 'ophthalmic',
    score: 2,
    code: new RegExp(`^${DIABETES}\\.35`),
    zh: '增殖性糖尿病視網膜病變',
    en: 'Proliferative diabetic retinopathy',
  },
  {
    domain: 'ophthalmic',
    score: 2,
    code: /^(?:H33|H35\.2|H43\.1|H54)(?:\.|$)/,
    zh: '嚴重眼部病變',
    en: 'Severe ophthalmic complication',
  },
  {
    domain: 'ophthalmic',
    score: 1,
    code: new RegExp(`^${DIABETES}\\.3`),
    zh: '糖尿病眼部病變',
    en: 'Diabetic ophthalmic complication',
  },
  {
    domain: 'ophthalmic',
    score: 1,
    code: /^H35\.(?:0|3|6|8)/,
    zh: '視網膜病變',
    en: 'Retinal complication',
  },

  // Nephropathy
  {
    domain: 'nephropathy',
    score: 2,
    code: /^(?:N17|N18\.[456]|N19|T82\.4|Z49|Z94\.0|Z99\.2)(?:\.|$)/,
    zh: '重度腎病變或腎臟替代治療',
    en: 'Severe kidney disease or kidney replacement therapy',
  },
  {
    domain: 'nephropathy',
    score: 1,
    code: new RegExp(`^${DIABETES}\\.2`),
    zh: '糖尿病腎病變',
    en: 'Diabetic kidney complication',
  },
  {
    domain: 'nephropathy',
    score: 1,
    code: /^(?:N03|N04|N05|N08\.3|N18\.[123]|R80)(?:\.|$)/,
    zh: '慢性腎病或蛋白尿',
    en: 'Chronic kidney disease or proteinuria',
  },

  // Neuropathy (maximum one point)
  {
    domain: 'neuropathy',
    score: 1,
    code: new RegExp(`^${DIABETES}\\.4`),
    zh: '糖尿病神經病變',
    en: 'Diabetic neuropathy',
  },
  {
    domain: 'neuropathy',
    score: 1,
    code: /^H49(?:\.|$)/,
    zh: '眼球運動神經麻痺',
    en: 'Ocular motor nerve palsy',
  },
  {
    domain: 'neuropathy',
    score: 1,
    code: /^(?:G59\.0|G60\.9|G63\.2|G73\.3|G99\.0|M14\.6)(?:\.|$)/,
    zh: '周邊或自主神經病變',
    en: 'Peripheral or autonomic neuropathy',
  },

  // Cerebrovascular
  {
    domain: 'cerebrovascular',
    score: 2,
    code: /^(?:I6[0-4]|I69)(?:\.|$)/,
    zh: '腦中風',
    en: 'Stroke',
  },
  {
    domain: 'cerebrovascular',
    score: 1,
    code: /^G45(?:\.|$)/,
    zh: '暫時性腦缺血發作',
    en: 'Transient ischemic attack',
  },

  // Cardiovascular
  {
    domain: 'cardiovascular',
    score: 2,
    code: /^(?:I50|I11\.0|I13\.[02])(?:\.|$)/,
    zh: '心衰竭',
    en: 'Heart failure',
  },
  {
    domain: 'cardiovascular',
    score: 2,
    code: /^I2[1-3](?:\.|$)/,
    zh: '心肌梗塞',
    en: 'Myocardial infarction',
  },
  {
    domain: 'cardiovascular',
    score: 2,
    code: /^(?:I46|I48|I49)(?:\.|$)/,
    zh: '嚴重心律不整或心跳停止',
    en: 'Serious arrhythmia or cardiac arrest',
  },
  {
    domain: 'cardiovascular',
    score: 2,
    code: /^I71(?:\.|$)/,
    zh: '主動脈瘤或剝離',
    en: 'Aortic aneurysm or dissection',
  },
  {
    domain: 'cardiovascular',
    score: 1,
    code: /^(?:I20|I24|I25|I70)(?:\.|$)/,
    zh: '缺血性或動脈粥樣硬化心血管病變',
    en: 'Ischemic or atherosclerotic cardiovascular disease',
  },

  // Peripheral vascular
  {
    domain: 'peripheral-vascular',
    score: 2,
    code: new RegExp(`^(?:${DIABETES}\\.(?:52|62[12])(?:\\.|$)|I70\\.2(?:3|6)|I74\\.3|A48\\.0|L97|L98\\.4)`),
    zh: '下肢潰瘍、壞疽或嚴重周邊血管病變',
    en: 'Lower-limb ulcer, gangrene, or severe peripheral vascular disease',
  },
  {
    domain: 'peripheral-vascular',
    score: 1,
    code: new RegExp(`^(?:${DIABETES}\\.5|I70\\.2|I72\\.4|I73\\.9|I79\\.2)`),
    zh: '糖尿病周邊血管病變',
    en: 'Diabetic peripheral vascular disease',
  },

  // Acute metabolic complications
  {
    domain: 'metabolic',
    score: 2,
    code: new RegExp(`^${DIABETES}\\.(?:01|11|641)(?:\\.|$)`),
    zh: '合併昏迷的急性代謝併發症',
    en: 'Acute metabolic complication with coma',
  },
  {
    domain: 'metabolic',
    score: 1,
    code: new RegExp(`^${DIABETES}\\.(?:00|10|649)(?:\\.|$)`),
    zh: '未合併昏迷的急性代謝併發症',
    en: 'Acute metabolic complication without coma',
  },
]

const FACT_KEY_BY_DOMAIN: Record<DcsiDomainId, string> = {
  ophthalmic: 'dcsiOphthalmicEvidence',
  nephropathy: 'dcsiNephropathyEvidence',
  neuropathy: 'dcsiNeuropathyEvidence',
  cerebrovascular: 'dcsiCerebrovascularEvidence',
  cardiovascular: 'dcsiCardiovascularEvidence',
  'peripheral-vascular': 'dcsiPeripheralVascularEvidence',
  metabolic: 'dcsiMetabolicEvidence',
}

function dateOnly(value?: string): string | undefined {
  if (!value || Number.isNaN(Date.parse(value))) return undefined
  return value.slice(0, 10)
}

function isWithinObservationWindow(date: string | undefined, now: Date): boolean {
  if (!date) return false
  const timestamp = Date.parse(date)
  if (Number.isNaN(timestamp)) return false
  const ageMs = now.getTime() - timestamp
  return ageMs >= 0 && ageMs <= DCSI_OBSERVATION_WINDOW_DAYS * 86_400_000
}

function normalizedCode(code?: string): string | undefined {
  const value = code?.trim().toUpperCase().replaceAll(' ', '')
  if (!value) return undefined
  return value.includes('.') || value.length <= 3
    ? value
    : `${value.slice(0, 3)}.${value.slice(3)}`
}

function isIcd10Coding(coding: CodingLike): boolean {
  if (!coding.code) return false
  if (coding.system && ICD10_SYSTEMS.has(coding.system)) return true
  const normalizedSystem = coding.system?.toLowerCase() ?? ''
  return normalizedSystem.includes('icd-10') || normalizedSystem.includes('icd10')
}

function matchingRules(coding: CodingLike): readonly DcsiRule[] {
  if (!isIcd10Coding(coding)) return []
  const code = normalizedCode(coding.code)
  if (!code) return []
  return DCSI_ICD10_RULES.filter((rule) => rule.code.test(code))
}

function diabetesAttributionForCode(
  coding: CodingLike,
): EvidenceCandidate['diabetesAttribution'] {
  const code = normalizedCode(coding.code)
  return code && new RegExp(`^${DIABETES}\\.`).test(code)
    ? 'explicit'
    : 'not-established'
}

function conditionCandidates(
  conditions: readonly ConditionEntity[],
  now: Date,
): EvidenceCandidate[] {
  return conditions.flatMap((condition): EvidenceCandidate[] => {
    if (!condition.id) return []
    if (condition.clinicalStatus && EXCLUDED_CONDITION_STATUS.has(condition.clinicalStatus)) return []
    if (condition.verificationStatus && EXCLUDED_VERIFICATION_STATUS.has(condition.verificationStatus)) return []
    const date = condition.recordedDate ?? condition.onsetDateTime
    const isCurrent = condition.clinicalStatus
      ? ACCEPTED_CONDITION_STATUS.has(condition.clinicalStatus)
      : isWithinObservationWindow(date, now)
    if (!isCurrent) return []

    return (condition.code?.coding ?? []).flatMap((coding) => (
      matchingRules(coding).map((rule) => ({
        domain: rule.domain,
        score: rule.score,
        kind: 'diagnosis',
        diabetesAttribution: diabetesAttributionForCode(coding),
        zh: rule.zh,
        en: rule.en,
        source: {
          resourceType: 'Condition',
          resourceId: condition.id,
          date: dateOnly(date),
          status: condition.clinicalStatus,
          coding: [coding],
          sourceSystem: condition.sourceSystem,
        },
      }))
    ))
  })
}

function encounterCandidates(
  encounters: readonly EncounterEntity[],
  now: Date,
): EvidenceCandidate[] {
  return encounters.flatMap((encounter): EvidenceCandidate[] => {
    if (!encounter.id || (encounter.status && EXCLUDED_ENCOUNTER_STATUS.has(encounter.status))) return []
    const date = encounter.period?.start
    if (!isWithinObservationWindow(date, now)) return []

    return (encounter.reasonCode ?? []).flatMap((reason) => (
      (reason.coding ?? []).flatMap((coding) => (
        matchingRules(coding).map((rule) => ({
          domain: rule.domain,
          score: rule.score,
          kind: 'diagnosis',
          diabetesAttribution: diabetesAttributionForCode(coding),
          zh: rule.zh,
          en: rule.en,
          source: {
            resourceType: 'Encounter',
            resourceId: encounter.id,
            date: dateOnly(date),
            status: encounter.status,
            coding: [coding],
            facility: encounter.serviceProvider?.display
              ?? encounter.location?.[0]?.location?.display,
            sourceSystem: encounter.sourceSystem,
          },
        }))
      ))
    ))
  })
}

function procedureSearchText(procedure: ProcedureEntity): string {
  return [
    procedure.code?.text,
    ...(procedure.code?.coding ?? []).flatMap((coding) => [coding.code, coding.display]),
  ].filter(Boolean).join(' ')
}

function procedureSource(procedure: ProcedureEntity): CdssFactSource {
  return {
    resourceType: 'Procedure',
    resourceId: procedure.id,
    date: dateOnly(procedure.performedDateTime ?? procedure.performedPeriod?.start),
    status: procedure.status,
    coding: procedure.code?.coding,
    facility: procedure.performer?.find((performer) => (
      performer.actor?.display ?? performer.display
    ))?.actor?.display
      ?? procedure.performer?.find((performer) => performer.display)?.display,
    sourceSystem: procedure.sourceSystem,
  }
}

function procedureCandidates(
  procedures: readonly ProcedureEntity[],
  now: Date,
): EvidenceCandidate[] {
  return procedures.flatMap((procedure): EvidenceCandidate[] => {
    if (!procedure.id || !procedure.status || !ACCEPTED_PROCEDURE_STATUS.has(procedure.status)) return []
    const date = procedure.performedDateTime ?? procedure.performedPeriod?.start
    if (!isWithinObservationWindow(date, now)) return []
    const text = procedureSearchText(procedure)
    const source = procedureSource(procedure)
    const results: EvidenceCandidate[] = []

    if (
      /(?:透析|血液淨化|dialysis|haemodialysis|hemodialysis|peritoneal dialysis|腎(?:臟)?移植|kidney transplant|renal transplant)/i.test(text)
      || /\b(?:90935|90937|90945|90947)\b/.test(text)
      || /\b5A1D[A-Z0-9]*\b/i.test(text)
    ) {
      results.push({
        domain: 'nephropathy',
        score: 2,
        kind: 'procedure',
        diabetesAttribution: 'not-established',
        zh: '透析或腎臟替代治療',
        en: 'Dialysis or kidney replacement therapy',
        source,
      })
    }

    if (
      /(?:下肢|足|趾|toe|foot|lower[- ](?:limb|extremity)).*(?:截肢|amputation)|(?:截肢|amputation).*(?:下肢|足|趾|toe|foot|lower[- ](?:limb|extremity))/i.test(text)
      || /\b0Y6[A-Z0-9]*\b/i.test(text)
    ) {
      results.push({
        domain: 'peripheral-vascular',
        score: 2,
        kind: 'procedure',
        diabetesAttribution: 'not-established',
        zh: '下肢截肢',
        en: 'Lower-extremity amputation',
        source,
      })
    }

    return results
  })
}

function laboratoryCandidates(
  facts: Readonly<Record<string, CdssFact>>,
  now: Date,
): EvidenceCandidate[] {
  const results: EvidenceCandidate[] = []
  const eGfr = facts.eGFR
  if (
    typeof eGfr?.numericValue === 'number'
    && eGfr.unit === 'mL/min/1.73m²'
    && isWithinObservationWindow(eGfr.date, now)
    && eGfr.sources?.[0]
  ) {
    if (eGfr.numericValue < 30) {
      results.push({
        domain: 'nephropathy',
        score: 2,
        kind: 'laboratory',
        diabetesAttribution: 'not-established',
        zh: `eGFR ${eGfr.numericValue}，符合重度腎功能下降`,
        en: `eGFR ${eGfr.numericValue}, consistent with severe kidney impairment`,
        source: eGfr.sources[0],
      })
    } else if (eGfr.numericValue < 60) {
      results.push({
        domain: 'nephropathy',
        score: 1,
        kind: 'laboratory',
        diabetesAttribution: 'not-established',
        zh: `eGFR ${eGfr.numericValue}，符合 CKD 第 3 期範圍`,
        en: `eGFR ${eGfr.numericValue}, within the stage 3 CKD range`,
        source: eGfr.sources[0],
      })
    }
  }

  const uacr = facts.urineAlbuminRatioQuantitative ?? facts.urineAlbuminRatio
  if (
    typeof uacr?.numericValue === 'number'
    && uacr.unit === 'mg/g'
    && uacr.numericValue >= 30
    && isWithinObservationWindow(uacr.date, now)
    && uacr.sources?.[0]
  ) {
    results.push({
      domain: 'nephropathy',
      score: 1,
      kind: 'laboratory',
      diabetesAttribution: 'not-established',
      zh: `UACR ${uacr.numericValue} mg/g，達白蛋白尿範圍`,
      en: `UACR ${uacr.numericValue} mg/g, within the albuminuria range`,
      source: uacr.sources[0],
    })
  }

  return results
}

function uniqueSources(candidates: readonly EvidenceCandidate[]): CdssFactSource[] {
  const sources = new Map<string, CdssFactSource>()
  candidates.forEach((candidate) => {
    const key = `${candidate.source.resourceType}/${candidate.source.resourceId}`
    const existing = sources.get(key)
    if (!existing) {
      sources.set(key, candidate.source)
      return
    }

    const codingByKey = new Map<string, CodingLike>()
    ;[...(existing.coding ?? []), ...(candidate.source.coding ?? [])].forEach((coding) => {
      const codingKey = `${coding.system ?? ''}|${coding.code ?? ''}|${coding.display ?? ''}`
      codingByKey.set(codingKey, coding)
    })
    sources.set(key, {
      ...existing,
      coding: [...codingByKey.values()],
    })
  })
  return [...sources.values()]
}

function contextBasis(
  candidates: readonly EvidenceCandidate[],
): CdssDcsiDomainContext['basis'] {
  const kinds = new Set(candidates.map((candidate) => candidate.kind))
  if (kinds.has('diagnosis') && kinds.has('laboratory')) return 'governed-code-and-lab'
  if (kinds.has('diagnosis') && kinds.has('procedure')) return 'governed-code-and-procedure'
  if (kinds.has('laboratory')) return 'governed-lab'
  if (kinds.has('procedure')) return 'governed-procedure'
  return 'governed-code'
}

export function deriveDcsiEvidence(input: {
  conditions: readonly ConditionEntity[]
  encounters: readonly EncounterEntity[]
  procedures: readonly ProcedureEntity[]
  facts: Readonly<Record<string, CdssFact>>
  now: Date
}): {
  facts: Record<string, CdssFact>
  contexts: Partial<Record<DcsiDomainId, CdssDcsiDomainContext>>
} {
  const candidates = [
    ...conditionCandidates(input.conditions, input.now),
    ...encounterCandidates(input.encounters, input.now),
    ...procedureCandidates(input.procedures, input.now),
    ...laboratoryCandidates(input.facts, input.now),
  ]

  const facts: Record<string, CdssFact> = {}
  const contexts: Partial<Record<DcsiDomainId, CdssDcsiDomainContext>> = {}
  const domains = [...new Set(candidates.map((candidate) => candidate.domain))]

  domains.forEach((domain) => {
    const domainCandidates = candidates.filter((candidate) => candidate.domain === domain)
    const score = Math.max(...domainCandidates.map((candidate) => candidate.score)) as 1 | 2
    const strongest = domainCandidates.filter((candidate) => candidate.score === score)
    const factKey = FACT_KEY_BY_DOMAIN[domain]
    const diabetesAttribution = strongest.some((candidate) => (
      candidate.diabetesAttribution === 'explicit'
    ))
      ? 'explicit'
      : 'not-established'
    const attributionSuffix = diabetesAttribution === 'not-established'
      ? {
          zh: '（糖尿病歸因未確認）',
          en: ' (diabetes attribution not established)',
        }
      : { zh: '', en: '' }
    const zh = `${[...new Set(strongest.map((candidate) => candidate.zh))].join('、')}${attributionSuffix.zh}`
    const en = `${[...new Set(strongest.map((candidate) => candidate.en))].join(', ')}${attributionSuffix.en}`

    facts[factKey] = {
      zh,
      en,
      sources: uniqueSources(strongest),
    }
    contexts[domain] = {
      score,
      factKeys: [factKey],
      basis: contextBasis(strongest),
      ruleVersion: DCSI_CODEBOOK_VERSION,
      observationWindowDays: DCSI_OBSERVATION_WINDOW_DAYS,
      diabetesAttribution,
    }
  })

  return { facts, contexts }
}
