// Error Boundary Component
"use client"

import { Component, ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw } from "lucide-react"
import { useOptionalLanguage } from "@/src/application/providers/language.provider"
import {
  isChunkLoadError,
  recoverFromChunkLoadError,
} from "@/src/shared/utils/chunk-load-recovery"

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

function DefaultErrorFallback({ error }: { error: Error | null }) {
  const language = useOptionalLanguage()
  const chunkLoadFailed = isChunkLoadError(error)
  const title = chunkLoadFailed
    ? language?.t.errors.chunkLoadTitle ?? '網站已更新，需要重新載入'
    : language?.t.errors.unexpectedTitle ?? '畫面暫時無法顯示'
  const description = chunkLoadFailed
    ? language?.t.errors.chunkLoadDescription
      ?? '頁面使用的舊版程式已失效。重新載入後會保留已儲存的設定與資料。'
    : error?.message || language?.t.errors.unknown || '發生未知錯誤'
  const reloadLabel = language?.t.errors.reloadPage ?? '重新載入頁面'

  return (
    <Card role="alert" className="border-destructive/40 bg-destructive/5 shadow-none">
      <CardHeader className="space-y-0 p-4 pb-2">
        <CardTitle className="flex items-start gap-2 text-base text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        {chunkLoadFailed ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 sm:h-8"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
            {reloadLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
    recoverFromChunkLoadError(error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return <DefaultErrorFallback error={this.state.error} />
    }

    return this.props.children
  }
}
