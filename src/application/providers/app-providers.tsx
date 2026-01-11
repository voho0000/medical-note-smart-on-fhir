
import { ReactNode } from 'react'
import { ThemeProvider } from './theme.provider'
import { LanguageProvider } from './language.provider'
import { PatientProvider } from './patient.provider'
import { ClinicalDataProvider } from './clinical-data.provider'

interface AppProvidersProps {
  children: ReactNode
}

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
