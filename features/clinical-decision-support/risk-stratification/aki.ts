export type AkiStage = 1 | 2 | 3
export type AkiDetectionState = 'detected' | 'not-detected' | 'insufficient-data'
export type AkiSignalRecency = 'current-window' | 'historical'
export type AkiTrigger = 'absolute-rise-48h' | 'ratio-rise-7d' | 'both'

const HOUR_MS = 60 * 60 * 1000
const FORTY_EIGHT_HOURS_MS = 48 * HOUR_MS
const SEVEN_DAYS_MS = 7 * 24 * HOUR_MS
const EPSILON = 1e-9

function roundClinicalValue(value: number): number {
  return Math.round(value * 10000) / 10000
}

export interface AkiCreatinineReading<TSource = unknown> {
  observedAt: string
  valueMgDl: number
  source: TSource
}

export interface AkiAssessment<TSource = unknown> {
  state: AkiDetectionState
  readingCount: number
  latestReading?: AkiCreatinineReading<TSource>
  event?: {
    stage: AkiStage
    trigger: AkiTrigger
    detectedAt: string
    recency: AkiSignalRecency
    current: AkiCreatinineReading<TSource>
    baseline: AkiCreatinineReading<TSource>
    absoluteRise48hMgDl?: number
    ratioRise7d?: number
    followUpReadings: readonly AkiCreatinineReading<TSource>[]
  }
}

interface EvaluatedEvent<TSource> {
  stage: AkiStage
  trigger: AkiTrigger
  current: AkiCreatinineReading<TSource>
  baseline: AkiCreatinineReading<TSource>
  absoluteRise48hMgDl?: number
  ratioRise7d?: number
}

function timestamp(value: string): number | undefined {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function validReadings<TSource>(
  readings: readonly AkiCreatinineReading<TSource>[],
): AkiCreatinineReading<TSource>[] {
  return readings
    .filter((reading) => (
      timestamp(reading.observedAt) !== undefined
      && Number.isFinite(reading.valueMgDl)
      && reading.valueMgDl > 0
    ))
    .sort((a, b) => timestamp(a.observedAt)! - timestamp(b.observedAt)!)
}

function lowestReading<TSource>(
  readings: readonly AkiCreatinineReading<TSource>[],
): AkiCreatinineReading<TSource> | undefined {
  return [...readings].sort((a, b) => (
    a.valueMgDl - b.valueMgDl
    || timestamp(b.observedAt)! - timestamp(a.observedAt)!
  ))[0]
}

function evaluateCurrentReading<TSource>(
  current: AkiCreatinineReading<TSource>,
  priorReadings: readonly AkiCreatinineReading<TSource>[],
): EvaluatedEvent<TSource> | undefined {
  const currentTime = timestamp(current.observedAt)!
  const prior48h = priorReadings.filter((reading) => {
    const interval = currentTime - timestamp(reading.observedAt)!
    return interval > 0 && interval <= FORTY_EIGHT_HOURS_MS
  })
  const prior7d = priorReadings.filter((reading) => {
    const interval = currentTime - timestamp(reading.observedAt)!
    return interval > 0 && interval <= SEVEN_DAYS_MS
  })
  const baseline48h = lowestReading(prior48h)
  const baseline7d = lowestReading(prior7d)
  const absoluteRise48hMgDl = baseline48h
    ? current.valueMgDl - baseline48h.valueMgDl
    : undefined
  const ratioRise7d = baseline7d
    ? current.valueMgDl / baseline7d.valueMgDl
    : undefined
  const meetsAbsoluteCriterion = (
    absoluteRise48hMgDl !== undefined
    && absoluteRise48hMgDl + EPSILON >= 0.3
  )
  const meetsRatioCriterion = (
    ratioRise7d !== undefined
    && ratioRise7d + EPSILON >= 1.5
  )
  if (!meetsAbsoluteCriterion && !meetsRatioCriterion) return undefined

  const trigger: AkiTrigger = meetsAbsoluteCriterion && meetsRatioCriterion
    ? 'both'
    : meetsAbsoluteCriterion
      ? 'absolute-rise-48h'
      : 'ratio-rise-7d'
  const baseline = (
    meetsRatioCriterion && baseline7d
      ? baseline7d
      : baseline48h
  )!
  const stage: AkiStage = (
    (ratioRise7d !== undefined && ratioRise7d + EPSILON >= 3)
    || current.valueMgDl + EPSILON >= 4
  )
    ? 3
    : ratioRise7d !== undefined && ratioRise7d + EPSILON >= 2
      ? 2
      : 1

  return {
    stage,
    trigger,
    current,
    baseline,
    ...(absoluteRise48hMgDl !== undefined
      ? { absoluteRise48hMgDl: roundClinicalValue(absoluteRise48hMgDl) }
      : {}),
    ...(ratioRise7d !== undefined
      ? { ratioRise7d: roundClinicalValue(ratioRise7d) }
      : {}),
  }
}

/**
 * Evaluates the creatinine-only KDIGO 2012 AKI signal.
 *
 * The function intentionally does not infer urine output, dialysis, etiology,
 * or a clinical diagnosis. A caller must preserve those as explicit missing
 * data and require clinician verification.
 */
export function assessAkiFromCreatinine<TSource>(
  inputReadings: readonly AkiCreatinineReading<TSource>[],
  now = new Date(),
): AkiAssessment<TSource> {
  const readings = validReadings(inputReadings)
  const latestReading = readings.at(-1)
  if (readings.length < 2) {
    return {
      state: 'insufficient-data',
      readingCount: readings.length,
      ...(latestReading ? { latestReading } : {}),
    }
  }

  let latestEvent: EvaluatedEvent<TSource> | undefined
  readings.forEach((current, index) => {
    const evaluated = evaluateCurrentReading(current, readings.slice(0, index))
    if (evaluated) latestEvent = evaluated
  })

  if (!latestEvent) {
    return {
      state: 'not-detected',
      readingCount: readings.length,
      latestReading,
    }
  }

  const eventTime = timestamp(latestEvent.current.observedAt)!
  const nowTime = now.getTime()
  const ageMs = nowTime - eventTime
  const recency: AkiSignalRecency = (
    ageMs >= 0 && ageMs <= SEVEN_DAYS_MS
  )
    ? 'current-window'
    : 'historical'
  const followUpReadings = readings.filter(
    (reading) => timestamp(reading.observedAt)! > eventTime,
  )

  return {
    state: 'detected',
    readingCount: readings.length,
    latestReading,
    event: {
      stage: latestEvent.stage,
      trigger: latestEvent.trigger,
      detectedAt: latestEvent.current.observedAt,
      recency,
      current: latestEvent.current,
      baseline: latestEvent.baseline,
      ...(latestEvent.absoluteRise48hMgDl !== undefined
        ? { absoluteRise48hMgDl: latestEvent.absoluteRise48hMgDl }
        : {}),
      ...(latestEvent.ratioRise7d !== undefined
        ? { ratioRise7d: latestEvent.ratioRise7d }
        : {}),
      followUpReadings,
    },
  }
}
