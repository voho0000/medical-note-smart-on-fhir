// Unit Tests: FHIR Helpers
import {
  getCodeableConceptText,
  formatQuantity,
  formatDate,
  formatSourceTime,
  calculateAge,
  formatGender,
  formatDateTime,
  getConceptText,
  round1,
  formatError,
} from '@/src/shared/utils/fhir-helpers'

describe('FHIR Helpers', () => {
  describe('getCodeableConceptText', () => {
    it('should return text from CodeableConcept', () => {
      const concept = {
        text: 'Hypertension',
        coding: [{ display: 'High blood pressure' }]
      }
      expect(getCodeableConceptText(concept)).toBe('Hypertension')
    })

    it('should return display from first coding if no text', () => {
      const concept = {
        coding: [{ display: 'Diabetes mellitus' }]
      }
      expect(getCodeableConceptText(concept)).toBe('Diabetes mellitus')
    })

    it('should return code if no text or display', () => {
      const concept = {
        coding: [{ code: 'E11' }]
      }
      expect(getCodeableConceptText(concept)).toBe('E11')
    })

    it('should return em dash for undefined', () => {
      expect(getCodeableConceptText(undefined)).toBe('—')
    })

    it('should return em dash for empty object', () => {
      expect(getCodeableConceptText({})).toBe('—')
    })
  })

  describe('formatQuantity', () => {
    it('should format quantity with value and unit', () => {
      const quantity = {
        value: 120,
        unit: 'mg'
      }
      expect(formatQuantity(quantity)).toBe('120 mg')
    })

    it('should format quantity with value only', () => {
      const quantity = {
        value: 5
      }
      expect(formatQuantity(quantity)).toBe('5')
    })

    it('should return em dash for undefined', () => {
      expect(formatQuantity(undefined)).toBe('—')
    })

    it('should return em dash for quantity without value', () => {
      const quantity = {
        unit: 'mg'
      }
      expect(formatQuantity(quantity)).toBe('—')
    })

    it('should handle decimal values', () => {
      const quantity = {
        value: 2.5,
        unit: 'ml'
      }
      expect(formatQuantity(quantity)).toBe('2.5 ml')
    })
  })

  describe('formatDate', () => {
    it('should format valid date string', () => {
      const dateString = '2024-01-15'
      const result = formatDate(dateString)
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/)
    })

    it('should return empty string for undefined', () => {
      expect(formatDate(undefined)).toBe('')
    })

    it('should return original string for invalid date', () => {
      // Unparseable input is echoed back verbatim rather than the confusing
      // JS artifact "Invalid Date".
      expect(formatDate('not-a-date')).toBe('not-a-date')
    })

    it('should return partial dates as-is (year / year-month)', () => {
      // FHIR `date` allows YYYY and YYYY-MM precision — render at the given
      // precision instead of fabricating a day.
      expect(formatDate('2024')).toBe('2024')
      expect(formatDate('2024-01')).toBe('2024-01')
    })

    it('should handle ISO date format', () => {
      const dateString = '2024-01-15T10:30:00Z'
      const result = formatDate(dateString)
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/)
    })

    it('keeps a dateTime on the day the SOURCE wrote, in any viewer timezone', () => {
      // Regression: a CT stamped 2026-01-14T00:00:00+08:00 (the 14th at the
      // reporting hospital) was rendered 2026/1/13 by a CI runner in UTC, which
      // also contradicted the day-grouping key (`iso.slice(0, 10)`).
      // The offsets below are chosen so that re-localising the INSTANT lands on
      // a different calendar day in every timezone a runner realistically has:
      // +14:00 midnight is the previous day everywhere up to UTC+13, and
      // -12:00 end-of-day is the next day everywhere from UTC-11 up. Comparing
      // against a locally-constructed date keeps the assertion itself
      // timezone-independent.
      expect(formatDate('2026-01-14T00:00:00+14:00')).toBe(new Date(2026, 0, 14).toLocaleDateString())
      expect(formatDate('2026-01-14T23:59:00-12:00')).toBe(new Date(2026, 0, 14).toLocaleDateString())
      expect(formatDate('2026-01-14T00:00:00+08:00')).toBe(new Date(2026, 0, 14).toLocaleDateString())
    })
  })

  describe('formatSourceTime', () => {
    it("renders the source's wall clock, not the viewer's", () => {
      // Same contract as formatDate: an 08:30 draw stays 08:30 for every
      // reader, so a serial-lab time badge still belongs to the collection-day
      // card it sits in.
      const expected = new Date(2026, 0, 14, 8, 30).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      expect(formatSourceTime('2026-01-14T08:30:00+08:00')).toBe(expected)
      expect(formatSourceTime('2026-01-14T08:30:00-05:00')).toBe(expected)
    })

    it('returns empty for values that carry no time', () => {
      // Never invent a clock reading a date-only source never claimed.
      expect(formatSourceTime('2026-01-14')).toBe('')
      expect(formatSourceTime('2026-01')).toBe('')
      expect(formatSourceTime(undefined)).toBe('')
      expect(formatSourceTime('not-a-date')).toBe('')
    })
  })

  describe('calculateAge', () => {
    it('should calculate age correctly', () => {
      const birthDate = '1990-01-01'
      const age = calculateAge(birthDate)
      const expectedAge = new Date().getFullYear() - 1990
      expect(parseInt(age)).toBeGreaterThanOrEqual(expectedAge - 1)
      expect(parseInt(age)).toBeLessThanOrEqual(expectedAge)
    })

    it('should return N/A for undefined', () => {
      expect(calculateAge(undefined)).toBe('N/A')
    })

    it('should handle leap year births', () => {
      const birthDate = '2000-02-29'
      const age = calculateAge(birthDate)
      expect(parseInt(age)).toBeGreaterThan(0)
    })
  })

  describe('formatGender', () => {
    it('should format male gender', () => {
      expect(formatGender('male')).toBe('Male')
    })

    it('should format female gender', () => {
      expect(formatGender('female')).toBe('Female')
    })

    it('should format other gender', () => {
      expect(formatGender('other')).toBe('Other')
    })

    it('should format unknown gender', () => {
      expect(formatGender('unknown')).toBe('Unknown')
    })

    it('should return N/A for undefined', () => {
      expect(formatGender(undefined)).toBe('N/A')
    })

    it('should capitalize first letter', () => {
      expect(formatGender('MALE')).toBe('Male')
    })
  })

  describe('formatDateTime', () => {
    it('should format valid datetime', () => {
      const dateString = '2024-01-15T10:30:00Z'
      const result = formatDateTime(dateString)
      expect(result).toBeTruthy()
      expect(result.length).toBeGreaterThan(0)
    })

    it('should return empty string for undefined', () => {
      expect(formatDateTime(undefined)).toBe('')
    })

    it('should handle invalid date gracefully', () => {
      const result = formatDateTime('invalid')
      expect(result).toBe('Invalid Date')
    })
  })

  describe('getConceptText', () => {
    it('should handle single CodeableConcept', () => {
      const concept = {
        text: 'Hypertension'
      }
      expect(getConceptText(concept)).toBe('Hypertension')
    })

    it('should handle array of CodeableConcepts', () => {
      const concepts = [
        { text: 'Diabetes' },
        { text: 'Hypertension' }
      ]
      expect(getConceptText(concepts)).toBe('Diabetes, Hypertension')
    })

    it('should return em dash for undefined', () => {
      expect(getConceptText(undefined)).toBe('—')
    })

    it('should return em dash for empty array', () => {
      expect(getConceptText([])).toBe('—')
    })

    it('should filter out empty values in array', () => {
      const concepts = [
        { text: 'Diabetes' },
        {},
        { text: 'Hypertension' }
      ]
      const result = getConceptText(concepts)
      expect(result).toContain('Diabetes')
      expect(result).toContain('Hypertension')
    })
  })

  describe('round1', () => {
    it('should round to 1 decimal place', () => {
      expect(round1(3.14159)).toBe(3.1)
    })

    it('should round up correctly', () => {
      expect(round1(3.16)).toBe(3.2)
    })

    it('should handle integers', () => {
      expect(round1(5)).toBe(5)
    })

    it('should handle negative numbers', () => {
      expect(round1(-2.67)).toBe(-2.7)
    })

    it('should handle zero', () => {
      expect(round1(0)).toBe(0)
    })

    it('should handle Infinity', () => {
      expect(round1(Infinity)).toBe(Infinity)
    })

    it('should handle NaN', () => {
      expect(isNaN(round1(NaN))).toBe(true)
    })
  })

  describe('formatError', () => {
    it('should format string error', () => {
      expect(formatError('Error message')).toBe('Error message')
    })

    it('should format Error object', () => {
      const error = new Error('Test error')
      expect(formatError(error)).toBe('Test error')
    })

    it('should format object with message', () => {
      const error = { message: 'Custom error' }
      expect(formatError(error)).toBe('Custom error')
    })

    it('should stringify object without message', () => {
      const error = { code: 500, status: 'failed' }
      const result = formatError(error)
      expect(result).toContain('500')
      expect(result).toContain('failed')
    })

    it('should handle null', () => {
      expect(formatError(null)).toBe('null')
    })

    it('should handle undefined', () => {
      expect(formatError(undefined)).toBe('undefined')
    })

    it('should handle number', () => {
      expect(formatError(404)).toBe('404')
    })

    it('should handle boolean', () => {
      expect(formatError(false)).toBe('false')
    })
  })

  describe('getCodeableConceptText - additional cases', () => {
    it('should prioritize text over coding display', () => {
      const concept = {
        text: 'Primary text',
        coding: [{ display: 'Secondary display' }]
      }
      expect(getCodeableConceptText(concept)).toBe('Primary text')
    })

    it('should use coding display when text is missing', () => {
      const concept = {
        coding: [{ display: 'Coding display' }]
      }
      expect(getCodeableConceptText(concept)).toBe('Coding display')
    })

    it('should use coding code when display is missing', () => {
      const concept = {
        coding: [{ code: 'E11.9' }]
      }
      expect(getCodeableConceptText(concept)).toBe('E11.9')
    })

    it('should handle multiple codings (use first)', () => {
      const concept = {
        coding: [
          { display: 'First display' },
          { display: 'Second display' }
        ]
      }
      expect(getCodeableConceptText(concept)).toBe('First display')
    })
  })

  describe('formatQuantity - additional cases', () => {
    it('should handle zero value', () => {
      expect(formatQuantity({ value: 0, unit: 'mg' })).toBe('0 mg')
    })

    it('should handle large numbers', () => {
      const result = formatQuantity({ value: 1000000, unit: 'cells' })
      expect(result).toContain('1')
      expect(result).toContain('cells')
    })

    it('should handle very small decimals', () => {
      expect(formatQuantity({ value: 0.1, unit: 'mg' })).toBe('0.1 mg')
    })

    it('should format integers without decimals', () => {
      expect(formatQuantity({ value: 100, unit: 'mg' })).toBe('100 mg')
    })

    it('should handle negative values', () => {
      expect(formatQuantity({ value: -5, unit: 'degrees' })).toContain('-5')
    })
  })
})

