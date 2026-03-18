// Shared Error Message Component
import { AlertCircle, ServerCrash } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'

interface ErrorMessageProps {
  error: Error | unknown
  context?: string
}

function isFhirServerError(message: string): { isFhirError: boolean; serverUrl?: string; statusCode?: string } {
  const fhirUrlMatch = message.match(/https?:\/\/[^\s<]+smarthealthit\.org[^\s<]*/i)
  const statusMatch = message.match(/\b(502|503|500|504)\b/)
  
  return {
    isFhirError: !!(fhirUrlMatch || statusMatch),
    serverUrl: fhirUrlMatch?.[0],
    statusCode: statusMatch?.[1]
  }
}

function getStatusCodeText(statusCode: string): { en: string; zh: string } {
  switch (statusCode) {
    case '502':
      return { en: 'Bad Gateway', zh: '閘道錯誤' }
    case '503':
      return { en: 'Service Unavailable', zh: '服務無法使用' }
    case '504':
      return { en: 'Gateway Timeout', zh: '閘道逾時' }
    default:
      return { en: 'Server Error', zh: '伺服器錯誤' }
  }
}

export function ErrorMessage({ error, context }: ErrorMessageProps) {
  const { t, locale } = useLanguage()
  const message = error instanceof Error ? error.message : String(error)
  const { isFhirError, serverUrl, statusCode } = isFhirServerError(message)
  
  if (isFhirError) {
    const statusText = statusCode ? getStatusCodeText(statusCode) : null
    
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-2 text-amber-600 dark:text-amber-500">
          <ServerCrash className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">{t.errors.fhirServerUnavailable}</div>
            <div className="text-xs mt-1 text-muted-foreground">
              {t.errors.fhirServerUnavailableDesc}
            </div>
          </div>
        </div>
        
        {serverUrl && (
          <div className="pl-6 text-xs">
            <div className="text-muted-foreground">{t.errors.fhirServerLabel}:</div>
            <div className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1 break-all">
              {serverUrl.replace(/\/Patient.*$/, '')}
            </div>
          </div>
        )}
        
        {statusCode && statusText && (
          <div className="pl-6 text-xs text-muted-foreground">
            {t.errors.errorCode}: {statusCode} ({locale === 'en' ? statusText.en : statusText.zh})
          </div>
        )}
        
        <div className="pl-6 text-xs text-muted-foreground">
          💡 {t.errors.fhirServerRetry}
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex items-start gap-2 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <div>
        {context && <div className="font-medium mb-1">Error loading {context}</div>}
        <div className="wrap-break-word">{message}</div>
      </div>
    </div>
  )
}
