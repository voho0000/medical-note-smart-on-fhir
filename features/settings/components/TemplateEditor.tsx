// Chat Template Editor
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowDown,
  ArrowUp,
  Keyboard,
  Lock,
  Share2,
  Star,
  Trash2,
} from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { LoginRequiredDialog } from "@/features/prompt-gallery/components/LoginRequiredDialog"

interface Template {
  id: string
  label: string
  content: string
  shortcut?: string
}

interface TemplateEditorProps {
  template: Template
  index: number
  canRemove: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  isDefault?: boolean
  onUpdate: (id: string, updates: Partial<Template>) => void
  onRemove: (id: string) => void
  onMove: (id: string, direction: "up" | "down") => void
  onShare?: (template: Template) => void
  onSetAsDefault?: (id: string) => void
}

export function TemplateEditor({
  template,
  index,
  canRemove,
  canMoveUp,
  canMoveDown,
  isDefault,
  onUpdate,
  onRemove,
  onMove,
  onShare,
  onSetAsDefault,
}: TemplateEditorProps) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [showLoginDialog, setShowLoginDialog] = useState(false)

  const handleShare = () => {
    if (!user) {
      setShowLoginDialog(true)
      return
    }
    onShare?.(template)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {template.label || `${t.settings.template} ${index + 1}`}
            </p>
            {isDefault ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-medium text-primary">
                <Star className="h-3 w-3 fill-current" />
                {t.settings.defaultTemplate}
              </span>
            ) : null}
            {template.shortcut ? (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[0.625rem] text-muted-foreground">
                /{template.shortcut}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            {t.settings.template} {index + 1}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => onMove(template.id, "up")} disabled={!canMoveUp} aria-label={t.settings.moveUp} title={t.settings.moveUp}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => onMove(template.id, "down")} disabled={!canMoveDown} aria-label={t.settings.moveDown} title={t.settings.moveDown}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          {onShare && template.content.trim() ? (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={handleShare} aria-label={t.promptGallery.sharePrompt} title={t.promptGallery.sharePrompt}>
              {user ? <Share2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </Button>
          ) : null}
          {canRemove ? (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => onRemove(template.id)} aria-label={t.settings.remove} title={t.settings.remove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-1.5">
          <label htmlFor={`template-label-${template.id}`} className="text-xs font-medium text-foreground">
            {t.settings.label}
          </label>
          <Input id={`template-label-${template.id}`} value={template.label} onChange={(event) => onUpdate(template.id, { label: event.target.value })} placeholder={t.settings.labelPlaceholder} className="h-9" />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`template-shortcut-${template.id}`} className="text-xs font-medium text-foreground">
              {t.settings.shortcut}
            </label>
            <span className="inline-flex items-center gap-1 text-[0.625rem] text-muted-foreground">
              <Keyboard className="h-3 w-3" />
              /{template.shortcut || "…"}
            </span>
          </div>
          <Input
            id={`template-shortcut-${template.id}`}
            value={template.shortcut ?? ""}
            onChange={(event) => onUpdate(template.id, { shortcut: event.target.value.replace(/[^\w-]/g, "").toLowerCase() })}
            placeholder={t.settings.shortcutPlaceholder}
            className="h-9 font-mono"
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`template-content-${template.id}`} className="text-xs font-medium text-foreground">
              {t.settings.prompt}
            </label>
            <span className="text-[0.625rem] tabular-nums text-muted-foreground">{template.content.length}</span>
          </div>
          <Textarea id={`template-content-${template.id}`} value={template.content} onChange={(event) => onUpdate(template.id, { content: event.target.value })} placeholder={t.settings.promptPlaceholder} className="min-h-[160px] resize-y text-sm leading-relaxed" />
        </div>

        {onSetAsDefault && !isDefault ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/10 px-3 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">{t.settings.setAsDefault}</p>
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{t.settings.defaultChatTemplateDesc}</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs" onClick={() => onSetAsDefault(template.id)}>
              <Star className="h-3.5 w-3.5" />
              {t.settings.setAsDefault}
            </Button>
          </div>
        ) : null}
      </div>

      <LoginRequiredDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />
    </div>
  )
}
