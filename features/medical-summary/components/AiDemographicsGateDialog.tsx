"use client"

import { useAiDemographicsGate } from '@/src/application/providers/ai-demographics-gate.provider'
import { PatientDemographicsEditorDialog } from '@/features/clinical-summary/patient-info/components/PatientDemographicsEditorDialog'

export function AiDemographicsGateDialog() {
  const { dialog } = useAiDemographicsGate()
  if (!dialog.open) return null

  return (
    <PatientDemographicsEditorDialog
      key={`${dialog.importId ?? 'sdk'}:${dialog.profile?.updatedAt ?? 'new'}:ai`}
      open
      onOpenChange={(open) => {
        if (!open) dialog.close()
      }}
      profile={dialog.profile}
      saving={dialog.saving}
      onSave={dialog.save}
      requiredForAi
    />
  )
}
