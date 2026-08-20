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

type LongitudinalTarget = {
  /** False when there is nothing to open (no observation, or no right pane). */
  available: boolean
  mode: LongitudinalMode
  /** Localized "查看趨勢" / "查看歷史紀錄" — the accessible name of whatever
   *  element ends up owning the interaction. */
  actionLabel: string
  /** Accessible name for a ROW that owns the tap: the reading first, the action
   *  second ("K 4.1 mmol/L，查看趨勢"). A row's own text is its default name, so
   *  labelling it with the bare action would cost a screen-reader user the
   *  result they are navigating to. Punctuation follows the active locale. */
  describe: (subject: string) => string
  /** This observation's detail is the one currently docked in the right pane. */
  isActive: boolean
  show: () => void
}

/**
 * The trend/history detail for one observation, without deciding what opens it.
 *
 * Split out of the button so a HOST can own the interaction instead: on the
 * single-panel layout the whole result row is the tap target (a 343×24px row
 * beats a 36px icon by Fitts, and a 36px box inside a one-line row is mostly
 * padding), while desktop keeps the icon button. Both paths must open exactly
 * the same pane, so the pane lives here and the callers only choose the trigger.
 */
export function useObservationLongitudinal({
  observation,
  title,
  sourceId,
  reportTitle,
  reportLookupTitle,
}: {
  observation: Observation | null | undefined
  title: string
  sourceId: string
  reportTitle?: string
  reportLookupTitle?: string
}): LongitudinalTarget {
  const { locale } = useLanguage()
  const rightDetail = useOptionalRightDetail()

  const mode = getObservationLongitudinalMode(observation)
  const isHistory = mode === 'history'
  const isZh = locale.startsWith('zh')
  const actionLabel = isHistory
    ? (isZh ? '查看歷史紀錄' : 'View history')
    : (isZh ? '查看趨勢' : 'View trend')
  const detailLabel = isHistory
    ? (isZh ? '歷史紀錄' : 'History')
    : (isZh ? '檢驗趨勢' : 'Trend')

  return {
    available: !!observation && !!rightDetail,
    mode,
    actionLabel,
    describe: (subject: string) => subject
      ? `${subject}${isZh ? '，' : ', '}${actionLabel}`
      : actionLabel,
    isActive: rightDetail?.detail?.sourceId === sourceId,
    show: () => {
      if (!observation || !rightDetail) return
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
    },
  }
}

/**
 * Handlers for a row that IS the trend control.
 *
 * Shared by every observation row rather than re-written per host: the guard is
 * the subtle part. Anything inside the row with its own interaction — the image
 * button, an NHI viewer link, the tap-to-expand value — must keep its tap, or
 * opening an image would also dock a trend behind it. (Tooltip triggers stop
 * propagation themselves, so revealing truncated text never reaches here.)
 * Keyboard activation is refused for events bubbling from a descendant, so a
 * Space press inside a nested control cannot open the pane either.
 */
export function rowLongitudinalHandlers(show: () => void) {
  return {
    onClick: (event: MouseEvent<HTMLElement>) => {
      const interactive = (event.target as HTMLElement).closest(
        'a, button, [role="button"], [data-nhi-viewer-actions]',
      )
      if (interactive && interactive !== event.currentTarget) return
      show()
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (event.target !== event.currentTarget) return
      event.preventDefault()
      show()
    },
  }
}

/**
 * The bare icon, for rows whose HOST owns the tap (see `useObservationLongitudinal`).
 *
 * Purely decorative — no box, no handlers, no tab stop: it is the visual cue
 * that the row opens something, and the row carries the role and the label.
 * Duplicating either here would put a second announcement and a second tab stop
 * inside a control that already has both.
 */
export function ObservationLongitudinalAffordance({
  mode,
  isActive,
  className,
}: {
  mode: LongitudinalMode
  isActive?: boolean
  className?: string
}) {
  const Icon = mode === 'history' ? History : TrendingUp
  return (
    <Icon
      className={cn(
        'h-4 w-4 shrink-0 text-muted-foreground',
        isActive && 'text-primary',
        className,
      )}
      aria-hidden="true"
    />
  )
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
  const longitudinal = useObservationLongitudinal({
    observation,
    title,
    sourceId,
    reportTitle,
    reportLookupTitle,
  })

  if (!longitudinal.available) return null

  const { mode, actionLabel, isActive, show: showLongitudinalDetail } = longitudinal
  const isHistory = mode === 'history'

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
      // Where this button still owns the tap on a touch layout (the narrative /
      // imaging report header, expanded panel rows), it keeps a 36px box:
      // literal px, not rem, because the root font-size is user-settable
      // (12–20px, 12px being the phone default for clinicians) and a rem box
      // rendered as a ~12px target. `max-md:-my-[11px]` keeps that box while
      // stopping it from SETTING the height of the line it sits on — 36 − 2×11
      // = 14px of layout contribution, less than the text line, so the box
      // overlaps the host's own padding instead of inflating it. The margin is
      // sized for the SMALLEST root, where (36 − line)/2 is largest; at root
      // 16/20 the text line governs anyway.
      //
      // Dense result rows do NOT use this path: their whole row is the tap
      // target and they render `ObservationLongitudinalAffordance` instead.
      'inline-flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors touch-manipulation hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 max-md:-my-[11px] md:min-h-0 md:min-w-0',
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
