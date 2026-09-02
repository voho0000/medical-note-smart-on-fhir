import { act, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import {
  ProcedureRow,
  type EncounterProcedure,
} from '@/features/clinical-summary/visit-history/components/EncounterCards'
import {
  navigationEncounterId,
  visibleCountForNavigation,
} from '@/features/clinical-summary/visit-history/utils/source-navigation'
import { useResourceNavigationStore } from '@/src/application/stores/resource-navigation.store'

const PROCEDURE: EncounterProcedure = {
  id: 'procedure-1',
  title: 'Iliac vein stenting',
  status: 'completed',
  category: '門診治療／小處置',
  performed: '2026-08-12T12:00:00+08:00',
  performer: '長庚嘉義',
  report: [],
}

describe('procedure source navigation', () => {
  beforeEach(() => {
    useResourceNavigationStore.setState({ pending: null, seq: 0, consumedSeq: 0 })
    HTMLElement.prototype.scrollIntoView = jest.fn()
  })

  it('resolves a Procedure citation to the Encounter that contains it', () => {
    expect(navigationEncounterId(
      { resourceType: 'Procedure', resourceId: 'procedure-1' },
      [{
        id: 'procedure-1',
        encounter: { reference: 'Encounter/visit-1' },
      }],
    )).toBe('visit-1')
  })

  it('uses the pre-resolved parent encounter while visit data is still mounting', () => {
    expect(navigationEncounterId(
      {
        resourceType: 'Procedure',
        resourceId: 'procedure-1',
        encounterId: 'visit-1',
      },
      [],
    )).toBe('visit-1')
  })

  it('expands progressive rendering far enough to mount an old visit', () => {
    const visits = Array.from({ length: 163 }, (_, index) => ({
      id: `visit-${index}`,
      date: `${2026 - Math.floor(index / 12)}-${String(12 - (index % 12)).padStart(2, '0')}-01`,
    }))

    expect(visibleCountForNavigation(visits, 'visit-160', 25)).toBe(161)
    expect(visibleCountForNavigation(visits, 'visit-10', 25)).toBe(25)
  })

  it('lets the exact procedure row claim a pending timeline navigation', () => {
    act(() => {
      useResourceNavigationStore.getState().navigate({
        resourceType: 'Procedure',
        resourceId: 'procedure-1',
      })
    })

    render(
      <LanguageProvider>
        <ProcedureRow procedure={PROCEDURE} />
      </LanguageProvider>,
    )

    expect(useResourceNavigationStore.getState()).toMatchObject({
      pending: null,
      consumedSeq: 1,
    })
  })

  it('keeps visit procedures compact and omits the redundant completed status', () => {
    render(
      <LanguageProvider>
        <ProcedureRow procedure={PROCEDURE} />
      </LanguageProvider>,
    )

    const row = screen.getByText('Iliac vein stenting').closest('[data-slot="encounter-procedure"]')
    expect(row).toHaveClass('px-3', 'py-2')
    expect(row).not.toHaveClass('rounded-lg', 'shadow-sm')
    expect(screen.getByText('門診治療／小處置')).toBeInTheDocument()
    expect(screen.getByText('長庚嘉義')).toBeInTheDocument()
    expect(screen.queryByText(/completed/i)).not.toBeInTheDocument()
  })
})
