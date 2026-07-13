import { renderHook } from '@testing-library/react'
import { useActiveAllergies } from '@/features/clinical-summary/allergies/hooks/useActiveAllergies'
import type { AllergyEntity } from '@/src/core/entities/clinical-data.entity'

describe('useActiveAllergies', () => {
  it('excludes domain-mapped inactive and resolved allergies', () => {
    const allergies: AllergyEntity[] = [
      { id: 'active', clinicalStatus: 'active' },
      { id: 'inactive', clinicalStatus: 'inactive' },
      { id: 'resolved', clinicalStatus: 'resolved' },
      { id: 'unknown' },
    ]

    const { result } = renderHook(() => useActiveAllergies(allergies))

    expect(result.current.map(allergy => allergy.id)).toEqual(['active', 'unknown'])
  })

  it('treats status codes case-insensitively', () => {
    const allergies: AllergyEntity[] = [
      { id: 'inactive', clinicalStatus: 'INACTIVE' },
      { id: 'active', clinicalStatus: 'ACTIVE' },
    ]

    const { result } = renderHook(() => useActiveAllergies(allergies))

    expect(result.current.map(allergy => allergy.id)).toEqual(['active'])
  })
})
