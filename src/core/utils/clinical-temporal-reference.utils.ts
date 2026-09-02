import type { ClinicalContextSection } from '@/src/core/entities/clinical-context.entity'

const TAIPEI_TIME_ZONE = 'Asia/Taipei'

function isoDateInTaipei(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp)
}

function timestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Latest dated clinical event in the supplied record. This deliberately does
 * not use export/generated metadata: those dates describe the file, not care.
 */
export function latestClinicalRecordDate(data: unknown): string | undefined {
  const source = (data ?? {}) as Record<string, any>
  const candidates: number[] = []
  const add = (...values: unknown[]) => {
    for (const value of values) {
      const parsed = timestamp(value)
      if (parsed !== undefined) candidates.push(parsed)
    }
  }

  for (const item of source.encounters ?? []) add(item?.period?.start, item?.period?.end)
  for (const item of source.medications ?? []) add(item?.authoredOn, item?.effectiveDateTime)
  for (const item of source.conditions ?? []) add(item?.recordedDate, item?.onsetDateTime)
  for (const item of source.allergies ?? []) add(item?.recordedDate, item?.onsetDateTime)
  for (const item of source.diagnosticReports ?? []) add(item?.effectiveDateTime, item?.issued)
  for (const item of source.imagingStudies ?? []) add(item?.started)
  for (const item of source.observations ?? []) add(item?.effectiveDateTime, item?.issued)
  for (const item of source.vitalSigns ?? []) add(item?.effectiveDateTime, item?.issued)
  for (const item of source.procedures ?? []) {
    add(item?.performedDateTime, item?.performedPeriod?.start, item?.performedPeriod?.end)
  }
  for (const item of source.immunizations ?? []) add(item?.occurrenceDateTime)
  for (const item of source.carePlans ?? []) add(item?.created, item?.period?.start, item?.period?.end)
  for (const item of source.consents ?? []) add(item?.dateTime)
  for (const item of source.documentReferences ?? []) add(item?.date, item?.context?.period?.start, item?.context?.period?.end)
  for (const item of source.compositions ?? []) add(item?.date, item?.event?.[0]?.period?.start, item?.event?.[0]?.period?.end)

  return candidates.length > 0 ? isoDateInTaipei(Math.max(...candidates)) : undefined
}

export function buildClinicalTemporalReferenceSection(
  data: unknown,
  referenceNowMs: number,
): ClinicalContextSection {
  const referenceDate = isoDateInTaipei(referenceNowMs)
  const latestRecordDate = latestClinicalRecordDate(data)

  return {
    title: 'Clinical Time Reference',
    items: [
      `Clinical reference date: ${referenceDate}. Use this date for medication supply and recency calculations.`,
      latestRecordDate
        ? `Latest available clinical record date: ${latestRecordDate}.`
        : 'Latest available clinical record date: not available in the supplied data.',
      '“Currently evidenced” means supported by the supplied claims as of the clinical reference date; it does not confirm actual medication use or non-use.',
    ],
  }
}
