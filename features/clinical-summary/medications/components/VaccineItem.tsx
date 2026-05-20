// Vaccine Item — point-event row (no chronic / no days-remaining).
//
// Same density target as MedicationItem (2 lines visible). When a vaccine
// has been administered more than once (flu yearly, COVID series, HPV
// boosters), the secondary doses are revealed via an expandable accordion.
"use client"

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import type { VaccineRow } from '../hooks/useVaccineRows'

interface VaccineItemProps {
  vaccine: VaccineRow
}

function Sep() {
  return <span className="text-muted-foreground/40 select-none" aria-hidden>·</span>
}

export function VaccineItem({ vaccine }: VaccineItemProps) {
  const { t } = useLanguage()
  const mt = (t.medications as any)
  const [expanded, setExpanded] = useState(false)
  const doseCount = vaccine.doses.length
  const latest = vaccine.doses[0]

  return (
    <div className="rounded-md border px-2.5 py-1 leading-tight">
      {/* ── Line 1: vaccine name + category + dose count ──────────────── */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className="text-[13px] font-semibold truncate"
            title={vaccine.name}
          >
            {vaccine.name}
          </span>
          {vaccine.category && (
            <span
              title={vaccine.category}
              className="inline-flex shrink-0 max-w-[10rem] items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0 text-[10px] font-medium text-slate-700 truncate"
            >
              {vaccine.category}
            </span>
          )}
        </div>
        {doseCount > 1 ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-0.5 rounded-full border bg-background text-foreground hover:bg-muted px-1.5 py-0 text-[10px] font-medium shrink-0"
            title={mt.vaccineDosesExpand ?? '展開歷次接種'}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {doseCount} {mt.vaccineDoseTimes ?? '劑'}
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground shrink-0">
            1 {mt.vaccineDoseTimes ?? '劑'}
          </span>
        )}
      </div>

      {/* ── Line 2: latest dose summary ───────────────────────────────── */}
      <div className="mt-0 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] text-muted-foreground">
        {latest?.dateLabel && <span>{latest.dateLabel}</span>}
        {latest?.provider && (
          <>
            <Sep />
            <span>{latest.provider}</span>
          </>
        )}
        {latest?.icdCode && (
          <>
            <Sep />
            <span title={mt.billingIcdTooltip} className="cursor-help">
              <span className="font-mono">{latest.icdCode}</span>
              {latest.icdText && <span className="ml-1">{latest.icdText}</span>}
            </span>
          </>
        )}
      </div>

      {/* ── Expanded dose history ────────────────────────────────────── */}
      {expanded && doseCount > 1 && (
        <ul className="mt-1 ml-3 border-l border-muted-foreground/20 pl-2 space-y-0.5 text-[10px] text-muted-foreground">
          {vaccine.doses.map((d, i) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-1.5">
              <span className="font-medium text-foreground/70 mr-0.5">#{doseCount - i}</span>
              {d.dateLabel && <span>{d.dateLabel}</span>}
              {d.provider && (<><Sep /><span>{d.provider}</span></>)}
              {d.icdCode && (
                <>
                  <Sep />
                  <span title={mt.billingIcdTooltip} className="cursor-help">
                    <span className="font-mono">{d.icdCode}</span>
                    {d.icdText && <span className="ml-1">{d.icdText}</span>}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
