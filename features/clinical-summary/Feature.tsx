// features/clinical-summary/Feature.tsx
"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"

import { PatientInfoCard } from "./components/PatientInfoCard"
import { VitalsCard } from "./components/VitalsCard"
import { AllergiesCard } from "./components/AllergiesCard"
import { MedListCard } from "./components/MedListCard"
import { ReportsCard } from "./components/ReportsCard"
import { DiagnosesCard } from "./components/DiagnosisCard" 

export default function ClinicalSummaryFeature() {
  // 固定高度，讓每個分頁內容自行捲動，不影響整頁
  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <Tabs defaultValue="patient" className="flex h-full flex-col">
        {/* 分頁標籤列 */}
        <TabsList className="w-full justify-start">
          <TabsTrigger value="patient">Patient / Vitals / Diagnosis</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="meds">Medications</TabsTrigger>
        </TabsList>

        {/* 分頁內容：各自 ScrollArea */}
        <TabsContent value="patient" className="flex-1">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-4 py-2">
              <PatientInfoCard />
              <VitalsCard />
              <DiagnosesCard />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="reports" className="flex-1">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-4 py-2">
              <ReportsCard />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="meds" className="flex-1">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-4 py-2">
              <AllergiesCard />
              <MedListCard />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
