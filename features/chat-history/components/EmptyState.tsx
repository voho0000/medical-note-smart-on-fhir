// Empty State Component
import { MessageSquare } from 'lucide-react'

interface EmptyStateProps {
  message: string
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
