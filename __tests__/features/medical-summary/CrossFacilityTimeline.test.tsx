import { render, screen } from '@testing-library/react'

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
  })
})
