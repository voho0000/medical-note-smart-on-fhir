import { fireEvent, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { RightDetailProvider } from '@/src/application/providers/right-detail.provider'
import { VisitItem } from '@/features/clinical-summary/visit-history/components/VisitItem'

jest.mock(
  '@/features/clinical-summary/visit-history/components/VisitDetailContent',
  () => ({
    VisitDetailContent: () => null,
    visitHasDetails: () => false,
  }),
)

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('VisitItem ICD tooltip', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    })
  })

  it('shows the complete code and diagnosis in an explicit tooltip', async () => {
    render(
      <LanguageProvider>
        <RightDetailProvider>
          <VisitItem
            visit={{
              id: 'visit-1',
              type: 'outpatient',
              date: '2026-02-10',
              institution: '示範北辰醫院',
              reason: 'I35.9 - 非風濕性未明示主動脈瓣疾患',
              icdCodes: [{
                code: 'I35.9',
                description: '非風濕性未明示主動脈瓣疾患',
              }],
              status: 'finished',
            }}
            isExpanded={false}
            onToggle={() => undefined}
          />
        </RightDetailProvider>
      </LanguageProvider>,
    )

    const icdChip = screen.getByLabelText('I35.9 非風濕性未明示主動脈瓣疾患')
    expect(icdChip).not.toHaveAttribute('title')

    fireEvent.focus(icdChip)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'I35.9 非風濕性未明示主動脈瓣疾患',
    )
  })
})
