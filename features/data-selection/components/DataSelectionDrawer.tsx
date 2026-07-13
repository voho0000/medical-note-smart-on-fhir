"use client"

import { Database } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DataSelectionFeature } from "../Feature"

export interface DataSelectionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  applyHint?: string
  modelId?: string
  fallbackModelId?: string
}

/**
 * Reusable host for the main AI clinical-data scope editor.
 *
 * The drawer owns presentation only. Selection state and clinical-data mapping
 * remain inside DataSelectionFeature/DataSelectionProvider, so any summary-like
 * surface can plug this in without duplicating scope logic or persistence.
 */
export function DataSelectionDrawer({
  open,
  onOpenChange,
  title,
  description,
  applyHint,
  modelId,
  fallbackModelId,
}: DataSelectionDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b bg-muted/20 px-4 py-3 pr-10 sm:px-5">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            {title}
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed">{description}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
          <div className="p-3 sm:p-4">
            <DataSelectionFeature
              modelId={modelId}
              fallbackModelId={fallbackModelId}
              showScopeDescription={false}
            />
          </div>
        </ScrollArea>

        {applyHint ? (
          <div className="border-t bg-background px-4 py-2.5 text-xs leading-relaxed text-muted-foreground sm:px-5">
            {applyHint}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
