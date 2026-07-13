import {
  referenceId,
  collectReportMemberIds,
  isVitalObservation,
  selectLabOrphanObservations,
  selectOtherObservations,
  selectStandaloneResultObservations,
} from '@/src/core/utils/observation-selectors'
import type {
  ClinicalDataCollection,
  DiagnosticReportEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'

const OBS_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/observation-category'

function labObs(id: string): ObservationEntity {
  return {
    id,
    code: {
      text: 'Glucose',
      coding: [{ system: 'http://loinc.org', code: '2345-7', display: 'Glucose' }],
    },
    category: [{ coding: [{ system: OBS_CATEGORY_SYSTEM, code: 'laboratory' }] }],
    valueQuantity: { value: 99, unit: 'mg/dL' },
  }
}

function vitalObs(id: string): ObservationEntity {
  return {
    id,
    code: { text: 'Heart rate' },
    category: [{ coding: [{ system: OBS_CATEGORY_SYSTEM, code: 'vital-signs' }] }],
    valueQuantity: { value: 72, unit: '/min' },
  }
}

function otherObs(id: string): ObservationEntity {
  // No category + a neutral label → inferGroupFromObservation returns 'other'.
  return { id, code: { text: 'Free-text finding' }, valueString: 'present' }
}

function emptyCollection(): ClinicalDataCollection {
  return {
    conditions: [],
    medications: [],
    allergies: [],
    observations: [],
    vitalSigns: [],
    diagnosticReports: [],
    imagingStudies: [],
    procedures: [],
    encounters: [],
    documentReferences: [],
    compositions: [],
    immunizations: [],
    consents: [],
    devices: [],
    carePlans: [],
  }
}

describe('observation-selectors (SSOT)', () => {
  describe('referenceId', () => {
    it('extracts the tail id from a relative reference', () => {
      expect(referenceId('Observation/member-1')).toBe('member-1')
    })
    it('returns undefined for empty / missing input', () => {
      expect(referenceId(undefined)).toBeUndefined()
      expect(referenceId('')).toBeUndefined()
    })
  })

  describe('collectReportMemberIds', () => {
    it('unions result[].reference and _observations[].id', () => {
      const member = labObs('member-1')
      const report: DiagnosticReportEntity = {
        id: 'dr-1',
        result: [{ reference: 'Observation/from-result' }],
        _observations: [member],
      }
      const ids = collectReportMemberIds([report])
      expect(ids.has('from-result')).toBe(true)
      expect(ids.has('member-1')).toBe(true)
      expect(ids.size).toBe(2)
    })
    it('is empty for no reports', () => {
      expect(collectReportMemberIds([]).size).toBe(0)
      expect(collectReportMemberIds(null).size).toBe(0)
    })
  })

  describe('isVitalObservation', () => {
    it('detects a vital-signs category observation', () => {
      expect(isVitalObservation(vitalObs('v'))).toBe(true)
    })
    it('does not flag a lab observation', () => {
      expect(isVitalObservation(labObs('l'))).toBe(false)
    })
  })

  // The core contract: an Observation that is simultaneously in `observations`,
  // a DiagnosticReport's members, AND `vitalSigns` must be classified ONCE and
  // never surfaced as a standalone orphan by any selector. This is the systemic
  // regression guard for the IPS duplicate-row / cross-feature divergence bug.
  describe('an observation present in all three places is classified once', () => {
    const shared = vitalObs('shared') // a vital that a report also references
    const labOrphan = labObs('lab-orphan') // genuinely standalone lab
    const reportMember = labObs('member-1') // lab, but a report member
    const otherOrphan = otherObs('other-1') // standalone, neither lab/imaging/vital

    const report: DiagnosticReportEntity = {
      id: 'dr-1',
      code: { text: 'CBC' },
      result: [{ reference: 'Observation/member-1' }, { reference: 'Observation/shared' }],
      _observations: [reportMember, shared],
      effectiveDateTime: '2026-06-01',
    }

    const data: ClinicalDataCollection = {
      ...emptyCollection(),
      observations: [shared, labOrphan, reportMember, otherOrphan],
      vitalSigns: [shared],
      diagnosticReports: [report],
    }

    it('selectLabOrphanObservations keeps only the genuinely standalone lab', () => {
      expect(selectLabOrphanObservations(data).map((o) => o.id)).toEqual(['lab-orphan'])
    })

    it('selectStandaloneResultObservations folds non-vital, non-imaging leftovers into results', () => {
      expect(selectStandaloneResultObservations(data).map((o) => o.id)).toEqual(['lab-orphan', 'other-1'])
    })

    it('selectOtherObservations keeps only the non-lab/imaging/vital leftover', () => {
      expect(selectOtherObservations(data).map((o) => o.id)).toEqual(['other-1'])
    })

    it('the shared report-member vital appears in no orphan selector', () => {
      const labIds = selectLabOrphanObservations(data).map((o) => o.id)
      const otherIds = selectOtherObservations(data).map((o) => o.id)
      expect(labIds).not.toContain('shared')
      expect(otherIds).not.toContain('shared')
      // ...and the report member lab isn't double-listed as a standalone lab.
      expect(labIds).not.toContain('member-1')
    })
  })

  describe('null / empty inputs', () => {
    it('selectors tolerate null', () => {
      expect(selectLabOrphanObservations(null)).toEqual([])
      expect(selectOtherObservations(undefined)).toEqual([])
    })
  })
})
