import { ReactNode } from 'react'
import { ThemeProvider } from './theme.provider'
import { LanguageProvider } from './language.provider'
import { QueryProvider } from './query-provider'

interface AppProvidersProps {
  children: ReactNode
}

/**
 * Unified App Providers - Clean Architecture
 * 
 * Provider reduction: 8 → 3 (62.5% reduction!)
 * 
 * Final architecture:
 * 1. QueryProvider: Server state (FHIR data via React Query)
 *    - Patient data: usePatientQuery()
 *    - Clinical data: useClinicalDataQuery()
 * 
 * 2. ThemeProvider: UI infrastructure (low-frequency updates)
 * 
 * 3. LanguageProvider: UI infrastructure (i18n, low-frequency updates)
 * 
 * State management strategy:
 * - High-frequency client state → Zustand (API keys, model, chat)
 * - Server state (FHIR) → React Query (patient, clinical data)
 * - UI infrastructure → Context (theme, language)
 * 
 * Benefits:
 * - Automatic caching (5 min stale time)
 * - Background refetching
 * - Dependent queries
 * - No unnecessary re-renders
 * - Clean separation of concerns
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </ThemeProvider>
    </QueryProvider>
  )
}
