/**
 * Responsive View Hook
 * 
 * Manages responsive view state for mobile/desktop layouts.
 * Detects screen size and provides mobile view switching functionality.
 * 
 * @param breakpoint - Screen width breakpoint in pixels (default: 1024)
 */
import { useState, useEffect } from "react"

export function useResponsiveView<T extends string>(
  initialView: T,
  breakpoint: number = 1024
) {
  const [mobileView, setMobileView] = useState<T>(initialView)
  const [isLargeScreen, setIsLargeScreen] = useState(false)

  // Detect screen size on client side to avoid hydration mismatch
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= breakpoint)
    }
    
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [breakpoint])

  return {
    mobileView,
    setMobileView,
    isLargeScreen,
  }
}
