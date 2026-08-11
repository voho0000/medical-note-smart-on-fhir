import type {
  ConditionEntity,
  ImmunizationEntity,
  ObservationEntity,
  ProcedureEntity,
} from '@/src/core/entities/clinical-data.entity'
import type {
  CdssFact,
  CdssFactSource,
  CdssFreshnessContext,
  CdssScreeningContext,
  CdssScreeningId,
} from '../types'

type CodingLike = { system?: string; code?: string; display?: string }

interface PreventiveRecord {
  date: string
  result?: string
  source: CdssFactSource
}

const ACCEPTED_OBSERVATION_STATUS = new Set(['final', 'amended', 'corrected'])
const ACCEPTED_PROCEDURE_STATUS = new Set(['completed', 'in-progress'])
const ACCEPTED_IMMUNIZATION_STATUS = new Set(['completed'])

const CPT_EYE_EXAM_CODES = new Set([
  '92002', '92004', '92012', '92014', '92227', '92228', '92229', '92250',
  '2022F', '2023F', '2024F', '2025F', '2026F', '3072F',
])
const FOOT_EXAM_CODES = new Set(['2028F', 'G0245', 'G0246'])
const CVX_INFLUENZA_CODES = new Set([
  '15', '16', '111', '140', '141', '144', '149', '150', '153', '155',
  '158', '161', '166', '168', '171', '185', '186', '197', '205', '206',
])
const CVX_COVID_CODES = new Set([
  '207', '208', '210', '211', '212', '213', '217', '218', '219', '221',
  '225', '226', '227', '228', '229', '230', '301', '302', '303', '304',
  '305', '306', '307', '308', '309', '310',
])
const CVX_PNEUMOCOCCAL_CODES = new Set(['33', '100', '109', '133', '152', '215', '216'])
const CVX_SINGLE_DOSE_PNEUMOCOCCAL_CODES = new Set(['216'])

function validDate(value?: string): string | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return undefined
  return value.slice(0, 10)
}

function dateValue(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

function ageInDays(date: string | undefined, now: Date): number | undefined {
  const timestamp = date ? Date.parse(date) : Number.NaN
  if (Number.isNaN(timestamp)) return undefined
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000))
}

function freshnessState(
  date: string | undefined,
  intervalDays: number,
  now: Date,
): Pick<CdssFreshnessContext, 'state' | 'ageDays'> {
  const ageDays = ageInDays(date, now)
  if (ageDays === undefined) return { state: 'missing' }
  if (ageDays <= intervalDays) return { state: 'current', ageDays }
  if (ageDays <= Math.round(intervalDays * 1.5)) return { state: 'due', ageDays }
  return { state: 'overdue', ageDays }
}

export function assessFactFreshness(input: {
  factKey: string
  date?: string
  intervalDays: number
  now: Date
}): CdssFreshnessContext {
  return {
    factKey: input.factKey,
    date: input.date,
    intervalDays: input.intervalDays,
    ...freshnessState(input.date, input.intervalDays, input.now),
  }
}

function codingText(codings: readonly CodingLike[] | undefined): string {
  return (codings ?? [])
    .flatMap((coding) => [coding.code, coding.display])
    .filter(Boolean)
    .join(' ')
}

function isCptOrHcpcsCode(coding: CodingLike, accepted: ReadonlySet<string>): boolean {
  if (!coding.code || !accepted.has(coding.code.toUpperCase())) return false
  const system = (coding.system ?? '').toLowerCase()
  return system.includes('cpt') || system.includes('hcpcs')
}

function recordText(input: {
  text?: string
  codings?: readonly CodingLike[]
  result?: string
}): string {
  return [input.text, codingText(input.codings), input.result].filter(Boolean).join(' ')
}

function observationResult(observation: ObservationEntity): string | undefined {
  return observation.valueString
    ?? observation.valueCodeableConcept?.text
    ?? observation.valueCodeableConcept?.coding?.find((coding) => coding.display)?.display
    ?? observation.interpretation?.text
    ?? observation.interpretation?.coding?.find((coding) => coding.display)?.display
}

function observationRecord(observation: ObservationEntity): PreventiveRecord | undefined {
  const date = validDate(observation.effectiveDateTime)
  if (
    !observation.id
    || !date
    || !observation.status
    || !ACCEPTED_OBSERVATION_STATUS.has(observation.status)
  ) return undefined
  const result = observationResult(observation)
  return {
    date,
    result,
    source: {
      resourceType: 'Observation',
      resourceId: observation.id,
      date,
      status: observation.status,
      value: result,
      coding: observation.code?.coding,
      facility: observation.performer?.find((performer) => performer.display)?.display,
      sourceSystem: observation.sourceSystem,
    },
  }
}

function procedureRecord(procedure: ProcedureEntity): PreventiveRecord | undefined {
  const date = validDate(procedure.performedDateTime ?? procedure.performedPeriod?.start)
  if (
    !procedure.id
    || !date
    || !procedure.status
    || !ACCEPTED_PROCEDURE_STATUS.has(procedure.status)
  ) return undefined
  const result = procedure.note?.map((note) => note.text).filter(Boolean).join('；') || undefined
  return {
    date,
    result,
    source: {
      resourceType: 'Procedure',
      resourceId: procedure.id,
      date,
      status: procedure.status,
      value: result,
      coding: procedure.code?.coding,
      facility: procedure.performer?.find((performer) => (
        performer.actor?.display ?? performer.display
      ))?.actor?.display
        ?? procedure.performer?.find((performer) => performer.display)?.display,
      sourceSystem: procedure.sourceSystem,
    },
  }
}

function isRetinalRecord(
  text: string,
  codings: readonly CodingLike[] | undefined,
): boolean {
  return (
    codings?.some((coding) => isCptOrHcpcsCode(coding, CPT_EYE_EXAM_CODES)) === true
    || /(?:散瞳)?眼底(?:檢查|攝影)|視網膜(?:篩檢|檢查|攝影)|fundus (?:exam|photograph)|retinal (?:exam|screen|imaging)|dilated eye exam/i.test(text)
  )
}

function isNeuropathyRecord(text: string): boolean {
  return /10[\s-]*g(?:ram)? monofilament|monofilament|單股纖維|128\s*hz|音叉|vibration perception|保護性(?:感覺|知覺)|周邊神經(?:病變)?(?:篩檢|評估|檢查)|neuropathy (?:screen|assessment|exam)/i.test(text)
}

function isFootRecord(
  text: string,
  codings: readonly CodingLike[] | undefined,
): boolean {
  return (
    codings?.some((coding) => isCptOrHcpcsCode(coding, FOOT_EXAM_CODES)) === true
    || /糖尿病足(?:部)?(?:篩檢|評估|檢查)|完整足部檢查|足背動脈|足部脈搏|pedal pulse|comprehensive foot (?:exam|evaluation)|diabetic foot (?:exam|assessment)|foot ulcer risk/i.test(text)
    || isNeuropathyRecord(text)
  )
}

function latestMatchingRecord(input: {
  observations: readonly ObservationEntity[]
  procedures: readonly ProcedureEntity[]
  matches: (text: string, codings: readonly CodingLike[] | undefined) => boolean
}): PreventiveRecord | undefined {
  const observationRecords = input.observations.flatMap((observation): PreventiveRecord[] => {
    const result = observationResult(observation)
    const text = recordText({
      text: observation.code?.text,
      codings: observation.code?.coding,
      result,
    })
    if (!input.matches(text, observation.code?.coding)) return []
    const record = observationRecord(observation)
    return record ? [record] : []
  })
  const procedureRecords = input.procedures.flatMap((procedure): PreventiveRecord[] => {
    const result = procedure.note?.map((note) => note.text).filter(Boolean).join('；')
    const text = recordText({
      text: procedure.code?.text,
      codings: procedure.code?.coding,
      result,
    })
    if (!input.matches(text, procedure.code?.coding)) return []
    const record = procedureRecord(procedure)
    return record ? [record] : []
  })
  return [...observationRecords, ...procedureRecords]
    .sort((a, b) => dateValue(b.date) - dateValue(a.date))[0]
}

function hasHighRiskFootCondition(conditions: readonly ConditionEntity[]): boolean {
  return conditions.some((condition) => {
    if (condition.clinicalStatus && ['inactive', 'resolved', 'entered-in-error'].includes(condition.clinicalStatus)) {
      return false
    }
    return condition.code?.coding?.some((coding) => (
      typeof coding.code === 'string'
      && /^(?:E1[01]\.(?:4|5|621)|L97|I70\.2|I73\.9|M14\.67|Z89\.)/.test(coding.code)
    )) === true
  })
}

function screeningFact(
  labelZh: string,
  labelEn: string,
  record: PreventiveRecord,
): CdssFact {
  const resultZh = record.result ? `：${record.result}` : ''
  const resultEn = record.result ? `: ${record.result}` : ''
  return {
    zh: `${labelZh}${resultZh}（${record.date}）`,
    en: `${labelEn}${resultEn} (${record.date})`,
    date: record.date,
    sources: [record.source],
  }
}

function screeningContext(input: {
  id: CdssScreeningId
  record?: PreventiveRecord
  intervalDays: number
  now: Date
  factKey?: string
  highRisk?: boolean
}): CdssScreeningContext {
  return {
    id: input.id,
    date: input.record?.date,
    result: input.record?.result,
    intervalDays: input.intervalDays,
    factKey: input.factKey,
    highRisk: input.highRisk,
    ...freshnessState(input.record?.date, input.intervalDays, input.now),
  }
}

function immunizationKind(
  immunization: ImmunizationEntity,
): 'influenza' | 'covid' | 'pneumococcal' | undefined {
  const codings = immunization.vaccineCode?.coding ?? []
  const cvxCodes = codings
    .filter((coding) => (coding.system ?? '').toLowerCase().includes('cvx'))
    .map((coding) => coding.code)
    .filter((code): code is string => Boolean(code))
  if (cvxCodes.some((code) => CVX_INFLUENZA_CODES.has(code))) return 'influenza'
  if (cvxCodes.some((code) => CVX_COVID_CODES.has(code))) return 'covid'
  if (cvxCodes.some((code) => CVX_PNEUMOCOCCAL_CODES.has(code))) return 'pneumococcal'

  const text = recordText({
    text: immunization.vaccineCode?.text,
    codings,
  })
  if (/influenza|流感/i.test(text)) return 'influenza'
  if (/covid|sars[- ]?cov[- ]?2|新冠|嚴重特殊傳染性肺炎/i.test(text)) return 'covid'
  if (/pneumococ|肺炎鏈球菌|pcv(?:13|15|20|21)|ppsv23/i.test(text)) return 'pneumococcal'
  return undefined
}

function immunizationRecord(immunization: ImmunizationEntity): PreventiveRecord | undefined {
  const date = validDate(immunization.occurrenceDateTime)
  if (
    !date
    || !immunization.status
    || !ACCEPTED_IMMUNIZATION_STATUS.has(immunization.status)
  ) return undefined
  const product = immunization.vaccineCode?.text
    ?? immunization.vaccineCode?.coding?.find((coding) => coding.display)?.display
  return {
    date,
    result: product,
    source: {
      resourceType: 'Immunization',
      resourceId: immunization.id,
      date,
      status: immunization.status,
      value: product,
      coding: immunization.vaccineCode?.coding,
      facility: immunization.performer?.find((performer) => performer.actor?.display)?.actor?.display,
      sourceSystem: immunization.sourceSystem,
    },
  }
}

function latestImmunization(
  immunizations: readonly ImmunizationEntity[],
  kind: 'influenza' | 'covid' | 'pneumococcal',
): { record?: PreventiveRecord; singleDosePneumococcal: boolean } {
  const matches = immunizations
    .filter((immunization) => immunizationKind(immunization) === kind)
    .flatMap((immunization) => {
      const record = immunizationRecord(immunization)
      return record ? [{ immunization, record }] : []
    })
    .sort((a, b) => dateValue(b.record.date) - dateValue(a.record.date))
  const latest = matches[0]
  const singleDosePneumococcal = kind === 'pneumococcal' && matches.some(({ immunization }) => (
    immunization.vaccineCode?.coding?.some((coding) => (
      (coding.system ?? '').toLowerCase().includes('cvx')
      && typeof coding.code === 'string'
      && CVX_SINGLE_DOSE_PNEUMOCOCCAL_CODES.has(coding.code)
    )) === true
    || /pcv(?:20|21)/i.test(recordText({
      text: immunization.vaccineCode?.text,
      codings: immunization.vaccineCode?.coding,
    }))
  ))
  return { record: latest?.record, singleDosePneumococcal }
}

export function derivePreventiveCareEvidence(input: {
  observations: readonly ObservationEntity[]
  procedures: readonly ProcedureEntity[]
  conditions: readonly ConditionEntity[]
  immunizations: readonly ImmunizationEntity[]
  now: Date
}): {
  facts: Record<string, CdssFact>
  screeningContexts: Partial<Record<CdssScreeningId, CdssScreeningContext>>
} {
  const facts: Record<string, CdssFact> = {}
  const highRiskFoot = hasHighRiskFootCondition(input.conditions)
  const retinal = latestMatchingRecord({
    observations: input.observations,
    procedures: input.procedures,
    matches: isRetinalRecord,
  })
  const neuropathy = latestMatchingRecord({
    observations: input.observations,
    procedures: input.procedures,
    matches: (text) => isNeuropathyRecord(text),
  })
  const foot = latestMatchingRecord({
    observations: input.observations,
    procedures: input.procedures,
    matches: isFootRecord,
  })

  const retinalNormal = retinal?.result
    ? /(?:normal|negative|no (?:diabetic )?retinopathy|無(?:糖尿病)?視網膜病變|正常)/i.test(retinal.result)
    : false
  const retinalIntervalDays = retinalNormal ? 730 : 365
  // ADA recommends inspecting a high-risk foot at every visit. An interval of
  // zero therefore means "current only when documented today", not "never due".
  const footIntervalDays = highRiskFoot ? 0 : 365

  if (retinal) facts.retinalExam = screeningFact('眼底檢查', 'Retinal examination', retinal)
  if (neuropathy) facts.neuropathyExam = screeningFact('神經病變篩檢', 'Neuropathy screening', neuropathy)
  if (foot) facts.footExam = screeningFact('足部檢查', 'Foot examination', foot)

  const influenza = latestImmunization(input.immunizations, 'influenza')
  const covid = latestImmunization(input.immunizations, 'covid')
  const pneumococcal = latestImmunization(input.immunizations, 'pneumococcal')
  if (influenza.record) facts.influenzaVaccine = screeningFact('流感疫苗', 'Influenza vaccine', influenza.record)
  if (covid.record) facts.covidVaccine = screeningFact('COVID-19 疫苗', 'COVID-19 vaccine', covid.record)
  if (pneumococcal.record) {
    facts.pneumococcalVaccine = screeningFact(
      '肺炎鏈球菌疫苗',
      'Pneumococcal vaccine',
      pneumococcal.record,
    )
  }

  const pneumococcalContext = pneumococcal.singleDosePneumococcal
    ? {
        id: 'pneumococcal-vaccine' as const,
        state: 'current' as const,
        date: pneumococcal.record?.date,
        ageDays: ageInDays(pneumococcal.record?.date, input.now),
        intervalDays: 0,
        result: pneumococcal.record?.result,
        factKey: 'pneumococcalVaccine',
      }
    : {
        id: 'pneumococcal-vaccine' as const,
        state: pneumococcal.record ? 'due' as const : 'missing' as const,
        date: pneumococcal.record?.date,
        ageDays: ageInDays(pneumococcal.record?.date, input.now),
        intervalDays: 0,
        result: pneumococcal.record?.result,
        factKey: pneumococcal.record ? 'pneumococcalVaccine' : undefined,
      }

  return {
    facts,
    screeningContexts: {
      'retinal-exam': screeningContext({
        id: 'retinal-exam',
        record: retinal,
        intervalDays: retinalIntervalDays,
        now: input.now,
        factKey: retinal ? 'retinalExam' : undefined,
      }),
      'neuropathy-exam': screeningContext({
        id: 'neuropathy-exam',
        record: neuropathy,
        intervalDays: 365,
        now: input.now,
        factKey: neuropathy ? 'neuropathyExam' : undefined,
      }),
      'foot-exam': screeningContext({
        id: 'foot-exam',
        record: foot,
        intervalDays: footIntervalDays,
        now: input.now,
        factKey: foot ? 'footExam' : undefined,
        highRisk: highRiskFoot,
      }),
      'influenza-vaccine': screeningContext({
        id: 'influenza-vaccine',
        record: influenza.record,
        intervalDays: 365,
        now: input.now,
        factKey: influenza.record ? 'influenzaVaccine' : undefined,
      }),
      'covid-vaccine': screeningContext({
        id: 'covid-vaccine',
        record: covid.record,
        intervalDays: 365,
        now: input.now,
        factKey: covid.record ? 'covidVaccine' : undefined,
      }),
      'pneumococcal-vaccine': pneumococcalContext,
    },
  }
}
