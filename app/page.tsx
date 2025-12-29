// app/page.tsx
"use client"

import { PatientProvider } from "@/src/application/providers/patient.provider"
import { ClinicalDataProvider } from "@/src/application/providers/clinical-data.provider"
import { ApiKeyProvider } from "@/src/application/providers/api-key.provider"
import ClinicalSummaryFeature from "@/src/layouts/LeftPanelLayout"
import { RightPanelFeature } from "@/src/layouts/RightPanelLayout"

export default function Page() {
  return (
    <ApiKeyProvider>
      <PatientProvider>
        <ClinicalDataProvider>
          <div className="flex h-svh flex-col overflow-hidden">
            <header className="shrink-0 border-b px-6 py-3">
              <h1 className="text-xl font-semibold">Clinical Summary | Medical Note</h1>
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
        </ClinicalDataProvider>
      </PatientProvider>
    </ApiKeyProvider>
  )
}
