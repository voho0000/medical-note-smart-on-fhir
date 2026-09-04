/**
 * Two contracts the AI clinical context must not lose silently:
 *
 *  1. WHICH DOCUMENT TEXT each consumer sends (full vs key sections), and
 *  2. THE ORDER the model reads the sections in — safety-critical compact
 *     facts first, ~47k tokens of discharge summaries last.
 */
import { renderHook } from '@testing-library/react'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import { resolveDocumentTextMode } from '@/src/core/utils/document-text-policy.utils'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'
import type { ConsumerProfile, DataConsumer } from '@/src/application/providers/data-selection.provider'
import { DOCUMENT_KEY_SECTIONS_NOTICE } from '@/src/core/utils/clinical-documents.utils'

const DISCHARGE_BODY = [
  'Discharge Diagnosis:',
  'Community acquired pneumonia.',
  'Physical Examination:',
  'UNIQUE_PHYSICAL_EXAM_MARKER — chest clear on auscultation.',
  'Review of Systems:',
  'UNIQUE_ROS_MARKER — denies chest pain.',
  'Hospital Course:',
  'Intravenous antibiotics were given for five days and the patient improved.',
  'Discharge Plan:',
  'Clinic review in one week.',
].join('\n')

const mockPatient = { id: 'patient-1', gender: 'female', birthDate: '1971-01-01' }
let mockProfile: ConsumerProfile

const mockData = {
  isLoading: false,
  isFetching: false,
  error: null,
  patient: mockPatient,
  encounters: [
    {
      id: 'enc-1',
      status: 'finished',
      class: { code: 'IMP' },
      period: { start: '2026-08-01', end: '2026-08-06' },
      serviceProvider: { display: '合成測試醫院' },
      serviceType: { text: '胸腔內科' },
      reasonCode: [{ coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'J18.9', display: 'Pneumonia' }] }],
    },
  ],
  conditions: [
    {
      id: 'cond-1',
      category: [{ coding: [{ code: 'problem-list-item' }] }],
      clinicalStatus: { coding: [{ code: 'active' }] },
      verificationStatus: { coding: [{ code: 'confirmed' }] },
      code: { text: 'Pneumonia', coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'J18.9', display: 'Pneumonia' }] },
      recordedDate: '2026-08-01',
    },
  ],
  allergies: [{
    id: 'allergy-1',
    clinicalStatus: { coding: [{ code: 'active' }] },
    code: { text: 'Penicillin' },
    recordedDate: '2020-01-01',
  }],
  medications: [{
    id: 'med-1',
    status: 'active',
    authoredOn: '2026-08-01',
    medicationCodeableConcept: { text: 'Amoxicillin 500mg' },
  }],
  procedures: [{
    id: 'proc-1',
    status: 'completed',
    encounter: { reference: 'Encounter/enc-1' },
    code: { text: 'Bronchoscopy biopsy' },
    performedDateTime: '2026-08-02',
  }],
  observations: [{
    id: 'obs-1',
    status: 'final',
    effectiveDateTime: '2026-08-02',
    category: [{ coding: [{ code: 'laboratory' }] }],
    code: { text: 'WBC', coding: [{ code: 'wbc' }] },
    valueQuantity: { value: 15.2, unit: '10^3/uL' },
  }],
  diagnosticReports: [{
    id: 'report-1',
    status: 'final',
    effectiveDateTime: '2026-08-02',
    category: [{ coding: [{ code: 'RAD' }] }],
    code: { text: 'Chest X-ray' },
    conclusion: 'Right lower lobe consolidation.',
  }],
  compositions: [{
    id: 'document-1',
    date: '2026-08-06',
    title: 'Discharge summary',
    type: { coding: [{ code: '18842-5' }] },
    section: [{ text: { div: `<div>${DISCHARGE_BODY.replace(/\n/g, '<br/>')}</div>` } }],
  }],
}

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: mockPatient }),
}))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockData,
}))
jest.mock('@/src/application/providers/data-selection.provider', () => ({
  useDataSelection: () => ({ getProfile: () => mockProfile }),
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'en' }),
}))
jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))
jest.mock('@/src/shared/hooks/use-now.hook', () => ({
  useNow: () => Date.parse('2026-09-03T00:00:00Z'),
}))

beforeEach(() => {
  ensureCategoriesInitialized()
  mockProfile = {
    selection: { ...ALL_DATA_SELECTION },
    filters: { ...ALL_DATA_FILTERS },
    documentMode: 'deduplicatedAdmissions',
    documentIds: [],
  }
})

const AUTOMATIC_MODES = ['latestAdmission', 'recentAdmissions', 'deduplicatedAdmissions', 'all'] as const
const GENERATION_CONSUMERS: DataConsumer[] = ['insights', 'chat']

describe('document text policy', () => {
  it.each(GENERATION_CONSUMERS)('reduces automatic-mode documents to key sections for %s', (consumer) => {
    for (const documentMode of AUTOMATIC_MODES) {
      expect(resolveDocumentTextMode(consumer, documentMode)).toBe('keySections')
    }
  })

  it.each(GENERATION_CONSUMERS)('sends a manual (custom) document selection as complete text for %s', (consumer) => {
    expect(resolveDocumentTextMode(consumer, 'custom')).toBe('full')
    // Not even an explicit caller request may abridge a manual pick.
    expect(resolveDocumentTextMode(consumer, 'custom', 'keySections')).toBe('full')
  })

  it('always sends complete documents for the AI handoff, in every document mode', () => {
    for (const documentMode of [...AUTOMATIC_MODES, 'custom']) {
      expect(resolveDocumentTextMode('aiExport', documentMode)).toBe('full')
      expect(resolveDocumentTextMode('aiExport', documentMode, 'keySections')).toBe('full')
    }
  })

  it('renders key sections for an automatic summary/insights scope', () => {
    const { result } = renderHook(() => useClinicalContext('insights'))
    const context = result.current.getFormattedClinicalContext()

    expect(context).toContain(DOCUMENT_KEY_SECTIONS_NOTICE)
    expect(context).toContain('Discharge Diagnosis:')
    expect(context).not.toContain('UNIQUE_ROS_MARKER')
  })

  it('renders complete documents for the AI handoff under the same automatic scope', () => {
    const { result } = renderHook(() => useClinicalContext('aiExport'))
    const context = result.current.getFormattedClinicalContext()

    expect(context).not.toContain(DOCUMENT_KEY_SECTIONS_NOTICE)
    expect(context).toContain('UNIQUE_ROS_MARKER')
    expect(context).toContain('UNIQUE_PHYSICAL_EXAM_MARKER')
  })

  it('renders complete documents for a manual selection', () => {
    mockProfile = { ...mockProfile, documentMode: 'custom', documentIds: ['document-1'] }
    const { result } = renderHook(() => useClinicalContext('insights'))
    const context = result.current.getFormattedClinicalContext()

    expect(context).not.toContain(DOCUMENT_KEY_SECTIONS_NOTICE)
    expect(context).toContain('UNIQUE_ROS_MARKER')
  })
})

describe('clinical context section order', () => {
  it('puts safety-critical compact facts first and bulk document text last', () => {
    const { result } = renderHook(() => useClinicalContext('insights'))
    const titles = result.current.getClinicalContext()
      .filter((section) => section.items.length > 0)
      .map((section) => section.title)

    const at = (needle: string) => titles.findIndex((title) => title.startsWith(needle))

    expect(titles[0]).toBe('Patient Information')
    expect(titles[1]).toBe('Clinical Time Reference')
    expect(titles.at(-1)).toBe('Data Scope')

    for (const [earlier, later] of [
      ['Clinical Time Reference', "Patient's Allergies"],
      ["Patient's Allergies", 'Problem List'],
      ['Problem List', 'Problem Timeline'],
      ['Problem Timeline', "Patient's Medications"],
      ["Patient's Medications", 'Procedures'],
      ['Procedures', 'Visits & Treatment History'],
      ['Visits & Treatment History', 'Lab Reports'],
      ['Lab Reports', 'Imaging Reports'],
      ['Imaging Reports', 'Documents'],
      ['Documents', 'Data Scope'],
    ] as const) {
      expect(at(earlier)).toBeGreaterThanOrEqual(0)
      expect(at(later)).toBeGreaterThan(at(earlier))
    }
  })

  it('carries the claims problem timeline directly under the problem list', () => {
    const { result } = renderHook(() => useClinicalContext('insights'))
    const sections = result.current.getClinicalContext()
    const problemListIndex = sections.findIndex((section) => section.title === 'Problem List')
    const timeline = sections[problemListIndex + 1]

    expect(timeline.title.startsWith('Problem Timeline')).toBe(true)
    expect(timeline.items[0]).toContain('J18.9 - Pneumonia')
    expect(timeline.items[0]).toContain('active')
    expect(timeline.items[0]).toContain('1 visits (1 inpatient)')
    expect(timeline.items[0]).toContain('胸腔內科')
    // Citation anchor for the latest Condition carrying this problem.
    expect(timeline.items[0]).toContain('Condition 2026-08-01')
  })
})
