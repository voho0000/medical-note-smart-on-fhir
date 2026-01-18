import {
  FHIR_SYSTEMS,
  FHIR_RESOURCES,
  FHIR_SEARCH_PARAMS,
  FHIR_STATUS
} from '@/src/shared/constants/fhir-systems.constants'

describe('fhir-systems.constants', () => {
  describe('FHIR_SYSTEMS', () => {
    it('should have all coding systems defined', () => {
      expect(FHIR_SYSTEMS.LOINC).toBe('http://loinc.org')
      expect(FHIR_SYSTEMS.SNOMED).toBe('http://snomed.info/sct')
      expect(FHIR_SYSTEMS.ICD10).toBe('http://hl7.org/fhir/sid/icd-10')
      expect(FHIR_SYSTEMS.RXNORM).toBe('http://www.nlm.nih.gov/research/umls/rxnorm')
      expect(FHIR_SYSTEMS.UCUM).toBe('http://unitsofmeasure.org')
    })

    it('should have valid URLs', () => {
      Object.values(FHIR_SYSTEMS).forEach(url => {
        expect(url).toMatch(/^http/)
      })
    })
  })

  describe('FHIR_RESOURCES', () => {
    it('should have all resource types defined', () => {
      expect(FHIR_RESOURCES.PATIENT).toBe('Patient')
      expect(FHIR_RESOURCES.CONDITION).toBe('Condition')
      expect(FHIR_RESOURCES.MEDICATION_REQUEST).toBe('MedicationRequest')
      expect(FHIR_RESOURCES.MEDICATION_STATEMENT).toBe('MedicationStatement')
      expect(FHIR_RESOURCES.ALLERGY_INTOLERANCE).toBe('AllergyIntolerance')
      expect(FHIR_RESOURCES.OBSERVATION).toBe('Observation')
      expect(FHIR_RESOURCES.DIAGNOSTIC_REPORT).toBe('DiagnosticReport')
      expect(FHIR_RESOURCES.PROCEDURE).toBe('Procedure')
      expect(FHIR_RESOURCES.ENCOUNTER).toBe('Encounter')
    })

    it('should have PascalCase resource names', () => {
      Object.values(FHIR_RESOURCES).forEach(resource => {
        expect(resource[0]).toBe(resource[0].toUpperCase())
      })
    })
  })

  describe('FHIR_SEARCH_PARAMS', () => {
    it('should have all search parameters defined', () => {
      expect(FHIR_SEARCH_PARAMS.PATIENT).toBe('patient')
      expect(FHIR_SEARCH_PARAMS.SUBJECT).toBe('subject')
      expect(FHIR_SEARCH_PARAMS.STATUS).toBe('status')
      expect(FHIR_SEARCH_PARAMS.CATEGORY).toBe('category')
      expect(FHIR_SEARCH_PARAMS.DATE).toBe('date')
      expect(FHIR_SEARCH_PARAMS.CODE).toBe('code')
    })

    it('should have lowercase parameter names', () => {
      Object.values(FHIR_SEARCH_PARAMS).forEach(param => {
        expect(param).toBe(param.toLowerCase())
      })
    })
  })

  describe('FHIR_STATUS', () => {
    it('should have all status values defined', () => {
      expect(FHIR_STATUS.ACTIVE).toBe('active')
      expect(FHIR_STATUS.COMPLETED).toBe('completed')
      expect(FHIR_STATUS.ENTERED_IN_ERROR).toBe('entered-in-error')
      expect(FHIR_STATUS.INACTIVE).toBe('inactive')
    })

    it('should have lowercase status values', () => {
      Object.values(FHIR_STATUS).forEach(status => {
        expect(status).toBe(status.toLowerCase())
      })
    })
  })
})
