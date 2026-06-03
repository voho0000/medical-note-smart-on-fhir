// AdvanceDirectivesCard — IPS "Advance Directives" section (FHIR R4 Consent).
//
// Surfaces 預立醫療決定 from 健保存摺: 安寧緩和醫療意願 (palliative / DNR),
// 器官捐贈意願 (organ donation), 病人自主權利法預立醫療決定 (AD). Compact
// pill-row layout — each consent renders as a pill showing the category plus a
// provision badge. A deny provision (e.g. 不施行 CPR) is the clinically
// load-bearing case and gets an amber accent.
//
// SCAFFOLD: field access follows standard FHIR R4. Display strings come from
// the source CodeableConcepts verbatim (text → coding.display → code); there
// is no canonical analyte mapping here, so nothing is fabricated. Audience-
// aware refinement is deferred until real bridge samples confirm the shape.
"use client"

import { useMemo } from 'react'
import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { getCodeableConceptText, formatDate } from "@/src/shared/utils/fhir-helpers"
import type { ConsentEntity } from "@/src/core/entities/clinical-data.entity"

function getConsentLabel(c: ConsentEntity): string {
  const cat = Array.isArray(c.category) ? c.category[0] : undefined
  const catText = getCodeableConceptText(cat)
  if (catText && catText !== '—') return catText
  return getCodeableConceptText(c.scope)
}

export function AdvanceDirectivesCard() {
  const { t } = useLanguage()
  const { consents, isLoading, error } = useClinicalData()

  const tt = (t as any).advanceDirectives || {
    title: 'Advance Directives',
    noData: 'No advance directives on record.',
    deny: 'Declined',
    permit: 'Agreed',
    unknown: 'Recorded',
  }

  const items = useMemo(() => {
    const list = Array.isArray(consents) ? consents : []
    return list.map((c) => {
      const type = c.provision?.type
      const deny = type === 'deny'
      const provisionLabel = type === 'deny' ? tt.deny : type === 'permit' ? tt.permit : tt.unknown
      return {
        id: c.id || `consent-${c.dateTime ?? Math.random()}`,
        label: getConsentLabel(c),
        deny,
        provisionLabel,
        date: formatDate(c.dateTime),
      }
    })
  }, [consents, tt])

  return (
    <FeatureCard
      title={tt.title}
      featureId="advance-directives"
      isLoading={isLoading}
      error={error}
      isEmpty={items.length === 0}
      emptyMessage={tt.noData}
    >
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <span
            key={it.id}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs " +
              (it.deny
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                : "border-border bg-muted/50 text-foreground")
            }
          >
            <span className="font-medium">{it.label}</span>
            <span className="opacity-70">· {it.provisionLabel}</span>
            {it.date && <span className="opacity-50">· {it.date}</span>}
          </span>
        ))}
      </div>
    </FeatureCard>
  )
}
