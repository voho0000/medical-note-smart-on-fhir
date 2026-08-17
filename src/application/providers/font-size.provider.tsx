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

// Read directly rather than via useAudience(): this provider sits ABOVE
// AudienceProvider in the tree. AudienceProvider announces changes with
// AUDIENCE_CHANGED_EVENT so a mid-session switch re-evaluates the default.
const AUDIENCE_STORAGE_KEY = "medical-note-audience"
export const AUDIENCE_CHANGED_EVENT = "mediprisma:audience-changed"

function storedAudience(): "medical" | "patient" {
  try {
    return localStorage.getItem(AUDIENCE_STORAGE_KEY) === "patient" ? "patient" : "medical"
  } catch {
    return "medical"
  }
}

/**
 * Phone default when the user has expressed no preference.
 *
 * Clinicians get the smallest root so dense cumulative tables fit without
 * horizontal scrolling. Patients do NOT — they read prose, not pivot tables,
 * and a 12px root rendered the summary body at ~10px and disclaimers at ~7.5px
 * (audit C1). Keeping the normal 16px root is the accessible default for them.
 */
function phoneDefaultFor(audience: "medical" | "patient"): FontSize {
  return audience === "patient" ? "base" : "xs"
}

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
    const hasExplicitChoice = () => {
      const stored = localStorage.getItem(STORAGE_KEY) as FontSize | null
      return stored && stored in FONT_SIZE_PX ? stored : null
    }

    // No saved preference: pick a per-device default on a phone-width viewport
    // (<768, the app's md split). NOT persisted — re-evaluated each load, so
    // the same account on a desktop still gets the 16px base.
    const applyDeviceDefault = () => {
      const explicit = hasExplicitChoice()
      if (explicit) {
        // An explicit user choice always wins, on any device.
        setFontSizeState(explicit)
        apply(explicit)
        return
      }
      const size = typeof window !== "undefined" && window.innerWidth < 768
        ? phoneDefaultFor(storedAudience())
        : "base"
      setFontSizeState(size)
      apply(size)
    }

    applyDeviceDefault()
    window.addEventListener(AUDIENCE_CHANGED_EVENT, applyDeviceDefault)
    return () => window.removeEventListener(AUDIENCE_CHANGED_EVENT, applyDeviceDefault)
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
