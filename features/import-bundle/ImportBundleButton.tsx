"use client"

import { useRef, useState } from "react"
import { Download, Trash2, Database, FlaskConical, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useImportBundle } from "./hooks/useImportBundle"
import { BundleFileInput, type BundleFileInputHandle } from "./components/BundleFileInput"

interface ImportBundleButtonProps {
  /**
   * When true, hide the text label on mobile (<640px) — only the
   * download icon shows. Used in the header where space is tight and
   * the button sits among other already-iconified controls.
   *
   * When false (default), the label is always visible — used in the
   * welcome onboarding screen where this is the primary CTA and
   * "匯入資料" needs to be unambiguous.
   */
  iconOnlyOnMobile?: boolean
}

export function ImportBundleButton({ iconOnlyOnMobile = false }: ImportBundleButtonProps = {}) {
  const fileRef = useRef<BundleFileInputHandle>(null)
  const { t } = useLanguage()
  const i18n = t.importBundle
  const { clear, loading, error, hasBundle, bundleIsActive, isDemo } = useImportBundle()
  // Clearing wipes the whole patient context in one click — confirm first
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {/* Data-source badge, only when the bundle is genuinely the data
            source — SMART context, if active, suppresses it so users aren't
            misled. Reads "示範資料" (green) for the bundled demo, "本地資料"
            (amber) for a real local import. The bundle's presence is also
            indicated by the Trash button below (which exits demo too). */}
        {bundleIsActive && (
          isDemo ? (
            // Demo badge doubles as the exit control — clicking it ends the demo
            // and returns to the welcome screen immediately (no confirm; demo
            // data is disposable). The trailing × signals it's dismissible.
            <button
              type="button"
              onClick={() => { void clear() }}
              disabled={loading}
              title={i18n.exitDemo}
              aria-label={i18n.exitDemo}
              className="group flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-200 disabled:opacity-50"
            >
              <FlaskConical className="h-3 w-3" />
              {i18n.demoData}
              <X className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
            </button>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Database className="h-3 w-3" />
              {i18n.localData}
            </span>
          )
        )}
        {/* Trash (with confirm) for a real imported bundle — placed right next
            to the 本地資料 badge it acts on, so "clear this data" is the
            intuitive click target. The demo uses its clickable badge × instead,
            so this is hidden in demo mode. */}
        {hasBundle && !isDemo && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive"
            onClick={() => setConfirmClearOpen(true)}
            title={i18n.clearTitle}
            aria-label={i18n.clearTitle}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={`h-9 gap-1.5 text-xs sm:text-sm ${
            iconOnlyOnMobile ? 'px-2 sm:px-3' : 'px-3'
          }`}
          onClick={() => fileRef.current?.open()}
          disabled={loading}
          title={i18n.importTitle}
          aria-label={i18n.button}
        >
          <Download className="h-3.5 w-3.5" />
          {/* In iconOnlyOnMobile mode the label hides below sm: — the
              header uses this. Without the flag the label always shows,
              which the welcome-screen CTA needs because it's the main
              call-to-action and shouldn't be ambiguous. */}
          <span className={iconOnlyOnMobile ? 'hidden sm:inline' : ''}>
            {loading ? i18n.importing : i18n.button}
          </span>
        </Button>
        <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{i18n.clearConfirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{i18n.clearConfirmDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { setConfirmClearOpen(false); clear() }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {i18n.clearTitle}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}
      <BundleFileInput ref={fileRef} testId="import-bundle-input" />
    </div>
  )
}
