import { FhirMapper } from '@/src/infrastructure/fhir/mappers/fhir.mapper'

it('preserves MediCloud qualitative results, method and source extensions', () => {
  const observation = {
    id: 'synthetic-hbsag', status: 'unknown', code: { text: 'HBsAg' },
    effectiveDateTime: '2024-03-12', valueCodeableConcept: { text: '陰性' },
    performer: [{ display: '合成院所' }], note: [{ text: '最近一次結果；IMUE0180' }],
    method: { text: '來源方法' }, extension: [{ url: 'source', valueUri: 'IMUE0180' }],
  }
  expect(FhirMapper.toObservation(observation)).toMatchObject(observation)
})

it('preserves source Composition sections, references and provenance tags', () => {
  const composition = {
    id: 'synthetic-exam',
    meta: { tag: [{ system: 'http://nhi-fhir-bridge/source-program', code: 'adult-preventive' }] },
    section: [{ title: 'B型肝炎檢查', text: { div: '<div>HBsAg 陰性</div>' }, entry: [{ reference: 'Observation/synthetic-hbsag' }] }],
  }
  expect(FhirMapper.toComposition(composition)).toMatchObject(composition)
})
