import { isCdssStorageSite } from '@/features/clinical-decision-support/telemetry/storage-site'
import { webcrypto } from 'node:crypto'
import { PatientMapper } from '@/src/infrastructure/fhir/mappers/patient.mapper'
import { applyUserEnteredPatientProfile } from '@/src/core/entities/patient.entity'
import { buildPatient } from '@/features/ips-export/utils/ips-fhir-mappers'
import { cdssPatientIdentity, VGH_MRN_SYSTEM } from '@/features/clinical-decision-support/telemetry/patient-identity'
import { cdssGatewaySaveSchema } from '@/src/shared/contracts/cdss-gateway-event'
import { parseStoredCdssSaveV3 } from '@/src/shared/contracts/cdss-stored-save-v3'

const nhi = { resourceType: 'Patient', id: 'synthetic-nhi', meta: { source: 'nhi-fhir-bridge/scraper' },
  name: [{ use: 'official', text: '陳大明' }], birthDate: '1970-01-15',
  identifier: [{ system: 'https://twcore.mohw.gov.tw/IdentifierSystem/national-id', value: 'A123456789' }] }
const vgh = { ...nhi, id: '00001234', meta: { source: 'ehr-fhir-bridge/scraper' },
  identifier: [{ system: 'urn:oid:his.patient.mrn', value: '00001234' }] }
const profile = { source: 'user-entered' as const, name: '陳大明', birthDate: '1970-01-15', updatedAt: '2026-10-05T00:00:00Z' }
beforeEach(() => Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle }))

test('NHI full national ID stays local; only masked identity leaves browser', async () => {
  const identity = await cdssPatientIdentity(PatientMapper.toDomain(nhi)!)
  expect(identity.patient_identity.identifier_masked).toBe('A123XXXXXX')
  expect(JSON.stringify(identity)).not.toContain('A123456789')
  expect(await cdssPatientIdentity(PatientMapper.toDomain({ ...nhi, identifier: [{ ...nhi.identifier[0], value: 'A123456788' }] })!)).not.toEqual(identity)
})
test('VGH MRN takes precedence; optional national ID does not change history key', async () => {
  const identity = await cdssPatientIdentity(PatientMapper.toDomain(vgh)!)
  expect(identity.patient_identity).toMatchObject({ identifier_system: VGH_MRN_SYSTEM, identifier_masked: 'MRN-XXXXXX34' })
  expect(JSON.stringify(identity)).not.toContain('00001234')
  expect(await cdssPatientIdentity(PatientMapper.toDomain({ ...vgh, identifier: [...vgh.identifier, { system: 'urn:oid:tw.gov.id-number', value: 'A123456789' }] })!)).toEqual(identity)
  expect(await cdssPatientIdentity(PatientMapper.toDomain({ ...vgh, identifier: [{ ...vgh.identifier[0], value: '00009934' }] })!)).not.toEqual(identity)
})
test.each([nhi, vgh])('identified bridge survives IPS roundtrip', async source => {
  const patient = PatientMapper.toDomain(source)!
  const restored = PatientMapper.toDomain(buildPatient(patient, { includeIdentifiers: true }).entry.resource)!
  expect(await cdssPatientIdentity(restored)).toEqual(await cdssPatientIdentity(patient))
})
test.each([
  { ...nhi, identifier: [{ ...nhi.identifier[0], value: 'A12345XXXX' }], name: [{ use: 'official', text: '陳O明' }], birthDate: '1970-01-01' },
  { ...vgh, id: 'a'.repeat(32), identifier: [{ ...vgh.identifier[0], value: 'a'.repeat(32) }], name: [{ use: 'official', text: 'DEID-aaaaaaaa' }], birthDate: '1970-01-01' },
])('deidentified bridge stays rejected after supplementation and IPS export', async source => {
  const patient = PatientMapper.toDomain(source)!
  expect(patient.deidentified).toBe(true)
  const edited = applyUserEnteredPatientProfile(patient, profile)
  const restored = PatientMapper.toDomain(buildPatient(edited, { includeIdentifiers: true }).entry.resource)!
  await expect(cdssPatientIdentity(restored)).rejects.toThrow('cdss_patient_deidentified')
})
test.each([
  { ...vgh, meta: { source: 'other-hospital' } },
  { ...vgh, identifier: [{ ...vgh.identifier[0], value: 'unknown' }] },
  { ...vgh, identifier: [...vgh.identifier, ...vgh.identifier] },
  { ...nhi, identifier: [{ ...nhi.identifier[0], value: 'A1234' }] },
])('unknown/ambiguous/missing identities fail closed', async source => {
  await expect(cdssPatientIdentity(PatientMapper.toDomain(source)!)).rejects.toThrow('cdss_identity_unavailable')
})
test('v3 writer and reader accept masked scoped MRNs, reject raw identifiers and wrong scopes', async () => {
  const identity = await cdssPatientIdentity(PatientMapper.toDomain(vgh)!)
  const save = { schema_version: 3, save_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', saved_at: '2026-10-05T00:00:00Z',
    site: 'vghtpe', patient_session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ...identity,
    pack_id: 'heart-failure-cdss', app_version: '0.0.0', build_revision: 'unknown',
    profile: { facts: { synthetic: 1 } }, result: { packId: 'heart-failure-cdss', packVersion: 'synthetic' },
    physician_inputs: {}, physician_decisions: {}, source_records: [], events: [] }
  expect(cdssGatewaySaveSchema.parse(save)).toEqual(save)
  expect(parseStoredCdssSaveV3(save)).toEqual(save)
  for (const patient_identity of [
    { ...save.patient_identity, identifier_masked: '00001234' },
    { ...save.patient_identity, identifier_system: 'urn:oid:his.patient.mrn' },
    { ...save.patient_identity, identifier_system: nhi.identifier[0].system },
  ]) {
    expect(cdssGatewaySaveSchema.safeParse({ ...save, patient_identity }).success).toBe(false)
    expect(() => parseStoredCdssSaveV3({ ...save, patient_identity })).toThrow()
  }
})

test('X-prefix full national ID is not a privacy mask', async () => {
  const patient = PatientMapper.toDomain({ ...nhi, identifier: [{ ...nhi.identifier[0], value: 'X123456789' }] })!
  expect(patient.deidentified).not.toBe(true)
  expect((await cdssPatientIdentity(patient)).patient_identity.identifier_masked).toBe('X123XXXXXX')
})

test.each([
  ['https://mediprisma.tw/app/', true],
  ['https://mediprisma.tw/app', true],
  ['https://mediprisma.tw/app/?site=vghtpe', true],
  ['https://mediprisma.tw/app/?site=other', false],
  ['https://mediprisma.tw/app/?site=vghtpe&site=vghtpe', false],
  ['https://mediprisma.tw/app-hmc/', false],
  ['https://another.invalid/app/', false],
  ['https://mediprisma.tw/', false],
])('CDSS storage admission for %s', (url, allowed) => expect(isCdssStorageSite(url as string)).toBe(allowed))

test('masked VGH national-ID namespace normalizes before hashing and storage', async () => {
  const source = { ...nhi, meta: { source: 'other-source' }, identifier: [{ system: 'urn:oid:tw.gov.id-number', value: 'A123***789' }] }
  const identity = await cdssPatientIdentity(PatientMapper.toDomain(source)!)
  expect(identity.patient_key_version).toBe(1)
  expect(identity.patient_identity.identifier_system).toBe(nhi.identifier[0].system)
})
test('bridge complete IDs use expensive key v2 while cloud masked IDs retain v1', async () => {
  expect((await cdssPatientIdentity(PatientMapper.toDomain(nhi)!)).patient_key_version).toBe(2)
  expect((await cdssPatientIdentity(PatientMapper.toDomain(vgh)!)).patient_key_version).toBe(2)
  expect((await cdssPatientIdentity(PatientMapper.toDomain({ ...nhi, meta: { source: 'cloud-source' }, identifier: [{ ...nhi.identifier[0], value: 'A123***789' }] })!)).patient_key_version).toBe(1)
})
test.each(['12345', '1234567890123'])('VGH rejects unsupported MRN length %s', async value => {
  await expect(cdssPatientIdentity(PatientMapper.toDomain({ ...vgh, identifier: [{ ...vgh.identifier[0], value }] })!)).rejects.toThrow('cdss_identity_unavailable')
})
test('VGH leading zeros stay significant; fullwidth digits normalize', async () => {
  const id = async (value: string) => cdssPatientIdentity(PatientMapper.toDomain({ ...vgh, identifier: [{ ...vgh.identifier[0], value }] })!)
  expect(await id('001234')).not.toEqual(await id('0001234'))
  expect(await id('００００１２３４')).toEqual(await id('00001234'))
})
test('normalized source metadata cannot clear a deidentified source', () => {
  const patient = PatientMapper.toDomain({ ...nhi, meta: { source: ' nhi-fhir-bridge/scraper ' }, identifier: [{ ...nhi.identifier[0], system: ` ${nhi.identifier[0].system} `, value: 'A12345XXXX' }] })!
  expect(patient.deidentified).toBe(true)
})

test('fullwidth O masked cloud name is rejected before normalization', async () => {
  const source = { ...nhi, meta: { source: 'cloud-source' }, name: [{ use: 'official', text: '王Ｏ明' }],
    identifier: [{ ...nhi.identifier[0], value: 'A123***789' }] }
  await expect(cdssPatientIdentity(PatientMapper.toDomain(source)!)).rejects.toThrow('cdss_identity_unavailable')
})

test('legacy cloud v1 fixed synthetic digest remains stable', async () => {
  const source = { ...nhi, meta: { source: 'cloud-source' }, identifier: [{ ...nhi.identifier[0], value: 'A123***789' }] }
  expect((await cdssPatientIdentity(PatientMapper.toDomain(source)!)).patient_key_sha256).toBe('d75a54cf627889983461c14ea75b9dc62e7208e3a78722d36c150eec90ec9687')
})

test('complete NHI v2 fixed synthetic digest remains stable', async () => {
  const source = { ...nhi, meta: { source: 'cloud-source' }, identifier: [{ ...nhi.identifier[0], value: 'A123456789' }] }
  expect((await cdssPatientIdentity(PatientMapper.toDomain(source)!)).patient_key_sha256).toBe('1d144f5864f97f556d122ad46c4bc25370bf4892573f905a0a87b2663750c846')
})
