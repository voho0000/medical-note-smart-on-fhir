/**
 * Prompt Gallery Dialog Component
 * Main dialog for browsing and selecting prompts
 */

import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2 } from 'lucide-react'
import { PromptFilters } from './PromptFilters'
import { PromptCard } from './PromptCard'
import { PromptPreviewDialog } from './PromptPreviewDialog'
import { SharePromptDialog } from './SharePromptDialog'
import { usePromptGallery } from '../hooks/usePromptGallery'
import type { SharedPrompt, PromptType } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'

interface PromptGalleryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: 'chat' | 'insight' | 'all'
  onSelectPrompt: (prompt: SharedPrompt) => void
}

export function PromptGalleryDialog({
  open,
  onOpenChange,
  mode = 'all',
  onSelectPrompt,
}: PromptGalleryDialogProps) {
  const { t } = useLanguage()
  const [previewPrompt, setPreviewPrompt] = useState<SharedPrompt | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [sharePrompt, setSharePrompt] = useState<SharedPrompt | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 8

  // Refresh prompts when dialog opens
  useEffect(() => {
    if (open) {
      fetchPrompts()
    }
  }, [open])

  // Initialize filter based on mode
  const initialFilter = useMemo(() => {
    if (mode === 'chat') return { type: 'chat' as PromptType }
    if (mode === 'insight') return { type: 'insight' as PromptType }
    return {}
  }, [mode])

  const {
    prompts,
    loading,
    error,
    filter,
    updateFilter,
    clearFilter,
    trackUsage,
    fetchPrompts,
  } = usePromptGallery(initialFilter)

  const handlePreview = (prompt: SharedPrompt) => {
    setPreviewPrompt(prompt)
    setPreviewOpen(true)
  }

  const handleUse = (prompt: SharedPrompt) => {
    onSelectPrompt(prompt)
    trackUsage(prompt.id)
  }

  const handleShare = (prompt: SharedPrompt) => {
    setSharePrompt(prompt)
    setShareOpen(true)
  }

  const hasActiveFilters = !!(
    filter.searchQuery ||
    filter.type ||
    filter.category ||
    filter.specialty
  )

  // Pagination
  const totalPages = Math.ceil(prompts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentPrompts = prompts.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  const handleFilterChange = (newFilter: any) => {
    updateFilter(newFilter)
    setCurrentPage(1)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh] w-[85vw] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t.promptGallery.title}</DialogTitle>
            <DialogDescription>{t.promptGallery.description}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Filters */}
            <PromptFilters
              searchQuery={filter.searchQuery || ''}
              onSearchChange={(query) => handleFilterChange({ searchQuery: query })}
              selectedType={filter.type}
              onTypeChange={(type) => handleFilterChange({ type })}
              selectedCategory={filter.category}
              onCategoryChange={(category) => handleFilterChange({ category })}
              selectedSpecialty={filter.specialty}
              onSpecialtyChange={(specialty) => handleFilterChange({ specialty })}
              onClearFilters={() => { clearFilter(); setCurrentPage(1); }}
              hasActiveFilters={hasActiveFilters}
            />

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Results */}
            {!loading && !error && (
              <div className="flex-1 overflow-y-auto min-h-[400px]">
                {prompts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">{t.promptGallery.noResults}</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {t.promptGallery.noResultsDescription}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3 p-1">
                      {currentPrompts.map((prompt) => (
                        <PromptCard
                          key={prompt.id}
                          prompt={prompt}
                          onPreview={handlePreview}
                        />
                      ))}
                    </div>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 pt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm">
                          第 {currentPage} / {totalPages} 頁 ({prompts.length} 個範本)
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <PromptPreviewDialog
        prompt={previewPrompt}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onUse={handleUse}
        onShare={handleShare}
        onDelete={fetchPrompts}
      />

      {/* Share Dialog */}
      {sharePrompt && (
        <SharePromptDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          initialTitle={sharePrompt.title}
          initialPrompt={sharePrompt.prompt}
          initialType={sharePrompt.types[0] || 'chat'}
          onSuccess={fetchPrompts}
        />
      )}
    </>
  )
}
