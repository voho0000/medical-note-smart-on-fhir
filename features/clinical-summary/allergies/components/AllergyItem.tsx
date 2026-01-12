// Allergy Item Component
import { Badge } from "@/components/ui/badge"
import type { AllergyIntolerance } from '@/src/shared/types/fhir.types'
import { getCodeableConceptText, formatDate } from '@/src/shared/utils/fhir-helpers'
import { useLanguage } from "@/src/application/providers/language.provider"

interface AllergyItemProps {
  allergy: AllergyIntolerance
}

export function AllergyItem({ allergy }: AllergyItemProps) {
  const { t } = useLanguage()
  const substance = getCodeableConceptText(allergy.code)
  // 直接使用字符串值，不用 getCodeableConceptText
  const clinicalStatus = typeof allergy.clinicalStatus === 'string' 
    ? allergy.clinicalStatus 
    : getCodeableConceptText(allergy.clinicalStatus)
  const verificationStatus = typeof allergy.verificationStatus === 'string'
    ? allergy.verificationStatus
    : getCodeableConceptText(allergy.verificationStatus)
  const criticality = allergy.criticality
  const type = allergy.type || 'allergy' // 默认为 allergy
  const category = allergy.category?.[0] || 'food' // 根据你的数据，默认为 food
  const reactions = allergy.reaction || []
  
  // 获取翻译
  const getTypeLabel = (type: string) => t.allergies.type[type as keyof typeof t.allergies.type] || type
  const getCategoryLabel = (cat: string) => t.allergies.category[cat as keyof typeof t.allergies.category] || cat
  const getCriticalityLabel = (crit: string) => t.allergies.criticality[crit as keyof typeof t.allergies.criticality] || crit

  return (
    <li className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{substance}</span>
            {type && (
              <Badge variant="outline" className="text-xs">
                {getTypeLabel(type)}
              </Badge>
            )}
            {category && (
              <Badge variant="secondary" className="text-xs">
                {getCategoryLabel(category)}
              </Badge>
            )}
            {criticality && (
              <Badge variant={criticality === "high" ? "destructive" : criticality === "low" ? "secondary" : "outline"} className="text-xs">
                {t.allergies.criticality.label}: {getCriticalityLabel(criticality)}
              </Badge>
            )}
          </div>
          
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {clinicalStatus && clinicalStatus !== "—" && (
              <span>{t.allergies.status}: {clinicalStatus}</span>
            )}
            {verificationStatus && verificationStatus !== "—" && (
              <span>{t.allergies.verification}: {verificationStatus}</span>
            )}
          </div>
        </div>
        
        {allergy.recordedDate && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
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
