"use client"

import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutList, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import type {
  MedicalSummaryCardDirection,
  MedicalSummaryCardId,
} from "../hooks/useMedicalSummaryCardLayout"

export interface MedicalSummaryCardLayoutItem {
  id: MedicalSummaryCardId
  label: string
  description?: string
}

interface MedicalSummaryCardLayoutManagerLabels {
  title: string
  description: string
  reset: string
  visible: string
  hidden: string
  moveUp: string
  moveDown: string
  showCard: string
  hideCard: string
  empty: string
}

interface MedicalSummaryCardLayoutManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: MedicalSummaryCardLayoutItem[]
  hiddenIds: ReadonlySet<MedicalSummaryCardId>
  labels: MedicalSummaryCardLayoutManagerLabels
  onMove: (
    id: MedicalSummaryCardId,
    direction: MedicalSummaryCardDirection,
    scopeIds: MedicalSummaryCardId[],
  ) => void
  onReset: () => void
  onVisibleChange: (id: MedicalSummaryCardId, visible: boolean) => void
}

export function MedicalSummaryCardLayoutManager({
  open,
  onOpenChange,
  items,
  hiddenIds,
  labels,
  onMove,
  onReset,
  onVisibleChange,
}: MedicalSummaryCardLayoutManagerProps) {
  const scopeIds = items.map((item) => item.id)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b bg-muted/20 px-4 py-3 pr-10">
          <SheetTitle className="flex items-center gap-2 text-base">
            <LayoutList className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            {labels.title}
          </SheetTitle>
          <SheetDescription className="text-xs">{labels.description}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
          <div className="space-y-2 p-3">
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                {labels.empty}
              </div>
            ) : (
              items.map((item, index) => {
                const visible = !hiddenIds.has(item.id)
                return (
                  <div
                    key={item.id}
                    data-testid={`medical-summary-card-layout-row-${item.id}`}
                    className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm"
                  >
                    <div className="flex items-start gap-2.5">
                      <Switch
                        data-testid={`medical-summary-card-layout-toggle-${item.id}`}
                        checked={visible}
                        onCheckedChange={(checked) => onVisibleChange(item.id, checked)}
                        className="mt-0.5 scale-90"
                        aria-label={visible ? labels.hideCard : labels.showCard}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {visible ? (
                            <Eye className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">
                            {visible ? labels.visible : labels.hidden}
                          </span>
                        </div>
                        {item.description ? (
                          <p className="mt-0.5 line-clamp-2 text-[0.6875rem] leading-snug text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          data-testid={`medical-summary-card-layout-move-up-${item.id}`}
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onMove(item.id, "up", scopeIds)}
                          disabled={index === 0}
                          title={labels.moveUp}
                          aria-label={labels.moveUp}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          data-testid={`medical-summary-card-layout-move-down-${item.id}`}
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onMove(item.id, "down", scopeIds)}
                          disabled={index === items.length - 1}
                          title={labels.moveDown}
                          aria-label={labels.moveDown}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>

        <div className="border-t bg-background px-3 py-2">
          <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            {labels.reset}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
