// Diagnosis Item Component
"use client"

import { useResourceAnchor } from '@/src/application/hooks/use-resource-anchor.hook'
import type { DiagnosisRow } from '../types'
import { StatusBadge } from './StatusBadge'

interface DiagnosisItemProps {
  diagnosis: DiagnosisRow
}

export function DiagnosisItem({ diagnosis }: DiagnosisItemProps) {
  // Resource-navigation anchor: a cited Condition in the Medical Summary tab
  // scroll-flashes this row.
  const anchorRef = useResourceAnchor<HTMLLIElement>('Condition', diagnosis.id)

  return (
    <li ref={anchorRef} className="rounded-md border p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-medium text-foreground">{diagnosis.title}</div>
        {diagnosis.when && (
          <div className="text-xs text-muted-foreground whitespace-nowrap">{diagnosis.when}</div>
        )}
      </div>

      {/* Cancer staging — a diagnosis attribute (mCODE Condition.stage), shown
          as its own emphasised line, not a generic category badge. */}
      {diagnosis.stage && (
        <div className="mt-1">
          <span className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/20">
            {diagnosis.stage}
          </span>
        </div>
      )}

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
            className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border"
          >
            {c}
          </span>
        ))}
      </div>
    </li>
  )
}
