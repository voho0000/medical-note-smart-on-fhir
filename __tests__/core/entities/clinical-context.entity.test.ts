import type { ClinicalContextSection, DataSelection, DataFilters, ClinicalContextOptions, TimeRange } from '@/src/core/entities/clinical-context.entity'

const makeSelection = (value: boolean): DataSelection => ({
  patientInfo: value,
  vitalSigns: value,
  problemList: value,
  advanceDirectives: value,
  medicalDevices: value,
  carePlans: value,
  encounters: value,
  labReports: value,
  imagingReports: value,
  procedures: value,
  observations: value,
  medications: value,
  allergies: value,
  immunizations: value,
  documents: value,
})

const makeFilters = (range: TimeRange = 'all'): DataFilters => ({
  problemListStatus: 'active',
  problemListTimeRange: 'all',
  encounterTimeRange: range,
  medicationStatus: 'active',
  medicationChronic: 'all',
  medicationTimeRange: range,
  labReportVersion: 'latest',
  labReportTimeRange: range,
  imagingReportVersion: 'latest',
  imagingReportTimeRange: range,
  vitalSignsVersion: 'latest',
  vitalSignsTimeRange: range,
  procedureVersion: 'latest',
  procedureTimeRange: range,
  observationVersion: 'latest',
  observationTimeRange: range,
  immunizationTimeRange: range,
  carePlanStatus: 'active',
})

describe('clinical-context.entity', () => {
  describe('ClinicalContextSection', () => {
    it('should have title and items', () => {
      const section: ClinicalContextSection = {
        title: 'Medications',
        items: ['Aspirin 100mg', 'Metformin 500mg']
      }
      expect(section.title).toBe('Medications')
      expect(section.items).toHaveLength(2)
    })
  })

  describe('DataSelection', () => {
    it('should have all data categories', () => {
      const selection = makeSelection(true)
      expect(Object.keys(selection)).toHaveLength(15)
    })

    it('should allow selective data inclusion', () => {
      const selection: DataSelection = {
        ...makeSelection(false),
        patientInfo: true,
        encounters: true,
      }
      expect(selection.patientInfo).toBe(true)
      expect(selection.medications).toBe(false)
    })
  })

  describe('DataFilters', () => {
    it('should have all filter options', () => {
      const filters = makeFilters()
      expect(filters.problemListStatus).toBe('active')
      expect(filters.medicationChronic).toBe('all')
      expect(filters.immunizationTimeRange).toBe('all')
    })

    it('should support different time ranges', () => {
      const timeRanges: TimeRange[] = ['24h', '3d', '1w', '1m', '3m', '6m', '1y', '3y', '5y', 'all']
      timeRanges.forEach(range => {
        const filters = makeFilters(range)
        expect(filters.labReportTimeRange).toBe(range)
        expect(filters.immunizationTimeRange).toBe(range)
      })
    })
  })

  describe('ClinicalContextOptions', () => {
    it('should combine selection and filters', () => {
      const options: ClinicalContextOptions = {
        selection: makeSelection(true),
        filters: makeFilters('1m')
      }
      expect(options.selection).toBeDefined()
      expect(options.filters).toBeDefined()
    })

    it('should support supplementary notes', () => {
      const options: ClinicalContextOptions = {
        selection: makeSelection(true),
        filters: makeFilters('all'),
        supplementaryNotes: 'Additional clinical notes'
      }
      expect(options.supplementaryNotes).toBe('Additional clinical notes')
    })
  })
})
