"use client"

import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { BadgeCheck, CheckCircle2, ChevronDown, ChevronRight, Sparkles, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useClinicalDataMapper } from '@/src/application/hooks/data/use-clinical-data-mapper.hook'
import { useDataSelection } from '@/src/application/providers/data-selection.provider'
import { useDataCategories, type DataType } from '@/features/data-selection/hooks/useDataCategories'
import { useDataFiltering } from '@/features/data-selection/hooks/useDataFiltering'
import { CategoryFilterControls } from '@/features/data-selection/components/CategoryFilterControls'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import { INFERENCE_TAG, SYSTEM } from '../utils/ips-constants'
import type { IpsBundle, IpsCompositionSection } from '../utils/ips-types'
import type { ValidationResult } from '../utils/ips-lite-validator'
import type { DataFilters } from '@/src/core/entities/clinical-context.entity'
import type { FilterValue } from '@/src/core/interfaces/data-category.interface'

interface IpsBundlePreviewProps {
  bundle: IpsBundle
  validation: ValidationResult | null
}

// The IPS sections, in IG order. `selKey` is the DataSelection toggle that gates
// the section ('results' is gated by labReports + the secondary observations
// toggle; 'planOfCare' by carePlans). `titleKey` indexes t.ipsExport.sections.
type SectionTitleKey =
  | 'problemList' | 'allergies' | 'medications' | 'immunizations' | 'procedures'
  | 'results' | 'vitalSigns' | 'medicalDevices' | 'planOfCare' | 'advanceDirectives'
type SectionDef = {
  titleKey: SectionTitleKey
  loinc: string
  selKey: DataType
}
const IPS_SECTIONS: SectionDef[] = [
  { titleKey: 'problemList', loinc: '11450-4', selKey: 'problemList' },
  { titleKey: 'allergies', loinc: '48765-2', selKey: 'allergies' },
  { titleKey: 'medications', loinc: '10160-0', selKey: 'medications' },
  { titleKey: 'immunizations', loinc: '11369-6', selKey: 'immunizations' },
  { titleKey: 'procedures', loinc: '47519-4', selKey: 'procedures' },
  { titleKey: 'results', loinc: '30954-2', selKey: 'labReports' },
  { titleKey: 'vitalSigns', loinc: '8716-3', selKey: 'vitalSigns' },
  { titleKey: 'medicalDevices', loinc: '46264-8', selKey: 'medicalDevices' },
  { titleKey: 'planOfCare', loinc: '18776-5', selKey: 'carePlans' },
  { titleKey: 'advanceDirectives', loinc: '42348-3', selKey: 'advanceDirectives' },
]

export function IpsBundlePreview({ bundle, validation }: IpsBundlePreviewProps) {
  const { t } = useLanguage()
  const x = t.ipsExport
  const sectionTitles = x.sections as unknown as Record<string, string>
  const [showJson, setShowJson] = useState(false)
  const [showChecks, setShowChecks] = useState(false)

  const composition = bundle.entry?.[0]?.resource
  const sections = ((composition?.section as IpsCompositionSection[] | undefined) ?? [])
  const json = useMemo(() => JSON.stringify(bundle, null, 2), [bundle])

  // ── Per-section selection (edits ONLY the 'ips' profile) ──────────────────
  const { getProfile, updateSelectionFor, setFiltersFor } = useDataSelection()
  const ips = getProfile('ips')
  const rawClinicalData = useClinicalData()
  const mapper = useClinicalDataMapper()
  const mappedData = useMemo(
    () => (mapper.isValid(rawClinicalData) ? mapper.toClinicalDataCollection(rawClinicalData) : mapper.getEmptyCollection()),
    [rawClinicalData, mapper],
  )
  const { filterKey, handleFilterChange } = useDataFiltering(ips.filters, (f: DataFilters) => setFiltersFor('ips', f))
  const dataCategories = useDataCategories(mappedData, filterKey, ips.filters)
  const adaptedFilters = ips.filters as unknown as Record<string, FilterValue>
  const catCount = (id: DataType) => dataCategories.find((c) => c.id === id)?.count ?? 0
  // Curated section narratives, keyed by LOINC (only the included, non-empty ones).
  const byLoinc = useMemo(() => {
    const m: Record<string, IpsCompositionSection> = {}
    for (const s of sections) {
      const code = s.code?.coding?.[0]?.code
      if (code) m[code] = s
    }
    return m
  }, [sections])

  const snomedCodedCount = useMemo(() => {
    let n = 0
    for (const e of bundle.entry ?? []) {
      const r = e.resource as { resourceType?: string; code?: { coding?: Array<{ system?: string }> } }
      if (r?.resourceType !== 'Condition') continue
      if ((r.code?.coding ?? []).some((cd) => cd?.system === SYSTEM.snomed)) n++
    }
    return n
  }, [bundle])

  const aiInferredCount = useMemo(() => {
    let n = 0
    for (const e of bundle.entry ?? []) {
      const r = e.resource as { resourceType?: string; meta?: { tag?: Array<{ system?: string; code?: string }> } }
      if (r?.resourceType !== 'Condition') continue
      if ((r.meta?.tag ?? []).some((tg) => tg?.system === INFERENCE_TAG.system && tg?.code === INFERENCE_TAG.code)) n++
    }
    return n
  }, [bundle])

  return (
    <div className="space-y-3">
      {/* Validation summary */}
      {validation && (
        <div className="rounded-md border">
          <button
            type="button"
            onClick={() => setShowChecks((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <div className="flex items-center gap-2">
              {validation.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {validation.ok ? x.validation.pass : x.validation.fail}
              </span>
            </div>
            {showChecks ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {showChecks && (
            <ul className="space-y-1 border-t px-3 py-2">
              {validation.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-xs">
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                  <span className={item.ok ? 'text-muted-foreground' : 'text-destructive'}>
                    {item.label}
                    {!item.ok && item.detail ? ` — ${item.detail}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {snomedCodedCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          <span>{x.snomedCoded.replace('{count}', String(snomedCodedCount))}</span>
        </div>
      )}

      {aiInferredCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>{x.aiInferred.replace('{count}', String(aiInferredCount))}</span>
        </div>
      )}

      {/* Sections — toggle + filters live in each section header, alongside its
          data, so you tune what's exported while seeing it. Excluded sections
          stay listed (greyed) so you can re-include them. */}
      <div className="space-y-2">
        {IPS_SECTIONS.map((sec) => {
          const included = !!ips.selection[sec.selKey]
          const category = dataCategoryRegistry.get(sec.selKey)
          const hasFilters = (category?.filters?.length ?? 0) > 0
          const curated = byLoinc[sec.loinc]
          const count = included && curated ? (curated.entry?.length ?? 0) : catCount(sec.selKey)
          const narrative = curated?.text?.div
          return (
            <div key={sec.loinc} className={`rounded-md border ${included ? 'bg-card' : 'bg-muted/20'}`}>
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Switch
                    checked={included}
                    onCheckedChange={(v) => updateSelectionFor('ips', sec.selKey, v)}
                    className="scale-90 shrink-0"
                    aria-label={sectionTitles[sec.titleKey]}
                  />
                  <div className="min-w-0">
                    <div className={`truncate text-sm font-semibold ${included ? '' : 'text-muted-foreground'}`}>
                      {sectionTitles[sec.titleKey]}
                    </div>
                    <div className="text-[0.6875rem] text-muted-foreground">LOINC {sec.loinc}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {included && hasFilters && category && (
                    <CategoryFilterControls
                      category={category}
                      filters={adaptedFilters}
                      onFilterChange={(key, value) => handleFilterChange(key as keyof DataFilters, value)}
                    />
                  )}
                  <Badge variant="secondary" className="shrink-0">{count}</Badge>
                </div>
              </div>

              {!included ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">{x.sectionExcluded}</div>
              ) : narrative ? (
                <div
                  className="ips-narrative overflow-x-auto px-3 py-2 text-xs [&_p]:text-muted-foreground [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:border-border/50 [&_td]:py-1 [&_td]:pr-3 [&_th]:py-1 [&_th]:pr-3 [&_th]:font-medium [&_th]:text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(narrative) }}
                />
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">{x.sectionEmpty}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Raw JSON disclosure */}
      <div className="rounded-md border">
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <span className="text-sm font-medium">{x.rawJson}</span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{bundle.entry?.length ?? 0}</Badge>
            {showJson ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {showJson && (
          <pre className="max-h-80 overflow-auto border-t bg-muted/30 px-3 py-2 text-[0.6875rem] leading-relaxed">
            {json}
          </pre>
        )}
      </div>
    </div>
  )
}
