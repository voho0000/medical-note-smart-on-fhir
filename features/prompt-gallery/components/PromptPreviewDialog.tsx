/**
 * Prompt Preview Dialog Component
 * Shows detailed preview of a prompt: the prompt text beside the author's
 * example output on desktop, stacked on phones. Bringing the prompt into the
 * workspace stays the single primary action; copy is secondary.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Calendar, TrendingUp, Trash2, Loader2, Copy } from 'lucide-react'
import type { PromptType, SharedPrompt } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { deleteSharedPrompt, loadSharedPromptContent } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { deleteTenantPrompt } from '@/features/prompt-gallery/services/tenant-prompts.service'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LoginRequiredDialog } from './LoginRequiredDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import { guidedPreviewEvents, GUIDED_PREVIEW_DIALOG_CLASSES } from '@/features/right-feature-tour/guided-preview'
import { coerceInsightOutputFormat } from '@/src/shared/constants/clinical-insights.constants'
import { getPromptSource } from '../constants/prompt-source'
import { useDesktopLayout } from '../hooks/useDesktopLayout'
import { formatPromptDate } from '../utils/prompt-filter.utils'
import { FavoriteButton } from './FavoriteButton'
import { PromptSourceBadge } from './PromptSourceBadge'

interface PromptPreviewDialogProps {
  prompt: SharedPrompt | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUse: (prompt: SharedPrompt, useAs?: PromptType) => void
  useMode?: PromptType | 'all'
  onShare?: (prompt: SharedPrompt) => void
  onDelete?: () => void
  guidedPreview?: boolean
  onRestoreFocus?: () => void
  isFavorite?: boolean
  onToggleFavorite?: (prompt: SharedPrompt) => void
  /** The gallery source is newer than the saved copy being previewed. */
  sourceUpdated?: boolean
  /** Viewer may retire this department template (owner/builder) even without authoring it. */
  canManage?: boolean
}

export function PromptPreviewDialog({
  prompt,
  open,
  onOpenChange,
  onUse,
  useMode = 'all',
  onDelete,
  guidedPreview = false,
  onRestoreFocus,
  isFavorite = false,
  onToggleFavorite,
  sourceUpdated = false,
  canManage = false,
}: PromptPreviewDialogProps) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const isDesktop = useDesktopLayout()
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ prompt: SharedPrompt; useAs?: PromptType } | null>(null)
  const [content, setContent] = useState<{ source: SharedPrompt; value?: SharedPrompt; error?: boolean }>()
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    if (open && prompt?.body) {
      loadSharedPromptContent(prompt).then(
        value => { if (active) setContent({ source: prompt, value }) },
        () => { if (active) setContent({ source: prompt, error: true }) },
      )
    }
    return () => { active = false }
  }, [open, prompt, retry])

  if (!prompt) return null
  const resolved = prompt.body ? (content?.source === prompt ? content.value : undefined) : prompt
  const contentError = content?.source === prompt && content.error && !resolved

  const isAuthor = !!user?.uid && prompt.authorId === user.uid
  const canDelete = isAuthor || (!!prompt.tenantId && canManage)
  const source = getPromptSource(prompt, user?.uid)
  const isPatientOnly = prompt.audience.includes('patient') && !prompt.audience.includes('medical')
  const outputFormat = coerceInsightOutputFormat(prompt.outputFormat)
  const outputFormatLabel = outputFormat === 'plain-text'
    ? t.settings.outputFormatPlain
    : outputFormat === 'html'
      ? t.settings.outputFormatHtml
      : t.settings.outputFormatMarkdown

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'chat':
        return t.promptGallery.typeChat
      case 'summary':
        return t.promptGallery.typeSummary
      default:
        return type
    }
  }

  const getCategoryLabel = (category: string) => {
    return t.promptGallery.categories[category as keyof typeof t.promptGallery.categories] || category
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date)
  }

  const handleUse = (useAs?: PromptType) => {
    if (guidedPreview || !resolved) return
    // Check if user is logged in
    if (!user) {
      // Store the pending action and show login dialog
      setPendingAction({ prompt: resolved, useAs })
      setShowLoginDialog(true)
      return
    }

    // User is logged in, proceed with the action
    onUse(resolved, useAs)
    onOpenChange(false)
  }

  const handleLoginSuccess = () => {
    if (guidedPreview) return
    // Execute the pending action after successful login
    if (pendingAction) {
      onUse(pendingAction.prompt, pendingAction.useAs)
      setPendingAction(null)
      onOpenChange(false)
    }
  }

  const handleCopy = async () => {
    if (guidedPreview || !resolved) return
    try {
      await navigator.clipboard.writeText(resolved.prompt)
      toast.success(t.common.copied)
    } catch {
      toast.error(t.promptGallery.shareError)
    }
  }

  const handleDeleteClick = () => {
    if (guidedPreview) return
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    if (guidedPreview) return
    setShowDeleteConfirm(false)
    setDeleting(true)
    setDeleteError(null)
    try {
      if (prompt.tenantId) await deleteTenantPrompt(prompt.id)
      else await deleteSharedPrompt(prompt.id)
      onOpenChange(false)
      if (onDelete) {
        onDelete()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t.promptGallery.deleteErrorMessage
      setDeleteError(errorMessage)
    } finally {
      setDeleting(false)
    }
  }

  const promptContent = (
    <div className="space-y-2">
      <h4 className="font-medium text-sm">{t.promptGallery.promptContent}</h4>
      <div className="rounded-lg bg-muted p-4">
        {contentError ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>{t.promptGallery.contentLoadError}</p>
            <Button variant="outline" onClick={() => { setContent(undefined); setRetry(value => value + 1) }}>{t.promptGallery.retry}</Button>
          </div>
        ) : resolved ? (
          <pre className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm font-mono">{resolved.prompt}</pre>
        ) : <div role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t.common.loading}</div>}
      </div>
    </div>
  )

  const exampleOutput = (
    <div className="space-y-2">
      <h4 className="font-medium text-sm">{t.promptGallery.exampleOutputLabel}</h4>
      {prompt.exampleOutput ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <pre className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{prompt.exampleOutput}</pre>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t.promptGallery.noExampleOutput}</p>
          <p className="mt-1">{t.promptGallery.noExampleOutputDesc}</p>
        </div>
      )}
    </div>
  )

  const metadata = (
    <>
      {/* Metadata */}
      {!isPatientOnly && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{getCategoryLabel(prompt.category)}</Badge>
          {prompt.specialty.map((spec) => (
            <Badge key={spec} variant="outline">
              {t.promptGallery.specialties[spec as keyof typeof t.promptGallery.specialties] || spec}
            </Badge>
          ))}
        </div>
      )}

      {/* Tags */}
      {prompt.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {prompt.tags.map((tag) => (
            <span key={tag} className="text-sm text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {(prompt.outputFormat || prompt.types.includes('summary')) && (
        <dl className="flex flex-wrap gap-x-2 text-sm">
          <dt className="text-muted-foreground">{t.promptGallery.outputFormatLabel}</dt>
          <dd>{outputFormatLabel}</dd>
        </dl>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        {!prompt.isAnonymous && prompt.authorName && (
          <div className="flex items-center gap-1">
            <span>作者：{prompt.authorName}</span>
          </div>
        )}
        {prompt.isAnonymous && (
          <div className="flex items-center gap-1">
            <span>作者：匿名</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <TrendingUp className="h-4 w-4" />
          <span>
            {t.promptGallery.usageCount}: {prompt.usageCount || 0}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          <span>
            {t.promptGallery.createdAt}: {formatDate(prompt.createdAt)}
          </span>
        </div>
      </div>
    </>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!guidedPreview) onOpenChange(next) }} modal={!guidedPreview}>
      <DialogContent
        data-tour="gallery-preview"
        className={cn("flex min-w-0 max-w-5xl max-h-[90vh] w-[calc(100vw-2rem)] flex-col overflow-hidden", guidedPreview && GUIDED_PREVIEW_DIALOG_CLASSES)}
        {...guidedPreviewEvents(guidedPreview)}
        onCloseAutoFocus={(event) => {
          if (guidedPreview) event.preventDefault()
          else if (onRestoreFocus) { event.preventDefault(); onRestoreFocus() }
        }}
      >
        <DialogHeader className="min-w-0 shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-6">
            <div className="flex min-w-0 items-center gap-2">
              <DialogTitle className="min-w-0 break-words text-xl">{prompt.title}</DialogTitle>
              {onToggleFavorite && (
                <FavoriteButton active={isFavorite} disabled={guidedPreview} tooltip={false} onToggle={() => onToggleFavorite(prompt)} />
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {prompt.types.map((type) => (
                <Badge key={type} variant="outline">{getTypeLabel(type)}</Badge>
              ))}
            </div>
          </div>
          <DialogDescription className={prompt.description ? "text-base [overflow-wrap:anywhere]" : "sr-only"}>
            {prompt.description || t.promptGallery.promptDetails}
          </DialogDescription>
          {/* Source is secondary information: it says where the prompt comes from, not that saving it grants editing. */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <PromptSourceBadge source={source} tenantName={prompt.tenantName} />
            {sourceUpdated && (
              <Badge className="h-4 shrink-0 border-0 bg-accent px-1.5 py-0 text-[0.5625rem] text-accent-foreground" title={t.promptGallery.sourceUpdatedHint}>
                {t.promptGallery.sourceUpdated}
              </Badge>
            )}
            <span className="tabular-nums">{t.promptGallery.updatedAt} {formatPromptDate(prompt.updatedAt)}</span>
            {isFavorite && (
              <>
                <span aria-hidden="true">·</span>
                <span>{sourceUpdated ? t.promptGallery.sourceUpdatedHint : t.promptGallery.savedCopyHint}</span>
              </>
            )}
          </div>
        </DialogHeader>

        {isDesktop ? (
          <div className="grid min-h-0 min-w-0 w-full shrink grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4">
            <ScrollArea viewportProps={{ tabIndex: 0, role: 'region', 'aria-label': t.promptGallery.promptContent }} className="h-[55vh] min-h-0 min-w-0 pr-4 [&_[data-slot=scroll-area-viewport]>div]:!block">
              <div className="min-w-0 space-y-4">
                {metadata}
                {promptContent}
              </div>
            </ScrollArea>
            <ScrollArea viewportProps={{ tabIndex: 0, role: 'region', 'aria-label': t.promptGallery.exampleOutputLabel }} className="h-[55vh] min-h-0 min-w-0 pr-4 [&_[data-slot=scroll-area-viewport]>div]:!block">
              <div className="min-w-0">{exampleOutput}</div>
            </ScrollArea>
          </div>
        ) : (
          <ScrollArea viewportProps={{ tabIndex: 0, role: 'region', 'aria-label': t.promptGallery.promptContent }} className="h-[50vh] min-h-0 min-w-0 w-full shrink pr-4 [&_[data-slot=scroll-area-viewport]>div]:!block">
            <div className="min-w-0 space-y-4">
              {metadata}
              {promptContent}
              {exampleOutput}
            </div>
          </ScrollArea>
        )}

        {deleteError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {deleteError}
          </div>
        )}

        <DialogFooter data-tour="gallery-preview-actions" className="min-w-0 shrink-0">
          <div className="flex w-full flex-wrap justify-between gap-2">
            <div>
              {canDelete && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteClick}
                  disabled={guidedPreview || deleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleting ? t.common.deleting : t.common.delete}
                </Button>
              )}
            </div>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t.common.close}
              </Button>
              <Button variant="outline" disabled={guidedPreview || !resolved} onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-2" />
                {t.promptGallery.copyPrompt}
              </Button>
              {useMode === 'all' && prompt.types.length > 1 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button disabled={guidedPreview || !resolved}>
                      {t.promptGallery.use}
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {prompt.types.includes('chat') && (
                      <DropdownMenuItem onClick={() => handleUse('chat')}>
                        {t.promptGallery.useInChat}
                      </DropdownMenuItem>
                    )}
                    {prompt.types.includes('summary') && (
                      <DropdownMenuItem onClick={() => handleUse('summary')}>
                        {t.promptGallery.addToSummary}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button disabled={guidedPreview || !resolved} onClick={() => handleUse(useMode === 'all' ? prompt.types[0] : useMode)}>
                  {useMode === 'chat'
                    ? t.promptGallery.useInChat
                    : useMode === 'summary'
                      ? t.promptGallery.addToSummary
                      : t.promptGallery.use}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除這個 Prompt 嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作無法復原。刪除後，這個 Prompt 將永久從範本庫中移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              確定刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Login Required Dialog */}
      <LoginRequiredDialog
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        title={t.promptGallery.usePromptLoginRequired}
        description={t.promptGallery.usePromptLoginDesc}
        onLoginSuccess={handleLoginSuccess}
      />
    </>
  )
}
