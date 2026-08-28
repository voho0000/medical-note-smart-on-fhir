import type {
  MedicationEntity,
  MedicationRemainingSummaryEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { ResourceNavTarget } from '@/src/application/stores/resource-navigation.store'
import { MEDCLOUD_SINGLE_PRESCRIPTION_REMAINING_DAYS_URL } from '@/src/shared/constants/medcloud.constants'

const SOURCE_MODULE_SYSTEM =
  'https://cloud-wildcatch.invalid/fhir/CodeSystem/source-module'

export function medicationSourceModule(medication: MedicationEntity): string | undefined {
  const tag = medication.meta?.tag?.find((candidate) =>
    candidate.system === SOURCE_MODULE_SYSTEM,
  )
  const code = tag?.code?.trim().toUpperCase()
  return code || undefined
}

/**
 * Compatibility guard for pre-0.8 bridge payloads that represented IMUE0120
 * as MedicationRequest. These records must never enter prescription views;
 * v0.8 renders only the canonical patient-level Basic summaries.
 */
export function isLegacyRemainingSupplyMedication(
  medication: MedicationEntity,
): boolean {
  return medicationSourceModule(medication) === 'IMUE0120'
}

/**
 * Keep reported IMUE0120 snapshots out of every prescription-only consumer.
 * The source module/structured extension is authoritative; dosage text such as
 * ASORDER is payload, not a safe classification signal.
 */
export function partitionMedicationRecords(medications: MedicationEntity[]): {
  prescriptions: MedicationEntity[]
  legacyRemainingSupply: MedicationEntity[]
} {
  const prescriptions: MedicationEntity[] = []
  const legacyRemainingSupply: MedicationEntity[] = []

  for (const medication of medications) {
    if (isLegacyRemainingSupplyMedication(medication)) legacyRemainingSupply.push(medication)
    else prescriptions.push(medication)
  }

  return { prescriptions, legacyRemainingSupply }
}

export function singlePrescriptionRemainingDays(
  medication: MedicationEntity,
): number | undefined {
  const value = medication.extension?.find(
    (extension) => extension.url === MEDCLOUD_SINGLE_PRESCRIPTION_REMAINING_DAYS_URL,
  )?.valueQuantity?.value

  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && Number.isInteger(value)
    ? value
    : undefined
}

function localDayKey(value: string | number): string | undefined {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export function isSnapshotFromToday(
  capturedAt: string | undefined,
  nowMs: number,
): boolean {
  if (!capturedAt) return false
  return localDayKey(capturedAt) === localDayKey(nowMs)
}

export function relatedMedicationNavigationTarget(
  summary: MedicationRemainingSummaryEntity,
  reference: string,
): ResourceNavTarget | undefined {
  const resourceId = reference.split('/').filter(Boolean).at(-1)
  if (!resourceId) return undefined

  return {
    resourceType: 'MedicationRequest',
    resourceId,
    display: summary.groupName || summary.atc5Name,
    date: summary.sourceMedicationDate,
    expandMedicationHistory: true,
  }
}

export function resolveSinglePrescriptionRemainingDisplay(
  medication: MedicationEntity,
  appEstimatedDays: number | undefined,
  nowMs: number,
) {
  const sourceDays = singlePrescriptionRemainingDays(medication)
  const capturedAt = medication._sourceCapturedAt
  const isCurrent = sourceDays !== undefined
    && isSnapshotFromToday(capturedAt, nowMs)

  return {
    sourceDays,
    capturedAt,
    isCurrent,
    displayDays: isCurrent ? sourceDays : appEstimatedDays,
    displaySource: isCurrent ? 'cloud-single' as const : 'app-estimate' as const,
  }
}
