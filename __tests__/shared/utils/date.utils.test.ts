// Unit Tests: Date Utilities
import { 
  calculateAge, 
  isWithinTimeRange, 
  formatDate,
  formatDateTime,
  isValidDate
} from '@/src/shared/utils/date.utils'

describe('Date Utilities', () => {
  describe('calculateAge', () => {
    it('should calculate age correctly', () => {
      // Arrange
      const birthDate = '1990-01-01'
      const today = new Date()
      const expectedAge = today.getFullYear() - 1990

      // Act
      const age = calculateAge(birthDate)

      // Assert
      expect(parseInt(age)).toBeGreaterThanOrEqual(expectedAge - 1)
      expect(parseInt(age)).toBeLessThanOrEqual(expectedAge)
    })

    it('should return Unknown for undefined birth date', () => {
      // Act
      const age = calculateAge(undefined)

      // Assert
      expect(age).toBe('Unknown')
    })

    it('should return Unknown for invalid birth date', () => {
      // Act
      const age = calculateAge('invalid-date')

      // Assert
      expect(age).toBe('Unknown')
    })

    it('should handle leap year births correctly', () => {
      // Arrange
      const birthDate = '2000-02-29'

      // Act
      const age = calculateAge(birthDate)

      // Assert
      expect(age).toBeDefined()
      expect(age).not.toBe('N/A')
    })
  })

  describe('isWithinTimeRange', () => {
    const now = new Date()

    it('should return true for date within 1 month', () => {
      // Arrange
      const date = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
      const dateString = date.toISOString()

      // Act
      const result = isWithinTimeRange(dateString, '1m')

      // Assert
      expect(result).toBe(true)
    })

    it('should return false for date outside 1 month', () => {
      // Arrange
      const date = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000) // 45 days ago
      const dateString = date.toISOString()

      // Act
      const result = isWithinTimeRange(dateString, '1m')

      // Assert
      expect(result).toBe(false)
    })

    it('should return true for date within 1 year', () => {
      // Arrange
      const date = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) // 180 days ago
      const dateString = date.toISOString()

      // Act
      const result = isWithinTimeRange(dateString, '1y')

      // Assert
      expect(result).toBe(true)
    })

    it('should return false for undefined date', () => {
      // Act
      const result = isWithinTimeRange(undefined, '1m')

      // Assert
      expect(result).toBe(false)
    })

    it('should return true for "all" range', () => {
      // Arrange
      const date = new Date(now.getTime() - 1000 * 24 * 60 * 60 * 1000) // 1000 days ago
      const dateString = date.toISOString()

      // Act
      const result = isWithinTimeRange(dateString, 'all')

      // Assert
      expect(result).toBe(true)
    })
  })

  describe('formatDate', () => {
    it('should format valid date correctly', () => {
      // Arrange
      const dateString = '2024-01-15'

      // Act
      const result = formatDate(dateString)

      // Assert
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/)
    })

    it('should return Unknown for undefined date', () => {
      // Act
      const result = formatDate(undefined)

      // Assert
      expect(result).toBe('Unknown')
    })

    it('should return Invalid date for invalid date string', () => {
      // Act
      const result = formatDate('invalid-date')

      // Assert
      expect(result).toBe('Invalid date')
    })

    it('should handle ISO date format', () => {
      // Arrange
      const dateString = '2024-01-15T10:30:00Z'

      // Act
      const result = formatDate(dateString)

      // Assert
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/)
    })
  })

  describe('formatDateTime', () => {
    it('should format valid datetime correctly', () => {
      // Arrange
      const dateString = '2024-01-15T10:30:00Z'

      // Act
      const result = formatDateTime(dateString)

      // Assert
      expect(result).toContain('2024')
      expect(result.length).toBeGreaterThan(10)
    })

    it('should return Unknown for undefined', () => {
      expect(formatDateTime(undefined)).toBe('Unknown')
    })

    it('should return Invalid date for invalid string', () => {
      expect(formatDateTime('not-a-date')).toBe('Invalid date')
    })

    it('should handle empty string', () => {
      expect(formatDateTime('')).toBe('Unknown')
    })
  })

  describe('isValidDate', () => {
    it('should return true for valid date string', () => {
      expect(isValidDate('2024-01-15')).toBe(true)
    })

    it('should return true for valid ISO date', () => {
      expect(isValidDate('2024-01-15T10:30:00Z')).toBe(true)
    })

    it('should return false for invalid date', () => {
      expect(isValidDate('invalid-date')).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isValidDate(undefined)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isValidDate('')).toBe(false)
    })
  })

  describe('isWithinTimeRange - additional cases', () => {
    const now = new Date()

    it('should handle 24h range', () => {
      const date = new Date(now.getTime() - 12 * 60 * 60 * 1000) // 12 hours ago
      expect(isWithinTimeRange(date.toISOString(), '24h')).toBe(true)
    })

    it('should handle 3d range', () => {
      const date = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      expect(isWithinTimeRange(date.toISOString(), '3d')).toBe(true)
    })

    it('should handle 1w range', () => {
      const date = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      expect(isWithinTimeRange(date.toISOString(), '1w')).toBe(true)
    })

    it('should handle 3m range', () => {
      const date = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
      expect(isWithinTimeRange(date.toISOString(), '3m')).toBe(true)
    })

    it('should handle 6m range', () => {
      const date = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000) // 120 days ago
      expect(isWithinTimeRange(date.toISOString(), '6m')).toBe(true)
    })

    it('should return false for invalid date string', () => {
      expect(isWithinTimeRange('invalid', '1m')).toBe(false)
    })

    it('should return false for date outside range', () => {
      const date = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      expect(isWithinTimeRange(date.toISOString(), '24h')).toBe(false)
    })
  })

  describe('calculateAge - edge cases', () => {
    it('should handle birthday today', () => {
      const today = new Date()
      const birthYear = today.getFullYear() - 30
      const birthDate = `${birthYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const age = calculateAge(birthDate)
      expect(parseInt(age)).toBe(30)
    })

    it('should handle birthday tomorrow (not yet birthday this year)', () => {
      const today = new Date()
      const tomorrow = new Date(today)
      tomorrow.setDate(today.getDate() + 1)
      const birthYear = today.getFullYear() - 30
      const birthDate = `${birthYear}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
      const age = calculateAge(birthDate)
      expect(parseInt(age)).toBe(29)
    })

    it('should return Unknown for null', () => {
      expect(calculateAge(null)).toBe('Unknown')
    })

    it('should return Unknown for empty string', () => {
      expect(calculateAge('')).toBe('Unknown')
    })
  })
})

