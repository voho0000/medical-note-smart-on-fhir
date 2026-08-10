"use client"

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CloudUpload, WifiOff } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useConnectivityStore } from '@/src/application/stores/connectivity.store'

export function NetworkStatusBanner() {
  const { t } = useLanguage()
  const browserOnline = useConnectivityStore((state) => state.browserOnline)
  const firestoreConnection = useConnectivityStore((state) => state.firestoreConnection)
  const chatSyncStatus = useConnectivityStore((state) => state.chatSyncStatus)
  const setBrowserOnline = useConnectivityStore((state) => state.setBrowserOnline)
  const [showSlowSync, setShowSlowSync] = useState(false)
  const [showSynced, setShowSynced] = useState(false)
  const degradationWasVisibleRef = useRef(false)

  useEffect(() => {
    const update = () => setBrowserOnline(window.navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [setBrowserOnline])

  useEffect(() => {
    const shouldShow = chatSyncStatus === 'pending' && browserOnline
    const timer = window.setTimeout(() => {
      if (shouldShow) degradationWasVisibleRef.current = true
      setShowSlowSync(shouldShow)
    }, shouldShow ? 1500 : 0)
    return () => window.clearTimeout(timer)
  }, [browserOnline, chatSyncStatus])

  useEffect(() => {
    if (!browserOnline || firestoreConnection === 'cache' || firestoreConnection === 'unavailable') {
      degradationWasVisibleRef.current = true
    }
    if (chatSyncStatus !== 'synced' || !degradationWasVisibleRef.current || !browserOnline) return
    degradationWasVisibleRef.current = false
    setShowSynced(true)
    const timer = window.setTimeout(() => setShowSynced(false), 3000)
    return () => window.clearTimeout(timer)
  }, [browserOnline, chatSyncStatus, firestoreConnection])

  if (!browserOnline) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 rounded-b-md border border-t-0 border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <span>{t.connectivity.offline}</span>
      </div>
    )
  }

  if (firestoreConnection === 'cache' || firestoreConnection === 'unavailable') {
    return (
      <div role="status" className="flex items-center justify-center gap-2 rounded-b-md border border-t-0 border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>{t.connectivity.cloudUnavailable}</span>
      </div>
    )
  }

  if (showSlowSync) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 rounded-b-md border border-t-0 border-sky-300 bg-sky-50 px-3 py-1.5 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100">
        <CloudUpload className="h-3.5 w-3.5 shrink-0 animate-pulse" />
        <span>{t.connectivity.pendingSync}</span>
      </div>
    )
  }

  if (chatSyncStatus === 'error') {
    return (
      <div role="status" className="flex items-center justify-center gap-2 rounded-b-md border border-t-0 border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>{t.connectivity.syncError}</span>
      </div>
    )
  }

  if (showSynced) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 rounded-b-md border border-t-0 border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>{t.connectivity.synced}</span>
      </div>
    )
  }

  return null
}
