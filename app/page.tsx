// app/page.tsx
"use client"

import { PatientProvider } from "@/src/application/providers/patient.provider"
import { ClinicalDataProvider } from "@/src/application/providers/clinical-data.provider"
import { ApiKeyProvider } from "@/src/application/providers/api-key.provider"
import { LanguageProvider, useLanguage } from "@/src/application/providers/language.provider"
import { LanguageSwitcher } from "@/src/shared/components/LanguageSwitcher"
import ClinicalSummaryFeature from "@/src/layouts/LeftPanelLayout"
import { RightPanelFeature } from "@/src/layouts/RightPanelLayout"

function PageContent() {
  const { t } = useLanguage()
  
  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="shrink-0 border-b px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t.header.title}</h1>
          <LanguageSwitcher />
        </div>
      </header>
            <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-2">
              {/* Left Panel - Clinical Summary */}
              <section className="min-h-0 overflow-y-auto">
                <ClinicalSummaryFeature />
              </section>
              
              {/* Right Panel - Tabs (Medical Note / Data Selection) */}
              <section className="min-h-0 overflow-y-auto">
                <RightPanelFeature />
              </section>
            </main>
          </div>
  )
}

export default function Page() {
  return (
    <LanguageProvider>
      <ApiKeyProvider>
        <PatientProvider>
          <ClinicalDataProvider>
            <PageContent />
          </ClinicalDataProvider>
        </PatientProvider>
      </ApiKeyProvider>
    </LanguageProvider>
  )
}
