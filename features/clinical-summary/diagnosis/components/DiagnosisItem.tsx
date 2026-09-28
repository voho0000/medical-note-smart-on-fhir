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

  // One line — name, stage, status badges, then the date at the right edge —
  // matching the 就醫主診斷 rows below it; wraps only when the row is too narrow.
  return (
    <li ref={anchorRef} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 leading-5">
      <span className="min-w-0 break-words font-medium text-foreground">{diagnosis.title}</span>

      {/* Cancer staging — a diagnosis attribute (mCODE Condition.stage), shown
          as its own emphasised chip, not a generic category badge. */}
      {diagnosis.stage && (
        <span className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/20">
          {diagnosis.stage}
        </span>
      )}
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
      {diagnosis.when && (
        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground tabular-nums">{diagnosis.when}</span>
      )}
    </li>
  )
}
