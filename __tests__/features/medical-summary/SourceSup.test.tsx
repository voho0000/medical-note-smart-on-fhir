import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SourceSup } from '@/features/medical-summary/components/SourceSup'
import { LanguageProvider, useLanguage } from '@/src/application/providers/language.provider'

function CurrentLocale() {
  return <span data-testid="current-locale">{useLanguage().locale}</span>
}

describe('SourceSup', () => {
  it('hides a trailing NHI institution code without changing source navigation', () => {
    const onNavigate = jest.fn()

    render(
      <SourceSup
        sources={[{
          key: 'L1',
          num: 1,
          verified: true,
          resourceType: 'Observation',
          resourceId: 'observation-hba1c',
          organization: '臺北榮總;門診;0601160016',
          date: '2026-05-05',
          display: 'HbA1c',
        }]}
        typeLabel={(resourceType) => resourceType ?? ''}
        unverifiedLabel="來源可能有問題，請核對"
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 · Observation/ }))

    expect(screen.getByText(/Observation · 臺北榮總 · 2026-05-05/)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('0601160016')

    fireEvent.click(screen.getByRole('button', { name: /Observation · 臺北榮總/ }))
    expect(onNavigate).toHaveBeenCalledWith({
      resourceType: 'Observation',
      resourceId: 'observation-hba1c',
      display: 'HbA1c',
      date: '2026-05-05',
    })
  })

  it('keeps long pre-generated traces scrollable inside the available viewport', () => {
    render(
      <SourceSup
        sources={Array.from({ length: 11 }, (_, index) => ({
          key: `O${index + 1}`,
          num: index + 1,
          verified: true,
          resourceType: 'Observation',
          resourceId: `observation-${index + 1}`,
          display: `Observation ${index + 1}`,
        }))}
        typeLabel={(resourceType) => resourceType ?? ''}
        unverifiedLabel="來源可能有問題，請核對"
        onNavigate={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /1,2,3,4,5,6,7,8,9,10,11 · Observation/ }))

    const trace = screen.getByRole('dialog')
    expect(trace).toHaveClass('overflow-y-auto', 'overscroll-contain')
    expect(trace).toHaveStyle({
      maxHeight: 'min(20rem, calc(var(--radix-popover-content-available-height) - 0.5rem))',
    })
    expect(screen.getByRole('button', { name: /11 Observation/ })).toBeInTheDocument()
  })

  it('localizes frozen demo source titles in the English trace only', async () => {
    localStorage.setItem('medical-note-locale', 'en')

    render(
      <LanguageProvider>
        <CurrentLocale />
        <SourceSup
          sources={[{
            key: 'K1',
            num: 1,
            verified: true,
            resourceType: 'CarePlan',
            resourceId: 'demo-careplan-1',
            organization: '示範北辰醫院',
            display: '末期腎臟病前期（Pre-ESRD）之病人照護與衛教計畫',
          }]}
          typeLabel={(resourceType) => resourceType ?? ''}
          unverifiedLabel="Source may be incorrect"
          onNavigate={jest.fn()}
        />
      </LanguageProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('current-locale')).toHaveTextContent('en'))
    fireEvent.click(screen.getByRole('button', { name: /1 · CarePlan/ }))

    expect(screen.getByText(/CarePlan · C Hospital/)).toBeInTheDocument()
    expect(screen.getByText('Pre-ESRD patient care and education program')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('末期腎臟病前期')
  })
})
