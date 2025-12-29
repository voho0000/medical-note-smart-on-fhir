"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/src/application/providers/language.provider"

interface PreviewTabProps {
  supplementaryNotes: string
  onSupplementaryNotesChange: (notes: string) => void
  editedClinicalContext: string | null
  onEditedClinicalContextChange: (context: string) => void
  formattedClinicalContext: string
  onReset: () => void
}

export function PreviewTab({
  supplementaryNotes,
  onSupplementaryNotesChange,
  editedClinicalContext,
  onEditedClinicalContextChange,
  formattedClinicalContext,
  onReset,
}: PreviewTabProps) {
  const { t } = useLanguage()
  
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-medium">{t.dataSelection.supplementaryNotes}</h3>
        <p className="text-sm text-muted-foreground">
          {t.dataSelection.supplementaryNotesDescription}
        </p>
      </div>
      <Textarea 
        value={supplementaryNotes}
        onChange={(e) => onSupplementaryNotesChange(e.target.value)}
        className="min-h-[120px] font-mono text-sm"
        placeholder={t.dataSelection.supplementaryNotesPlaceholder}
      />
      <div className="space-y-1 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">{t.dataSelection.formattedClinicalContext}</h2>
          <p className="text-sm text-muted-foreground">
            {t.dataSelection.formattedClinicalContextDescription}
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={onReset}
          disabled={!editedClinicalContext}
        >
          {t.dataSelection.resetToDefault}
        </Button>
      </div>
      <Textarea 
        value={editedClinicalContext ?? formattedClinicalContext}
        onChange={(e) => onEditedClinicalContextChange(e.target.value)}
        className="min-h-[250px] font-mono text-sm"
        placeholder={t.dataSelection.noDataSelected}
      />
    </div>
  )
}
