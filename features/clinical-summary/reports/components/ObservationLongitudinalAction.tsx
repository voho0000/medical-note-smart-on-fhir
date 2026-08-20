import type { KeyboardEvent, MouseEvent } from 'react'
import dynamic from 'next/dynamic'
import { History, Loader2, TrendingUp } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useOptionalRightDetail } from '@/src/application/providers/right-detail.provider'
import type { Observation } from '../types'

// The trend detail owns every chart in the reports workspace, and charting is
// the single heaviest dependency in the initial bundle. Nothing here renders
// until the clinician opens a trend, so pay for it then.
const ObservationTrendDetail = dynamic(
  () => import('./ObservationTrendDetail').then((m) => m.ObservationTrendDetail),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      </div>
    ),
  },
)

type LongitudinalMode = 'trend' | 'history'

interface ObservationLongitudinalActionProps {
  observation: Observation | null | undefined
  title: string
  sourceId: string
  reportTitle?: string
  reportLookupTitle?: string
  /** Use div inside an existing button/AccordionTrigger to avoid nested buttons. */
  as?: 'button' | 'div'
  stopPropagation?: boolean
  dataTour?: string
  className?: string
}

export function getObservationLongitudinalMode(
  observation: Observation | null | undefined,
): LongitudinalMode {
  const hasNumericValue = !!observation?.valueQuantity
    || !!observation?.component?.some((component) => component.valueQuantity)
  return hasNumericValue ? 'trend' : 'history'
}

/**
 * Shared entry point for every observation trend/history affordance.
 *
 * It owns the icon, accessible label, active state, right-pane title and body,
 * so list rows and expanded report rows cannot drift into different behavior.
 */
export function ObservationLongitudinalAction({
  observation,
  title,
  sourceId,
  reportTitle,
  reportLookupTitle,
  as = 'button',
  stopPropagation = false,
  dataTour,
  className,
}: ObservationLongitudinalActionProps) {
  const { locale } = useLanguage()
  const rightDetail = useOptionalRightDetail()

  if (!observation || !rightDetail) return null

  const mode = getObservationLongitudinalMode(observation)
  const isHistory = mode === 'history'
  const isZh = locale.startsWith('zh')
  const actionLabel = isHistory
    ? (isZh ? '查看歷史紀錄' : 'View history')
    : (isZh ? '查看趨勢' : 'View trend')
  const detailLabel = isHistory
    ? (isZh ? '歷史紀錄' : 'History')
    : (isZh ? '檢驗趨勢' : 'Trend')
  const isActive = rightDetail.detail?.sourceId === sourceId

  const showLongitudinalDetail = () => {
    rightDetail.showDetail({
      sourceId,
      title: (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {isHistory
            ? <History className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            : <TrendingUp className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
          <span className="truncate">{title || (isZh ? '檢驗項目' : 'Result')}</span>
          <span className="shrink-0 font-normal text-muted-foreground">· {detailLabel}</span>
        </span>
      ),
      node: (
        <ObservationTrendDetail
          key={sourceId}
          observation={observation}
          reportTitle={reportTitle}
          reportLookupTitle={reportLookupTitle}
        />
      ),
    })
  }

  const activate = (event: MouseEvent<HTMLElement>) => {
    if (stopPropagation) event.stopPropagation()
    showLongitudinalDetail()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (stopPropagation) event.stopPropagation()
    showLongitudinalDetail()
  }
  const sharedProps = {
    'aria-label': actionLabel,
    'data-report-history-action': true,
    'data-detail-source-id': sourceId,
    'data-tour': dataTour,
    className: cn(
      // Literal px, not rem: the root font-size drops to 12px on phones, so a
      // rem-sized box here rendered as a ~12px tap target — and this is the
      // entry point to every trend in the app. Desktop keeps the compact icon.
      'inline-flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors touch-manipulation hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[44px] sm:min-w-[44px] md:min-h-0 md:min-w-0',
      isActive && 'text-primary',
      className,
    ),
  }
  const icon = isHistory
    ? <History className="h-4 w-4" aria-hidden="true" />
    : <TrendingUp className="h-4 w-4" aria-hidden="true" />

  if (as === 'div') {
    return (
      <div
        {...sharedProps}
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={handleKeyDown}
      >
        {icon}
      </div>
    )
  }

  return (
    <button {...sharedProps} type="button" onClick={activate}>
      {icon}
    </button>
  )
}
