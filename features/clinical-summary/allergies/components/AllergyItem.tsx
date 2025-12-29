// Allergy Item Component
import { Badge } from "@/components/ui/badge"
import type { AllergyIntolerance } from '@/src/shared/types/fhir.types'
import { getCodeableConceptText, formatDate } from '@/src/shared/utils/fhir-helpers'

interface AllergyItemProps {
  allergy: AllergyIntolerance
}

export function AllergyItem({ allergy }: AllergyItemProps) {
  const substance = getCodeableConceptText(allergy.code)
  const verificationStatus = getCodeableConceptText(allergy.verificationStatus)
  const criticality = allergy.criticality
  const reactions = allergy.reaction || []

  return (
    <li className="rounded-md border p-3">
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
}
