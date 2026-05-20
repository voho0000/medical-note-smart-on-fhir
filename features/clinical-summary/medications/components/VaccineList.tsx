// Vaccine list — flat newest-first list of vaccine product groups.
// Each VaccineItem shows latest dose summary + expandable history when
// the same vaccine was given more than once.
"use client"

import { useLanguage } from '@/src/application/providers/language.provider'
import { VaccineItem } from './VaccineItem'
import type { VaccineRow } from '../hooks/useVaccineRows'

interface VaccineListProps {
  vaccines: VaccineRow[]
}

export function VaccineList({ vaccines }: VaccineListProps) {
  const { t } = useLanguage()
  const mt = (t.medications as any)

  if (vaccines.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {mt.vaccineNoData ?? '無疫苗接種紀錄。'}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">
        {mt.vaccineHeader ?? '疫苗接種'} ({vaccines.length})
      </h3>
      <div className="space-y-1">
        {vaccines.map((v) => (
          <VaccineItem key={v.id} vaccine={v} />
        ))}
      </div>
    </div>
  )
}
