// 就醫主診斷 rows — claim primary codes, one per ICD-10 code. Plain divided
// rows rather than the bordered Condition rows above, so the two sections do
// not read as the same kind of evidence. 全部／慢性／非慢性 filters on CCIR;
// undetermined codes (Z, V–Y) show only under 全部.
"use client"

import { useId, useState } from 'react'
import { useLanguage } from "@/src/application/providers/language.provider"
import { formatDate } from '../../diagnosis/utils/fhir-helpers'
import type { VisitPrimaryDiagnosis } from '../utils/visit-primary-diagnoses'
import { FilterPills } from './FilterPills'

type ChronicityFilter = 'all' | 'chronic' | 'nonChronic'

interface VisitPrimaryDiagnosisListProps {
  diagnoses: VisitPrimaryDiagnosis[]
}

export function VisitPrimaryDiagnosisList({ diagnoses }: VisitPrimaryDiagnosisListProps) {
  const { t } = useLanguage()
  const tt = (t as any).problemList || {}
  const titleId = useId()
  const [filter, setFilter] = useState<ChronicityFilter>('all')

  const filters: { key: ChronicityFilter; label: string }[] = [
    { key: 'all', label: tt.filterAll || 'All' },
    { key: 'chronic', label: tt.filterChronic || 'Chronic' },
    { key: 'nonChronic', label: tt.filterNonChronic || 'Not chronic' },
  ]
  const shown = filter === 'all' ? diagnoses : diagnoses.filter((d) => d.chronicity === filter)

  const meta = (d: VisitPrimaryDiagnosis): string => {
    const first = formatDate(d.firstDate)
    const last = formatDate(d.lastDate)
    const count = ((d.visitCount === 1 ? tt.visitCountOne : tt.visitCount) || '{count}')
      .replace('{count}', String(d.visitCount))
    const parts =
      d.visitCount > 1 && first && last && first !== last
        ? [(tt.visitSince || '{date}').replace('{date}', first), count, (tt.visitLatest || '{date}').replace('{date}', last)]
        : [last || first, count].filter(Boolean)
    if (d.inpatient) parts.push(tt.visitInpatient || 'Inpatient')
    return parts.join(' · ')
  }

  return (
    <section data-testid="visit-primary-diagnoses" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 id={titleId} className="font-medium text-foreground">
          {tt.visitTitle || 'Visit primary diagnoses'}
        </h3>
        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground ring-1 ring-border">
          {tt.visitBadge || 'Unconfirmed'}
        </span>
        <FilterPills
          label={tt.chronicityFilterLabel || 'Chronicity filter'}
          options={filters}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{tt.visitNote}</p>
      {shown.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">{tt.filterNone || 'No items for this filter'}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {shown.map((d) => (
            <li key={d.key} className="py-2">
              <div className="text-foreground">
                <span className="tabular-nums">{d.code}</span>
                {d.description && <span> {d.description}</span>}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{meta(d)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
