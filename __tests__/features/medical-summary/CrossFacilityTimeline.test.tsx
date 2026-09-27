import { fireEvent, render, screen } from '@testing-library/react'

import { LanguageProvider } from '@/src/application/providers/language.provider'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'
import { CrossFacilityTimeline } from '@/features/medical-summary/components/CrossFacilityTimeline'

const result = {
  timeline: [
    {
      key: 'E1',
      date: '2026-08-12',
      category: 'encounter',
      encounterClass: 'outpatient',
      organization: '示範長青醫院',
      label: 'Latest outpatient claim',
      resourceType: 'Encounter',
      resourceId: 'demo-encounter-1',
    },
  ],
  droppedTimelineCount: 0,
} as unknown as MedicalSummaryResult

describe('CrossFacilityTimeline', () => {
  it('keeps a document timeline event visible and navigable when its excerpt is not found', async () => {
    const onNavigate = jest.fn()
    render(<LanguageProvider><CrossFacilityTimeline result={{ ...result, timeline: [{
      ...result.timeline[0], key: 'D1', resourceType: 'DocumentReference', resourceId: 'synthetic-doc',
      documentEvidence: [{ source: 'D1', quote: 'Synthetic unmatched quote', verification: 'not-found' }],
    }] }} title="Timeline" categoryLabel={() => 'Document'} encounterClassLabel={() => 'Document'}
      earlierLabel="Earlier" collapseLabel="Less" droppedNote={null} onNavigate={onNavigate} /></LanguageProvider>)
    expect(await screen.findByText('Excerpt needs review. Open the source to check.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Latest outpatient claim/ }))
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'synthetic-doc', evidenceQuote: 'Synthetic unmatched quote' }))
  })
  beforeEach(() => {
    localStorage.setItem('medical-note-locale', 'en')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows the English demo organization alias in an English summary', async () => {
    render(
      <LanguageProvider>
        <CrossFacilityTimeline
          result={result}
          title="Cross-hospital timeline"
          categoryLabel={() => 'Encounter'}
          encounterClassLabel={() => 'Outpatient'}
          earlierLabel="{count} earlier event(s)"
          collapseLabel="Show less"
          droppedNote={null}
        />
      </LanguageProvider>,
    )

    expect(await screen.findByText('A Hospital')).toBeInTheDocument()
    expect(screen.queryByText('示範長青醫院')).not.toBeInTheDocument()
    expect(screen.queryByText('Document source date:')).not.toBeInTheDocument()
  })

  it('labels document provenance dates even when the source quote matches exactly', async () => {
    const onNavigate = jest.fn()
    render(<LanguageProvider><CrossFacilityTimeline result={{ ...result, timeline: [{
      ...result.timeline[0], key: 'D1', resourceType: 'DocumentReference', resourceId: 'synthetic-doc',
      date: '2026-08-12', label: 'Surgery documented in 2024',
      documentEvidence: [{ source: 'D1', quote: 'Surgery performed in 2024', verification: 'exact' }],
    }] }} title="Timeline" categoryLabel={() => 'Procedure'} encounterClassLabel={() => 'Document'}
      earlierLabel="Earlier" collapseLabel="Less" droppedNote={null} onNavigate={onNavigate} /></LanguageProvider>)
    expect(await screen.findByText('Document source date:')).toBeVisible()
    expect(screen.getByText(/Document rows use the source date/)).toBeVisible()
    expect(screen.queryByText('Excerpt needs review. Open the source to check.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Surgery documented in 2024/ }))
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'synthetic-doc', date: '2026-08-12', evidenceQuote: 'Surgery performed in 2024' }))
  })
})
