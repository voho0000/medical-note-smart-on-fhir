import { curateForIps } from '@/features/ips-export/utils/ips-curation'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import type { DataFilters, DataSelection } from '@/src/core/entities/clinical-context.entity'
import {
  DEFAULT_DATA_FILTERS,
  DEFAULT_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'

// A fixed "now" so time-range filtering is deterministic.
const NOW = new Date('2026-06-08T00:00:00Z')

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86400000).toISOString()
}

function emptyCollection(): ClinicalDataCollection {
  return {
    conditions: [],
    medications: [],
    allergies: [],
    observations: [],
    vitalSigns: [],
    diagnosticReports: [],
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

function selection(overrides: Partial<DataSelection> = {}): DataSelection {
  return { ...DEFAULT_DATA_SELECTION, ...overrides }
}

function filters(overrides: Partial<DataFilters> = {}): DataFilters {
  return { ...DEFAULT_DATA_FILTERS, ...overrides }
}

describe('curateForIps — time-range curation (labs / reports)', () => {
  it('drops diagnostic reports older than the lab time window', () => {
    const data = emptyCollection()
    data.diagnosticReports = [
      { id: 'recent', code: { text: 'CBC' }, effectiveDateTime: isoDaysAgo(30) },
      { id: 'old', code: { text: 'CBC' }, effectiveDateTime: isoDaysAgo(800) },
    ]
    const out = curateForIps({
      data,
      selection: selection(),
      filters: filters({ labReportTimeRange: '6m', labReportVersion: 'all' }),
      now: NOW,
    })
    expect(out.diagnosticReports.map((r) => r.id)).toEqual(['recent'])
  })

  it('keeps only the latest report per panel when version=latest', () => {
    const data = emptyCollection()
    data.diagnosticReports = [
      { id: 'cbc-old', code: { text: 'CBC' }, effectiveDateTime: isoDaysAgo(40) },
      { id: 'cbc-new', code: { text: 'CBC' }, effectiveDateTime: isoDaysAgo(5) },
      { id: 'lipid', code: { text: 'Lipid Panel' }, effectiveDateTime: isoDaysAgo(10) },
    ]
    const out = curateForIps({
      data,
      selection: selection(),
      filters: filters({ labReportTimeRange: 'all', labReportVersion: 'latest' }),
      now: NOW,
    })
    const ids = out.diagnosticReports.map((r) => r.id).sort()
    expect(ids).toEqual(['cbc-new', 'lipid'])
  })

  it('excludes lab reports entirely when the labReports category is unselected', () => {
    const data = emptyCollection()
    data.diagnosticReports = [{ id: 'cbc', code: { text: 'CBC' }, effectiveDateTime: isoDaysAgo(1) }]
    const out = curateForIps({
      data,
      selection: selection({ labReports: false }),
      filters: filters(),
      now: NOW,
    })
    expect(out.diagnosticReports).toHaveLength(0)
  })
})

describe('curateForIps — medications (現用藥 / 慢箋為主, deduped)', () => {
  it('collapses refill cycles of the same drug into one row (latest authoredOn)', () => {
    const data = emptyCollection()
    data.medications = [
      {
        id: 'm1',
        status: 'active',
        authoredOn: isoDaysAgo(60),
        medicationCodeableConcept: { text: 'Amlodipine 5mg' },
      },
      {
        id: 'm2',
        status: 'active',
        authoredOn: isoDaysAgo(2),
        medicationCodeableConcept: { text: 'Amlodipine 5mg' },
      },
    ]
    const out = curateForIps({ data, selection: selection(), filters: filters(), now: NOW })
    expect(out.medications).toHaveLength(1)
    expect(out.medications[0].id).toBe('m2')
  })

  it('keeps a chronic prescription even if its latest cycle reads completed', () => {
    const data = emptyCollection()
    data.medications = [
      {
        id: 'chronic',
        status: 'completed',
        authoredOn: isoDaysAgo(10),
        medicationCodeableConcept: { text: 'Metformin 500mg' },
        courseOfTherapyType: { coding: [{ code: 'continuous' }] },
      },
      {
        id: 'finished-acute',
        status: 'completed',
        authoredOn: isoDaysAgo(10),
        medicationCodeableConcept: { text: 'Amoxicillin 250mg' },
      },
    ]
    const out = curateForIps({
      data,
      selection: selection(),
      filters: filters({ medicationStatus: 'active' }),
      now: NOW,
    })
    expect(out.medications.map((m) => m.id)).toEqual(['chronic'])
  })

  it('honors the acute-only chronic filter', () => {
    const data = emptyCollection()
    data.medications = [
      {
        id: 'chronic',
        status: 'active',
        authoredOn: isoDaysAgo(5),
        medicationCodeableConcept: { text: 'Metformin 500mg' },
        courseOfTherapyType: { coding: [{ code: 'continuous' }] },
      },
      {
        id: 'acute',
        status: 'active',
        authoredOn: isoDaysAgo(5),
        medicationCodeableConcept: { text: 'Ibuprofen 400mg' },
      },
    ]
    const out = curateForIps({
      data,
      selection: selection(),
      filters: filters({ medicationChronic: 'acute' }),
      now: NOW,
    })
    expect(out.medications.map((m) => m.id)).toEqual(['acute'])
  })
})

describe('curateForIps — problem list', () => {
  it('prefers problem-list-item conditions and filters to active', () => {
    const data = emptyCollection()
    data.conditions = [
      {
        id: 'pli-active',
        clinicalStatus: 'active',
        category: [{ coding: [{ code: 'problem-list-item' }] }],
        code: { text: 'Hypertension' },
      },
      {
        id: 'pli-resolved',
        clinicalStatus: 'resolved',
        category: [{ coding: [{ code: 'problem-list-item' }] }],
        code: { text: 'Old fracture' },
      },
      {
        id: 'encounter-dx',
        clinicalStatus: 'active',
        code: { text: 'Visit diagnosis' },
      },
    ]
    const out = curateForIps({
      data,
      selection: selection({ problemList: true, conditions: true }),
      filters: filters({ problemListStatus: 'active' }),
      now: NOW,
    })
    expect(out.conditions.map((c) => c.id)).toEqual(['pli-active'])
  })

  it('falls back to all conditions when none are tagged problem-list-item', () => {
    const data = emptyCollection()
    data.conditions = [
      { id: 'c1', clinicalStatus: 'active', code: { text: 'Diabetes' } },
      { id: 'c2', clinicalStatus: 'resolved', code: { text: 'Sprain' } },
    ]
    const out = curateForIps({
      data,
      selection: selection({ problemList: true, conditions: false }),
      filters: filters({ problemListStatus: 'active' }),
      now: NOW,
    })
    expect(out.conditions.map((c) => c.id)).toEqual(['c1'])
  })
})

describe('curateForIps — Results observations (orphans only)', () => {
  it('drops observations already nested under a report and vital-sign observations', () => {
    const data = emptyCollection()
    // The data layer surfaces a report-member observation BOTH flat in
    // `observations` (same id) and nested under the report. It also lumps
    // vital-sign observations into the same flat list. Only the true orphan
    // should survive into the Results section.
    const member = { id: 'tsh', code: { text: 'TSH' }, effectiveDateTime: isoDaysAgo(1) }
    data.observations = [
      { id: 'orphan', code: { text: 'Free T4' }, effectiveDateTime: isoDaysAgo(1) },
      { ...member },
      {
        id: 'bp',
        code: { text: 'Blood Pressure' },
        category: [{ coding: [{ code: 'vital-signs' }] }],
        effectiveDateTime: isoDaysAgo(1),
      },
    ]
    data.diagnosticReports = [
      {
        id: 'panel',
        code: { text: 'Thyroid Panel' },
        effectiveDateTime: isoDaysAgo(1),
        _observations: [{ ...member }],
      },
    ]
    const out = curateForIps({
      data,
      selection: selection(),
      filters: filters({ labReportTimeRange: 'all', labReportVersion: 'all' }),
      now: NOW,
    })
    expect(out.observations.map((o) => o.id)).toEqual(['orphan'])
  })
})

describe('curateForIps — vitals & passthrough', () => {
  it('keeps only the latest vital per type when version=latest', () => {
    const data = emptyCollection()
    data.vitalSigns = [
      { id: 'bp-old', code: { text: 'Blood Pressure' }, effectiveDateTime: isoDaysAgo(20) },
      { id: 'bp-new', code: { text: 'Blood Pressure' }, effectiveDateTime: isoDaysAgo(1) },
      { id: 'hr', code: { text: 'Heart Rate' }, effectiveDateTime: isoDaysAgo(3) },
    ]
    const out = curateForIps({
      data,
      selection: selection(),
      filters: filters({ vitalSignsVersion: 'latest', vitalSignsTimeRange: 'all' }),
      now: NOW,
    })
    expect(out.vitalSigns.map((v) => v.id).sort()).toEqual(['bp-new', 'hr'])
  })

  it('passes through resources without a data-selection toggle (devices/carePlans/consents)', () => {
    const data = emptyCollection()
    data.devices = [{ id: 'dev-1', type: { text: 'Pacemaker' } }]
    data.carePlans = [{ id: 'cp-1', title: 'Diabetes care' }]
    data.consents = [{ id: 'con-1', status: 'active' }]
    const out = curateForIps({ data, selection: selection(), filters: filters(), now: NOW })
    expect(out.devices).toHaveLength(1)
    expect(out.carePlans).toHaveLength(1)
    expect(out.consents).toHaveLength(1)
  })

  it('empties allergies when the allergies category is unselected', () => {
    const data = emptyCollection()
    data.allergies = [{ id: 'a1', code: { text: 'Penicillin' } }]
    const out = curateForIps({
      data,
      selection: selection({ allergies: false }),
      filters: filters(),
      now: NOW,
    })
    expect(out.allergies).toHaveLength(0)
  })
})
