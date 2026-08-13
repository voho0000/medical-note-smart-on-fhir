"use client"

import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
  const accessibleLabel = locale === 'zh-TW'
    ? `開啟 DICOM Viewer（健保影像）${suffix}`
    : `Open DICOM Viewer (NHI imaging)${suffix}`

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
  const className = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none text-sky-800 transition-colors hover:border-sky-400 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-sky-300/50 disabled:cursor-wait disabled:opacity-60 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900/50'

  if (nestedInButton) {
    return (
      <span
        role="button"
        tabIndex={loading ? -1 : 0}
        aria-disabled={loading}
        aria-label={action.title ? `${accessibleLabel}：${action.title}` : accessibleLabel}
        title={accessibleLabel}
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
        className={className}
      >
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={(event) => {
        event.stopPropagation()
        void open()
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className={className}
      aria-label={action.title ? `${accessibleLabel}：${action.title}` : accessibleLabel}
      title={accessibleLabel}
    >
      {content}
    </button>
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
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
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
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        aria-label={`${locale === 'zh-TW' ? '開啟' : 'Open'} ${label}`}
        title={legacyHint}
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
        <span>{label}</span>
      </a>
    )
  })

  const containerClassName = cn('flex flex-wrap items-center gap-1.5', className)
  return nestedInButton ? (
    <span className={containerClassName} data-nhi-viewer-actions>{controls}</span>
  ) : (
    <div className={containerClassName} data-nhi-viewer-actions>{controls}</div>
  )
}
