// Synthetic NHI-style fixture mirroring real bundle structure
// (HL7 ActCode classes, multi-coding observations, multi-reasonCode encounters,
// refill cycles, abnormal interpretations, etc.). Covers the edge cases that
// previously slipped past unit tests.
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import type { AgentDataSource } from '@/src/infrastructure/ai/tools/fhir-tools'

export const samplePatient: PatientEntity = {
  id: 'patient-test-001',
  resourceType: 'Patient',
  gender: 'male',
  birthDate: '1950-01-15',
  age: 75,
}

export const sampleCollection: ClinicalDataCollection = {
  conditions: [
    {
      id: 'cond-1',
      code: {
        text: '原發性高血壓',
        coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I10', display: 'Essential hypertension' }],
      },
      category: [{ coding: [{ code: 'problem-list-item' }] }],
      clinicalStatus: 'active',
      recordedDate: '2020-01-15',
    },
  ],
  medications: [
    // Chronic drug with TWO refill cycles (same name) — tests dedup
    {
      id: 'med-1a',
      medicationCodeableConcept: { text: '通舒錠', coding: [{ display: 'Sotalol' }] },
      status: 'active',
      authoredOn: '2026-04-27T00:00:00+08:00',
      courseOfTherapyType: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-course-of-therapy', code: 'continuous', display: 'Continuous long term therapy' }],
        text: 'Continuous long term therapy',
      } as any,
      encounter: { reference: 'Encounter/enc-amb-1' },
      intent: 'order',
    },
    {
      id: 'med-1b',
      medicationCodeableConcept: { text: '通舒錠', coding: [{ display: 'Sotalol' }] },
      status: 'completed',
      authoredOn: '2026-03-30T00:00:00+08:00',
      courseOfTherapyType: {
        coding: [{ code: 'continuous' }],
      } as any,
      encounter: { reference: 'Encounter/enc-amb-1' },
      intent: 'order',
    },
    // Acute med inside an inpatient stay
    {
      id: 'med-2',
      medicationCodeableConcept: { text: '普拿疼', coding: [{ display: 'Acetaminophen' }] },
      status: 'completed',
      authoredOn: '2025-05-18T00:00:00+08:00',
      courseOfTherapyType: null as any,
      encounter: { reference: 'Encounter/enc-inpatient-1' },
      intent: 'order',
    },
  ],
  allergies: [
    {
      id: 'allergy-1',
      code: { text: 'Penicillin' },
      criticality: 'high',
      // `type` is on FHIR AllergyIntolerance but our domain entity doesn't
      // narrow that field — tool reads it as `any`. Cast for fixture.
      type: 'allergy',
      recordedDate: '2015-06-01',
    } as any,
  ],
  observations: [
    // Lab observation — abnormal
    {
      id: 'obs-lab-1',
      code: {
        text: 'HbA1c',
        coding: [
          { system: 'http://loinc.org', code: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood' },
          { code: 'HbA1c', display: 'HbA1c' },
        ],
      },
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
      valueQuantity: { value: 8.2, unit: '%' },
      interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'H', display: 'High' }] }],
      effectiveDateTime: '2025-05-19T00:00:00+08:00',
      status: 'final',
    } as any,
    // Lab observation — normal
    {
      id: 'obs-lab-2',
      code: { text: 'WBC' },
      category: [{ coding: [{ code: 'laboratory' }] }],
      valueQuantity: { value: 6.0, unit: '10^3/uL' },
      interpretation: [{ coding: [{ code: 'N' }] }],
      effectiveDateTime: '2025-05-19T00:00:00+08:00',
    } as any,
    // Earlier HbA1c — for trend
    {
      id: 'obs-lab-3',
      code: { text: 'HbA1c' },
      category: [{ coding: [{ code: 'laboratory' }] }],
      valueQuantity: { value: 7.5, unit: '%' },
      interpretation: [{ coding: [{ code: 'H' }] }],
      effectiveDateTime: '2024-12-01T00:00:00+08:00',
    } as any,
  ],
  vitalSigns: [
    // Vital sign — uses category code "vital-signs" (hyphenated)
    {
      id: 'vital-1',
      code: {
        text: 'Body Height',
        coding: [
          { system: 'http://loinc.org', code: '8302-2', display: 'Body height' },
          { system: 'local', code: 'Body Height', display: 'Body Height' },
        ],
      },
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
      valueQuantity: { value: 168, unit: 'cm' },
      effectiveDateTime: '2025-05-18T00:00:00+08:00',
    } as any,
  ],
  diagnosticReports: [
    {
      id: 'report-1',
      code: { text: '全套血液檢查' },
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
      effectiveDateTime: '2025-05-19T00:00:00+08:00',
      status: 'final',
      encounter: { reference: 'Encounter/enc-inpatient-1' },
      _observations: [
        { code: { text: 'HbA1c' }, valueQuantity: { value: 8.2, unit: '%' }, interpretation: [{ coding: [{ code: 'H' }] }] },
        { code: { text: 'WBC' }, valueQuantity: { value: 6.0, unit: '10^3/uL' }, interpretation: [{ coding: [{ code: 'N' }] }] },
      ],
    } as any,
    {
      id: 'report-2',
      code: { text: 'Chest X-ray' },
      category: [{ coding: [{ code: 'RAD' }] }],
      effectiveDateTime: '2025-05-18T00:00:00+08:00',
      status: 'final',
      _observations: [],
    } as any,
  ],
  imagingStudies: [],
  procedures: [
    {
      id: 'proc-1',
      code: { text: '經皮玻璃體部分切除術' },
      status: 'completed',
      performedDateTime: '2016-09-23T00:00:00+08:00',
    },
  ],
  encounters: [
    // INPATIENT — primary + secondary diagnoses
    {
      id: 'enc-inpatient-1',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'inpatient encounter' },
      type: [{ text: '住院' }],
      period: { start: '2025-05-18T00:00:00+08:00', end: '2025-05-22T00:00:00+08:00' },
      status: 'finished',
      serviceProvider: { display: '長庚嘉義' },
      reasonCode: [
        { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I50.9', display: 'Heart failure, unspecified' }], text: 'I50.9 心臟衰竭' },
        { coding: [{ code: 'E11.9', display: 'Type 2 diabetes mellitus without complications' }], text: 'E11.9 第二型糖尿病' },
      ],
      participant: [{ individual: { display: 'Dr. Wang' } }],
    } as any,
    // OUTPATIENT
    {
      id: 'enc-amb-1',
      class: { code: 'AMB' },
      type: [{ text: '門診' }],
      period: { start: '2026-03-30T00:00:00+08:00' },
      status: 'finished',
      serviceProvider: { display: '臺北榮總' },
      reasonCode: [{ coding: [{ code: 'I10', display: 'Essential hypertension' }] }],
    } as any,
    // EMERGENCY
    {
      id: 'enc-emer-1',
      class: { code: 'EMER' },
      type: [{ text: '急診' }],
      period: { start: '2025-02-11T00:00:00+08:00' },
      status: 'finished',
      reasonCode: [],
    } as any,
    // PHARMACY (AMB class but type=藥局)
    {
      id: 'enc-pharm-1',
      class: { code: 'AMB' },
      type: [{ text: '藥局' }],
      period: { start: '2026-05-13T00:00:00+08:00' },
      status: 'finished',
      serviceProvider: { display: '益安大藥局' },
    } as any,
  ],
  documentReferences: [],
  compositions: [],
  immunizations: [
    {
      id: 'imm-1',
      vaccineCode: { text: '流感疫苗', coding: [{ code: 'FLU' }] },
      occurrenceDateTime: '2024-10-01T00:00:00+08:00',
      performer: [{ actor: { display: 'CDC' } }],
    } as any,
  ],
  consents: [],
  devices: [],
  carePlans: [],
}

export const sampleDataSource = (): AgentDataSource => ({
  patient: samplePatient,
  collection: sampleCollection,
})
