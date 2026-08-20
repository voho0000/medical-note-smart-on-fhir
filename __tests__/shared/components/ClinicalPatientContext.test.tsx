/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

import { LanguageProvider } from '@/src/application/providers/language.provider'
import { ClinicalPatientContext } from '@/src/shared/components/clinical-workspace/patient-context'

const patient = {
  resourceType: 'Patient' as const,
  id: 'internal-patient-123',
  name: [{ text: '王小明' }],
  age: 42,
  gender: 'male' as const,
}

describe('ClinicalPatientContext', () => {
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
})
