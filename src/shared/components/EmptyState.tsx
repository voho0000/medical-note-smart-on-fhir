// Shared Empty State Component
interface EmptyStateProps {
  message?: string
}

export function EmptyState({ message = "No data available" }: EmptyStateProps) {
  return (
    <div className="text-sm text-muted-foreground">
      {message}
    </div>
  )
}
