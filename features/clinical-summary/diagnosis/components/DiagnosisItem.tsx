// Diagnosis Item Component
import type { DiagnosisRow } from '../types'
import { StatusBadge } from './StatusBadge'

interface DiagnosisItemProps {
  diagnosis: DiagnosisRow
}

export function DiagnosisItem({ diagnosis }: DiagnosisItemProps) {
  return (
    <li className="rounded-md border p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-medium text-foreground">{diagnosis.title}</div>
        {diagnosis.when && (
          <div className="text-xs text-muted-foreground whitespace-nowrap">{diagnosis.when}</div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {diagnosis.clinical && (
          <StatusBadge status={diagnosis.clinical} type="clinical" />
        )}
        {diagnosis.verification && (
          <StatusBadge status={diagnosis.verification} type="verification" />
        )}
        {diagnosis.categories?.map((c, i) => (
          <span 
            key={i} 
            className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-200"
          >
            {c}
          </span>
        ))}
      </div>
    </li>
  )
}
