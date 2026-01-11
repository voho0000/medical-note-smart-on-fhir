/**
 * Unified App Providers
 * 
 * Consolidates remaining Context providers.
 * Many providers have been migrated to Zustand stores:
 * - ApiKeyProvider → useAiConfigStore
 * - ModelSelectionProvider → useAiConfigStore
 * - ChatMessagesProvider → useChatStore
 * 
 * Benefits of Zustand migration:
 * - No Provider nesting needed
 * - Better performance (granular subscriptions)
 * - Simpler code
 * 
 * Architecture: Application Layer
 */

import { ReactNode } from 'react'
import { ThemeProvider } from './theme.provider'
import { LanguageProvider } from './language.provider'
import { PatientProvider } from './patient.provider'
import { ClinicalDataProvider } from './clinical-data.provider'

interface AppProvidersProps {
  children: ReactNode
}

/**
 * Unified provider component - now much simpler!
 * Reduced from 8 providers to 4 providers (50% reduction)
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <PatientProvider>
          <ClinicalDataProvider>
            {children}
          </ClinicalDataProvider>
        </PatientProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
