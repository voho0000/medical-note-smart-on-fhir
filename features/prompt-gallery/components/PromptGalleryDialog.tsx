/**
 * Prompt Gallery Dialog Component
 * Main dialog for browsing and selecting prompts.
 *
 * Entries: all / favorites / mine / department / system. Favorites are a
 * cross-source collection of saved copies (usePromptFavorites), not a source;
 * the department tab appears only for accounts with an active membership. The list
 * is a sortable table on desktop and cards on phones, and it scrolls as one
 * continuous list rather than paging.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { X, Library, Share2, User, Heart, ShieldCheck, Building2 } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  SUBTAB_LIST_CLASSES,
  SUBTAB_TRIGGER_CLASSES,
} from "@/src/shared/config/ui-theme.config"
import { AlertCircle, Loader2 } from 'lucide-react'
import { PromptFilters } from './PromptFilters'
import { PromptCard } from './PromptCard'
import { PromptTable } from './PromptTable'
import { PromptPreviewDialog } from './PromptPreviewDialog'
import { SharePromptDialog } from './SharePromptDialog'
import { LoginRequiredDialog } from './LoginRequiredDialog'
import { usePromptGallery } from '../hooks/usePromptGallery'
import { usePromptFavorites } from '../hooks/usePromptFavorites'
import { useTenantMemberships } from '../hooks/useTenantMemberships'
import { useTenantPrompts } from '../hooks/useTenantPrompts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDesktopLayout } from '../hooks/useDesktopLayout'
import { isSystemPrompt } from '../constants/prompt-source'
import { favoriteHasUpdate } from '../utils/prompt-favorite.utils'
import { loadSharedPromptContent } from '../services/prompt-gallery.service'
import { matchesPromptFilter, sortPrompts } from '../utils/prompt-filter.utils'
import type { SharedPrompt, PromptType, PromptGalleryFilter, PromptGallerySort } from '../types/prompt.types'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import { guidedPreviewEvents, GUIDED_PREVIEW_DIALOG_CLASSES } from '@/features/right-feature-tour/guided-preview'

type GalleryTab = 'all' | 'fav' | 'my' | 'system' | 'tenant'

interface PromptGalleryDialogProps {
  guidedPreview?: boolean
  previewFirstTemplate?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: 'chat' | 'summary' | 'all'
  onSelectPrompt: (prompt: SharedPrompt, useAs?: PromptType) => void
}

export function PromptGalleryDialog({
  open,
  onOpenChange,
  mode = 'all',
  onSelectPrompt,
  guidedPreview = false,
  previewFirstTemplate = false,
}: PromptGalleryDialogProps) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const { user, isAnonymous } = useAuth()
  const isDesktop = useDesktopLayout()
  const [selectedTab, setActiveTab] = useState<GalleryTab>('all')
  const activeTab: GalleryTab = guidedPreview ? 'all' : selectedTab
  const [previewPrompt, setPreviewPrompt] = useState<SharedPrompt | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [sharePrompt, setSharePrompt] = useState<SharedPrompt | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [favoriteLoginOpen, setFavoriteLoginOpen] = useState(false)
  // Gallery tabs default to newest first; favorites keep "most recently saved" until a column is picked.
  const [sort, setSort] = useState<PromptGallerySort>({ field: 'createdAt', direction: 'desc' })
  const [favoriteSort, setFavoriteSort] = useState<PromptGallerySort>()
  const previewTrigger = useRef<HTMLElement | null>(null)
  // Favorites follow a signed-in account (FR-13); anonymous sessions are asked to sign in.
  const favoritesUserId = user && !isAnonymous ? user.uid : undefined

  // Initialize filter based on mode + current audience
  const initialFilter = useMemo(() => {
    const base: { type?: PromptType; audience: typeof audience } = { audience }
    if (mode === 'chat') return { ...base, type: 'chat' as PromptType }
    if (mode === 'summary') return { ...base, type: 'summary' as PromptType }
    return base
  }, [mode, audience])

  // Hook for "All Templates" (the system tab is a client-side slice of the same list)
  const allPromptsHook = usePromptGallery({ initialFilter, enabled: open && (activeTab === 'all' || activeTab === 'system') })

  // Hook for "My Templates" (only if user is logged in)
  const myPromptsHook = usePromptGallery({
    initialFilter,
    userId: user?.uid,
    enabled: open && activeTab === 'my' && !!user,
  })

  const favoritesHook = usePromptFavorites({ userId: favoritesUserId, enabled: open && !guidedPreview })
  // Filter state for the lists that are already in memory (favorites, department).
  const [favoriteFilter, setFavoriteFilter] = useState<PromptGalleryFilter>(initialFilter)

  // Department templates (科常用範本): one tab, switchable when the account belongs to several departments.
  const memberships = useTenantMemberships({ userId: favoritesUserId, enabled: open && !guidedPreview })
  const [selectedTenantId, setSelectedTenantId] = useState<string>()
  const tenant = memberships.find((membership) => membership.tenantId === selectedTenantId) ?? memberships[0]
  const tenantHook = useTenantPrompts({ tenantId: tenant?.tenantId, tenantName: tenant?.displayName, enabled: open && activeTab === 'tenant' })
  const hasTenantTab = memberships.length > 0

  // Select the appropriate hook based on active tab
  const galleryHook = activeTab === 'my' ? myPromptsHook : allPromptsHook
  const {
    prompts,
    loading,
    error,
    filter: galleryFilter,
    updateFilter,
    clearFilter,
    trackUsage,
    fetchPrompts,
  } = galleryHook
  const usesClientFilter = activeTab === 'fav' || activeTab === 'tenant'
  const filter = usesClientFilter ? favoriteFilter : galleryFilter

  // Sync filter.audience when the global audience switches.
  // For patient audience, also clear category/specialty filters (they don't apply to citizen-facing prompts).
  useEffect(() => {
    const patch: Partial<typeof filter> = {}
    if (galleryFilter.audience !== audience) patch.audience = audience
    if (audience === 'patient') {
      if (galleryFilter.category) patch.category = undefined
      if (galleryFilter.specialty) patch.specialty = undefined
    }
    if (Object.keys(patch).length > 0) {
      updateFilter(patch)
    }
  }, [audience, galleryFilter.audience, galleryFilter.category, galleryFilter.specialty, updateFilter])

  const handleTabChange = (value: string) => {
    setActiveTab(value as GalleryTab)
  }

  const handlePreview = (prompt: SharedPrompt) => {
    previewTrigger.current = document.activeElement as HTMLElement
    setPreviewPrompt(prompt)
    setPreviewOpen(true)
  }

  const handleUse = (prompt: SharedPrompt, useAs?: PromptType) => {
    if (guidedPreview) return
    onSelectPrompt(prompt, useAs)
    if (prompt.tenantId) void tenantHook.trackUsage(prompt.id)
    else void trackUsage(prompt.id)
  }

  /** Quick use from a row: skip the preview when the target is unambiguous and the user is signed in. */
  const handleQuickUse = async (prompt: SharedPrompt) => {
    if (guidedPreview) return
    if (!user || (mode === 'all' && prompt.types.length > 1)) {
      handlePreview(prompt)
      return
    }
    try {
      const resolved = await loadSharedPromptContent(prompt)
      handleUse(resolved, mode === 'all' ? resolved.types[0] : mode)
      onOpenChange(false)
    } catch {
      handlePreview(prompt)
    }
  }

  const handleShare = (prompt: SharedPrompt) => {
    setSharePrompt(prompt)
    setShareOpen(true)
  }

  const handleToggleFavorite = useCallback((prompt: SharedPrompt) => {
    if (guidedPreview) return
    if (!favoritesUserId) {
      setFavoriteLoginOpen(true)
      return
    }
    void favoritesHook.toggle(prompt)
  }, [guidedPreview, favoritesUserId, favoritesHook])

  const hasActiveFilters = !!(
    filter.searchQuery ||
    filter.type ||
    filter.category ||
    filter.specialty
  )

  const handleFilterChange = (newFilter: Partial<PromptGalleryFilter>) => {
    if (usesClientFilter) setFavoriteFilter((previous) => ({ ...previous, ...newFilter }))
    else updateFilter(newFilter)
  }
  const handleClearFilters = () => {
    if (usesClientFilter) setFavoriteFilter(initialFilter)
    else clearFilter()
  }
  const refreshLists = () => {
    void fetchPrompts()
    void tenantHook.fetchPrompts()
  }

  // Favorites whose gallery source moved on since the copy was saved.
  const updatedFavoriteIds = useMemo(() => {
    const live = new Map(allPromptsHook.prompts.map((prompt) => [prompt.id, prompt]))
    return new Set(favoritesHook.favorites.filter((favorite) => favoriteHasUpdate(favorite, live.get(favorite.id))).map((favorite) => favorite.id))
  }, [allPromptsHook.prompts, favoritesHook.favorites])

  const visiblePrompts = useMemo(() => {
    if (activeTab === 'fav') {
      const list = favoritesHook.favorites.map((favorite) => favorite.prompt).filter((prompt) => matchesPromptFilter(prompt, favoriteFilter))
      return favoriteSort ? sortPrompts(list, favoriteSort) : list
    }
    if (activeTab === 'tenant') {
      return sortPrompts(tenantHook.prompts.filter((prompt) => matchesPromptFilter(prompt, favoriteFilter)), sort)
    }
    const list = activeTab === 'system' ? prompts.filter(isSystemPrompt) : prompts
    return sortPrompts(list, sort)
  }, [activeTab, favoritesHook.favorites, favoriteFilter, favoriteSort, prompts, sort, tenantHook.prompts])

  const listLoading = activeTab === 'fav' ? favoritesHook.loading : activeTab === 'tenant' ? tenantHook.loading : loading
  const listError = activeTab === 'fav' ? null : activeTab === 'tenant' ? tenantHook.error : error
  const systemCount = useMemo(() => prompts.filter(isSystemPrompt).length, [prompts])
  const canFavorite = !guidedPreview

  const emptyState = activeTab === 'fav'
    ? { icon: Heart, title: t.promptGallery.noFavorites, description: t.promptGallery.noFavoritesDesc }
    : activeTab === 'tenant'
      ? { icon: Building2, title: t.promptGallery.noTenantPrompts, description: t.promptGallery.noTenantPromptsDesc }
    : activeTab === 'my'
      ? { icon: AlertCircle, title: t.promptGallery.noMyPrompts, description: t.promptGallery.noMyPromptsDesc }
      : { icon: AlertCircle, title: t.promptGallery.noResults, description: t.promptGallery.noResultsDescription }
  const EmptyIcon = emptyState.icon

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!guidedPreview) onOpenChange(next) }} modal={!guidedPreview}>
        <DialogContent
          data-tour="custom-summary-gallery"
          className={cn("flex h-[85vh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-3", guidedPreview && GUIDED_PREVIEW_DIALOG_CLASSES)}
          {...guidedPreviewEvents(guidedPreview)}
        >
          <DialogHeader className="pr-10">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>{t.promptGallery.title}</DialogTitle>
              <DialogDescription className="sr-only">{t.promptGallery.description}</DialogDescription>
              {user && (
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={guidedPreview}
                  onClick={() => {
                    setSharePrompt(null)
                    setShareOpen(true)
                  }}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  {t.promptGallery.sharePrompt}
                </Button>
              )}
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col gap-0 overflow-hidden">
            {/* Two rows on a phone, one row from md up; the department tab is the fifth entry when present. */}
            <TabsList data-tour="gallery-tabs" className={cn(SUBTAB_LIST_CLASSES, 'grid w-full', hasTenantTab ? 'grid-cols-3 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4')}>
              <TabsTrigger
                value="all"
                className={`${SUBTAB_TRIGGER_CLASSES} flex items-center gap-2`}
              >
                <Library className="h-4 w-4" />
                {t.promptGallery.allPrompts}
              </TabsTrigger>
              <TabsTrigger
                value="fav"
                className={`${SUBTAB_TRIGGER_CLASSES} flex items-center gap-2`}
                disabled={guidedPreview}
              >
                <Heart className="h-4 w-4" fill={activeTab === 'fav' ? 'currentColor' : 'none'} />
                {t.promptGallery.favorites}
                {favoritesHook.favorites.length > 0 && (
                  <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">
                    {favoritesHook.favorites.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="my"
                className={`${SUBTAB_TRIGGER_CLASSES} flex items-center gap-2`}
                disabled={!user}
              >
                <User className="h-4 w-4" />
                {t.promptGallery.myPrompts}
                {user && myPromptsHook.prompts.length > 0 && (
                  <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">
                    {myPromptsHook.prompts.length}
                  </span>
                )}
              </TabsTrigger>
              {hasTenantTab && (
                <TabsTrigger
                  value="tenant"
                  className={`${SUBTAB_TRIGGER_CLASSES} flex items-center gap-2`}
                  disabled={guidedPreview}
                >
                  <Building2 className="h-4 w-4" />
                  {t.promptGallery.tenantPrompts}
                  {activeTab === 'tenant' && tenantHook.prompts.length > 0 && (
                    <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">
                      {tenantHook.prompts.length}
                    </span>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger
                value="system"
                className={`${SUBTAB_TRIGGER_CLASSES} flex items-center gap-2`}
                disabled={guidedPreview}
              >
                <ShieldCheck className="h-4 w-4" />
                {t.promptGallery.systemPrompts}
                {systemCount > 0 && (
                  <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">
                    {systemCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="flex-1 flex flex-col gap-2 overflow-hidden mt-3 [@media(max-height:500px)]:overflow-y-auto">
            {/* Department switcher for accounts in more than one department */}
            {activeTab === 'tenant' && memberships.length > 1 && tenant && (
              <div className="flex shrink-0 items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                <Select value={tenant.tenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger aria-label={t.promptGallery.tenantSwitcher} className="h-8 w-[14rem] shadow-none max-md:min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {memberships.map((membership) => (
                      <SelectItem key={membership.tenantId} value={membership.tenantId}>{membership.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Filters + result count in one row */}
            <div data-tour="gallery-filters" className="shrink-0">
            <PromptFilters
              searchQuery={filter.searchQuery || ''}
              onSearchChange={(query) => handleFilterChange({ searchQuery: query })}
              selectedType={filter.type}
              onTypeChange={(type) => handleFilterChange({ type })}
              selectedCategory={filter.category}
              onCategoryChange={(category) => handleFilterChange({ category })}
              selectedSpecialty={filter.specialty}
              onSpecialtyChange={(specialty) => handleFilterChange({ specialty })}
              trailing={!listLoading && !listError && (
                <>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearFilters}
                      className="h-7 text-xs max-md:min-h-11"
                    >
                      <X className="h-3 w-3 mr-1" />
                      {t.promptGallery.clearFilters}
                    </Button>
                  )}
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t.promptGallery.resultsCount.replace('{count}', String(visiblePrompts.length))}
                  </span>
                </>
              )}
            />
            </div>

            {/* Active filter chips (screen-reader friendly removal) */}
            {hasActiveFilters && !listLoading && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-1">
                {filter.type && (
                  <Badge variant="secondary" className="text-xs">
                    {filter.type === 'chat' ? t.promptGallery.typeChat : t.promptGallery.typeSummary}
                    <button type="button" aria-label={`${t.promptGallery.clearFilters}: ${filter.type === 'chat' ? t.promptGallery.typeChat : t.promptGallery.typeSummary}`} className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring" onClick={() => handleFilterChange({ type: undefined })}><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                {filter.category && (
                  <Badge variant="secondary" className="text-xs">
                    {t.promptGallery.categories[filter.category as keyof typeof t.promptGallery.categories]}
                    <button type="button" aria-label={`${t.promptGallery.clearFilters}: ${t.promptGallery.categories[filter.category as keyof typeof t.promptGallery.categories]}`} className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring" onClick={() => handleFilterChange({ category: undefined })}><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                {filter.specialty && (
                  <Badge variant="secondary" className="max-w-full whitespace-normal text-xs">
                    {t.promptGallery.specialties[filter.specialty as keyof typeof t.promptGallery.specialties]}
                    <button type="button" aria-label={`${t.promptGallery.clearFilters}: ${t.promptGallery.specialties[filter.specialty as keyof typeof t.promptGallery.specialties]}`} className="ml-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-ring" onClick={() => handleFilterChange({ specialty: undefined })}><X className="h-3 w-3" /></button>
                  </Badge>
                )}
              </div>
            )}

            {/* Results: one continuous scrolling list */}
            <div className="flex-1 overflow-y-auto overscroll-contain [@media(max-height:500px)]:min-h-32 [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible">
              {/* Loading */}
              {listLoading && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Error */}
              {!listLoading && listError && (
                <div className="flex items-center justify-center h-full">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{listError}</AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Content */}
              {!listLoading && !listError && (
                <>
                {visiblePrompts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <EmptyIcon className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">{emptyState.title}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{emptyState.description}</p>
                    {activeTab === 'my' && (
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => {
                          setSharePrompt(null)
                          setShareOpen(true)
                        }}
                      >
                        {t.promptGallery.shareFirstPrompt}
                      </Button>
                    )}
                    {activeTab === 'fav' && (
                      <Button variant="outline" className="mt-4" onClick={() => setActiveTab('all')}>
                        <Library className="mr-2 h-4 w-4" />
                        {t.promptGallery.allPrompts}
                      </Button>
                    )}
                  </div>
                ) : isDesktop && !guidedPreview ? (
                  <div className="rounded-lg border border-border bg-card">
                    <PromptTable
                      prompts={visiblePrompts}
                      currentUserId={user?.uid}
                      sort={activeTab === 'fav' ? favoriteSort : sort}
                      onSortChange={activeTab === 'fav' ? setFavoriteSort : setSort}
                      isFavorite={favoritesHook.isFavorite}
                      onToggleFavorite={canFavorite ? handleToggleFavorite : undefined}
                      onPreview={handlePreview}
                      onUse={handleQuickUse}
                      updatedIds={updatedFavoriteIds}
                      showSource={activeTab !== 'system' && activeTab !== 'tenant'}
                    />
                  </div>
                ) : (
                  <div className={cn("grid grid-cols-1 gap-3 p-1 sm:grid-cols-2", !guidedPreview && "lg:grid-cols-4")}>
                    {visiblePrompts.map((prompt) => (
                      <PromptCard
                        key={prompt.id}
                        prompt={prompt}
                        onPreview={handlePreview}
                        currentUserId={user?.uid}
                        isFavorite={favoritesHook.isFavorite(prompt.id)}
                        onToggleFavorite={canFavorite ? handleToggleFavorite : undefined}
                        sourceUpdated={updatedFavoriteIds.has(prompt.id)}
                      />
                    ))}
                  </div>
                )}
                </>
              )}
            </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <PromptPreviewDialog
        prompt={guidedPreview ? (previewFirstTemplate && !loading && !error ? visiblePrompts[0] ?? null : null) : previewPrompt}
        open={guidedPreview ? open && previewFirstTemplate && !loading && !error && !!visiblePrompts[0] : previewOpen}
        onOpenChange={(next) => { if (!guidedPreview) setPreviewOpen(next) }}
        onUse={handleUse}
        useMode={mode}
        onShare={handleShare}
        onDelete={refreshLists}
        onRestoreFocus={() => previewTrigger.current?.focus()}
        guidedPreview={guidedPreview}
        isFavorite={previewPrompt ? favoritesHook.isFavorite(previewPrompt.id) : false}
        onToggleFavorite={canFavorite ? handleToggleFavorite : undefined}
        sourceUpdated={previewPrompt ? updatedFavoriteIds.has(previewPrompt.id) : false}
        canManage={!!previewPrompt?.tenantId && !!memberships.find((membership) => membership.tenantId === previewPrompt.tenantId)?.canPublish}
      />

      {/* Share Dialog */}
      <SharePromptDialog
        open={!guidedPreview && shareOpen}
        onOpenChange={setShareOpen}
        initialTitle={sharePrompt?.title}
        initialDescription={sharePrompt?.description}
        initialPrompt={sharePrompt?.prompt}
        initialExampleOutput={sharePrompt?.exampleOutput}
        initialType={sharePrompt?.types[0] || (mode === 'summary' ? 'summary' : 'chat')}
        initialOutputFormat={sharePrompt?.outputFormat}
        initialLanguagePolicy={sharePrompt?.languagePolicy}
        memberships={memberships}
        initialTenantId={sharePrompt?.tenantId ?? (activeTab === 'tenant' ? tenant?.tenantId : undefined)}
        onSuccess={refreshLists}
      />

      {/* Favorites need an account so they follow the user across devices */}
      <LoginRequiredDialog
        open={favoriteLoginOpen}
        onOpenChange={setFavoriteLoginOpen}
        title={t.promptGallery.favoriteLoginRequired}
        description={t.promptGallery.favoriteLoginDesc}
        onLoginSuccess={() => setFavoriteLoginOpen(false)}
      />
    </>
  )
}
