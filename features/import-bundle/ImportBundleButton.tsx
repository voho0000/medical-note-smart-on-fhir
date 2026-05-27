"use client"

import { useRef } from "react"
import { Download, Trash2, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useImportBundle } from "./hooks/useImportBundle"

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
  const fileRef = useRef<HTMLInputElement>(null)
  const { t } = useLanguage()
  const i18n = t.importBundle
  const { importFile, clear, loading, error, hasBundle, bundleIsActive } = useImportBundle()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importFile(file)
    } catch {
      // error is captured in the hook's state; no extra handling needed.
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {/* "Local data" badge only when the bundle is genuinely the data
            source — SMART context, if active, suppresses the badge so users
            aren't misled. The bundle's presence is still indicated by the
            Trash button below. */}
        {bundleIsActive && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            <Database className="h-3 w-3" />
            {i18n.localData}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className={`h-8 sm:h-9 gap-1.5 text-xs sm:text-sm ${
            iconOnlyOnMobile ? 'px-2 sm:px-3' : 'px-3'
          }`}
          onClick={() => fileRef.current?.click()}
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
        {hasBundle && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9 text-destructive hover:text-destructive"
            onClick={clear}
            title={i18n.clearTitle}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
