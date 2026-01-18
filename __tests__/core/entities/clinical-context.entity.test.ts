import type { ClinicalContextSection, DataSelection, DataFilters, ClinicalContextOptions, TimeRange } from '@/src/core/entities/clinical-context.entity'

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
      const selection: DataSelection = {
        patientInfo: true,
        conditions: true,
        medications: true,
        allergies: true,
        diagnosticReports: true,
        labReports: true,
        imagingReports: true,
        procedures: true,
        observations: true
      }
      expect(Object.keys(selection)).toHaveLength(9)
    })

    it('should allow selective data inclusion', () => {
      const selection: DataSelection = {
        patientInfo: true,
        conditions: true,
        medications: false,
        allergies: false,
        diagnosticReports: false,
        labReports: false,
        imagingReports: false,
        procedures: false,
        observations: false
      }
      expect(selection.patientInfo).toBe(true)
      expect(selection.medications).toBe(false)
    })
  })

  describe('DataFilters', () => {
    it('should have all filter options', () => {
      const filters: DataFilters = {
        conditionStatus: 'active',
        medicationStatus: 'active',
        reportInclusion: 'latest',
        reportTimeRange: 'all',
        labReportVersion: 'latest',
        labReportTimeRange: 'all',
        imagingReportVersion: 'latest',
        imagingReportTimeRange: 'all',
        vitalSignsVersion: 'latest',
        vitalSignsTimeRange: 'all',
        procedureVersion: 'latest',
        procedureTimeRange: 'all'
      }
      expect(filters.conditionStatus).toBe('active')
      expect(filters.reportInclusion).toBe('latest')
    })

    it('should support different time ranges', () => {
      const timeRanges: TimeRange[] = ['24h', '3d', '1w', '1m', '3m', '6m', '1y', 'all']
      timeRanges.forEach(range => {
        const filters: DataFilters = {
          conditionStatus: 'active',
          medicationStatus: 'active',
          reportInclusion: 'latest',
          reportTimeRange: range,
          labReportVersion: 'latest',
          labReportTimeRange: range,
          imagingReportVersion: 'latest',
          imagingReportTimeRange: range,
          vitalSignsVersion: 'latest',
          vitalSignsTimeRange: range,
          procedureVersion: 'latest',
          procedureTimeRange: range
        }
        expect(filters.reportTimeRange).toBe(range)
      })
    })
  })

  describe('ClinicalContextOptions', () => {
    it('should combine selection and filters', () => {
      const options: ClinicalContextOptions = {
        selection: {
          patientInfo: true,
          conditions: true,
          medications: true,
          allergies: true,
          diagnosticReports: true,
          labReports: true,
          imagingReports: true,
          procedures: true,
          observations: true
        },
        filters: {
          conditionStatus: 'active',
          medicationStatus: 'active',
          reportInclusion: 'latest',
          reportTimeRange: '1m',
          labReportVersion: 'latest',
          labReportTimeRange: '1m',
          imagingReportVersion: 'latest',
          imagingReportTimeRange: '1m',
          vitalSignsVersion: 'latest',
          vitalSignsTimeRange: '1m',
          procedureVersion: 'latest',
          procedureTimeRange: '1m'
        }
      }
      expect(options.selection).toBeDefined()
      expect(options.filters).toBeDefined()
    })

    it('should support supplementary notes', () => {
      const options: ClinicalContextOptions = {
        selection: {
          patientInfo: true,
          conditions: true,
          medications: true,
          allergies: true,
          diagnosticReports: true,
          labReports: true,
          imagingReports: true,
          procedures: true,
          observations: true
        },
        filters: {
          conditionStatus: 'active',
          medicationStatus: 'active',
          reportInclusion: 'latest',
          reportTimeRange: 'all',
          labReportVersion: 'latest',
          labReportTimeRange: 'all',
          imagingReportVersion: 'latest',
          imagingReportTimeRange: 'all',
          vitalSignsVersion: 'latest',
          vitalSignsTimeRange: 'all',
          procedureVersion: 'latest',
          procedureTimeRange: 'all'
        },
        supplementaryNotes: 'Additional clinical notes'
      }
      expect(options.supplementaryNotes).toBe('Additional clinical notes')
    })
  })
})
