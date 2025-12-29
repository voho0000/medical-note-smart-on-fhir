// app/page.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { PatientProvider } from "@/src/application/providers/patient.provider"
import { ClinicalDataProvider } from "@/src/application/providers/clinical-data.provider"
import { ApiKeyProvider } from "@/src/application/providers/api-key.provider"
import { LanguageProvider, useLanguage } from "@/src/application/providers/language.provider"
import { LanguageSwitcher } from "@/src/shared/components/LanguageSwitcher"
import ClinicalSummaryFeature from "@/src/layouts/LeftPanelLayout"
import { RightPanelFeature } from "@/src/layouts/RightPanelLayout"

function PageContent() {
  const { t } = useLanguage()
  const [leftWidth, setLeftWidth] = useState(50) // percentage
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  
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
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t.header.title}</h1>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="flex flex-1 gap-4 overflow-hidden p-4" ref={containerRef}>
        {/* Left Panel - Clinical Summary */}
        <section 
          className="min-h-0 overflow-y-auto"
          style={{ width: `${leftWidth}%` }}
        >
          <ClinicalSummaryFeature />
        </section>
        
        {/* Resizable Divider */}
        <div
          className="group relative flex w-2 shrink-0 cursor-col-resize items-center justify-center bg-border hover:bg-primary/30 active:bg-primary/50"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 -left-2 -right-2" />
          <div className="h-12 w-1 rounded-full bg-muted-foreground/30 group-hover:bg-primary/60" />
        </div>
        
        {/* Right Panel - Tabs (Medical Note / Data Selection) */}
        <section 
          className="min-h-0 overflow-y-auto"
          style={{ width: `${100 - leftWidth - 0.5}%` }}
        >
          <RightPanelFeature />
        </section>
      </main>
    </div>
  )
}

export default function Page() {
  return (
    <LanguageProvider>
      <ApiKeyProvider>
        <PatientProvider>
          <ClinicalDataProvider>
            <PageContent />
          </ClinicalDataProvider>
        </PatientProvider>
      </ApiKeyProvider>
    </LanguageProvider>
  )
}
