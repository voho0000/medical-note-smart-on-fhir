// Wrapper for the right-panel detail slot: a header (title + ✕ back-to-AI) over
// a scrollable body. Rendered in the right <section> when a left-panel card has
// pushed its detail rightward (see RightDetailProvider).
"use client"

import type { ReactNode } from "react"
import { ChevronLeft } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"

export function RightDetailPane({
  title,
  onClose,
  children,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useLanguage()
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          title={t.common.close}
          aria-label={t.common.close}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t.common.close}
        </button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  )
}
