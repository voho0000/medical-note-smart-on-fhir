// features/clinical-summary/Feature.tsx
"use client"

import { PatientInfoCard } from "./components/PatientInfoCard"
import { MedListCard } from "./components/MedListCard"
import { ReportsCard } from "./components/ReportsCard"
import { AllergiesCard } from "./components/AllergiesCard"
import { VitalsCard } from "./components/VitalsCard"

export default function ClinicalSummaryFeature() {
  return (
    <div className="space-y-6">
      <PatientInfoCard />
      <VitalsCard />
      <MedListCard />
      <AllergiesCard />
      <ReportsCard />
    </div>
  )
}
