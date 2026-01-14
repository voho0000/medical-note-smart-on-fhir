// Unit Tests: FHIR Mapper
import { FhirMapper } from '@/src/infrastructure/fhir/mappers/fhir.mapper'

describe('FhirMapper', () => {
  describe('toCondition', () => {
    it('should map FHIR Condition to domain entity', () => {
      const fhirCondition = {
        id: 'condition-123',
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '73211009', display: 'Diabetes mellitus' }],
          text: 'Diabetes'
        },
        clinicalStatus: {
          coding: [{ code: 'active' }]
        },
        verificationStatus: {
          coding: [{ code: 'confirmed' }]
        },
        recordedDate: '2024-01-15'
      }

      const result = FhirMapper.toCondition(fhirCondition)

      expect(result.id).toBe('condition-123')
      expect(result.code).toEqual(fhirCondition.code)
      expect(result.clinicalStatus).toBe('active')
      expect(result.verificationStatus).toBe('confirmed')
      expect(result.recordedDate).toBe('2024-01-15')
    })

    it('should handle missing id with empty string', () => {
      const fhirCondition = {
        code: { text: 'Hypertension' }
      }

      const result = FhirMapper.toCondition(fhirCondition)

      expect(result.id).toBe('')
    })

    it('should handle dateRecorded fallback', () => {
      const fhirCondition = {
        id: 'cond-456',
        code: { text: 'Asthma' },
        dateRecorded: '2023-06-20'
      }

      const result = FhirMapper.toCondition(fhirCondition)

      expect(result.recordedDate).toBe('2023-06-20')
    })

    it('should handle missing status fields', () => {
      const fhirCondition = {
        id: 'cond-789',
        code: { text: 'Condition' }
      }

      const result = FhirMapper.toCondition(fhirCondition)

      expect(result.clinicalStatus).toBeUndefined()
      expect(result.verificationStatus).toBeUndefined()
    })
  })

  describe('toMedication', () => {
    it('should map FHIR MedicationRequest to domain entity', () => {
      const fhirMedication = {
        id: 'med-123',
        medicationCodeableConcept: {
          coding: [{ code: '123456', display: 'Aspirin' }],
          text: 'Aspirin 100mg'
        },
        status: 'active',
        intent: 'order',
        authoredOn: '2024-01-10',
        dosageInstruction: [
          {
            text: 'Take 1 tablet daily',
            timing: { repeat: { frequency: 1, period: 1, periodUnit: 'd' } }
          }
        ]
      }

      const result = FhirMapper.toMedication(fhirMedication)

      expect(result.id).toBe('med-123')
      expect(result.medicationCodeableConcept).toEqual(fhirMedication.medicationCodeableConcept)
      expect(result.status).toBe('active')
      expect(result.intent).toBe('order')
      expect(result.authoredOn).toBe('2024-01-10')
      expect(result.dosageInstruction).toHaveLength(1)
    })

    it('should handle missing optional fields', () => {
      const fhirMedication = {
        id: 'med-minimal'
      }

      const result = FhirMapper.toMedication(fhirMedication)

      expect(result.id).toBe('med-minimal')
      expect(result.medicationCodeableConcept).toBeUndefined()
      expect(result.status).toBeUndefined()
    })
  })

  describe('toAllergy', () => {
    it('should map FHIR AllergyIntolerance to domain entity', () => {
      const fhirAllergy = {
        id: 'allergy-123',
        code: {
          coding: [{ code: '227493005', display: 'Cashew nut' }],
          text: 'Cashew nuts'
        },
        clinicalStatus: {
          coding: [{ code: 'active' }]
        },
        verificationStatus: {
          coding: [{ code: 'confirmed' }]
        },
        criticality: 'high',
        reaction: [
          {
            manifestation: [{ text: 'Anaphylaxis' }],
            severity: 'severe'
          }
        ],
        recordedDate: '2023-05-15'
      }

      const result = FhirMapper.toAllergy(fhirAllergy)

      expect(result.id).toBe('allergy-123')
      expect(result.code).toEqual(fhirAllergy.code)
      expect(result.clinicalStatus).toBe('active')
      expect(result.verificationStatus).toBe('confirmed')
      expect(result.criticality).toBe('high')
      expect(result.reaction).toHaveLength(1)
      expect(result.recordedDate).toBe('2023-05-15')
    })

    it('should handle recorded fallback', () => {
      const fhirAllergy = {
        id: 'allergy-456',
        code: { text: 'Peanuts' },
        recorded: '2022-03-10'
      }

      const result = FhirMapper.toAllergy(fhirAllergy)

      expect(result.recordedDate).toBe('2022-03-10')
    })
  })

  describe('toObservation', () => {
    it('should map FHIR Observation with valueQuantity', () => {
      const fhirObservation = {
        id: 'obs-123',
        code: {
          coding: [{ code: '8867-4', display: 'Heart rate' }],
          text: 'Heart rate'
        },
        valueQuantity: {
          value: 72,
          unit: 'beats/minute',
          system: 'http://unitsofmeasure.org',
          code: '/min'
        },
        effectiveDateTime: '2024-01-15T10:30:00Z',
        status: 'final',
        category: [
          {
            coding: [{ code: 'vital-signs' }]
          }
        ]
      }

      const result = FhirMapper.toObservation(fhirObservation)

      expect(result.id).toBe('obs-123')
      expect(result.code).toEqual(fhirObservation.code)
      expect(result.valueQuantity).toEqual(fhirObservation.valueQuantity)
      expect(result.effectiveDateTime).toBe('2024-01-15T10:30:00Z')
      expect(result.status).toBe('final')
      expect(result.category).toHaveLength(1)
    })

    it('should map FHIR Observation with valueString', () => {
      const fhirObservation = {
        id: 'obs-456',
        code: { text: 'Blood type' },
        valueString: 'A+',
        effectiveDateTime: '2024-01-10',
        status: 'final'
      }

      const result = FhirMapper.toObservation(fhirObservation)

      expect(result.valueString).toBe('A+')
      expect(result.valueQuantity).toBeUndefined()
    })

    it('should map FHIR Observation with components', () => {
      const fhirObservation = {
        id: 'obs-bp',
        code: { text: 'Blood Pressure' },
        component: [
          {
            code: { text: 'Systolic' },
            valueQuantity: { value: 120, unit: 'mmHg' }
          },
          {
            code: { text: 'Diastolic' },
            valueQuantity: { value: 80, unit: 'mmHg' }
          }
        ],
        effectiveDateTime: '2024-01-15',
        status: 'final'
      }

      const result = FhirMapper.toObservation(fhirObservation)

      expect(result.component).toBeDefined()
      expect(result.component).toHaveLength(2)
      if (result.component) {
        expect(result.component[0].code?.text).toBe('Systolic')
        expect(result.component[1].code?.text).toBe('Diastolic')
      }
    })
  })

  describe('toDiagnosticReport', () => {
    it('should map FHIR DiagnosticReport without observations', () => {
      const fhirReport = {
        id: 'report-123',
        code: {
          coding: [{ code: 'LAB', display: 'Laboratory' }],
          text: 'Lab Report'
        },
        status: 'final',
        effectiveDateTime: '2024-01-15',
        issued: '2024-01-15T14:30:00Z',
        conclusion: 'All values within normal range',
        category: [{ coding: [{ code: 'LAB' }] }]
      }

      const result = FhirMapper.toDiagnosticReport(fhirReport, [])

      expect(result.id).toBe('report-123')
      expect(result.code).toEqual(fhirReport.code)
      expect(result.status).toBe('final')
      expect(result.conclusion).toBe('All values within normal range')
      expect(result._observations).toBeUndefined()
    })

    it('should map DiagnosticReport with linked observations', () => {
      const observations = [
        {
          id: 'obs-1',
          code: { text: 'Glucose' },
          valueQuantity: { value: 95, unit: 'mg/dL' },
          status: 'final'
        },
        {
          id: 'obs-2',
          code: { text: 'Cholesterol' },
          valueQuantity: { value: 180, unit: 'mg/dL' },
          status: 'final'
        }
      ]

      const fhirReport = {
        id: 'report-456',
        code: { text: 'Metabolic Panel' },
        status: 'final',
        result: [
          { reference: 'Observation/obs-1' },
          { reference: 'Observation/obs-2' }
        ],
        effectiveDateTime: '2024-01-15'
      }

      const result = FhirMapper.toDiagnosticReport(fhirReport, observations)

      expect(result._observations).toHaveLength(2)
      expect(result._observations?.[0].id).toBe('obs-1')
      expect(result._observations?.[1].id).toBe('obs-2')
    })

    it('should expand observations with hasMember', () => {
      const observations = [
        {
          id: 'obs-panel',
          code: { text: 'Blood Pressure Panel' },
          status: 'final',
          hasMember: [
            { reference: 'Observation/obs-systolic' },
            { reference: 'Observation/obs-diastolic' }
          ]
        },
        {
          id: 'obs-systolic',
          code: { text: 'Systolic BP' },
          valueQuantity: { value: 120, unit: 'mmHg' },
          status: 'final'
        },
        {
          id: 'obs-diastolic',
          code: { text: 'Diastolic BP' },
          valueQuantity: { value: 80, unit: 'mmHg' },
          status: 'final'
        }
      ]

      const fhirReport = {
        id: 'report-bp',
        code: { text: 'BP Report' },
        status: 'final',
        result: [{ reference: 'Observation/obs-panel' }],
        effectiveDateTime: '2024-01-15'
      }

      const result = FhirMapper.toDiagnosticReport(fhirReport, observations)

      expect(result._observations).toHaveLength(3)
      expect(result._observations?.[0].id).toBe('obs-panel')
      expect(result._observations?.[1].id).toBe('obs-systolic')
      expect(result._observations?.[2].id).toBe('obs-diastolic')
    })

    it('should handle missing result references', () => {
      const fhirReport = {
        id: 'report-no-results',
        code: { text: 'Empty Report' },
        status: 'final',
        effectiveDateTime: '2024-01-15'
      }

      const result = FhirMapper.toDiagnosticReport(fhirReport, [])

      expect(result._observations).toBeUndefined()
    })
  })

  describe('toProcedure', () => {
    it('should map FHIR Procedure with performedDateTime', () => {
      const fhirProcedure = {
        id: 'proc-123',
        code: {
          coding: [{ code: '80146002', display: 'Appendectomy' }],
          text: 'Appendectomy'
        },
        status: 'completed',
        performedDateTime: '2024-01-10T09:00:00Z'
      }

      const result = FhirMapper.toProcedure(fhirProcedure)

      expect(result.id).toBe('proc-123')
      expect(result.code).toEqual(fhirProcedure.code)
      expect(result.status).toBe('completed')
      expect(result.performedDateTime).toBe('2024-01-10T09:00:00Z')
      expect(result.performedPeriod).toBeUndefined()
    })

    it('should map FHIR Procedure with performedPeriod', () => {
      const fhirProcedure = {
        id: 'proc-456',
        code: { text: 'Surgery' },
        status: 'in-progress',
        performedPeriod: {
          start: '2024-01-15T08:00:00Z',
          end: '2024-01-15T12:00:00Z'
        }
      }

      const result = FhirMapper.toProcedure(fhirProcedure)

      expect(result.performedPeriod).toEqual(fhirProcedure.performedPeriod)
      expect(result.performedDateTime).toBeUndefined()
    })
  })

  describe('toEncounter', () => {
    it('should map FHIR Encounter', () => {
      const fhirEncounter = {
        id: 'enc-123',
        status: 'finished',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'IMP',
          display: 'inpatient encounter'
        },
        type: [
          {
            coding: [{ code: 'emergency', display: 'Emergency' }]
          }
        ],
        period: {
          start: '2024-01-10T08:00:00Z',
          end: '2024-01-12T16:00:00Z'
        },
        reasonCode: [
          {
            coding: [{ code: '386661006', display: 'Fever' }]
          }
        ]
      }

      const result = FhirMapper.toEncounter(fhirEncounter)

      expect(result.id).toBe('enc-123')
      expect(result.status).toBe('finished')
      expect(result.class).toEqual(fhirEncounter.class)
      expect(result.type).toHaveLength(1)
      expect(result.period).toEqual(fhirEncounter.period)
      expect(result.reasonCode).toHaveLength(1)
    })

    it('should handle minimal Encounter', () => {
      const fhirEncounter = {
        id: 'enc-minimal',
        status: 'planned'
      }

      const result = FhirMapper.toEncounter(fhirEncounter)

      expect(result.id).toBe('enc-minimal')
      expect(result.status).toBe('planned')
      expect(result.class).toBeUndefined()
      expect(result.type).toBeUndefined()
    })
  })
})
