// Keyboard Shortcuts Hook
import { useEffect } from 'react'

export function useKeyboardShortcuts(
  isExpanded: boolean,
  onCollapse: () => void
) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        onCollapse()
      }
    }
    
    if (isExpanded) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isExpanded, onCollapse])
}
