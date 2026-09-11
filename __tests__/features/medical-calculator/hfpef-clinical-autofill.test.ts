import { buildClinicalSelects, ecgSelects, antihypertensiveSelect } from '@/features/medical-calculator/hfpef-clinical-autofill'
import { buildAutofill } from '@/features/medical-calculator/hooks/use-lab-autofill.hook'
import { resolveInput, isFullyAutofillable } from '@/features/medical-calculator/autofill-compute'
import { HFPEF } from '@/features/medical-calculator/calculators/hfpef'
import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'
const now = new Date('2026-09-12T12:00:00Z')
const ecg = (conclusion: string, date = '2026-09-11') => ({ id: `ekg-${date}`, code: { text: 'EKG' }, conclusion, effectiveDateTime: date, status: 'final' })
const drug = (name: string, id = name, status = 'active'): MedicationEntity => ({ id, status, medicationCodeableConcept: { text: name }, authoredOn: '2026-09-01' })
const dx = (code: string) => ({ id: 'dx-af', code: { coding: [{ code, system: 'http://hl7.org/fhir/sid/icd-10-cm' }] }, recordedDate: '2026-01-01' })

describe('AF diagnosis first, EKG fallback', () => {
  test.each(['I48.0', 'I48.11', 'I48.19', 'I48.2', 'I48.20', 'I48.21', 'I48.91'])('AF code %s overrides a sinus tracing for history', code => {
    const result = buildClinicalSelects([ecg('Normal sinus rhythm')], [], now, [dx(code)])
    expect(result.afHistory).toMatchObject({ value: 'yes', resourceType: 'Condition', obsId: 'dx-af' })
    expect(result.rhythm?.value).toBe('sr')
  })
  test.each(['I48.3', 'I48.4', 'I48.92', 'I48', 'I48.9'])('flutter/ambiguous code %s does not assert AF', code => {
    expect(buildClinicalSelects([], [], now, [dx(code)]).afHistory).toBeUndefined()
  })
  test('billing encounter code has provenance and precedes EKG', () => {
    const encounters = [{ id: 'visit', reasonCode: [{ coding: [{ code: 'I4891' }] }], period: { start: '2026-08-01' } }]
    expect(buildClinicalSelects([ecg('Sinus bradycardia')], [], now, [], encounters).afHistory).toMatchObject({ value: 'yes', resourceType: 'Encounter', obsId: 'visit' })
  })
  test('refuted and unknown code systems do not assert AF', () => {
    expect(buildClinicalSelects([], [], now, [{ ...dx('I48.0'), verificationStatus: 'refuted' }]).afHistory).toBeUndefined()
    expect(buildClinicalSelects([], [], now, [{ id: 'x', code: { coding: [{ code: 'I480', system: 'local-unknown' }] } }]).afHistory).toBeUndefined()
  })
  test('older EKG AF is retained when latest EKG is sinus', () => {
    const result = buildClinicalSelects([ecg('Atrial fibrillation', '2026-01-01'), ecg('Normal sinus rhythm')], [], now)
    expect(result.afHistory).toMatchObject({ value: 'yes', date: '2026-01-01' })
    expect(result.rhythm?.value).toBe('sr')
  })
  test('sinus-only records permit a labelled record-based no; no data stay blank', () => {
    expect(buildClinicalSelects([ecg('Sinus bradycardia')], [], now).afHistory?.value).toBe('no')
    expect(buildClinicalSelects([], [], now).afHistory).toBeUndefined()
  })
  test.each(['No atrial fibrillation', 'Possible AF', 'Rule out atrial fibrillation', 'Atrial flutter', 'Ventricular paced rhythm'])('does not misread %s as AF', text => expect(ecgSelects([ecg(text)], now).afHistory).toBeUndefined())
  test('historical mention is not the current rhythm', () => {
    const result = ecgSelects([ecg('History of atrial fibrillation; Normal sinus rhythm')], now)
    expect(result.afHistory?.value).toBe('yes')
    expect(result.rhythm?.value).toBe('sr')
  })
  test('cancelled/future EKG excluded and unknown latest rhythm not filled from older sinus', () => {
    expect(ecgSelects([{ ...ecg('AF'), status: 'cancelled' }, ecg('AF', '2027-01-01')], now)).toEqual({})
    expect(ecgSelects([ecg('Normal sinus rhythm', '2026-01-01'), ecg('Ventricular paced rhythm')], now).rhythm).toBeUndefined()
  })
})
describe('current antihypertensive ingredients', () => {
  test('two agents, with source and one agent', () => {
    expect(antihypertensiveSelect([drug('amlodipine'), drug('valsartan')], now)).toMatchObject({ value: 'yes', resourceType: 'MedicationRequest' })
    expect(antihypertensiveSelect([drug('amlodipine')], now)?.value).toBe('no')
  })
  test('duplicate prescriptions, doses and combo overlap are deduplicated', () => {
    expect(antihypertensiveSelect([drug('amlodipine 5mg', 'a'), drug('amlodipine 10mg', 'b')], now)?.value).toBe('no')
    expect(antihypertensiveSelect([drug('amlodipine/valsartan', 'combo'), drug('amlodipine', 'single')], now)?.testName).toContain('2 種')
  })
  test('ATC-only and named records deduplicate to same ingredient', () => {
    const med = { ...drug('Norvasc'), medicationCodeableConcept: { coding: [{ code: 'C08CA01', system: 'http://www.whocc.no/atc' }] } }
    expect(antihypertensiveSelect([med, drug('amlodipine')], now)?.value).toBe('no')
  })
  test('stopped, expired and future supplies do not count', () => {
    expect(antihypertensiveSelect([drug('amlodipine'), drug('valsartan', 'v', 'stopped')], now)?.value).toBe('no')
    const expired = { ...drug('valsartan'), authoredOn: '2026-01-01', dispenseRequest: { expectedSupplyDuration: { value: 30, unit: 'days' } } }
    expect(antihypertensiveSelect([drug('amlodipine'), expired], now)?.value).toBe('no')
    expect(antihypertensiveSelect([drug('amlodipine'), { ...drug('valsartan'), authoredOn: '2027-01-01' }], now)?.value).toBe('no')
  })
  test('ophthalmic beta blockers and non-antihypertensive drugs excluded', () => {
    expect(antihypertensiveSelect([drug('betaxolol eye drops'), drug('amlodipine')], now)?.value).toBe('no')
  })
  test('unresolved combo/unknown meds do not force a negative result', () => {
    expect(antihypertensiveSelect([drug('unidentified tablet')], now)).toBeUndefined()
    const combo = { ...drug('valsartan'), medicationCodeableConcept: { text: 'valsartan', coding: [{ code: 'C09DA03', system: 'http://www.whocc.no/atc' }] } }
    expect(antihypertensiveSelect([combo], now)).toBeUndefined()
    expect(antihypertensiveSelect([], now)).toBeUndefined()
  })
  test('ARNI is a single therapeutic agent', () => expect(antihypertensiveSelect([drug('sacubitril/valsartan')], now)?.value).toBe('no'))
  test('selector seeding includes evidence without enabling unreviewed list scores', () => {
    const af = buildAutofill([], {}, [ecg('AF')], [drug('amlodipine'), drug('valsartan')], now)
    expect(resolveInput(HFPEF[0].inputs.find(i => i.key === 'af')!, af)).toMatchObject({ value: 'yes', filled: true, source: { resourceType: 'DiagnosticReport' } })
    expect(resolveInput(HFPEF[0].inputs.find(i => i.key === 'antihypertensives')!, af)).toMatchObject({ value: 'yes', filled: true })
    expect(isFullyAutofillable(HFPEF[0])).toBe(false)
  })
})
