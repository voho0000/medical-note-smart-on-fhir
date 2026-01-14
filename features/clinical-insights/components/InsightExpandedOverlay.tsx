// Insight Expanded Overlay Component
"use client"

import { Maximize2, Minimize2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useLanguage } from "@/src/application/providers/language.provider"

interface InsightExpandedOverlayProps {
  insightContent: React.ReactNode
  onCollapse: () => void
  title: string
}

export function InsightExpandedOverlay({ insightContent, onCollapse, title }: InsightExpandedOverlayProps) {
  const { t } = useLanguage()

  return (
    <>
      {/* Placeholder to maintain layout */}
      <Card className="flex h-full flex-col overflow-hidden opacity-50">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Maximize2 className="h-8 w-8 mr-2" />
          {t.common.maximize}
        </div>
      </Card>
      
      {/* Fullscreen overlay - click outside to close */}
      <div 
        className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
        onClick={onCollapse}
      >
        {/* Floating minimize button */}
        <button
          onClick={onCollapse}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shadow-md"
          title={t.common.minimize}
        >
          <Minimize2 className="h-5 w-5" />
        </button>
        
        {/* Title */}
        <div className="pt-4 px-6 text-center">
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        
        <div 
          className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 flex flex-col min-h-0"
          onClick={(e) => e.stopPropagation()}
        >
          {insightContent}
        </div>
      </div>
    </>
  )
}
