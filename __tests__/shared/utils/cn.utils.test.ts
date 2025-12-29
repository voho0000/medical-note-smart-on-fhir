// Unit Tests: CN Utilities (Tailwind Class Merger)
import { cn } from '@/src/shared/utils/cn.utils'

describe('CN Utilities', () => {
  describe('cn', () => {
    it('should merge simple class names', () => {
      const result = cn('px-4', 'py-2')
      expect(result).toBe('px-4 py-2')
    })

    it('should handle conditional classes', () => {
      const result = cn('base-class', true && 'conditional-class', false && 'hidden-class')
      expect(result).toContain('base-class')
      expect(result).toContain('conditional-class')
      expect(result).not.toContain('hidden-class')
    })

    it('should merge conflicting Tailwind classes correctly', () => {
      // twMerge should keep the last conflicting class
      const result = cn('px-4', 'px-8')
      expect(result).toBe('px-8')
    })

    it('should handle arrays of classes', () => {
      const result = cn(['flex', 'items-center'], 'justify-between')
      expect(result).toContain('flex')
      expect(result).toContain('items-center')
      expect(result).toContain('justify-between')
    })

    it('should handle objects with conditional classes', () => {
      const result = cn({
        'text-red-500': true,
        'text-blue-500': false,
        'font-bold': true
      })
      expect(result).toContain('text-red-500')
      expect(result).toContain('font-bold')
      expect(result).not.toContain('text-blue-500')
    })

    it('should handle undefined and null values', () => {
      const result = cn('base', undefined, null, 'other')
      expect(result).toContain('base')
      expect(result).toContain('other')
    })

    it('should handle empty input', () => {
      const result = cn()
      expect(result).toBe('')
    })

    it('should handle empty strings', () => {
      const result = cn('', 'valid-class', '')
      expect(result).toBe('valid-class')
    })

    it('should merge responsive classes correctly', () => {
      const result = cn('text-sm', 'md:text-base', 'lg:text-lg')
      expect(result).toContain('text-sm')
      expect(result).toContain('md:text-base')
      expect(result).toContain('lg:text-lg')
    })

    it('should handle hover and focus states', () => {
      const result = cn('hover:bg-blue-500', 'focus:ring-2')
      expect(result).toContain('hover:bg-blue-500')
      expect(result).toContain('focus:ring-2')
    })

    it('should merge conflicting responsive classes', () => {
      const result = cn('md:px-4', 'md:px-8')
      expect(result).toBe('md:px-8')
    })

    it('should handle complex combinations', () => {
      const isActive = true
      const isDisabled = false
      const result = cn(
        'base-button',
        'px-4 py-2',
        isActive && 'active',
        isDisabled && 'disabled',
        { 'font-bold': true }
      )
      expect(result).toContain('base-button')
      expect(result).toContain('px-4')
      expect(result).toContain('py-2')
      expect(result).toContain('active')
      expect(result).toContain('font-bold')
      expect(result).not.toContain('disabled')
    })

    it('should handle dark mode classes', () => {
      const result = cn('bg-white', 'dark:bg-gray-800')
      expect(result).toContain('bg-white')
      expect(result).toContain('dark:bg-gray-800')
    })

    it('should merge conflicting color classes', () => {
      const result = cn('text-red-500', 'text-blue-500')
      expect(result).toBe('text-blue-500')
    })

    it('should preserve arbitrary values', () => {
      const result = cn('w-[200px]', 'h-[100px]')
      expect(result).toContain('w-[200px]')
      expect(result).toContain('h-[100px]')
    })
  })
})
