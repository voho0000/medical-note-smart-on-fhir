// Shared Error Message Component
interface ErrorMessageProps {
  error: Error | unknown
  context?: string
}

export function ErrorMessage({ error, context }: ErrorMessageProps) {
  const message = error instanceof Error ? error.message : String(error)
  
  return (
    <div className="text-sm text-destructive">
      {context && <div className="font-medium mb-1">Error loading {context}</div>}
      <div>{message}</div>
    </div>
  )
}
