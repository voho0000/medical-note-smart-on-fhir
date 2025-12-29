// features/clinical-summary/Feature.tsx
"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getEnabledFeatures } from "@/src/shared/config/feature-registry"
import { VisitHistoryCard } from "./visit-history/VisitHistoryCard"

export default function ClinicalSummaryFeature() {
  const features = getEnabledFeatures()
  
  // Group features by tab
  const patientTabFeatures = features.filter(f => 
    ['patient-info', 'vitals', 'diagnosis'].includes(f.id)
  )
  const medsTabFeatures = features.filter(f => 
    ['allergies', 'medications'].includes(f.id)
  )
  const reportsTabFeatures = features.filter(f => 
    f.id === 'reports'
  )

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <Tabs defaultValue="patient" className="flex h-full flex-col">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="patient">Patient / Vitals / Diagnosis</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="meds">Medications</TabsTrigger>
          <TabsTrigger value="visits">Visit History</TabsTrigger>
        </TabsList>

        <TabsContent value="patient" className="flex-1">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-4 py-2">
              {patientTabFeatures.map(feature => {
                const Component = feature.component
                return <Component key={feature.id} />
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="reports" className="flex-1">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-4 py-2">
              {reportsTabFeatures.map(feature => {
                const Component = feature.component
                return <Component key={feature.id} />
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="meds" className="flex-1">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-4 py-2">
              {medsTabFeatures.map(feature => {
                const Component = feature.component
                return <Component key={feature.id} />
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="visits" className="flex-1">
          <ScrollArea className="h-full pr-2">
            <div className="space-y-4 py-2">
              <VisitHistoryCard />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
