"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertCircle, CheckCircle2, CloudUpload, HardDrive, Loader2, Sparkles } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { CustomInsightModulesManager } from "@/features/clinical-insights/components/CustomInsightModulesManager"
import { AuthDialog } from "@/features/auth/components/AuthDialog"

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
  const { t, locale } = useLanguage()
  const { user } = useAuth()
  const { isLoading, lastSavedAt, savePanels, syncStatus } = useClinicalInsightsConfig()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const labels = t.medicalSummary
  const savedAtLabel = lastSavedAt
    ? `${t.settings.customTemplateSyncSaved} · ${lastSavedAt.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    })}`
    : t.settings.customTemplateSyncSaved

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && user && syncStatus === "dirty") void savePanels()
    onOpenChange(nextOpen)
  }

  const accountSyncStatus = (() => {
    if (isLoading || syncStatus === "idle") {
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t.settings.loadingCustomSummaryTemplates}
        </span>
      )
    }
    if (syncStatus === "dirty") {
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
          {t.settings.customTemplateSyncDirty}
        </span>
      )
    }
    if (syncStatus === "saving") {
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t.settings.customTemplateSyncSaving}
        </span>
      )
    }
    if (syncStatus === "error") {
      return (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5 text-destructive">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {t.settings.customTemplateSyncError}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void savePanels()}
          >
            {t.settings.customTemplateRetrySync}
          </Button>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {savedAtLabel}
      </span>
    )
  })()

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
          <SheetHeader className="border-b bg-muted/20 px-4 py-3 pr-10 sm:px-5 sm:pr-12">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-violet-500 dark:text-violet-300" />
                  {labels.customManagerTitle}
                </SheetTitle>
                <SheetDescription className="mt-1 text-xs">{labels.customManagerDescription}</SheetDescription>
              </div>
              <div
                role="status"
                aria-live="polite"
                className="flex min-h-8 shrink-0 items-center text-xs sm:justify-end"
              >
                {user ? accountSyncStatus : (
                  <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground">
                    <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.settings.customTemplateGuestStatus}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-8 px-1 text-xs"
                      onClick={() => setShowAuthDialog(true)}
                    >
                      {t.settings.customTemplateGuestSignIn}
                    </Button>
                  </span>
                )}
              </div>
            </div>
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
      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </>
  )
}
