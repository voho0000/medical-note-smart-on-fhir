'use client'

import { z } from 'zod'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import { isCollectorSite } from '@/src/application/telemetry/collector'
import { fhirAccessToken } from './fhir-auth'
import { cdssGatewaySaveSchema } from '@/src/shared/contracts/cdss-gateway-event'
import { cdssPatientIdentity } from './patient-identity'
import { cdssEndpoint } from './cdss-gateway'

const index = z.object({ saveId: z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i),
  documentId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/), patientId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/),
  receivedAt: z.string().datetime({ offset: true }), packId: z.string().min(1).max(80),
  versionId: z.string().max(64).nullable() }).strict()
const list = z.object({ records: z.array(index).max(10), hasMore: z.boolean() }).strict()
const record = index.extend({ savedAt: z.string().datetime({ offset: true }), save: cdssGatewaySaveSchema })
export type CdssHistoryList = z.infer<typeof list>
export type CdssHistoryRecord = z.infer<typeof record>

async function request(patient: PatientEntity, path: string, saveId: string | undefined, signal: AbortSignal) {
  const url = cdssEndpoint(path)
  if (!url || !isCollectorSite()) throw new Error('cdss_history_unavailable')
  const identity = await cdssPatientIdentity(patient)
  const key = { site: 'vghtpe' as const, patient_key_version: 1 as const, patient_key_sha256: identity.patient_key_sha256 }
  const token = await fhirAccessToken()
  if (signal.aborted || !isCollectorSite()) throw new Error('cdss_site_changed')
  const response = await fetch(url, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ ...key, ...(saveId ? { save_id: saveId } : {}) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), credentials: 'omit',
    referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
  })
  if (response.status !== 200) throw new Error('cdss_history_unavailable')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('cdss_history_unavailable')
  let bytes = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      bytes += item.value.byteLength
      if (bytes > 5 * 1024 * 1024) throw new Error('cdss_history_unavailable')
      chunks.push(item.value)
    }
  } finally { await reader.cancel() }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
  return { data: JSON.parse(new TextDecoder().decode(body)), key }
}

export async function listCdssHistory(patient: PatientEntity, signal: AbortSignal): Promise<CdssHistoryList> {
  return list.parse((await request(patient, '/cdss/v1/history', undefined, signal)).data)
}
export async function readCdssHistory(patient: PatientEntity, saveId: string, signal: AbortSignal): Promise<CdssHistoryRecord> {
  const { data, key } = await request(patient, '/cdss/v1/history/read', saveId, signal)
  const parsed = record.parse(data)
  if (parsed.saveId !== saveId || parsed.save.save_id !== saveId || parsed.save.site !== key.site ||
      parsed.save.patient_key_version !== key.patient_key_version || parsed.save.patient_key_sha256 !== key.patient_key_sha256 ||
      parsed.packId !== parsed.save.pack_id) throw new Error('cdss_history_unavailable')
  return parsed
}
