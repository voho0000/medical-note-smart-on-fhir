import type { PatientEntity } from '@/src/core/entities/patient.entity'
import { listCdssHistory, readCdssHistory, type CdssHistoryRecord } from './cdss-history'

/** Latest accepted save for the current patient, owner, across care packs. Never applies it. */
export async function latestCdssSave(patient: PatientEntity, signal: AbortSignal, ownerUid: string): Promise<CdssHistoryRecord | null> {
  // FHIR history requests DocumentReference _sort=-date; date is server receivedAt.
  // The bounded first page therefore contains the latest receipt, even with hasMore.
  // listCdssHistory validates all receivedAt values as ISO datetimes before this sort.
  const history = await listCdssHistory(patient, signal, ownerUid)
  const latest = [...history.records]
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))[0]
  if (!latest && history.hasMore) throw new Error('cdss_history_incomplete')
  if (!latest) return null
  const record = await readCdssHistory(patient, latest.saveId, signal, ownerUid)
  if (record.packId !== latest.packId) throw new Error('cdss_history_unavailable')
  return record
}
