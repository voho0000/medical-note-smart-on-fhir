/**
 * Prompt Preview Dialog Component
 * Shows detailed preview of a prompt
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
import { Calendar, TrendingUp, Share2, Trash2 } from 'lucide-react'
import type { SharedPrompt } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { deleteSharedPrompt } from '../services/prompt-gallery.service'
import { useState } from 'react'
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

interface PromptPreviewDialogProps {
  prompt: SharedPrompt | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUse: (prompt: SharedPrompt, useAs?: 'chat' | 'insight') => void
  onShare?: (prompt: SharedPrompt) => void
  onDelete?: () => void
}

export function PromptPreviewDialog({
  prompt,
  open,
  onOpenChange,
  onUse,
  onShare,
  onDelete,
}: PromptPreviewDialogProps) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  if (!prompt) return null

  const isAuthor = user?.uid && prompt.authorId === user.uid

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'chat':
        return t.promptGallery.typeChat
      case 'insight':
        return t.promptGallery.typeInsight
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

  const handleUse = () => {
    onUse(prompt)
    onOpenChange(false)
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false)
    setDeleting(true)
    try {
      await deleteSharedPrompt(prompt.id)
      onOpenChange(false)
      if (onDelete) {
        onDelete()
      }
    } catch (error) {
      console.error('刪除失敗:', error)
      alert('刪除失敗，請稍後再試')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] w-[90vw]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-xl">{prompt.title}</DialogTitle>
            <div className="flex gap-1">
              {prompt.types.map((type) => (
                <Badge key={type} variant="outline">{getTypeLabel(type)}</Badge>
              ))}
            </div>
          </div>
          {prompt.description && (
            <DialogDescription className="text-base">
              {prompt.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-4">
            {/* Metadata */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{getCategoryLabel(prompt.category)}</Badge>
              {prompt.specialty.map((spec) => (
                <Badge key={spec} variant="outline">
                  {t.promptGallery.specialties[spec as keyof typeof t.promptGallery.specialties] || spec}
                </Badge>
              ))}
            </div>

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
              {prompt.usageCount !== undefined && prompt.usageCount > 0 && (
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4" />
                  <span>
                    {t.promptGallery.usageCount}: {prompt.usageCount || 0}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>
                  {t.promptGallery.createdAt}: {formatDate(prompt.createdAt)}
                </span>
              </div>
            </div>

            {/* Prompt Content */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">{t.promptGallery.promptContent}</h4>
              <div className="rounded-lg bg-muted p-4">
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {prompt.prompt}
                </pre>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="flex w-full justify-between">
            <div>
              {isAuthor && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteClick}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleting ? '刪除中...' : '刪除'}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t.common.close}
              </Button>
              {prompt.types.length > 1 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button>
                      {t.promptGallery.use}
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {prompt.types.includes('chat') && (
                      <DropdownMenuItem onClick={() => { onUse(prompt, 'chat'); onOpenChange(false); }}>
                        使用為 Chat Template
                      </DropdownMenuItem>
                    )}
                    {prompt.types.includes('insight') && (
                      <DropdownMenuItem onClick={() => { onUse(prompt, 'insight'); onOpenChange(false); }}>
                        使用為 Clinical Insight
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button onClick={handleUse}>{t.promptGallery.use}</Button>
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
    </>
  )
}
