// Patient Info Display Component
import type { PatientInfo } from '../types'

interface PatientInfoDisplayProps {
  patientInfo: PatientInfo
}

export function PatientInfoDisplay({ patientInfo }: PatientInfoDisplayProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="font-medium text-muted-foreground">Name:</span>
      <span className="col-span-2">{patientInfo.name}</span>
      
      <span className="font-medium text-muted-foreground">Gender:</span>
      <span className="col-span-2">{patientInfo.gender}</span>
      
      <span className="font-medium text-muted-foreground">Age:</span>
      <span className="col-span-2">{patientInfo.age}</span>
      
      {patientInfo.id && (
        <>
          <span className="font-medium text-muted-foreground">ID:</span>
          <span className="col-span-2 text-sm text-muted-foreground">
            {patientInfo.id}
          </span>
        </>
      )}
    </div>
  )
}
