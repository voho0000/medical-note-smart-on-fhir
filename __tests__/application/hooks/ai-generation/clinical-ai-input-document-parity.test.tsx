// The AI domain filter removes dental / TCM / rehabilitation encounters from
// the outbound view only. A discharge summary linked to one of those encounters
// is NOT removed, but it used to lose the institution + ICD evidence that
// `deduplicatedAdmissions` groups by, so `useClinicalContext` re-expanded the
// document list while every AI selector (adaptive tiers, prioritizer, source
// catalog) still resolved the deduplicated set from the pre-filter collection.
// The prompt then carried documents the source catalog did not know about.
import { renderHook } from '@testing-library/react'
import { useClinicalAiInput } from '@/src/application/hooks/ai-generation/use-clinical-ai-input.hook'
import { ALL_DATA_FILTERS, ALL_DATA_SELECTION } from '@/src/shared/constants/data-selection.constants'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
} from '@/src/core/utils/clinical-documents.utils'
import { filterAiExcludedClinicalDomains } from '@/src/core/utils/ai-clinical-domain-filter.utils'
import type { ConsumerProfile } from '@/src/application/providers/data-selection.provider'

const mockPatient = { id: 'dental-mix-patient', gender: 'female', birthDate: '1961-11-04' }
let mockProfile: ConsumerProfile

const DENTAL_SERVICE_TYPE = {
  coding: [{ system: 'http://terminology.hl7.org/CodeSystem/service-type', code: '88' }],
}

function admission(id: string, organization: string, icd: string, dental = false) {
  return {
    id,
    status: 'finished',
    class: { code: 'IMP' },
    period: { start: `2026-0${id.length % 8 + 1}-01T00:00:00+08:00` },
    serviceProvider: { reference: `Organization/${organization}`, display: organization },
    reasonCode: [{ coding: [{ code: icd }] }],
    ...(dental ? { serviceType: DENTAL_SERVICE_TYPE } : {}),
  }
}

function dischargeSummary(id: string, date: string, encounterId: string) {
  return {
    id,
    date,
    type: { coding: [{ code: '18842-5' }], text: '出院病摘' },
    context: {
      period: { start: date },
      encounter: [{ reference: `Encounter/${encounterId}` }],
    },
    content: [{
      attachment: {
        contentType: 'text/html',
        data: btoa(`<p>Discharge note ${id}. Course was uneventful.</p>`),
      },
    }],
  }
}

// Two institutions × one primary ICD each, two admissions per group. In each
// group the newer admission is the dental one the AI domain filter removes.
const mockData = {
  isLoading: false,
  isFetching: false,
  error: null,
  encounters: [
    admission('a-new-dental', 'a-hospital', 'N39.0', true),
    admission('a-old', 'a-hospital', 'N39.0'),
    admission('b-new-dental', 'b-hospital', 'C34.90', true),
    admission('b-old', 'b-hospital', 'C34.90'),
  ],
  documentReferences: [
    dischargeSummary('doc-a-new', '2026-05-01', 'a-new-dental'),
    dischargeSummary('doc-a-old', '2026-02-01', 'a-old'),
    dischargeSummary('doc-b-new', '2026-04-01', 'b-new-dental'),
    dischargeSummary('doc-b-old', '2026-01-01', 'b-old'),
  ],
}

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({ usePatient: () => ({ patient: mockPatient }) }))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({ useClinicalData: () => mockData }))
jest.mock('@/src/application/providers/data-selection.provider', () => ({ useDataSelection: () => ({ getProfile: () => mockProfile }) }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'zh-TW' }) }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/src/shared/hooks/use-now.hook', () => ({ useNow: () => Date.parse('2026-09-03') }))

/** What the AI selectors resolve, from the collection that still has encounters. */
function selectorDocumentIds(): string[] {
  return resolveSelectedDocuments(
    listClinicalDocuments(mockData as never),
    mockProfile.documentMode,
    mockProfile.documentIds,
  ).map((document) => document.id)
}

describe('AI document selection parity across the domain filter', () => {
  beforeEach(() => {
    ensureCategoriesInitialized()
    mockProfile = {
      selection: { ...ALL_DATA_SELECTION, documents: true },
      filters: { ...ALL_DATA_FILTERS },
      documentMode: 'deduplicatedAdmissions',
      documentIds: [],
    }
  })

  it('removes the dental encounters but keeps their discharge summaries', () => {
    const filtered = filterAiExcludedClinicalDomains(mockData as never) as typeof mockData
    expect(filtered.encounters.map((encounter) => encounter.id)).toEqual(['a-old', 'b-old'])
    expect(filtered.documentReferences.map((document) => document.id))
      .toEqual(mockData.documentReferences.map((document) => document.id))
  })

  it('renders exactly the documents the selectors resolved, in the same order', () => {
    const expected = selectorDocumentIds()
    expect(expected).toEqual(['doc-a-new', 'doc-b-new'])

    const { result } = renderHook(() => useClinicalAiInput(undefined, 'insights', 1, false))

    expect(result.current.dataReady).toBe(true)
    expect(result.current.contextView.includedDocumentIds).toEqual(expected)
    const rendered = result.current.clinicalContext.match(/<BEGIN_DOCUMENT id="([^"]+)"/g) ?? []
    expect(rendered).toHaveLength(expected.length)
  })

  it('keeps the source catalog and the prompt on the same documents', () => {
    const { result } = renderHook(() => useClinicalAiInput(undefined, 'insights', 1, false))

    const catalogDocumentIds = result.current.catalog
      .filter((entry) => entry.resourceType === 'DocumentReference')
      .map((entry) => entry.resourceId)
    expect([...catalogDocumentIds].sort())
      .toEqual([...result.current.contextView.includedDocumentIds].sort())
    for (const id of catalogDocumentIds) {
      expect(result.current.clinicalContext).toContain(`<BEGIN_DOCUMENT id="${id}"`)
    }
  })

  it('does not change the non-AI record view, which never runs the filter', () => {
    expect(listClinicalDocuments(mockData as never).map((document) => document.id))
      .toEqual(['doc-a-new', 'doc-b-new', 'doc-a-old', 'doc-b-old'])
    expect(mockData.encounters).toHaveLength(4)
  })
})
