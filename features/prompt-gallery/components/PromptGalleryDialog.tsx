/**
 * Prompt Gallery Dialog Component
 * Main dialog for browsing and selecting prompts
 */

import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X, Library, User } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertCircle, Loader2 } from 'lucide-react'
import { PromptFilters } from './PromptFilters'
import { PromptCard } from './PromptCard'
import { PromptPreviewDialog } from './PromptPreviewDialog'
import { SharePromptDialog } from './SharePromptDialog'
import { usePromptGallery } from '../hooks/usePromptGallery'
import type { SharedPrompt, PromptType } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'

interface PromptGalleryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: 'chat' | 'insight' | 'all'
  onSelectPrompt: (prompt: SharedPrompt, useAs?: 'chat' | 'insight') => void
}

export function PromptGalleryDialog({
  open,
  onOpenChange,
  mode = 'all',
  onSelectPrompt,
}: PromptGalleryDialogProps) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all')
  const [previewPrompt, setPreviewPrompt] = useState<SharedPrompt | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [sharePrompt, setSharePrompt] = useState<SharedPrompt | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest')
  const itemsPerPage = 8

  // Initialize filter based on mode
  const initialFilter = useMemo(() => {
    if (mode === 'chat') return { type: 'chat' as PromptType }
    if (mode === 'insight') return { type: 'insight' as PromptType }
    return {}
  }, [mode])

  // Hook for "All Templates"
  const allPromptsHook = usePromptGallery({ initialFilter })
  
  // Hook for "My Templates" (only if user is logged in)
  const myPromptsHook = usePromptGallery({ 
    initialFilter,
    userId: user?.uid 
  })

  // Select the appropriate hook based on active tab
  const {
    prompts,
    loading,
    error,
    filter,
    updateFilter,
    clearFilter,
    trackUsage,
    fetchPrompts,
  } = activeTab === 'my' ? myPromptsHook : allPromptsHook

  // Refresh prompts when dialog opens or tab changes
  useEffect(() => {
    if (open) {
      fetchPrompts()
    }
  }, [open, activeTab])

  // Reset to "All" tab and page 1 when switching tabs
  const handleTabChange = (value: string) => {
    setActiveTab(value as 'all' | 'my')
    setCurrentPage(1)
  }

  const handlePreview = (prompt: SharedPrompt) => {
    setPreviewPrompt(prompt)
    setPreviewOpen(true)
  }

  const handleUse = (prompt: SharedPrompt, useAs?: 'chat' | 'insight') => {
    onSelectPrompt(prompt, useAs)
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

  // Sort prompts
  const sortedPrompts = useMemo(() => {
    const sorted = [...prompts]
    if (sortBy === 'popular') {
      return sorted.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    }
    // Default: latest (already sorted by createdAt desc from Firestore)
    return sorted
  }, [prompts, sortBy])

  // Pagination
  const totalPages = Math.ceil(sortedPrompts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentPrompts = sortedPrompts.slice(startIndex, endIndex)

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

          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="all" className="flex items-center gap-2">
                <Library className="h-4 w-4" />
                所有範本
              </TabsTrigger>
              <TabsTrigger value="my" className="flex items-center gap-2" disabled={!user}>
                <User className="h-4 w-4" />
                我的範本
                {user && myPromptsHook.prompts.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {myPromptsHook.prompts.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="flex-1 flex flex-col gap-3 overflow-hidden mt-3">
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
            />

            {/* Active Filters & Results Count */}
            {(hasActiveFilters || prompts.length > 0) && !loading && (
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {prompts.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      共 {prompts.length} 個範本
                    </span>
                  )}
                  {filter.type && (
                    <Badge variant="secondary" className="text-xs">
                      {filter.type === 'chat' ? t.promptGallery.typeChat : t.promptGallery.typeInsight}
                      <X
                        className="ml-1 h-3 w-3 cursor-pointer"
                        onClick={() => handleFilterChange({ type: undefined })}
                      />
                    </Badge>
                  )}
                  {filter.category && (
                    <Badge variant="secondary" className="text-xs">
                      {t.promptGallery.categories[filter.category as keyof typeof t.promptGallery.categories]}
                      <X
                        className="ml-1 h-3 w-3 cursor-pointer"
                        onClick={() => handleFilterChange({ category: undefined })}
                      />
                    </Badge>
                  )}
                  {filter.specialty && (
                    <Badge variant="secondary" className="text-xs">
                      {t.promptGallery.specialties[filter.specialty as keyof typeof t.promptGallery.specialties]}
                      <X
                        className="ml-1 h-3 w-3 cursor-pointer"
                        onClick={() => handleFilterChange({ specialty: undefined })}
                      />
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { clearFilter(); setCurrentPage(1); }}
                      className="h-7 text-xs"
                    >
                      <X className="h-3 w-3 mr-1" />
                      清除篩選
                    </Button>
                  )}
                  <Select
                    value={sortBy}
                    onValueChange={(value) => { setSortBy(value as 'latest' | 'popular'); setCurrentPage(1); }}
                  >
                    <SelectTrigger className="w-[130px] h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">最新優先</SelectItem>
                      <SelectItem value="popular">熱門優先</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

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
                    <h3 className="text-lg font-medium">
                      {activeTab === 'my' ? '您還沒有分享任何範本' : t.promptGallery.noResults}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {activeTab === 'my' 
                        ? '開始分享您的第一個範本，讓其他使用者也能受益！' 
                        : t.promptGallery.noResultsDescription}
                    </p>
                    {activeTab === 'my' && (
                      <Button 
                        variant="outline" 
                        className="mt-4"
                        onClick={() => setShareOpen(true)}
                      >
                        分享第一個範本
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3 p-1">
                      {currentPrompts.map((prompt) => (
                        <PromptCard
                          key={prompt.id}
                          prompt={prompt}
                          onPreview={handlePreview}
                          currentUserId={user?.uid}
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
            </TabsContent>
          </Tabs>
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
      <SharePromptDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        initialTitle={sharePrompt?.title}
        initialPrompt={sharePrompt?.prompt}
        initialType={sharePrompt?.types[0] || 'chat'}
        onSuccess={fetchPrompts}
      />
    </>
  )
}
