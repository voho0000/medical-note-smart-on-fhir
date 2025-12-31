// app/page.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { PatientProvider } from "@/src/application/providers/patient.provider"
import { ClinicalDataProvider } from "@/src/application/providers/clinical-data.provider"
import { ApiKeyProvider } from "@/src/application/providers/api-key.provider"
import { LanguageProvider, useLanguage } from "@/src/application/providers/language.provider"
import { ThemeProvider } from "@/src/application/providers/theme.provider"
import { LanguageSwitcher } from "@/src/shared/components/LanguageSwitcher"
import ClinicalSummaryFeature from "@/src/layouts/LeftPanelLayout"
import { RightPanelFeature } from "@/src/layouts/RightPanelLayout"

function PageContent() {
  const { t } = useLanguage()
  const [leftWidth, setLeftWidth] = useState(50) // percentage
  const [isDragging, setIsDragging] = useState(false)
  const [mobileView, setMobileView] = useState<'left' | 'right'>('left') // for mobile tab switching
  const [isLargeScreen, setIsLargeScreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Detect screen size on client side to avoid hydration mismatch
  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024)
    }
    
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])
  
  const handleMouseDown = () => {
    setIsDragging(true)
  }
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return
      
      const container = containerRef.current
      const rect = container.getBoundingClientRect()
      const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100
      
      // Limit between 30% and 70%
      if (newLeftWidth >= 30 && newLeftWidth <= 70) {
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
  }, [isDragging])
  
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-gradient-to-br from-blue-50/50 via-background to-purple-50/30">
      <header className="shrink-0 border-b bg-white/80 backdrop-blur-md px-3 py-3 sm:px-6 sm:py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl overflow-hidden">
              <img src="/icon.svg" alt="App Icon" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-base sm:text-xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{t.header.title}</h1>
          </div>
          <LanguageSwitcher />
        </div>
      </header>
      
      {/* Mobile Tab Switcher - Only visible on small screens */}
      <div className="lg:hidden flex border-b bg-white/80 backdrop-blur-md">
        <button
          onClick={() => setMobileView('left')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mobileView === 'left'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          {t.header.clinicalSummary || '臨床摘要'}
        </button>
        <button
          onClick={() => setMobileView('right')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mobileView === 'right'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          {t.header.features || '功能'}
        </button>
      </div>
      
      <main className="flex flex-1 flex-col lg:flex-row gap-3 sm:gap-6 overflow-hidden p-3 sm:p-6" ref={containerRef}>
        {/* Left Panel - Clinical Summary */}
        <section 
          className={`w-full lg:w-auto min-h-0 overflow-y-auto flex-1 lg:flex-initial ${
            mobileView === 'left' ? 'block' : 'hidden lg:block'
          }`}
          style={isLargeScreen ? { width: `${leftWidth}%` } : undefined}
        >
          <ClinicalSummaryFeature />
        </section>
        
        {/* Resizable Divider - Hidden on mobile */}
        <div
          className="hidden lg:flex group relative w-2 shrink-0 cursor-col-resize items-center justify-center rounded-full bg-border/60 transition-colors hover:bg-primary/20 active:bg-primary/30"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 -left-2 -right-2" />
          <div className="h-16 w-1 rounded-full bg-muted-foreground/20 transition-colors group-hover:bg-primary/50 group-active:bg-primary" />
        </div>
        
        {/* Right Panel - Tabs (Medical Note / Data Selection) */}
        <section 
          className={`w-full lg:w-auto min-h-0 overflow-y-auto flex-1 lg:flex-initial ${
            mobileView === 'right' ? 'block' : 'hidden lg:block'
          }`}
          style={isLargeScreen ? { width: `${100 - leftWidth - 0.5}%` } : undefined}
        >
          <RightPanelFeature />
        </section>
      </main>
    </div>
  )
}

export default function Page() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ApiKeyProvider>
          <PatientProvider>
            <ClinicalDataProvider>
              <PageContent />
            </ClinicalDataProvider>
          </PatientProvider>
        </ApiKeyProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
