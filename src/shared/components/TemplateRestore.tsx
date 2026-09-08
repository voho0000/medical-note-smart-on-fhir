"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useLanguage } from "@/src/application/providers/language.provider"

interface TemplateRestoreProps<T extends { id: string }> {
  storageKey: string
  scopeLabel: string
  items: T[]
  getDefaults: () => T[]
  nameKey: keyof T
  promptKey: keyof T
  onApply: (items: T[]) => Promise<boolean>
  disabled?: boolean
}

const TEMPLATE_BACKUP_CHANGE_EVENT = "mediprisma:template-backup-change"

function notifyBackupChange(storageKey: string) {
  window.dispatchEvent(new CustomEvent(TEMPLATE_BACKUP_CHANGE_EVENT, { detail: storageKey }))
}

function readValidBackup<T extends { id: string }>(
  storageKey: string,
  nameKey: keyof T,
  promptKey: keyof T,
): { version: 1; items: T[] } | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const backup = JSON.parse(raw)
    if (backup.version !== 1 || !Array.isArray(backup.items) || !backup.items.length ||
      !backup.items.every((item: T) => item && typeof item.id === "string" &&
        typeof item[nameKey] === "string" && typeof item[promptKey] === "string")) {
      return null
    }
    return backup
  } catch {
    return null
  }
}

/** Back up before a confirmed restore; keep the backup available for recovery. */
export function TemplateRestore<T extends { id: string }>({
  storageKey, scopeLabel, items, getDefaults, nameKey, promptKey, onApply, disabled,
}: TemplateRestoreProps<T>) {
  const { t } = useLanguage()
  const s = t.settings
  const resetButtonRef = useRef<HTMLButtonElement>(null)
  const pendingReplacementRef = useRef<T[] | null>(null)
  const busyRef = useRef(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasBackup, setHasBackup] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const refreshBackupAvailability = () => {
      setHasBackup(readValidBackup<T>(storageKey, nameKey, promptKey) !== null)
    }
    refreshBackupAvailability()
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) refreshBackupAvailability()
    }
    const handleLocalBackupChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === storageKey) refreshBackupAvailability()
    }
    window.addEventListener("storage", handleStorage)
    window.addEventListener(TEMPLATE_BACKUP_CHANGE_EVENT, handleLocalBackupChange)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(TEMPLATE_BACKUP_CHANGE_EVENT, handleLocalBackupChange)
    }
  }, [nameKey, promptKey, storageKey])

  const applyReplacement = async (replacement: T[], successMessage: string) => {
    try {
      if (!await onApply(replacement)) throw new Error("Template save failed")
      toast.success(successMessage, { id: storageKey })
      return true
    } catch {
      if (confirmOpen) setError(s.templateRestoreSaveError)
      else toast.error(s.templateRestoreSaveError, { id: storageKey })
      return false
    }
  }

  const restoreDefaults = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setIsSaving(true)
    setError("")
    try {
      if (!pendingReplacementRef.current) {
        const defaults = getDefaults()
        // Compare bundled fields only: account snapshots can contain timestamps.
        const alreadyDefault = items.length === defaults.length && defaults.every((item, index) => (
          Object.keys(item).every(key => item[key as keyof T] === items[index]?.[key as keyof T])
        ))
        // Repeated resets must not overwrite the pre-restore backup.
        if (!alreadyDefault) {
          window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, items }))
          setHasBackup(true)
          notifyBackupChange(storageKey)
        }
        pendingReplacementRef.current = defaults
      }
      if (await applyReplacement(pendingReplacementRef.current, s.templateRestoreSaved)) setConfirmOpen(false)
    } catch {
      setError(s.templateRestoreBackupError)
    } finally {
      busyRef.current = false
      setIsSaving(false)
    }
  }

  const recoverBackup = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setIsSaving(true)
    setError("")
    try {
      const backup = readValidBackup<T>(storageKey, nameKey, promptKey)
      if (!backup) {
        setHasBackup(false)
        toast.info(s.templateRestoreNoBackup, { id: storageKey })
        return
      }
      // JSON turns account timestamps into strings. Restore only the known
      // date metadata before passing an existing backup to the save adapters.
      const restored = backup.items.map((item: T) => {
        const template: Record<string, unknown> = { ...item }
        for (const field of ["createdAt", "updatedAt"]) {
          if (typeof template[field] !== "string") continue
          const date = new Date(template[field])
          if (!Number.isFinite(date.getTime())) throw new Error("Invalid template date")
          template[field] = date
        }
        return template as T
      })
      if (await applyReplacement(restored, s.templateRestoreRecovered)) {
        window.localStorage.removeItem(storageKey)
        setHasBackup(false)
        notifyBackupChange(storageKey)
      }
    } catch {
      toast.error(s.templateRestoreReadError, { id: storageKey })
    } finally {
      busyRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <section className="min-w-0 space-y-1" aria-label={s.templateRestoreTitle}>
      <div className="flex flex-wrap gap-1 sm:flex-col">
        <Button type="button" variant="ghost" className="min-h-11 justify-start whitespace-normal px-2 text-xs text-muted-foreground sm:min-h-8 sm:h-auto" ref={resetButtonRef} disabled={disabled || isSaving} onClick={() => { pendingReplacementRef.current = null; setError(""); setConfirmOpen(true) }}>
          {s.templateRestoreTitle}
        </Button>
        {hasBackup ? (
          <Button type="button" variant="ghost" className="min-h-11 justify-start whitespace-normal px-2 text-xs sm:min-h-8 sm:h-auto" disabled={disabled || isSaving} onClick={() => void recoverBackup()}>
            {s.templateRestoreRecover}
          </Button>
        ) : null}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={open => { if (!busyRef.current) setConfirmOpen(open) }}>
        <AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); resetButtonRef.current?.focus() }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{s.templateRestoreConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{scopeLabel} · {s.templateRestoreConfirmDesc}<br />{s.templateRestoreBackupHint}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={isSaving}>{s.templateRestoreKeep}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" disabled={isSaving} onClick={event => { event.preventDefault(); void restoreDefaults() }}>{isSaving ? s.saving : s.templateRestoreTitle}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
