// features/clinical-summary/components/AllergiesCard.tsx
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useClinicalData } from "@/lib/providers/ClinicalDataProvider"

type Coding = { 
  system?: string 
  code?: string 
  display?: string 
}

type CodeableConcept = { 
  text?: string 
  coding?: Coding[] 
}

interface AllergyIntolerance {
  id?: string
  resourceType: string
  code?: CodeableConcept
  clinicalStatus?: {
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  verificationStatus?: {
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  criticality?: string
  reaction?: Array<{
    manifestation?: Array<{
      text?: string
      coding?: Array<{
        code?: string
        display?: string
      }>
    }>
    severity?: string
    description?: string
    onset?: string
  }>
  recordedDate?: string
}

function getCodeableConceptText(cc?: CodeableConcept): string {
  if (!cc) return "—"
  return cc.text || cc.coding?.[0]?.display || cc.coding?.[0]?.code || "—"
}

function formatDate(d?: string): string {
  if (!d) return ""
  try { 
    return new Date(d).toLocaleDateString() 
  } catch { 
    return d 
  }
}

export function AllergiesCard() {
  const { allergies = [], isLoading, error } = useClinicalData()

  const activeAllergies = useMemo(() => {
    return (allergies as AllergyIntolerance[]).filter(a => 
      a.clinicalStatus?.coding?.[0]?.code === 'active' || 
      a.verificationStatus?.coding?.[0]?.code === 'confirmed'
    )
  }, [allergies])

  const body = useMemo(() => {
    if (isLoading) {
      return <div className="text-sm text-muted-foreground">Loading allergies…</div>
    }
    
    if (error) {
      return (
        <div className="text-sm text-red-600">
          {error instanceof Error ? error.message : String(error)}
        </div>
      )
    }

    if (activeAllergies.length === 0) {
      return <div className="text-sm text-muted-foreground">No active allergies found.</div>
    }

    return (
      <ul className="space-y-2">
        {activeAllergies.map((allergy) => {
          const substance = getCodeableConceptText(allergy.code)
          const verificationStatus = getCodeableConceptText(allergy.verificationStatus)
          const criticality = allergy.criticality
          const reactions = allergy.reaction || []

          return (
            <li key={allergy.id || Math.random()} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{substance}</span>
                {criticality && (
                  <Badge variant={criticality === "high" ? "destructive" : "secondary"}>
                    {criticality}
                  </Badge>
                )}
                {verificationStatus !== "—" && (
                  <Badge variant="outline">Verified: {verificationStatus}</Badge>
                )}
                {allergy.recordedDate && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDate(allergy.recordedDate)}
                  </span>
                )}
              </div>
              
              {reactions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {reactions.map((reaction, index) => {
                    const severity = reaction.severity
                    const manifestations = reaction.manifestation?.map(m => 
                      getCodeableConceptText(m)
                    ).filter(Boolean).join(", ")
                    
                    return (
                      <div key={index} className="text-sm text-muted-foreground">
                        {severity && (
                          <span className="font-medium text-foreground">
                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                          </span>
                        )}
                        {manifestations && (
                          <span>: {manifestations}</span>
                        )}
                        {reaction.description && (
                          <div className="mt-1 text-muted-foreground">
                            {reaction.description}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }, [isLoading, error, activeAllergies])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allergies & Intolerances</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
