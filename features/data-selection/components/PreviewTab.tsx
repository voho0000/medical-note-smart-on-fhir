"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

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
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-medium">Supplementary Notes</h3>
        <p className="text-sm text-muted-foreground">
          Add additional context or notes to send to the AI
        </p>
      </div>
      <Textarea 
        value={supplementaryNotes}
        onChange={(e) => onSupplementaryNotesChange(e.target.value)}
        className="min-h-[120px] font-mono text-sm"
        placeholder="Add supplementary notes here..."
      />
      <div className="space-y-1 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Formatted Clinical Context</h2>
          <p className="text-sm text-muted-foreground">
            Edit the clinical context to remove unnecessary details
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={onReset}
          disabled={!editedClinicalContext}
        >
          Reset to Default
        </Button>
      </div>
      <Textarea 
        value={editedClinicalContext ?? formattedClinicalContext}
        onChange={(e) => onEditedClinicalContextChange(e.target.value)}
        className="min-h-[250px] font-mono text-sm"
        placeholder="No data selected"
      />
    </div>
  )
}
