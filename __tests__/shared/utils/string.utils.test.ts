// Unit Tests: String Utilities
import {
  truncateText,
  capitalizeFirst,
  formatList,
  sanitizeHtml,
} from '@/src/shared/utils/string.utils'

describe('String Utilities', () => {
  describe('truncateText', () => {
    it('should truncate long text', () => {
      const text = 'This is a very long text that should be truncated'
      const result = truncateText(text, 20)
      expect(result).toBe('This is a very long ...')
      expect(result.length).toBe(23) // 20 + '...'
    })

    it('should not truncate short text', () => {
      const text = 'Short text'
      const result = truncateText(text, 20)
      expect(result).toBe('Short text')
    })

    it('should handle empty string', () => {
      expect(truncateText('', 10)).toBe('')
    })

    it('should handle undefined', () => {
      expect(truncateText(undefined, 10)).toBe('')
    })

    it('should use custom suffix', () => {
      const text = 'This is a long text'
      const result = truncateText(text, 10, '…')
      expect(result).toBe('This is a …')
    })
  })

  describe('capitalizeFirst', () => {
    it('should capitalize first letter', () => {
      expect(capitalizeFirst('hello')).toBe('Hello')
    })

    it('should handle already capitalized', () => {
      expect(capitalizeFirst('Hello')).toBe('Hello')
    })

    it('should handle empty string', () => {
      expect(capitalizeFirst('')).toBe('')
    })

    it('should handle undefined', () => {
      expect(capitalizeFirst(undefined)).toBe('')
    })

    it('should handle single character', () => {
      expect(capitalizeFirst('a')).toBe('A')
    })

    it('should not affect rest of string', () => {
      expect(capitalizeFirst('hELLO')).toBe('HELLO')
    })
  })

  describe('formatList', () => {
    it('should format list with commas', () => {
      const items = ['apple', 'banana', 'orange']
      expect(formatList(items)).toBe('apple, banana, orange')
    })

    it('should format list with "and"', () => {
      const items = ['apple', 'banana', 'orange']
      expect(formatList(items, 'and')).toBe('apple, banana and orange')
    })

    it('should handle single item', () => {
      expect(formatList(['apple'])).toBe('apple')
    })

    it('should handle two items', () => {
      expect(formatList(['apple', 'banana'], 'and')).toBe('apple and banana')
    })

    it('should handle empty array', () => {
      expect(formatList([])).toBe('')
    })

    it('should handle undefined', () => {
      expect(formatList(undefined)).toBe('')
    })
  })

  describe('sanitizeHtml', () => {
    it('should remove script tags', () => {
      const html = '<p>Hello</p><script>alert("xss")</script>'
      const result = sanitizeHtml(html)
      expect(result).not.toContain('<script>')
      expect(result).toContain('Hello')
    })

    it('should remove event handlers', () => {
      const html = '<div onclick="alert(\'xss\')">Click me</div>'
      const result = sanitizeHtml(html)
      expect(result).not.toContain('onclick')
    })

    it('should allow safe tags', () => {
      const html = '<p>Hello <strong>world</strong></p>'
      const result = sanitizeHtml(html)
      expect(result).toContain('<p>')
      expect(result).toContain('<strong>')
    })

    it('should handle empty string', () => {
      expect(sanitizeHtml('')).toBe('')
    })

    it('should handle undefined', () => {
      expect(sanitizeHtml(undefined)).toBe('')
    })
  })
})
