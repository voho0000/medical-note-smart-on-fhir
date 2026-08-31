/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

import { LanguageProvider } from '@/src/application/providers/language.provider'
import { ClinicalPatientContext } from '@/src/shared/components/clinical-workspace/patient-context'

const patient = {
  resourceType: 'Patient' as const,
  id: 'internal-patient-123',
  name: [{ text: '王小明', given: ['Xiaoming'], family: 'Wang' }],
  age: 42,
  gender: 'male' as const,
}

describe('ClinicalPatientContext', () => {
  beforeEach(() => {
    localStorage.setItem('medical-note-locale', 'zh-TW')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it.each(['header', 'mobile'] as const)(
    'shows only name, age, and gender in the %s context',
    (variant) => {
      render(
        <LanguageProvider>
          <ClinicalPatientContext patient={patient} variant={variant} />
        </LanguageProvider>,
      )

      const context = screen.getByLabelText('病人資訊 · 王小明 · 42歲 · 男性')
      expect(context).toHaveTextContent('王小明·42歲·男性')
      expect(context).not.toHaveTextContent(patient.id)
      expect(context.getAttribute('aria-label')).not.toContain(patient.id)
      if (variant === 'mobile') {
        expect(context).toHaveClass('min-h-[40px]')
      }
    },
  )

  it('shows the supplied Romanized name in the English context', async () => {
    localStorage.setItem('medical-note-locale', 'en')

    render(
      <LanguageProvider>
        <ClinicalPatientContext patient={patient} variant="header" />
      </LanguageProvider>,
    )

    const context = await screen.findByLabelText(
      'Patient Information · Xiaoming Wang · 42 years · Male',
    )
    expect(context).toHaveTextContent('Xiaoming Wang·42 years·Male')
    expect(context).not.toHaveTextContent('王小明')
  })
})
