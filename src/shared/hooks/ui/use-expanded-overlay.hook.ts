// Hook for managing expanded overlay behavior
import { useEffect } from "react"

interface UseExpandedOverlayOptions {
  isExpanded: boolean
  onCollapse: () => void
}

export function useExpandedOverlay({ isExpanded, onCollapse }: UseExpandedOverlayOptions) {
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
