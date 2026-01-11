import { ReactNode } from 'react'
import { ThemeProvider } from './theme.provider'
import { LanguageProvider } from './language.provider'
import { PatientProvider } from './patient.provider'
import { ClinicalDataProvider } from './clinical-data.provider'
import { QueryProvider } from './query-provider'

interface AppProvidersProps {
  children: ReactNode
}

/**
 * Unified provider component - React Query migration complete!
 * 
 * Before: 8 providers
 * After: 3 providers (62.5% reduction!)
 * 
 * Final architecture:
 * - QueryProvider: Server state management (FHIR data via React Query)
 * - ThemeProvider: UI infrastructure (low-frequency, ecosystem support)
 * - LanguageProvider: UI infrastructure (low-frequency, i18n integration)
 * 
 * Migrated to React Query:
 * - Patient data (usePatientQuery)
 * - Clinical data (useClinicalDataQuery)
 * 
 * Benefits:
 * - Automatic caching and background refetching
 * - No unnecessary re-renders
 * - Built-in loading/error states
 * - Dependent queries handled automatically
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
