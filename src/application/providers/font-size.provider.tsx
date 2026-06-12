"use client"

// Global font-size control. Scales the root <html> font-size, so every
// rem-based size (Tailwind text-*, spacing) scales proportionally — a
// readable "zoom" the viewport meta (user-scalable=no) otherwise blocks.

import { createContext, useContext, useEffect, useState, ReactNode } from "react"

export type FontSize = "xs" | "sm" | "base" | "lg" | "xl"

// Root px per level (browser default is 16). Kept modest so layout holds.
const FONT_SIZE_PX: Record<FontSize, string> = {
  xs: "12px",
  sm: "14px",
  base: "16px",
  lg: "18px",
  xl: "20px",
}

const STORAGE_KEY = "font-size"

interface FontSizeContextType {
  fontSize: FontSize
  setFontSize: (size: FontSize) => void
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined)

function apply(size: FontSize) {
  document.documentElement.style.fontSize = FONT_SIZE_PX[size]
}

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>("base")

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as FontSize | null
    if (stored && stored in FONT_SIZE_PX) {
      setFontSizeState(stored)
      apply(stored)
    }
  }, [])

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size)
    localStorage.setItem(STORAGE_KEY, size)
    apply(size)
  }

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </FontSizeContext.Provider>
  )
}

export function useFontSize() {
  const context = useContext(FontSizeContext)
  if (context === undefined) {
    throw new Error("useFontSize must be used within a FontSizeProvider")
  }
  return context
}
