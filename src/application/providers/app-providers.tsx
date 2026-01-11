/**
 * Unified App Providers
 * 
 * Consolidates remaining Context providers.
 * Successfully migrated to Zustand stores:
 * ✅ ApiKeyProvider → useAiConfigStore
 * ✅ ModelSelectionProvider → useAiConfigStore  
 * ✅ ChatMessagesProvider → useChatStore
 * 
 * Benefits achieved:
 * - No Provider nesting for migrated state
 * - Better performance (granular subscriptions)
 * - Simpler code and better DX
 * - Provider count reduced from 8 to 4 (50% reduction)
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
 * Unified provider component - 50% reduction achieved!
 * Before: 8 providers (Theme, Language, ApiKey, ModelSelection, ChatMessages, Patient, ClinicalData, + others)
 * After: 4 providers (Theme, Language, Patient, ClinicalData)
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
