// Unit Tests: Clinical Context Formatters
import { formatClinicalContext, mapAndFilter } from '@/src/application/hooks/clinical-context/formatters'
import type { ClinicalContextSection } from '@/src/core/entities/clinical-context.entity'

describe('Clinical Context Formatters', () => {
  describe('formatClinicalContext', () => {
    it('should format sections with items correctly', () => {
      const sections: ClinicalContextSection[] = [
        { title: 'Conditions', items: ['Diabetes', 'Hypertension'] },
        { title: 'Medications', items: ['Metformin', 'Lisinopril'] }
      ]

      const result = formatClinicalContext(sections)

      expect(result).toBe(
        'Conditions:\n- Diabetes\n- Hypertension\n\nMedications:\n- Metformin\n- Lisinopril'
      )
    })

    it('should return default message for empty array', () => {
      const result = formatClinicalContext([])
      expect(result).toBe('No clinical data available.')
    })

    it('should return default message for null input', () => {
      const result = formatClinicalContext(null as any)
      expect(result).toBe('No clinical data available.')
    })

    it('should return default message for undefined input', () => {
      const result = formatClinicalContext(undefined as any)
      expect(result).toBe('No clinical data available.')
    })

    it('should filter out sections with no items', () => {
      const sections: ClinicalContextSection[] = [
        { title: 'Conditions', items: ['Diabetes'] },
        { title: 'Empty Section', items: [] },
        { title: 'Medications', items: ['Metformin'] }
      ]

      const result = formatClinicalContext(sections)

      expect(result).not.toContain('Empty Section')
      expect(result).toContain('Conditions')
      expect(result).toContain('Medications')
    })

    it('should handle section with undefined items', () => {
      const sections: ClinicalContextSection[] = [
        { title: 'Conditions', items: ['Diabetes'] },
        { title: 'Bad Section', items: undefined as any }
      ]

      const result = formatClinicalContext(sections)

      expect(result).not.toContain('Bad Section')
      expect(result).toContain('Conditions')
    })

    it('should use "Untitled" for section without title', () => {
      const sections: ClinicalContextSection[] = [
        { title: '', items: ['Item 1', 'Item 2'] }
      ]

      const result = formatClinicalContext(sections)

      expect(result).toContain('Untitled:')
      expect(result).toContain('- Item 1')
    })

    it('should handle single section', () => {
      const sections: ClinicalContextSection[] = [
        { title: 'Allergies', items: ['Penicillin'] }
      ]

      const result = formatClinicalContext(sections)

      expect(result).toBe('Allergies:\n- Penicillin')
    })

    it('should handle section with single item', () => {
      const sections: ClinicalContextSection[] = [
        { title: 'Patient Info', items: ['Age: 45'] }
      ]

      const result = formatClinicalContext(sections)

      expect(result).toBe('Patient Info:\n- Age: 45')
    })

    it('should handle multiple items in single section', () => {
      const sections: ClinicalContextSection[] = [
        { 
          title: 'Vital Signs', 
          items: ['BP: 120/80', 'HR: 72', 'Temp: 98.6°F', 'RR: 16'] 
        }
      ]

      const result = formatClinicalContext(sections)

      expect(result).toContain('- BP: 120/80')
      expect(result).toContain('- HR: 72')
      expect(result).toContain('- Temp: 98.6°F')
      expect(result).toContain('- RR: 16')
    })

    it('should preserve item formatting', () => {
      const sections: ClinicalContextSection[] = [
        { title: 'Lab Results', items: ['WBC: 7.5 K/uL (Normal: 4-11)'] }
      ]

      const result = formatClinicalContext(sections)

      expect(result).toContain('- WBC: 7.5 K/uL (Normal: 4-11)')
    })

    it('should handle sections with special characters', () => {
      const sections: ClinicalContextSection[] = [
        { title: 'Notes & Comments', items: ['Patient reports 50% improvement'] }
      ]

      const result = formatClinicalContext(sections)

      expect(result).toContain('Notes & Comments:')
      expect(result).toContain('- Patient reports 50% improvement')
    })
  })

  describe('mapAndFilter', () => {
    it('should map and filter items correctly', () => {
      const items = [
        { name: 'Item 1' },
        { name: 'Item 2' },
        { name: 'Item 3' }
      ]

      const result = mapAndFilter(items, item => item.name)

      expect(result).toEqual(['Item 1', 'Item 2', 'Item 3'])
    })

    it('should filter out null values', () => {
      const items = [
        { name: 'Item 1' },
        { name: null },
        { name: 'Item 3' }
      ]

      const result = mapAndFilter(items, item => item.name)

      expect(result).toEqual(['Item 1', 'Item 3'])
    })

    it('should filter out undefined values', () => {
      const items = [
        { name: 'Item 1' },
        { name: undefined },
        { name: 'Item 3' }
      ]

      const result = mapAndFilter(items, item => item.name)

      expect(result).toEqual(['Item 1', 'Item 3'])
    })

    it('should return empty array for undefined input', () => {
      const result = mapAndFilter<string>(undefined, item => item)

      expect(result).toEqual([])
    })

    it('should return empty array for empty input array', () => {
      const result = mapAndFilter<string>([], item => item)

      expect(result).toEqual([])
    })

    it('should handle mapper returning all nulls', () => {
      const items = [1, 2, 3]
      const result = mapAndFilter(items, () => null)

      expect(result).toEqual([])
    })

    it('should handle mapper returning all undefined', () => {
      const items = [1, 2, 3]
      const result = mapAndFilter(items, () => undefined)

      expect(result).toEqual([])
    })

    it('should filter out empty strings', () => {
      const items = [
        { value: 'Valid' },
        { value: '' },
        { value: 'Also Valid' }
      ]

      const result = mapAndFilter(items, item => item.value)

      expect(result).toEqual(['Valid', 'Also Valid'])
    })

    it('should preserve non-empty strings including whitespace', () => {
      const items = [
        { value: 'Text' },
        { value: ' ' },
        { value: 'More Text' }
      ]

      const result = mapAndFilter(items, item => item.value)

      expect(result).toEqual(['Text', ' ', 'More Text'])
    })

    it('should work with complex mapper function', () => {
      const items = [
        { code: { text: 'Diabetes' } },
        { code: { text: null } },
        { code: null },
        { code: { text: 'Hypertension' } }
      ]

      const result = mapAndFilter(items, item => item.code?.text)

      expect(result).toEqual(['Diabetes', 'Hypertension'])
    })

    it('should handle numeric values converted to strings', () => {
      const items = [1, 2, 3, 4, 5]
      const result = mapAndFilter(items, item => `Item ${item}`)

      expect(result).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'])
    })

    it('should maintain order of items', () => {
      const items = ['z', 'a', 'm', 'b']
      const result = mapAndFilter(items, item => item)

      expect(result).toEqual(['z', 'a', 'm', 'b'])
    })
  })
})
