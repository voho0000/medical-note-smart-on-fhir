// Shared Loading Skeleton Component
export function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-3/4 animate-pulse bg-muted rounded" />
      <div className="h-5 w-1/2 animate-pulse bg-muted rounded" />
      <div className="h-5 w-2/3 animate-pulse bg-muted rounded" />
    </div>
  )
}
