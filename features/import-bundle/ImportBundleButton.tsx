"use client"

import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Upload, Trash2, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LocalBundleService } from "@/src/infrastructure/fhir/services/local-bundle.service"

export function ImportBundleButton() {
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [active, setActive] = useState(() => LocalBundleService.hasData())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const text = await file.text()
      const bundle = JSON.parse(text)
      if (bundle.resourceType !== 'Bundle') {
        throw new Error('Not a FHIR Bundle (resourceType must be "Bundle")')
      }
      const parsed = LocalBundleService.parse(bundle)
      if (!parsed) {
        throw new Error('Bundle must contain at least one Patient resource')
      }
      LocalBundleService.save(bundle)
      setActive(true)
      await queryClient.invalidateQueries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse bundle')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleClear = async () => {
    LocalBundleService.clear()
    setActive(false)
    setError(null)
    await queryClient.invalidateQueries()
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {active && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            <Database className="h-3 w-3" />
            Local data
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          title="Import FHIR Bundle JSON"
        >
          <Upload className="h-3 w-3" />
          {loading ? 'Importing…' : 'Import'}
        </Button>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
            onClick={handleClear}
            title="Clear local data"
          >
            <Trash2 className="h-3 w-3" />
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
