import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const output = process.argv[2]
if (!output) throw new Error('Usage: node generate-fhir.mjs <output.json>')
const base = 'https://example.org/fhir'
const marker = { system: `${base}/CodeSystem/test-data`, code: 'synthetic', display: '合成效能測試資料' }
const patientId = 'synthetic-patient-1000-prescriptions'
const organizationId = 'synthetic-test-hospital'
const encounterId = 'synthetic-outpatient-20260903'
const start = '2026-09-03'
const end = '2026-10-01'
const names = ['ACETAMINOPHEN 500 MG', 'QUETIAPINE (AS FUMARATE) 25 MG', 'BETHANECHOL CHLORIDE 25 MG', 'SODIUM CHLORIDE 3.2 MG/ML+POTASSIUM CHLORIDE 1.4 MG/ML']
const frequencies = ['HS', 'TIDAC', 'BID', 'QDPRN']
const resources = [
  {
    resourceType: 'Patient', id: patientId, meta: { tag: [marker] }, active: true,
    identifier: [{ system: `${base}/synthetic-patient-id`, value: 'TEST-1000-PRESCRIPTIONS' }],
    name: [{ use: 'official', text: '合成測試病人（1000筆處方）' }], gender: 'unknown',
  },
  { resourceType: 'Organization', id: organizationId, meta: { tag: [marker] }, active: true, name: '合成測試醫院' },
  {
    resourceType: 'Encounter', id: encounterId, meta: { tag: [marker] }, status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patientId}` },
    period: { start: `${start}T09:00:00+08:00`, end: `${start}T10:00:00+08:00` },
    serviceProvider: { reference: `Organization/${organizationId}`, display: '合成測試醫院' },
  },
]
for (let i = 0; i < 1000; i++) {
  const frequency = frequencies[i % 4]
  const quantity = 28 + (i % 4) * 14
  resources.push({
    resourceType: 'MedicationRequest', id: `synthetic-rx-${String(i + 1).padStart(4, '0')}`,
    meta: { tag: [marker] }, status: 'active', intent: 'order',
    medicationCodeableConcept: {
      coding: [{ system: `${base}/CodeSystem/synthetic-medication`, code: `drug-${i % 4 + 1}`, display: names[i % 4] }],
      text: names[i % 4],
    },
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${encounterId}` }, authoredOn: `${start}T09:00:00+08:00`,
    requester: { reference: `Organization/${organizationId}`, display: '合成測試醫院 門診' },
    category: [{ text: '合成測試藥理分類' }],
    ...(i % 2 === 0 ? { courseOfTherapyType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-course-of-therapy', code: 'continuous', display: 'Continuous long term therapy' }] } } : {}),
    reasonCode: [{ coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'S72.002A' }], text: '左側股骨頸未明示部位閉鎖性骨折之初期照護' }],
    dosageInstruction: [{
      sequence: 1, text: `${i % 3 === 0 ? '1 錠，' : ''}${frequency}，28 天，總量 ${quantity}`,
      timing: { code: { text: frequency }, repeat: { boundsPeriod: { start, end }, frequency: [1, 3, 2, 1][i % 4], period: 1, periodUnit: 'd' } },
      asNeededBoolean: frequency === 'QDPRN', route: { text: 'PO' },
      ...(i % 3 === 0 ? { doseAndRate: [{ doseQuantity: { value: 1, unit: '錠' } }] } : {}),
    }],
    dispenseRequest: {
      validityPeriod: { start, end }, quantity: { value: quantity },
      expectedSupplyDuration: { value: 28, unit: 'days', system: 'http://unitsofmeasure.org', code: 'd' },
    },
    note: [{ text: '完全合成的介面效能測試處方，沿用千列測試資料；不是實際病歷或可供臨床採用的處方。剩餘天數及累計開立次數應由應用程式計算。' }],
  })
}
const bundle = {
  resourceType: 'Bundle', id: 'synthetic-1000-prescriptions', type: 'collection',
  meta: { tag: [marker] }, timestamp: new Date().toISOString(),
  identifier: { system: `${base}/synthetic-bundle-id`, value: 'medication-date-fit-1000-v1' },
  entry: resources.map(resource => ({ fullUrl: `${base}/${resource.resourceType}/${resource.id}`, resource })),
}
const requests = resources.filter(r => r.resourceType === 'MedicationRequest')
assert.equal(requests.length, 1000)
assert.equal(resources.filter(r => r.resourceType === 'Patient').length, 1)
const keys = new Set(resources.map(r => `${r.resourceType}/${r.id}`))
assert.equal(keys.size, resources.length)
function checkReferences(value) {
  if (!value || typeof value !== 'object') return
  if (typeof value.reference === 'string') assert(keys.has(value.reference), `Unresolved reference: ${value.reference}`)
  for (const child of Object.values(value)) checkReferences(child)
}
checkReferences(bundle)
for (const request of requests) {
  assert.equal(request.subject.reference, `Patient/${patientId}`)
  assert.equal(request.dispenseRequest.expectedSupplyDuration.value, 28)
  assert.equal((Date.parse(end) - Date.parse(start)) / 86400000, 28)
}
writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`, { flag: 'wx' })
assert.equal(JSON.parse(readFileSync(output, 'utf8')).entry.length, 1003)
console.log(JSON.stringify({ output: resolve(output), prescriptions: requests.length, resources: resources.length, medicationNames: names.length, bytes: readFileSync(output).length, checks: 'JSON roundtrip, unique IDs, prescription count, patient references, all resource references and date duration passed' }))
