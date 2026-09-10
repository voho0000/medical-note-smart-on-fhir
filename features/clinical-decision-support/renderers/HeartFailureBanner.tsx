"use client"

import { useId, useState } from 'react'
import { ArrowRight, ChevronDown, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssRecommendation } from '../types'
import type { HeartFailureHeadline } from './heart-failure-board'
import { statusLabel, statusStyle, StatusIcon } from './status-presentation'

/**
 * What this visit needs from the clinician, in one line that never blocks.
 *
 * The interrupting alert is the reason clinicians stop reading CDSS output: a
 * dialog over the note has to be dismissed before the sentence being typed can
 * be finished, so it gets dismissed unread, and the one visit where it mattered
 * is dismissed the same way. This says the same thing in a strip that takes no
 * focus, covers nothing, and can be ignored for the whole visit.
 *
 * Two layers on purpose. The first is a count and nothing else — enough to
 * decide whether to look now, and readable without a decision. The second holds
 * the detail and the action, and opens only when asked, because an action
 * printed beside a summary is an action taken before the basis was read.
 *
 * `role="status"` rather than `role="alert"`: a polite live region is announced
 * when the reader arrives at it instead of interrupting what is being read,
 * which is the same promise the visual strip makes.
 */
interface HeartFailureBannerProps {
  /** Safety modules the pack marked actionable. */
  alerts: readonly CdssRecommendation[]
  /** The pack's own next steps for this visit, already ordered. */
  headlines: readonly HeartFailureHeadline[]
  isEnglish: boolean
  /** Opens the module's own card, where the full basis is. */
  onOpen: (id: string) => void
}

interface BannerItem {
  id: string
  title: string
  moduleName: string
  action?: string
  status: CdssRecommendation['status']
  isSafety: boolean
}

function bannerItems(
  alerts: readonly CdssRecommendation[],
  headlines: readonly HeartFailureHeadline[],
): BannerItem[] {
  const items: BannerItem[] = alerts.map((alert) => ({
    id: alert.id,
    title: alert.title,
    moduleName: alert.moduleName ?? alert.id,
    action: alert.nextActions[0],
    status: alert.status,
    isSafety: true,
  }))
  const seen = new Set(items.map((item) => item.id))
  for (const headline of headlines) {
    // A safety module already listed above is not listed twice; the strip is a
    // count of things to do, not of the places they were mentioned.
    if (seen.has(headline.recommendation.id)) continue
    seen.add(headline.recommendation.id)
    items.push({
      id: headline.recommendation.id,
      title: headline.reason,
      moduleName: headline.moduleName,
      action: headline.action,
      status: headline.recommendation.status,
      isSafety: false,
    })
  }
  return items
}

export function HeartFailureBanner({
  alerts,
  headlines,
  isEnglish,
  onOpen,
}: HeartFailureBannerProps) {
  const [expanded, setExpanded] = useState(false)
  const regionId = useId()
  const items = bannerItems(alerts, headlines)
  const safetyCount = items.filter((item) => item.isSafety).length
  const quiet = items.length === 0

  const summaryText = quiet
    ? (isEnglish
      ? 'Nothing needs a decision this visit.'
      : '本次沒有需要決定的事項。')
    : [
        isEnglish
          ? `${items.length} thing${items.length === 1 ? '' : 's'} need you`
          : `${items.length} 件事需要您`,
        safetyCount > 0
          ? (isEnglish
            ? `${safetyCount} safety alert${safetyCount === 1 ? '' : 's'}`
            : `其中 ${safetyCount} 件是安全警訊`)
          : undefined,
      ].filter(Boolean).join(' · ')

  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border bg-card',
        safetyCount > 0 ? 'border-amber-300 dark:border-amber-500/40' : 'border-border',
      )}
      aria-label={isEnglish ? 'This visit' : '本次就診摘要'}
      data-testid="cdss-hf-banner"
      data-safety-count={safetyCount}
      data-quiet={quiet ? 'true' : undefined}
    >
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2',
          safetyCount > 0 && 'bg-amber-50 dark:bg-amber-500/[0.08]',
        )}
      >
        {safetyCount > 0 ? (
          <TriangleAlert
            className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
            aria-hidden="true"
          />
        ) : (
          <ShieldCheck
            className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300"
            aria-hidden="true"
          />
        )}
        {/*
          The first layer is the whole message. It is a live region so a reader
          already inside the note hears it without being moved, and it carries
          no control of its own — nothing here can be actioned by mistake.
        */}
        <p
          role="status"
          className="min-w-0 text-sm font-semibold text-foreground"
          data-testid="cdss-hf-banner-summary"
        >
          {summaryText}
        </p>
        {quiet ? null : (
          <>
            <span className="text-[11px] leading-4 text-muted-foreground">
              {isEnglish
                ? 'Nothing is blocked; open when you are ready.'
                : '不影響您現在的操作，準備好再展開。'}
            </span>
            <button
              type="button"
              className={cn(
                'ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary transition-colors',
                'hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              aria-expanded={expanded}
              aria-controls={regionId}
              onClick={() => setExpanded((open) => !open)}
              data-testid="cdss-hf-banner-trigger"
            >
              {expanded
                ? (isEnglish ? 'Hide details' : '收起細節')
                : (isEnglish ? 'Show details' : '展開細節與動作')}
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
          </>
        )}
      </div>

      {expanded && !quiet ? (
        <div
          id={regionId}
          role="region"
          aria-label={isEnglish ? 'What needs you' : '需要您處理的事項'}
          className="border-t border-border bg-background"
          data-testid="cdss-hf-banner-detail"
        >
          <ul className="divide-y divide-border/60">
            {items.map((item) => (
              <li key={item.id} className="px-3 py-2.5" data-testid={`cdss-hf-banner-item-${item.id}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {item.isSafety ? (
                    <TriangleAlert
                      className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="text-sm font-semibold leading-5 text-foreground">{item.title}</span>
                  <Badge className={cn('h-5 px-1.5 text-[11px]', statusStyle[item.status])}>
                    <StatusIcon status={item.status} />
                    {statusLabel(item.status, isEnglish)}
                  </Badge>
                  <span className="text-[11px] leading-4 text-muted-foreground">{item.moduleName}</span>
                </div>
                {item.action ? (
                  <p className="mt-1 flex gap-1.5 text-xs leading-relaxed text-foreground">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 break-words">{item.action}</span>
                  </p>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    'mt-1.5 inline-flex min-h-8 items-center rounded-md px-2 text-xs font-medium text-primary transition-colors',
                    'hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                  onClick={() => onOpen(item.id)}
                  data-testid={`cdss-hf-banner-open-${item.id}`}
                >
                  {isEnglish ? 'Open the module' : '開啟模組看依據'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
