import { fireEvent, render, screen } from '@testing-library/react'
import { SourceSup } from '@/features/medical-summary/components/SourceSup'

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

    expect(screen.getByText(/Observation · 臺北榮總;門診 · 2026-05-05/)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('0601160016')

    fireEvent.click(screen.getByRole('button', { name: /Observation · 臺北榮總;門診/ }))
    expect(onNavigate).toHaveBeenCalledWith({
      resourceType: 'Observation',
      resourceId: 'observation-hba1c',
      display: 'HbA1c',
      date: '2026-05-05',
    })
  })
})
