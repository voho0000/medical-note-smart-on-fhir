'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  EyeOff,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Settings2,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AuthDialog } from '@/features/auth'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { isFeatureRequestAdmin } from './admin'
import { FeatureRequestAdminDialog } from './FeatureRequestAdminDialog'
import { FeatureRequestFormDialog } from './FeatureRequestFormDialog'
import { canEditFeatureRequest, filterFeatureRequests } from './model'
import {
  subscribeFeatureRequestOwnerships,
  subscribeFeatureRequests,
  subscribeFeatureRequestVotes,
  toggleFeatureRequestVote,
  withdrawFeatureRequest,
} from '@/features/feature-request-pool/service'
import type {
  FeatureRequest,
  FeatureRequestCategory,
  FeatureRequestOwnership,
  FeatureRequestSort,
  FeatureRequestStatus,
  FeatureRequestView,
} from './types'

interface FeatureRequestPoolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FeatureRequestDescriptionProps {
  requestId: string
  description: string
  showMoreLabel: string
  showLessLabel: string
}

function FeatureRequestDescription({
  requestId,
  description,
  showMoreLabel,
  showLessLabel,
}: FeatureRequestDescriptionProps) {
  const paragraphRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)

  useEffect(() => {
    if (expanded) return
    const paragraph = paragraphRef.current
    if (!paragraph) return

    const measureOverflow = () => {
      setCanExpand(
        paragraph.scrollWidth > paragraph.clientWidth + 1
        || paragraph.scrollHeight > paragraph.clientHeight + 1,
      )
    }
    measureOverflow()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureOverflow)
      return () => window.removeEventListener('resize', measureOverflow)
    }

    const observer = new ResizeObserver(measureOverflow)
    observer.observe(paragraph)
    return () => observer.disconnect()
  }, [description, expanded])

  const descriptionId = `feature-request-description-${requestId}`

  return (
    <div className={expanded ? '' : 'flex min-w-0 items-center gap-2'}>
      <p
        ref={paragraphRef}
        id={descriptionId}
        className={expanded
          ? 'whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90'
          : 'min-w-0 flex-1 truncate text-sm leading-6 text-foreground/90'}
      >
        {description}
      </p>
      {canExpand && (
        <button
          type="button"
          className="h-[44px] shrink-0 text-left text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-6"
          aria-expanded={expanded}
          aria-controls={descriptionId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? showLessLabel : showMoreLabel}
        </button>
      )}
    </div>
  )
}

export function FeatureRequestPoolDialog({ open, onOpenChange }: FeatureRequestPoolDialogProps) {
  const { t, locale } = useLanguage()
  const copy = t.featureRequests
  const { user, loading: authLoading } = useAuth()
  const admin = isFeatureRequestAdmin(user)
  const [requests, setRequests] = useState<FeatureRequest[]>([])
  const [ownerships, setOwnerships] = useState<FeatureRequestOwnership[]>([])
  const [supportedIds, setSupportedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<FeatureRequestSort>('popular')
  const [status, setStatus] = useState<FeatureRequestStatus | 'all'>('all')
  const [category, setCategory] = useState<FeatureRequestCategory | 'all'>('all')
  const [view, setView] = useState<FeatureRequestView>('all')
  const [authOpen, setAuthOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRequest, setEditingRequest] = useState<FeatureRequest | null>(null)
  const [adminRequest, setAdminRequest] = useState<FeatureRequest | null>(null)
  const [withdrawRequest, setWithdrawRequest] = useState<FeatureRequest | null>(null)
  const [busyVotes, setBusyVotes] = useState<Set<string>>(new Set())
  const [withdrawing, setWithdrawing] = useState(false)

  useEffect(() => {
    if (!open) return
    try {
      return subscribeFeatureRequests(
        admin,
        (nextRequests) => {
          setRequests(nextRequests)
          setLoading(false)
        },
        (error) => {
          console.error('Feature requests subscription failed:', error)
          setLoadError(copy.loadError)
          setLoading(false)
        },
      )
    } catch (error) {
      console.error('Feature requests subscription could not start:', error)
      queueMicrotask(() => {
        setLoadError(copy.loadError)
        setLoading(false)
      })
    }
  }, [admin, copy.loadError, open])

  useEffect(() => {
    if (!open || !user) return
    const unsubscribeOwners = subscribeFeatureRequestOwnerships(
      user.uid,
      admin,
      setOwnerships,
      (error) => console.error('Feature request ownership subscription failed:', error),
    )
    const unsubscribeVotes = subscribeFeatureRequestVotes(
      user.uid,
      setSupportedIds,
      (error) => console.error('Feature request votes subscription failed:', error),
    )
    return () => {
      unsubscribeOwners()
      unsubscribeVotes()
    }
  }, [admin, open, user])

  const effectiveView: FeatureRequestView = (
    (!user && (view === 'mine' || view === 'supported'))
    || (!admin && view === 'hidden')
  ) ? 'all' : view
  const effectiveOwnerships = useMemo(() => user ? ownerships : [], [ownerships, user])
  const effectiveSupportedIds = useMemo(() => user ? supportedIds : new Set<string>(), [supportedIds, user])
  const ownershipById = useMemo(
    () => new Map(effectiveOwnerships.map((ownership) => [ownership.requestId, ownership])),
    [effectiveOwnerships],
  )
  const ownedIds = useMemo(
    () => new Set(
      effectiveOwnerships
        .filter((ownership) => ownership.authorId === user?.uid)
        .map((ownership) => ownership.requestId),
    ),
    [effectiveOwnerships, user?.uid],
  )
  const visibleRequests = useMemo(
    () => filterFeatureRequests(requests, {
      search,
      status,
      category,
      view: effectiveView,
      sort,
      ownedIds,
      supportedIds: effectiveSupportedIds,
    }),
    [category, effectiveSupportedIds, effectiveView, ownedIds, requests, search, sort, status],
  )

  const statusLabel = (value: FeatureRequestStatus) => ({
    evaluating: copy.statuses.evaluating,
    planned: copy.statuses.planned,
    'in-progress': copy.statuses.inProgress,
    completed: copy.statuses.completed,
  })[value]

  const categoryLabel = (value: FeatureRequestCategory) => ({
    ai: copy.categories.ai,
    feature: copy.categories.feature,
    ui: copy.categories.ui,
  })[value]

  const handleNewRequest = () => {
    if (!user) {
      setAuthOpen(true)
      return
    }
    setEditingRequest(null)
    setFormOpen(true)
  }

  const handleVote = async (request: FeatureRequest) => {
    if (!user) {
      setAuthOpen(true)
      return
    }
    setBusyVotes((current) => new Set(current).add(request.id))
    try {
      await toggleFeatureRequestVote(request.id, user.uid)
    } catch (error) {
      console.error('Feature request vote failed:', error)
      toast.error(copy.voteError)
    } finally {
      setBusyVotes((current) => {
        const next = new Set(current)
        next.delete(request.id)
        return next
      })
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawRequest) return
    setWithdrawing(true)
    try {
      await withdrawFeatureRequest(withdrawRequest.id)
      setWithdrawRequest(null)
    } catch (error) {
      console.error('Feature request withdrawal failed:', error)
      toast.error(copy.withdrawDialog.error)
    } finally {
      setWithdrawing(false)
    }
  }

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }),
    [locale],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[92dvh] sm:max-h-[92dvh] sm:max-w-5xl sm:rounded-lg sm:border">
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6 sm:pr-16">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="space-y-1">
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>{copy.description}</DialogDescription>
              </div>
              <Button className="h-[44px] w-full sm:h-9 sm:w-auto sm:shrink-0" onClick={handleNewRequest}>
                <Plus className="h-4 w-4" />
                {copy.newRequest}
              </Button>
            </div>
            {!authLoading && !user && (
              <button
                type="button"
                className="w-fit text-left text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setAuthOpen(true)}
              >
                {copy.signInToContribute}
              </button>
            )}
          </DialogHeader>

          <div className="shrink-0 space-y-3 border-b bg-muted/20 px-4 py-3 sm:px-6">
            <div className="space-y-1.5">
              <Label htmlFor="feature-request-search">{copy.searchLabel}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="feature-request-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  className="h-[44px] pl-9 sm:h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="feature-request-sort">{copy.sortLabel}</Label>
                <Select value={sort} onValueChange={(value) => setSort(value as FeatureRequestSort)}>
                  <SelectTrigger id="feature-request-sort" className="min-h-[44px] w-full sm:min-h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popular">{copy.sortPopular}</SelectItem>
                    <SelectItem value="latest">{copy.sortLatest}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="feature-request-status">{copy.statusLabel}</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as FeatureRequestStatus | 'all')}>
                  <SelectTrigger id="feature-request-status" className="min-h-[44px] w-full sm:min-h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.allStatuses}</SelectItem>
                    <SelectItem value="evaluating">{copy.statuses.evaluating}</SelectItem>
                    <SelectItem value="planned">{copy.statuses.planned}</SelectItem>
                    <SelectItem value="in-progress">{copy.statuses.inProgress}</SelectItem>
                    <SelectItem value="completed">{copy.statuses.completed}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="feature-request-category-filter">{copy.categoryLabel}</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as FeatureRequestCategory | 'all')}>
                  <SelectTrigger id="feature-request-category-filter" className="min-h-[44px] w-full sm:min-h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.allCategories}</SelectItem>
                    <SelectItem value="ai">{copy.categories.ai}</SelectItem>
                    <SelectItem value="feature">{copy.categories.feature}</SelectItem>
                    <SelectItem value="ui">{copy.categories.ui}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="feature-request-view">{copy.viewLabel}</Label>
                <Select value={view} onValueChange={(value) => setView(value as FeatureRequestView)}>
                  <SelectTrigger id="feature-request-view" className="min-h-[44px] w-full sm:min-h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.views.all}</SelectItem>
                    {user && <SelectItem value="mine">{copy.views.mine}</SelectItem>}
                    {user && <SelectItem value="supported">{copy.views.supported}</SelectItem>}
                    {admin && <SelectItem value="hidden">{copy.views.hidden}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex min-h-40 items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {copy.loading}
              </div>
            ) : loadError ? (
              <div className="p-6 text-center text-sm text-destructive">{loadError}</div>
            ) : visibleRequests.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{copy.empty}</div>
            ) : (
              <div role="list" aria-label={copy.title}>
                {visibleRequests.map((request) => {
                  const supported = effectiveSupportedIds.has(request.id)
                  const owned = ownedIds.has(request.id)
                  const editable = canEditFeatureRequest(request, owned)
                  const author = request.displayAuthor && request.authorName
                    ? request.authorName
                    : copy.anonymous
                  return (
                    <article key={request.id} role="listitem" className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:px-6">
                      <Button
                        type="button"
                        variant={supported ? 'default' : 'outline'}
                        className="h-16 w-16 flex-col gap-0.5 px-1 tabular-nums sm:w-[4.5rem]"
                        aria-pressed={supported}
                        aria-label={`${supported ? copy.removeVote : copy.vote}: ${request.title}`}
                        disabled={busyVotes.has(request.id) || request.visibility === 'hidden'}
                        onClick={() => handleVote(request)}
                      >
                        {busyVotes.has(request.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                        <span>{request.voteCount}</span>
                      </Button>

                      <div className="min-w-0 space-y-2">
                        <h3 className="min-w-0 break-words text-base font-semibold leading-6">{request.title}</h3>

                        {request.description && (
                          <FeatureRequestDescription
                            key={`${request.id}-${request.updatedAt.getTime()}`}
                            requestId={request.id}
                            description={request.description}
                            showMoreLabel={copy.showFullDescription}
                            showLessLabel={copy.collapseDescription}
                          />
                        )}

                        {request.officialNote && (
                          <div className="rounded-md bg-muted px-3 py-2 text-sm">
                            <div className="mb-1 flex items-center gap-1.5 font-medium">
                              <Megaphone className="h-3.5 w-3.5" />
                              {copy.officialUpdate}
                            </div>
                            <p className="whitespace-pre-wrap break-words text-muted-foreground">{request.officialNote}</p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{categoryLabel(request.category)}</span>
                          <span>{copy.byAuthor.replace('{name}', author)}</span>
                          <span>{copy.createdOn.replace('{date}', dateFormatter.format(request.createdAt))}</span>
                        </div>
                      </div>

                      <div className="col-start-2 flex flex-wrap items-center gap-2 self-start sm:col-start-3 sm:row-start-1 sm:flex-col sm:items-end">
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <Badge variant="outline">{statusLabel(request.status)}</Badge>
                          {request.visibility === 'hidden' && (
                            <Badge variant="secondary"><EyeOff className="h-3 w-3" />{copy.hidden}</Badge>
                          )}
                        </div>
                        {(owned || admin) && (
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            {editable && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-[44px] sm:h-8"
                                onClick={() => {
                                  setEditingRequest(request)
                                  setFormOpen(true)
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />{copy.edit}
                              </Button>
                            )}
                            {owned && request.visibility === 'visible' && (
                              <Button variant="ghost" size="sm" className="h-[44px] sm:h-8" onClick={() => setWithdrawRequest(request)}>
                                {copy.withdraw}
                              </Button>
                            )}
                            {admin && (
                              <Button variant="outline" size="sm" className="h-[44px] sm:h-8" onClick={() => setAdminRequest(request)}>
                                <Settings2 className="h-3.5 w-3.5" />{copy.manage}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      {user && formOpen && (
        <FeatureRequestFormDialog
          key={editingRequest?.id ?? 'new'}
          open={formOpen}
          onOpenChange={setFormOpen}
          user={user}
          request={editingRequest}
        />
      )}
      {admin && adminRequest && (
        <FeatureRequestAdminDialog
          key={adminRequest.id}
          open={Boolean(adminRequest)}
          onOpenChange={(nextOpen) => { if (!nextOpen) setAdminRequest(null) }}
          request={adminRequest}
          ownership={adminRequest ? ownershipById.get(adminRequest.id) : undefined}
        />
      )}

      <AlertDialog open={Boolean(withdrawRequest)} onOpenChange={(nextOpen) => { if (!nextOpen) setWithdrawRequest(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.withdrawDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.withdrawDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdrawing}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleWithdraw} disabled={withdrawing}>
              {copy.withdrawDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
