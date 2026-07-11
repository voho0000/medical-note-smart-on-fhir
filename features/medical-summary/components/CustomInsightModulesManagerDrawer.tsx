"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sparkles } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { CustomInsightModulesManager } from "@/features/clinical-insights/components/CustomInsightModulesManager"

interface CustomInsightModulesManagerDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPanelId?: string
}

export function CustomInsightModulesManagerDrawer({
  open,
  onOpenChange,
  initialPanelId,
}: CustomInsightModulesManagerDrawerProps) {
  const { t } = useLanguage()
  const labels = t.medicalSummary

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b bg-muted/20 px-4 py-3 pr-10 sm:px-5">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-violet-500" />
            {labels.customManagerTitle}
          </SheetTitle>
          <SheetDescription className="text-xs">{labels.customManagerDescription}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
          <div className="p-3 sm:p-4">
            <CustomInsightModulesManager
              key={initialPanelId ?? "module-manager"}
              initialPanelId={initialPanelId}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
