import { render, screen } from '@testing-library/react'
import { AllergyItem } from '@/features/clinical-summary/allergies/components/AllergyItem'
import { useLanguage } from '@/src/application/providers/language.provider'

jest.mock('@/src/application/providers/language.provider')

describe('AllergyItem', () => {
  beforeEach(() => {
    jest.mocked(useLanguage).mockReturnValue({
      t: {
        allergies: {
          type: { allergy: 'Allergy', intolerance: 'Intolerance' },
          category: { food: 'Food', medication: 'Medication' },
          criticality: { label: 'Criticality' },
          status: 'Status',
          verification: 'Verification',
        },
      },
    } as any)
  })

  it('does not invent allergy type or food category when source fields are absent', () => {
    render(<AllergyItem allergy={{ id: 'a1', code: { text: 'Penicillin' } }} />)

    expect(screen.getByText('Penicillin')).toBeInTheDocument()
    expect(screen.queryByText('Allergy')).not.toBeInTheDocument()
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
  })

  it('renders classifications when they are present in the source', () => {
    render(<AllergyItem allergy={{
      id: 'a2',
      code: { text: 'Penicillin' },
      type: 'allergy',
      category: ['medication'],
    }} />)

    expect(screen.getByText('Allergy')).toBeInTheDocument()
    expect(screen.getByText('Medication')).toBeInTheDocument()
  })
})
