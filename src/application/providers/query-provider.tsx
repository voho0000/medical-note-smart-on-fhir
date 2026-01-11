/**
 * React Query Provider
 * 
 * Provides React Query (TanStack Query) context for server state management.
 * Used for FHIR data fetching (Patient, ClinicalData).
 * 
 * Benefits:
 * - Automatic caching and background refetching
 * - Loading and error states handled automatically
 * - Optimistic updates and mutations
 * - No unnecessary re-renders
 */

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode, useState } from 'react'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
