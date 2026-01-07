// Unit Tests: Generate Clinical Context Use Case
import { GenerateClinicalContextUseCase } from '@/src/core/use-cases/clinical-context/generate-clinical-context.use-case'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import type { ClinicalContextOptions } from '@/src/core/entities/clinical-context.entity'

describe('GenerateClinicalContextUseCase', () => {
  let useCase: GenerateClinicalContextUseCase

  beforeEach(() => {
    useCase = new GenerateClinicalContextUseCase()
  })

  const mockPatient: PatientEntity = {
    id: 'patient-123',
    resourceType: 'Patient',
    name: [{ given: ['John'], family: 'Doe' }],
    gender: 'male',
    birthDate: '1990-01-15',
    age: 34
  }

  const mockClinicalData: ClinicalDataCollection = {
    conditions: [
      { id: 'cond-1', code: { text: 'Diabetes Type 2' } },
      { id: 'cond-2', code: { text: 'Hypertension' } }
    ],
    medications: [
      { id: 'med-1', medicationCodeableConcept: { text: 'Metformin 500mg' }, status: 'active', intent: 'order' },
      { id: 'med-2', medicationCodeableConcept: { text: 'Lisinopril 10mg' }, status: 'active', intent: 'order' }
    ],
    allergies: [
      { id: 'allergy-1', code: { text: 'Penicillin' } }
    ],
    observations: [],
    vitalSigns: [
      {
        id: 'vital-1',
        code: { text: 'Blood Pressure' },
        valueQuantity: { value: 120, unit: 'mmHg' },
        effectiveDateTime: new Date().toISOString(),
        status: 'final'
      }
    ],
    diagnosticReports: [
      {
        id: 'report-1',
        code: { text: 'Complete Blood Count' },
        effectiveDateTime: new Date().toISOString(),
        status: 'final',
        _observations: [
          {
            id: 'obs-1',
            code: { text: 'Hemoglobin' },
            valueQuantity: { value: 14.5, unit: 'g/dL' },
            status: 'final'
          }
        ]
      }
    ],
    procedures: [
      {
        id: 'proc-1',
        code: { text: 'Appendectomy' },
        status: 'completed',
        performedDateTime: '2024-01-10'
      }
    ],
    encounters: []
  }

  const defaultOptions: ClinicalContextOptions = {
    selection: {
      patientInfo: true,
      conditions: true,
      medications: true,
      allergies: true,
      observations: true,
      diagnosticReports: true,
      procedures: true
    },
    filters: {
      medicationStatus: 'all',
      conditionStatus: 'all',
      reportInclusion: 'all',
      reportTimeRange: 'all',
      labReportVersion: 'all',
      vitalSignsVersion: 'all',
      vitalSignsTimeRange: 'all'
    }
  }

  describe('execute', () => {
    it('should generate patient information section', () => {
      const result = useCase.execute(mockPatient, mockClinicalData, defaultOptions)

      const patientSection = result.find(s => s.title === 'Patient Information')
      expect(patientSection).toBeDefined()
      expect(patientSection?.items).toContain('Gender: Male')
      expect(patientSection?.items).toContain('Age: 34')
    })

    it('should generate conditions section', () => {
      const result = useCase.execute(mockPatient, mockClinicalData, defaultOptions)

      const conditionsSection = result.find(s => s.title === "Patient's Conditions")
      expect(conditionsSection).toBeDefined()
      expect(conditionsSection?.items).toContain('Diabetes Type 2')
      expect(conditionsSection?.items).toContain('Hypertension')
    })

    it('should generate medications section', () => {
      const result = useCase.execute(mockPatient, mockClinicalData, defaultOptions)

      const medsSection = result.find(s => s.title === "Patient's Medications")
      expect(medsSection).toBeDefined()
      expect(medsSection?.items).toContain('Active Medications:')
      expect(medsSection?.items.some(item => item.includes('Metformin 500mg'))).toBe(true)
      expect(medsSection?.items.some(item => item.includes('Lisinopril 10mg'))).toBe(true)
    })

    it('should filter medications by status', () => {
      const dataWithInactive = {
        ...mockClinicalData,
        medications: [
          ...mockClinicalData.medications,
          { id: 'med-3', medicationCodeableConcept: { text: 'Old Med' }, status: 'stopped', intent: 'order' }
        ]
      }

      const options = {
        ...defaultOptions,
        filters: { ...defaultOptions.filters, medicationStatus: 'active' as const }
      }

      const result = useCase.execute(mockPatient, dataWithInactive, options)
      const medsSection = result.find(s => s.title === "Patient's Medications")
      
      expect(medsSection?.items.some(item => item.includes('Old Med'))).toBe(false)
      expect(medsSection?.items).toContain('Active Medications:')
      expect(medsSection?.items.length).toBeGreaterThanOrEqual(3) // Header + 2 active meds
    })

    it('should generate allergies section', () => {
      const result = useCase.execute(mockPatient, mockClinicalData, defaultOptions)

      const allergiesSection = result.find(s => s.title === "Patient's Allergies")
      expect(allergiesSection).toBeDefined()
      expect(allergiesSection?.items).toContain('Penicillin')
    })

    it('should generate diagnostic reports section', () => {
      const result = useCase.execute(mockPatient, mockClinicalData, defaultOptions)

      const reportsSection = result.find(s => s.title?.includes('Diagnostic Reports'))
      expect(reportsSection).toBeDefined()
      expect(reportsSection?.items.some(item => item.includes('Complete Blood Count'))).toBe(true)
    })

    it('should generate procedures section', () => {
      const result = useCase.execute(mockPatient, mockClinicalData, defaultOptions)

      const proceduresSection = result.find(s => s.title === 'Procedures')
      expect(proceduresSection).toBeDefined()
      expect(proceduresSection?.items.some(item => item.includes('Appendectomy'))).toBe(true)
    })

    it('should generate vital signs section', () => {
      const result = useCase.execute(mockPatient, mockClinicalData, defaultOptions)

      const vitalSection = result.find(s => s.title === 'Blood Pressure')
      expect(vitalSection).toBeDefined()
      expect(vitalSection?.items).toContain('120 mmHg')
    })

    it('should handle null patient', () => {
      const result = useCase.execute(null, mockClinicalData, defaultOptions)

      const patientSection = result.find(s => s.title === 'Patient Information')
      expect(patientSection).toBeUndefined()
    })

    it('should handle empty clinical data', () => {
      const emptyData: ClinicalDataCollection = {
        conditions: [],
        medications: [],
        allergies: [],
        observations: [],
        vitalSigns: [],
        diagnosticReports: [],
        procedures: [],
        encounters: []
      }

      const result = useCase.execute(mockPatient, emptyData, defaultOptions)

      expect(result.length).toBeGreaterThan(0) // Should at least have patient info
      expect(result.find(s => s.title === 'Patient Information')).toBeDefined()
    })

    it('should respect selection options', () => {
      const selectiveOptions: ClinicalContextOptions = {
        selection: {
          patientInfo: true,
          conditions: true,
          medications: false,
          allergies: false,
          observations: false,
          diagnosticReports: false,
          procedures: false
        },
        filters: defaultOptions.filters
      }

      const result = useCase.execute(mockPatient, mockClinicalData, selectiveOptions)

      expect(result.find(s => s.title === 'Patient Information')).toBeDefined()
      expect(result.find(s => s.title === "Patient's Conditions")).toBeDefined()
      expect(result.find(s => s.title === "Patient's Medications")).toBeUndefined()
      expect(result.find(s => s.title === "Patient's Allergies")).toBeUndefined()
    })

    it('should show latest reports only when specified', () => {
      const dataWithMultipleReports = {
        ...mockClinicalData,
        diagnosticReports: [
          {
            id: 'report-1',
            code: { text: 'CBC' },
            effectiveDateTime: '2024-01-15',
            status: 'final' as const,
            _observations: [
              {
                id: 'obs-1',
                code: { text: 'WBC' },
                valueQuantity: { value: 7.5, unit: 'K/uL' },
                status: 'final' as const
              }
            ]
          },
          {
            id: 'report-2',
            code: { text: 'CBC' },
            effectiveDateTime: '2024-01-10',
            status: 'final' as const,
            _observations: [
              {
                id: 'obs-2',
                code: { text: 'WBC' },
                valueQuantity: { value: 8.0, unit: 'K/uL' },
                status: 'final' as const
              }
            ]
          }
        ]
      }

      const options = {
        ...defaultOptions,
        filters: { ...defaultOptions.filters, labReportVersion: 'latest' as const }
      }

      const result = useCase.execute(mockPatient, dataWithMultipleReports, options)
      const reportsSection = result.find(s => s.title?.includes('Latest Versions Only'))
      
      expect(reportsSection).toBeDefined()
      expect(reportsSection?.items.length).toBeGreaterThan(0)
    })
  })

  describe('formatSections', () => {
    it('should format sections as text', () => {
      const sections = [
        { title: 'Section 1', items: ['Item 1', 'Item 2'] },
        { title: 'Section 2', items: ['Item 3'] }
      ]

      const result = useCase.formatSections(sections)

      expect(result).toContain('Section 1:')
      expect(result).toContain('- Item 1')
      expect(result).toContain('- Item 2')
      expect(result).toContain('Section 2:')
      expect(result).toContain('- Item 3')
    })

    it('should handle empty sections', () => {
      const result = useCase.formatSections([])

      expect(result).toBe('No clinical data available.')
    })

    it('should filter out sections with no items', () => {
      const sections = [
        { title: 'Section 1', items: ['Item 1'] },
        { title: 'Empty Section', items: [] },
        { title: 'Section 2', items: ['Item 2'] }
      ]

      const result = useCase.formatSections(sections)

      expect(result).toContain('Section 1')
      expect(result).toContain('Section 2')
      expect(result).not.toContain('Empty Section')
    })

    it('should handle null input', () => {
      const result = useCase.formatSections(null as any)

      expect(result).toBe('No clinical data available.')
    })
  })
})
