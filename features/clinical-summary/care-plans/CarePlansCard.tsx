// CarePlansCard — IPS "Plan of Care" section (FHIR R4 CarePlan).
//
// Surfaces 照護計畫 from 健保存摺 (糖尿病共同照護, 居家醫療整合照護 …).
// List layout: each plan is one block with a title, a status badge
// (進行中 / 已完成 / 已取消 …) and an indented list of its activities.
//
// SCAFFOLD: field access follows standard FHIR R4. Status → badge mapping uses
// the fixed FHIR CarePlan.status value set (not a fabricated NHI mapping).
// Display strings (title, category, activity descriptions) come from the
// source verbatim; nothing fabricated.
"use client"

import { useMemo } from 'react'
import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { getCodeableConceptText, formatDate } from "@/src/shared/utils/fhir-helpers"
import type { CarePlanEntity } from "@/src/core/entities/clinical-data.entity"

function getCarePlanTitle(cp: CarePlanEntity): string {
  if (cp.title && cp.title.trim()) return cp.title.trim()
  const cat = Array.isArray(cp.category) ? cp.category[0] : undefined
  const catText = getCodeableConceptText(cat)
  if (catText && catText !== '—') return catText
  return cp.description?.trim() || '—'
}

function getActivities(cp: CarePlanEntity): string[] {
  if (!Array.isArray(cp.activity)) return []
  return cp.activity
    .map((a) => {
      const detail = a?.detail
      if (!detail) return ''
      if (detail.description?.trim()) return detail.description.trim()
      const codeText = getCodeableConceptText(detail.code)
      return codeText && codeText !== '—' ? codeText : ''
    })
    .filter(Boolean)
}

const STATUS_CHIP: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  revoked: "bg-muted text-muted-foreground line-through",
  'on-hold': "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  draft: "bg-muted text-muted-foreground",
}

export function CarePlansCard() {
  const { t } = useLanguage()
  const { carePlans, isLoading, error } = useClinicalData()

  const tt = (t as any).carePlans || {
    title: 'Care Plans',
    noData: 'No care plans recorded (not provided by source).',
    activities: 'Activities',
    statusActive: 'Active',
    statusCompleted: 'Completed',
    statusRevoked: 'Cancelled',
    statusOnHold: 'On hold',
    statusDraft: 'Draft',
    statusUnknown: 'Unknown',
  }

  const statusLabel = (status?: string): string => {
    switch (status) {
      case 'active': return tt.statusActive
      case 'completed': return tt.statusCompleted
      case 'revoked': return tt.statusRevoked
      case 'on-hold': return tt.statusOnHold
      case 'draft': return tt.statusDraft
      default: return tt.statusUnknown
    }
  }

  const items = useMemo(() => {
    const list = Array.isArray(carePlans) ? carePlans : []
    return list.map((cp) => {
      const start = cp.period?.start ? formatDate(cp.period.start) : ''
      const end = cp.period?.end ? formatDate(cp.period.end) : ''
      const range = start || end ? `${start}${start || end ? ' – ' : ''}${end}` : ''
      return {
        id: cp.id || `careplan-${cp.created ?? Math.random()}`,
        title: getCarePlanTitle(cp),
        status: cp.status,
        statusText: statusLabel(cp.status),
        range,
        activities: getActivities(cp),
      }
    })
  }, [carePlans, tt])

  return (
    <FeatureCard
      title={tt.title}
      featureId="care-plans"
      isLoading={isLoading}
      error={error}
      isEmpty={items.length === 0}
      emptyMessage={tt.noData}
    >
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id} className="rounded-md border border-border/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{it.title}</span>
              <span
                className={
                  "shrink-0 rounded-full px-2 py-0.5 text-xs " +
                  (STATUS_CHIP[it.status || ''] || "bg-muted text-muted-foreground")
                }
              >
                {it.statusText}
              </span>
            </div>
            {it.range && <div className="mt-0.5 text-xs text-muted-foreground">{it.range}</div>}
            {it.activities.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 border-l-2 border-border/50 pl-3">
                {it.activities.map((a, i) => (
                  <li key={i} className="text-xs text-muted-foreground">{a}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </FeatureCard>
  )
}
