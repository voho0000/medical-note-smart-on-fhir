import { render, screen } from '@testing-library/react'
import { PatientInfoDisplay } from '@/features/clinical-summary/patient-info/components/PatientInfoDisplay'
import { LanguageProvider } from '@/src/application/providers/language.provider'

describe('PatientInfoDisplay phone layout', () => {
  it('keeps short labels and values on the same row', () => {
    const { container } = render(
      <LanguageProvider>
        <PatientInfoDisplay patientInfo={{
          id: 'demo-patient-1',
          name: '陳○明',
          gender: '男性',
          age: '94',
        }} />
      </LanguageProvider>,
    )

    const demographicGrid = container.querySelector('.grid')
    expect(demographicGrid).toHaveClass('grid-cols-[max-content_minmax(0,1fr)]')
    expect(demographicGrid).not.toHaveClass('grid-cols-1')
    expect(screen.getByText('demo-patient-1')).toHaveClass('break-all')
  })
})
