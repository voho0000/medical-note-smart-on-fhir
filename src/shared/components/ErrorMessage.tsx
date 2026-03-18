// Shared Error Message Component
import { AlertCircle, ServerCrash } from 'lucide-react'

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

export function ErrorMessage({ error, context }: ErrorMessageProps) {
  const message = error instanceof Error ? error.message : String(error)
  const { isFhirError, serverUrl, statusCode } = isFhirServerError(message)
  
  if (isFhirError) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-2 text-amber-600 dark:text-amber-500">
          <ServerCrash className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">FHIR 伺服器暫時無法使用</div>
            <div className="text-xs mt-1 text-muted-foreground">
              這不是應用程式的問題，而是外部 FHIR 伺服器正在維護或暫時無法回應
            </div>
          </div>
        </div>
        
        {serverUrl && (
          <div className="pl-6 text-xs">
            <div className="text-muted-foreground">FHIR 伺服器:</div>
            <div className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1 break-all">
              {serverUrl.replace(/\/Patient.*$/, '')}
            </div>
          </div>
        )}
        
        {statusCode && (
          <div className="pl-6 text-xs text-muted-foreground">
            錯誤代碼: {statusCode} ({statusCode === '502' ? 'Bad Gateway' : statusCode === '503' ? 'Service Unavailable' : 'Server Error'})
          </div>
        )}
        
        <div className="pl-6 text-xs text-muted-foreground">
          💡 請稍後再試，或使用其他 FHIR 伺服器
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
