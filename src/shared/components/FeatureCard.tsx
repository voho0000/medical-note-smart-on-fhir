// Unified Feature Card Wrapper Component
import { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeleton } from './LoadingSkeleton'
import { ErrorMessage } from './ErrorMessage'
import { EmptyState } from './EmptyState'

interface FeatureCardProps {
  title: string
  isLoading?: boolean
  error?: Error | null
  isEmpty?: boolean
  emptyMessage?: string
  children: ReactNode
}

export function FeatureCard({ 
  title, 
  isLoading = false,
  error = null,
  isEmpty = false,
  emptyMessage = "No data available",
  children 
}: FeatureCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <LoadingSkeleton />}
        {!isLoading && error && <ErrorMessage error={error} context={title.toLowerCase()} />}
        {!isLoading && !error && isEmpty && <EmptyState message={emptyMessage} />}
        {!isLoading && !error && !isEmpty && children}
      </CardContent>
    </Card>
  )
}
