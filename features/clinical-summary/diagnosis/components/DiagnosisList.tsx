// Diagnosis List Component
import type { DiagnosisRow } from '../types'
import { DiagnosisItem } from './DiagnosisItem'

interface DiagnosisListProps {
  diagnoses: DiagnosisRow[]
  isLoading: boolean
  error: Error | null
}

export function DiagnosisList({ diagnoses, isLoading, error }: DiagnosisListProps) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading diagnoses…</div>
  }
  
  if (error) {
    return <div className="text-sm text-red-600">{String(error)}</div>
  }
  
  if (diagnoses.length === 0) {
    return <div className="text-sm text-muted-foreground">No active diagnoses.</div>
  }

  return (
    <ul className="space-y-2">
      {diagnoses.map((diagnosis) => (
        <DiagnosisItem key={diagnosis.id} diagnosis={diagnosis} />
      ))}
    </ul>
  )
}
