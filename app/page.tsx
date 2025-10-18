// app/page.tsx
"use client"

import ClinicalSummaryFeature from "@/features/clinical-summary/Feature"
import MedicalNoteFeature from "@/features/medical-note/Feature"
import { PatientProvider } from "@/lib/providers/PatientProvider"
import { ApiKeyProvider } from "@/lib/providers/ApiKeyProvider"

export default function Page() {
  return (
    <PatientProvider>
      <ApiKeyProvider storage="session">
        <div className="mx-auto max-w-6xl p-6">
          <h1 className="mb-6 text-2xl font-semibold text-center">
            SMART on FHIR · Clinical Summary & Medical Note
          </h1>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <ClinicalSummaryFeature />
            </div>
            <div>
              <MedicalNoteFeature />
            </div>
          </div>
        </div>
      </ApiKeyProvider>
    </PatientProvider>
  )
}
