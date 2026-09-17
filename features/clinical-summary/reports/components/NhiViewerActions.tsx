"use client"

import { useState, type ReactElement } from 'react'
import { ChevronDown, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import type { NhiViewerAction } from '../types'
import {
  isTrustedLegacyNhiViewerAttachment,
  requestNhiViewerOpen,
  type NhiViewerErrorCode,
} from '../utils/nhi-viewer-request'

const ERROR_ZH: Record<NhiViewerErrorCode, string> = {
  INVALID_REQUEST: '影像調閱資料格式不正確，請重新匯入最新資料。',
  REQUEST_IN_PROGRESS: '正在開啟另一筆健保影像，請稍候。',
  MEDCLOUD_TAB_NOT_FOUND: '請先開啟並登入健保雲端病歷後再試。',
  PATIENT_MISMATCH: '雲端病歷目前不是同一位病人，請切換至正確病人後再試。',
  SESSION_EXPIRED: '雲端病歷登入狀態已失效，請重新登入後再試。',
  VIEWER_UNAVAILABLE: '暫時無法取得影像調閱網址，請稍後再試。',
  OPEN_FAILED: '無法開啟影像視窗，請檢查瀏覽器設定後再試。',
  UNSUPPORTED_ORIGIN: '此頁面不支援健保影像即時調閱，請使用 MediPrisma 正式站或本機開發站 http://localhost:3001。',
  EXTENSION_UNAVAILABLE: '無法連接健康抓抓擴充功能，請確認擴充功能已啟用後重試。',
}

const ERROR_EN: Record<NhiViewerErrorCode, string> = {
  INVALID_REQUEST: 'The imaging request is invalid. Import the latest data and try again.',
  REQUEST_IN_PROGRESS: 'Another NHI image is being opened. Please wait.',
  MEDCLOUD_TAB_NOT_FOUND: 'Open and sign in to NHI cloud records, then try again.',
  PATIENT_MISMATCH: 'NHI cloud records is showing a different patient. Switch to the correct patient and try again.',
  SESSION_EXPIRED: 'The NHI cloud-record session has expired. Sign in again and retry.',
  VIEWER_UNAVAILABLE: 'The imaging viewer is temporarily unavailable. Please try again later.',
  OPEN_FAILED: 'The viewer window could not be opened. Check browser popup settings and retry.',
  UNSUPPORTED_ORIGIN: 'Live NHI imaging is available on the official MediPrisma site or the local development site at http://localhost:3001.',
  EXTENSION_UNAVAILABLE: 'Cannot connect to the Health Catcher extension. Confirm it is enabled and retry.',
}

/**
 * Open a 健保影像 study and report the failure, single-flight.
 *
 * Exported because the 總覽 rows hang the same action off the 影像 badge
 * rather than a button of their own: two triggers spelling their own error
 * wording (or forgetting the in-flight guard) is exactly how the same failure
 * ends up explained two different ways.
 */
export function useNhiViewerOpener() {
  const { locale } = useLanguage()
  const [opening, setOpening] = useState(false)

  const open = async (action: NhiViewerAction) => {
    if (opening) return
    if (action.kind === 'legacy') {
      const opened = window.open(action.url, '_blank', 'noopener,noreferrer')
      if (opened) opened.opener = null
      return
    }
    setOpening(true)
    try {
      const result = await requestNhiViewerOpen(action.descriptor)
      if (!result.ok) toast.error((locale === 'zh-TW' ? ERROR_ZH : ERROR_EN)[result.code] ?? ERROR_ZH.OPEN_FAILED)
    } finally {
      setOpening(false)
    }
  }

  return { opening, open }
}

/**
 * The precondition a live request cannot check for itself.
 *
 * The Viewer URL is minted by the NHI session inside 雲端病歷; the app has no
 * status channel to that window, so it cannot grey the trigger out or warn
 * first — the miss only surfaces as a failure toast AFTER the press. Saying it
 * on the trigger is the one place the reader can learn it beforehand.
 */
export function nhiViewerPrerequisiteHint(locale: string): string {
  return locale === 'zh-TW'
    ? '需同時開著該病人的健保雲端病歷'
    : "Requires this patient's NHI cloud record to be open"
}

/**
 * Instant two-line tooltip for a viewer trigger.
 *
 * A native `title` costs the browser's own 1–2 second dwell before it appears —
 * long enough that the reader has already clicked and met the failure toast,
 * which is exactly what saying the prerequisite up front was meant to avoid.
 * Radix opens on the first hover frame and on keyboard focus.
 */
export function NhiViewerTooltip({
  label,
  hint,
  children,
}: {
  label: string
  /** The precondition line, or null for a trigger that has no precondition. */
  hint: string | null
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[18rem]">
        <span className="block">{label}</span>
        {hint && <span className="mt-0.5 block text-background/70">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * What the tooltip SHOWS. Deliberately count-free: the trigger next to it
 * already reads 「健保影像 2」, so spelling out 「共 2 筆中的第 1 筆」 in the
 * bubble as well is noise in the reader's way.
 */
export function nhiViewerOpenLabel(locale: string): string {
  return locale === 'zh-TW'
    ? '開啟 DICOM Viewer（健保影像）'
    : 'Open DICOM Viewer (NHI imaging)'
}

/**
 * What a screen reader HEARS. Here the ordinal earns its length: without the
 * visible 「健保影像 2」 beside it, "open imaging" on a split button gives no
 * hint that the other studies are behind the chevron.
 */
export function nhiViewerFirstLabel(locale: string, count: number): string {
  if (count > 1) {
    return locale === 'zh-TW'
      ? `開啟健保影像 1，共 ${count} 筆中的第 1 筆`
      : `Open NHI imaging 1, first of ${count} studies`
  }
  return nhiViewerOpenLabel(locale)
}

const LIVE_ACTION_CLASS = 'inline-flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-xs font-medium leading-none text-sky-800 transition-colors hover:border-sky-400 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-sky-300/50 disabled:cursor-wait disabled:opacity-60 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/15'
const LEGACY_ACTION_CLASS = 'inline-flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium leading-none text-amber-800 focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-amber-300/50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'

function LiveViewerButton({
  action,
  nestedInButton,
  suffix,
}: {
  action: Extract<NhiViewerAction, { kind: 'live' }>
  nestedInButton: boolean
  suffix: string
}) {
  const { locale } = useLanguage()
  const [loading, setLoading] = useState(false)
  const visibleLabel = locale === 'zh-TW' ? `健保影像${suffix}` : `NHI imaging${suffix}`
  const accessibleLabel = `${nhiViewerFirstLabel(locale, 1)}${suffix}`
  // Tooltip only — the prerequisite belongs on hover, not in the name a screen
  // reader repeats on every row.
  const hint = nhiViewerPrerequisiteHint(locale)

  const open = async () => {
    if (loading) return
    setLoading(true)
    try {
      const result = await requestNhiViewerOpen(action.descriptor)
      if (!result.ok) toast.error((locale === 'zh-TW' ? ERROR_ZH : ERROR_EN)[result.code] ?? ERROR_ZH.OPEN_FAILED)
    } finally {
      setLoading(false)
    }
  }

  const content = (
    <>
      {loading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ExternalLink className="h-3 w-3" aria-hidden />}
      <span>{loading && locale === 'zh-TW' ? '開啟中…' : loading ? 'Opening…' : visibleLabel}</span>
    </>
  )
  if (nestedInButton) {
    return (
      <NhiViewerTooltip label={nhiViewerOpenLabel(locale)} hint={hint}>
        <span
          role="button"
          tabIndex={loading ? -1 : 0}
          aria-disabled={loading}
          aria-label={action.title ? `${accessibleLabel}：${action.title}` : accessibleLabel}
          onClick={(event) => {
            event.stopPropagation()
            void open()
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (!loading && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              void open()
            }
          }}
          className={LIVE_ACTION_CLASS}
        >
          {content}
        </span>
      </NhiViewerTooltip>
    )
  }

  return (
    <NhiViewerTooltip label={nhiViewerOpenLabel(locale)} hint={hint}>
      <button
        type="button"
        disabled={loading}
        onClick={(event) => {
          event.stopPropagation()
          void open()
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className={LIVE_ACTION_CLASS}
        aria-label={action.title ? `${accessibleLabel}：${action.title}` : accessibleLabel}
      >
        {content}
      </button>
    </NhiViewerTooltip>
  )
}

export function NhiViewerActions({
  actions,
  className,
  nestedInButton = false,
}: {
  actions?: NhiViewerAction[]
  className?: string
  nestedInButton?: boolean
}) {
  const { locale } = useLanguage()
  const safeActions = (actions ?? []).filter((action) => (
    action.kind === 'live' || isTrustedLegacyNhiViewerAttachment(action)
  ))
  if (safeActions.length === 0) return null

  const legacyLabel = locale === 'zh-TW' ? '舊健保影像' : 'Legacy NHI imaging'
  const legacyHint = locale === 'zh-TW'
    ? '此為舊資料中的短效連結，可能已過期。'
    : 'This short-lived link comes from legacy data and may have expired.'

  const controls = safeActions.map((action, index) => {
    const suffix = safeActions.length > 1 ? ` ${index + 1}` : ''
    if (action.kind === 'live') return (
      <LiveViewerButton
        key={`live:${index}:${action.descriptor.iplCaseSeqNo}`}
        action={action}
        nestedInButton={nestedInButton}
        suffix={suffix}
      />
    )
    const label = `${legacyLabel}${suffix}`
    if (nestedInButton) return (
      <span
        key={`legacy:${index}:${action.title ?? ''}`}
        role="link"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation()
          const opened = window.open(action.url, '_blank', 'noopener,noreferrer')
          if (opened) opened.opener = null
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            const opened = window.open(action.url, '_blank', 'noopener,noreferrer')
            if (opened) opened.opener = null
          }
        }}
        className={LEGACY_ACTION_CLASS}
        aria-label={`${locale === 'zh-TW' ? '開啟' : 'Open'} ${label}`}
        title={legacyHint}
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
        <span>{label}</span>
      </span>
    )
    return (
      <a
        key={`legacy:${index}:${action.title ?? ''}`}
        href={action.url}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className={LEGACY_ACTION_CLASS}
        aria-label={`${locale === 'zh-TW' ? '開啟' : 'Open'} ${label}`}
        title={legacyHint}
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
        <span>{label}</span>
      </a>
    )
  })

  const containerClassName = cn('inline-flex shrink-0 items-center', className)
  if (safeActions.length > 1) {
    return (
      <NhiViewerActionMenu
        actions={safeActions}
        nestedInButton={nestedInButton}
        className={containerClassName}
      />
    )
  }
  return nestedInButton ? (
    <span className={containerClassName} data-nhi-viewer-actions>{controls}</span>
  ) : (
    <div className={containerClassName} data-nhi-viewer-actions>{controls}</div>
  )
}

function NhiViewerActionMenu({
  actions,
  nestedInButton,
  className,
}: {
  actions: NhiViewerAction[]
  nestedInButton: boolean
  className?: string
}) {
  const { locale } = useLanguage()
  const [openingIndex, setOpeningIndex] = useState<number | null>(null)
  const allLegacy = actions.every((action) => action.kind === 'legacy')
  const count = actions.length
  const visibleLabel = locale === 'zh-TW' ? `健保影像 ${count}` : `NHI imaging ${count}`
  const menuAccessibleLabel = locale === 'zh-TW'
    ? `選擇健保影像，共 ${count} 筆`
    : `Choose NHI imaging, ${count} studies`
  const primaryAccessibleLabel = nhiViewerFirstLabel(locale, count)
  // A legacy-only cluster opens plain NHI links and needs nothing open, so it
  // must not carry the live request's prerequisite.
  const primaryHint = allLegacy ? null : nhiViewerPrerequisiteHint(locale)

  const openLive = async (action: Extract<NhiViewerAction, { kind: 'live' }>, index: number) => {
    if (openingIndex !== null) return
    setOpeningIndex(index)
    try {
      const result = await requestNhiViewerOpen(action.descriptor)
      if (!result.ok) toast.error((locale === 'zh-TW' ? ERROR_ZH : ERROR_EN)[result.code] ?? ERROR_ZH.OPEN_FAILED)
    } finally {
      setOpeningIndex(null)
    }
  }

  const openLegacy = (action: Extract<NhiViewerAction, { kind: 'legacy' }>) => {
    const opened = window.open(action.url, '_blank', 'noopener,noreferrer')
    if (opened) opened.opener = null
  }

  const openFirst = () => {
    const firstAction = actions[0]
    if (firstAction.kind === 'live') {
      void openLive(firstAction, 0)
    } else {
      openLegacy(firstAction)
    }
  }

  const primaryContent = (
    <>
      {openingIndex !== null
        ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        : <ExternalLink className="h-3 w-3" aria-hidden />}
      <span>{openingIndex !== null && locale === 'zh-TW' ? '開啟中…' : openingIndex !== null ? 'Opening…' : visibleLabel}</span>
    </>
  )
  const actionClassName = allLegacy ? LEGACY_ACTION_CLASS : LIVE_ACTION_CLASS
  const primaryClassName = cn(actionClassName, 'rounded-r-none border-r-0 pr-1.5')
  const menuTriggerClassName = cn(actionClassName, 'rounded-l-none px-1.5')
  const primary = (
    <NhiViewerTooltip label={nhiViewerOpenLabel(locale)} hint={primaryHint}>
      {nestedInButton ? (
        <span
          role="button"
          tabIndex={openingIndex === null ? 0 : -1}
          aria-disabled={openingIndex !== null}
          aria-label={primaryAccessibleLabel}
          className={primaryClassName}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            openFirst()
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (openingIndex === null && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              openFirst()
            }
          }}
        >
          {primaryContent}
        </span>
      ) : (
        <button
          type="button"
          disabled={openingIndex !== null}
          aria-label={primaryAccessibleLabel}
          className={primaryClassName}
          onClick={(event) => {
            event.stopPropagation()
            openFirst()
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {primaryContent}
        </button>
      )}
    </NhiViewerTooltip>
  )

  const menuTrigger = nestedInButton ? (
    <span
      role="button"
      tabIndex={openingIndex === null ? 0 : -1}
      aria-disabled={openingIndex !== null}
      aria-label={menuAccessibleLabel}
      title={menuAccessibleLabel}
      className={menuTriggerClassName}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ChevronDown className="h-3 w-3" aria-hidden />
    </span>
  ) : (
    <button
      type="button"
      disabled={openingIndex !== null}
      aria-label={menuAccessibleLabel}
      title={menuAccessibleLabel}
      className={menuTriggerClassName}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ChevronDown className="h-3 w-3" aria-hidden />
    </button>
  )

  return (
    <span className={className} data-nhi-viewer-actions>
      {primary}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{menuTrigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          {actions.map((action, index) => {
            const itemLabel = locale === 'zh-TW' ? `健保影像 ${index + 1}` : `NHI imaging ${index + 1}`
            if (action.kind === 'live') {
              return (
                <DropdownMenuItem
                  key={`live:${index}:${action.descriptor.iplCaseSeqNo}`}
                  disabled={openingIndex !== null}
                  aria-label={`${locale === 'zh-TW' ? '開啟' : 'Open'} ${itemLabel}`}
                  onSelect={(event) => {
                    event.stopPropagation()
                    void openLive(action, index)
                  }}
                >
                  <ExternalLink aria-hidden />
                  <span>{itemLabel}</span>
                  {action.title ? <span className="ml-auto max-w-[12rem] truncate text-xs text-muted-foreground">{action.title}</span> : null}
                </DropdownMenuItem>
              )
            }
            return (
              <DropdownMenuItem key={`legacy:${index}:${action.title ?? ''}`} asChild>
                <a
                  href={action.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  aria-label={`${locale === 'zh-TW' ? '開啟' : 'Open'} ${itemLabel}`}
                  title={locale === 'zh-TW' ? '此為舊資料中的短效連結，可能已過期。' : 'This short-lived link comes from legacy data and may have expired.'}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <ExternalLink aria-hidden />
                  <span>{itemLabel}</span>
                  {action.title ? <span className="ml-auto max-w-[12rem] truncate text-xs text-muted-foreground">{action.title}</span> : null}
                </a>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
