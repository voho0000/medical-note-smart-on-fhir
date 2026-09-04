import { renderHook } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { clinicalAiSourceSignature, useClinicalAiInput } from '@/src/application/hooks/ai-generation/use-clinical-ai-input.hook'
import { ALL_DATA_FILTERS, ALL_DATA_SELECTION } from '@/src/shared/constants/data-selection.constants'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import type { ConsumerProfile } from '@/src/application/providers/data-selection.provider'
import * as summarySources from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { listClinicalDocuments } from '@/src/core/utils/clinical-documents.utils'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

const mockPatient = { id: 'synthetic-performance-patient', gender: 'female', birthDate: '1971-01-01' }
let mockProfile: ConsumerProfile
const mockData = {
  isLoading: false, isFetching: false, error: null,
  observations: Array.from({ length: 1_073 }, (_, i) => ({
    id: `obs-${i}`, status: 'final', effectiveDateTime: '2026-08-01',
    category: [{ coding: [{ code: 'laboratory' }] }],
    code: { text: `Lab ${i % 80}`, coding: [{ code: `lab-${i % 80}` }] },
    valueQuantity: { value: i, unit: 'mg/dL' },
  })),
  encounters: Array.from({ length: 88 }, (_, i) => ({
    id: `visit-${i}`, status: 'finished', class: { code: 'AMB' },
    period: { start: '2026-08-01' },
  })),
  medications: Array.from({ length: 236 }, (_, i) => ({
    id: `med-${i}`, status: 'active', authoredOn: '2026-08-01',
    medicationCodeableConcept: { text: `Synthetic medicine ${i}` },
  })),
  compositions: Array.from({ length: 24 }, (_, i) => ({
    id: `document-${i}`, date: `2026-08-${String(24 - i).padStart(2, '0')}`,
    title: i === 0 ? 'Preventive health report' : 'Discharge summary',
    type: { coding: [{ code: i === 0 ? 'other' : '18842-5' }] },
    section: [{ text: { div: `<div>Document ${i}: ${'Synthetic clinical finding. '.repeat(350)}</div>` } }],
  })),
}

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({ usePatient: () => ({ patient: mockPatient }) }))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({ useClinicalData: () => mockData }))
jest.mock('@/src/application/providers/data-selection.provider', () => ({ useDataSelection: () => ({ getProfile: () => mockProfile }) }))
jest.mock('@/src/application/providers/language.provider', () => ({ useLanguage: () => ({ locale: 'zh-TW' }) }))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/src/shared/hooks/use-now.hook', () => ({ useNow: () => Date.parse('2026-09-03') }))
jest.mock('@/src/core/use-cases/medical-summary/generate-medical-summary.use-case', () => {
  const actual = jest.requireActual('@/src/core/use-cases/medical-summary/generate-medical-summary.use-case')
  return { ...actual, getSourceCatalog: jest.fn(actual.getSourceCatalog) }
})

describe('document-only clinical input changes', () => {
  beforeEach(() => {
    ensureCategoriesInitialized()
    mockProfile = { selection: { ...ALL_DATA_SELECTION, documents: false }, filters: { ...ALL_DATA_FILTERS }, documentMode: 'all', documentIds: [] }
  })
  afterEach(() => jest.restoreAllMocks())

  it('gives manual and automatic document policies distinct cache identities', () => {
    mockProfile = { ...mockProfile, selection: { ...mockProfile.selection, documents: true }, documentMode: 'custom', documentIds: ['document-2'] }
    const { result, rerender } = renderHook(() => useClinicalAiInput(154_000, 'insights', 1, false, 100_000))
    const signatureFor = (policy: Record<string, string> = {}) => clinicalAiSourceSignature(
      mockPatient, { ...mockProfile, ...policy }, result.current.clinicalData!, result.current.catalog,
    )
    expect(result.current.contextAdaptation).toBeNull()
    // Manual picks stay complete text; older caches built before that guarantee
    // must not be reused.
    expect(result.current.inputSignature).not.toBe(signatureFor())
    expect(result.current.inputSignature).toBe(signatureFor({ manualDocumentPolicy: 'complete-v1' }))
    mockProfile = { ...mockProfile, documentMode: 'all' }
    rerender()
    expect(result.current.contextAdaptation).toBeNull()
    // Automatic modes send key sections only; that is a different input than
    // the full documents older summaries were written from.
    expect(result.current.inputSignature).not.toBe(signatureFor())
    expect(result.current.inputSignature).toBe(signatureFor({ documentTextPolicy: 'key-sections-v1' }))
  })

  it('never gives the AI handoff a key-sections cache identity', () => {
    mockProfile = { ...mockProfile, selection: { ...mockProfile.selection, documents: true }, documentMode: 'all' }
    const { result } = renderHook(() => useClinicalAiInput(154_000, 'aiExport', 1, false, 100_000))
    const signatureFor = (policy: Record<string, string> = {}) => clinicalAiSourceSignature(
      mockPatient, { ...mockProfile, ...policy }, result.current.clinicalData!, result.current.catalog,
    )

    // A handoff carries complete documents, so it must never be filed under —
    // or hydrated from — the reduced key-sections identity.
    expect(result.current.inputSignature).not.toBe(signatureFor({ documentTextPolicy: 'key-sections-v1' }))
    expect(result.current.inputSignature).toBe(signatureFor({ documentTextPolicy: 'complete-v1' }))
    for (const doc of listClinicalDocuments(mockData)) {
      expect(result.current.contextView.getFormattedClinicalContext()).toContain(doc.text)
    }
  })

  it.each([100_000, 15_000, 700])('preserves every custom document and its entire body at a %i token budget', (clinicalLimit) => {
    mockProfile = { ...mockProfile, selection: { ...mockProfile.selection, documents: true }, documentMode: 'custom', documentIds: ['document-2', 'document-4'] }
    // Even providers that normally permit text truncation must keep manual picks.
    const preview = renderHook(() => useClinicalAiInput(154_000, 'insights', 1, true, clinicalLimit, { includeSources: false }))
    const generation = renderHook(() => useClinicalAiInput(154_000, 'insights', 1, true, clinicalLimit))
    const input = generation.result.current
    expect(input.dataReady).toBe(true)
    expect(input.preserveManualDocuments).toBe(true)
    expect(input.contextView.includedDocumentIds).toEqual(mockProfile.documentIds)
    expect(preview.result.current.clinicalContext).toBe(input.clinicalContext)
    expect(input.catalog.filter(entry => entry.resourceType === 'Composition').map(entry => entry.resourceId).sort()).toEqual([...mockProfile.documentIds].sort())
    for (const doc of listClinicalDocuments(mockData).filter(doc => mockProfile.documentIds.includes(doc.id))) {
      expect(input.clinicalContext).toContain(doc.text)
      expect(input.formattedClinicalContext).toContain(doc.text)
    }
    expect(input.clinicalContext).not.toContain('<BEGIN_DOCUMENT id="document-1">')
    expect(input.clinicalContext).not.toContain('omitted to fit')
    if (clinicalLimit === 700) {
      expect(input.contextAdaptation?.tier).toBe('prioritized')
      expect(input.contextAdaptation?.protectedDocumentCount).toBe(2)
      // The count alone does not say which pick to undo — name the heaviest.
      const named = input.contextAdaptation?.protectedDocuments ?? []
      expect(named.map(document => document.id).sort()).toEqual([...mockProfile.documentIds].sort())
      expect(named.every(document => document.tokens > 0)).toBe(true)
      expect(estimateTokens(input.clinicalContext)).toBeGreaterThan(700)
    } else {
      expect(estimateTokens(input.clinicalContext)).toBeLessThan(clinicalLimit)
    }
    // Explicitly clearing the custom set must not reintroduce the latest note.
    mockProfile = { ...mockProfile, documentIds: [] }
    generation.rerender()
    expect(generation.result.current.contextView.includedDocumentIds).toEqual([])
    expect(generation.result.current.clinicalContext).not.toContain('<BEGIN_DOCUMENT')
  })

  it('names at most the 3 heaviest protected documents, largest first', () => {
    mockProfile = {
      ...mockProfile,
      selection: { ...mockProfile.selection, documents: true },
      documentMode: 'custom',
      documentIds: ['document-2', 'document-4', 'document-6', 'document-8', 'document-10'],
    }
    const { result } = renderHook(() => useClinicalAiInput(154_000, 'insights', 1, true, 700))

    const named = result.current.contextAdaptation?.protectedDocuments ?? []
    expect(result.current.contextAdaptation?.protectedDocumentCount).toBe(5)
    expect(named).toHaveLength(3)
    expect(named.map(document => document.tokens))
      .toEqual([...named.map(document => document.tokens)].sort((a, b) => b - a))
    for (const document of named) {
      expect(mockProfile.documentIds).toContain(document.id)
      expect(document.tokens).toBeGreaterThan(0)
      expect(document.title).toBe('Discharge summary')
    }
  })

  it('leaves protected documents unset when the selection is not manual', () => {
    mockProfile = { ...mockProfile, selection: { ...mockProfile.selection, documents: true }, documentMode: 'all' }
    const { result } = renderHook(() => useClinicalAiInput(154_000, 'insights', 1, true, 700))
    expect(result.current.protectedDocuments).toEqual([])
    expect(result.current.contextAdaptation?.protectedDocuments).toBeUndefined()
  })

  it('blocks stale generation input while capacity or saved document choices are deferred', () => {
    const commits: Array<ReturnType<typeof useClinicalAiInput>> = []
    const { result, rerender } = renderHook(({ limit }) => {
      const input = useClinicalAiInput(limit, 'insights', 1, false, 100_000)
      useLayoutEffect(() => { commits.push(input) }, [input])
      return input
    }, { initialProps: { limit: 154_000 } })
    const originalSignature = result.current.inputSignature
    commits.length = 0
    rerender({ limit: 32_768 })
    const pending = commits.filter(input => input.isCalculating)
    expect(pending.length).toBeGreaterThan(0)
    for (const input of pending) {
      expect(input.dataReady).toBe(false)
      expect(input.inputSignature).toBe('')
      expect(input.clinicalContext).toBe('')
      expect(input.catalog).toEqual([])
      expect(input.clinicalData).toBeNull()
      expect(input.sourceScopeSignature).toBe(originalSignature)
    }
    expect(result.current.dataReady).toBe(true)
    commits.length = 0
    mockProfile = { ...mockProfile, selection: { ...mockProfile.selection, documents: true }, documentMode: 'custom', documentIds: ['document-2'] }
    rerender({ limit: 32_768 })
    expect(commits.some(input => input.isCalculating && input.sourceScopeSignature === '')).toBe(true)
    expect(result.current.inputSignature).not.toBe(originalSignature)
  })

  it.each([[154_000, 100_000], [32_768, 15_000], [8_000, 700]])('keeps preview-only fitting identical to generation at %i/%i tokens', (limit, clinicalLimit) => {
    mockProfile = { ...mockProfile, selection: { ...mockProfile.selection, documents: true } }
    const catalog = jest.mocked(summarySources.getSourceCatalog)
    catalog.mockClear()
    const preview = renderHook(() => useClinicalAiInput(limit, 'insights', 1, false, clinicalLimit, { includeSources: false }))
    expect(catalog).not.toHaveBeenCalled()
    expect(preview.result.current.catalog).toEqual([])
    expect(preview.result.current.inputSignature).toBe('')
    expect(preview.result.current.clinicalData).toBeNull()
    const generation = renderHook(() => useClinicalAiInput(limit, 'insights', 1, false, clinicalLimit))
    // Only the saved-scope identity and the settled outbound catalog are
    // needed; intermediate fitting tiers must not build throwaway catalogs.
    expect(catalog).toHaveBeenCalledTimes(2)
    expect(generation.result.current.inputSignature).not.toBe('')
    expect(preview.result.current.clinicalContext).toBe(generation.result.current.clinicalContext)
    expect(preview.result.current.formattedClinicalContext).toBe(generation.result.current.formattedClinicalContext)
    expect(preview.result.current.contextAdaptation).toEqual(generation.result.current.contextAdaptation)
    expect(preview.result.current.effectiveProfile).toEqual(generation.result.current.effectiveProfile)
    if (clinicalLimit === 700) expect(preview.result.current.contextAdaptation?.tier).toBe('prioritized')

    // A new saved selection invalidates the transient identity as well.
    mockProfile = { ...mockProfile, selection: { ...mockProfile.selection, documents: false }, filters: { ...ALL_DATA_FILTERS, labDepth: 'latest' } }
    preview.rerender()
    generation.rerender()
    expect(preview.result.current.clinicalContext).toBe(generation.result.current.clinicalContext)
    expect(preview.result.current.clinicalContext).not.toContain('<BEGIN_DOCUMENT')
  })

  it('does not rebuild unchanged structured sections when enabling 23 discharge summaries', () => {
    const categoryContext = jest.spyOn(dataCategoryRegistry, 'getCategoryContext')
    const started = performance.now()
    const { result, rerender } = renderHook(() => useClinicalAiInput(154_000, 'insights', 1, false, 100_000))
    categoryContext.mockClear()
    const toggled = performance.now()
    mockProfile = { ...mockProfile, selection: { ...mockProfile.selection, documents: true } }
    rerender()
    const enabled = performance.now()
    expect(result.current.dataReady).toBe(true)
    expect(result.current.clinicalContext.match(/<BEGIN_DOCUMENT /g)).toHaveLength(24)
    expect(result.current.catalog.filter(entry => entry.resourceType === 'Composition')).toHaveLength(24)
    expect(categoryContext).not.toHaveBeenCalled()
    if (process.env.CLINICAL_INPUT_BENCHMARK === '1') {
      console.info('Synthetic document input timing (ms)', { mount: Math.round(toggled - started), enable: Math.round(enabled - toggled) })
    }

    mockProfile = { ...mockProfile, documentMode: 'latestAdmission' }
    rerender()
    expect(result.current.clinicalContext.match(/<BEGIN_DOCUMENT /g)).toHaveLength(1)
    expect(result.current.clinicalContext).toContain('<BEGIN_DOCUMENT id="document-1">')
    expect(result.current.clinicalContext).not.toContain('<BEGIN_DOCUMENT id="document-0">')
    expect(result.current.catalog.filter(entry => entry.resourceType === 'Composition').map(entry => entry.resourceId)).toEqual(['document-1'])
    expect(categoryContext).not.toHaveBeenCalled()

    mockProfile = { ...mockProfile, selection: { ...mockProfile.selection, documents: false } }
    rerender()
    expect(result.current.clinicalContext).not.toContain('<BEGIN_DOCUMENT')
    expect(result.current.catalog.some(entry => entry.resourceType === 'Composition')).toBe(false)
    expect(categoryContext).not.toHaveBeenCalled()

    // The optimization must not retain stale labs when a relevant filter changes.
    mockProfile = { ...mockProfile, filters: { ...mockProfile.filters, labDepth: 'latest' } }
    rerender()
    expect(categoryContext.mock.calls.some(([category]) => category === 'labReports')).toBe(true)
  })
})
