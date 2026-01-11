/**
 * Resizable Layout Hook
 * 
 * Manages resizable split panel layout with drag functionality.
 * Reusable across any split-panel layout in the application.
 * 
 * @param initialWidth - Initial width percentage (default: 50)
 * @param minWidth - Minimum width percentage (default: 30)
 * @param maxWidth - Maximum width percentage (default: 70)
 */
import { useState, useRef, useEffect, useCallback } from "react"

interface UseResizableLayoutOptions {
  initialWidth?: number
  minWidth?: number
  maxWidth?: number
}

export function useResizableLayout(options: UseResizableLayoutOptions = {}) {
  const {
    initialWidth = 50,
    minWidth = 30,
    maxWidth = 70
  } = options

  const [leftWidth, setLeftWidth] = useState(initialWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return
      
      const container = containerRef.current
      const rect = container.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100
      
      // Limit between min and max
      if (newLeftWidth >= minWidth && newLeftWidth <= maxWidth) {
        setLeftWidth(newLeftWidth)
      }
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
    }
    
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, minWidth, maxWidth])

  return {
    leftWidth,
    isDragging,
    containerRef,
    handleMouseDown,
  }
}
