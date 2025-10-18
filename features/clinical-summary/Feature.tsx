"use client"

import { PatientInfoCard } from "./components/PatientInfoCard"
import { MedListCard } from "./components/MedListCard"
import { ReportsCard } from "./components/ReportsCard"

export default function ClinicalSummaryFeature() {
  return (
    <div className="space-y-4">
      <PatientInfoCard />
      <MedListCard />
      <ReportsCard />
    </div>
  )
}
