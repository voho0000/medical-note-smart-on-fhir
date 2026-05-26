"use client"

import { useRef } from "react"
import { Download, Trash2, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useImportBundle } from "./hooks/useImportBundle"

export function ImportBundleButton() {
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
          className="h-8 sm:h-9 gap-1.5 px-3 text-xs sm:text-sm"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          title={i18n.importTitle}
        >
          <Download className="h-3.5 w-3.5" />
          {loading ? i18n.importing : i18n.button}
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
