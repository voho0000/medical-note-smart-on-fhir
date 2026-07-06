// ProblemListCard — patient problem / diagnosis list.
//
// Shows ALL fetched conditions (no category filter), so it works for BOTH:
//   - bridge-tagged `problem-list-item` conditions (健保存摺 重大傷病), and
//   - standard FHIR servers / the SMART sandbox, where conditions are usually
//     category `encounter-diagnosis` (or have no category at all).
// A clinicalStatus filter (default: Active) keeps the card focused — general
// FHIR sources carry lots of `resolved` history that would otherwise flood it.
"use client"

import { useMemo, useState } from 'react'
import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { cn } from "@/src/shared/utils/cn.utils"
import { useDiagnosis } from '../diagnosis/hooks/useDiagnosis'
import { useDiagnosisRows } from '../diagnosis/hooks/useDiagnosisRows'
import { DiagnosisList } from '../diagnosis/components/DiagnosisList'

type StatusFilter = 'active' | 'resolved' | 'all'

// FHIR clinicalStatus value set (hl7.org/fhir/valueset-condition-clinical).
const ACTIVE_STATUSES = new Set(['active', 'recurrence', 'relapse'])
const RESOLVED_STATUSES = new Set(['resolved', 'inactive', 'remission'])

function matchesFilter(clinicalStatus: string | undefined, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  const s = (clinicalStatus || '').toLowerCase()
  // 'active' also keeps unknown/blank status — don't silently hide it.
  if (filter === 'active') return s === '' || ACTIVE_STATUSES.has(s)
  return RESOLVED_STATUSES.has(s)
}

export function ProblemListCard() {
  const { t } = useLanguage()
  const { conditions, isLoading, error } = useDiagnosis()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')

  const tt = (t as any).problemList || {}

  const filteredConditions = useMemo(
    () =>
      Array.isArray(conditions)
        ? conditions.filter((c: any) => matchesFilter(c?.clinicalStatus, statusFilter))
        : [],
    [conditions, statusFilter]
  )
  const rows = useDiagnosisRows(filteredConditions)

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'active', label: tt.filterActive || 'Active' },
    { key: 'resolved', label: tt.filterResolved || 'Resolved' },
    { key: 'all', label: tt.filterAll || 'All' },
  ]

  return (
    <FeatureCard
      title={tt.title || 'Problem List'}
      featureId="problem-list"
      isLoading={isLoading}
      error={error}
      isEmpty={Array.isArray(conditions) ? conditions.length === 0 : true}
      emptyMessage={tt.noData || 'No problem list items.'}
    >
      <div data-testid="problem-list-card">
        <div className="mb-2 flex items-center gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              aria-pressed={statusFilter === f.key}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                statusFilter === f.key
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {rows.length > 0 ? (
          // Cap the visible height so a long problem list (e.g. 50+ 重大傷病)
          // scrolls internally instead of pushing every card below it far down
          // the panel's single outer scroll. Matches the AI-summary problem
          // card's max-h + overflow pattern.
          <div className="max-h-[32rem] overflow-y-auto scrollbar-thin-persistent pr-1">
            <DiagnosisList diagnoses={rows} isLoading={false} error={null} />
          </div>
        ) : (
          <p className="py-2 text-xs text-muted-foreground">{tt.filterNone || 'No items for this filter'}</p>
        )}
      </div>
    </FeatureCard>
  )
}
