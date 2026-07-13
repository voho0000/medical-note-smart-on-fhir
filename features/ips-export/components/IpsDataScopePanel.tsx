"use client"

import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { BadgeCheck, CalendarClock, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useClinicalDataMapper } from '@/src/application/hooks/data/use-clinical-data-mapper.hook'
import { useDataSelection } from '@/src/application/providers/data-selection.provider'
import { useDataCategories, type DataType } from '@/features/data-selection/hooks/useDataCategories'
import { useDataFiltering } from '@/features/data-selection/hooks/useDataFiltering'
import { CategoryFilterControls } from '@/features/data-selection/components/CategoryFilterControls'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import { inferGroupFromCategory } from '@/src/shared/utils/report-grouping-helpers'
import { INFERENCE_TAG, SYSTEM } from '../utils/ips-constants'
import { orphanResultObservations } from '../utils/ips-helpers'
import type { IpsBundle, IpsCompositionSection } from '../utils/ips-types'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import type { DataFilters } from '@/src/core/entities/clinical-context.entity'
import type { DataCategory, FilterValue } from '@/src/core/interfaces/data-category.interface'

interface IpsDataScopePanelProps {
  bundle: IpsBundle
  /** IPS-curated collection — used for the labs empty-window feedback. */
  curatedData: ClinicalDataCollection | null
}

// P2 快修:narrative 預覽表格只先顯示前 20 列,其餘以「展開全部」載入,避免
// 大病人(數百列檢驗)把 scope panel 撐爆。
const NARRATIVE_PREVIEW_MAX_ROWS = 20

/**
 * Cap the total number of table body rows in a (sanitized) narrative preview.
 * Returns the truncated html plus the original row count so the caller can
 * offer a "show all" toggle. Non-table narrative content passes through as-is.
 */
function truncateNarrativeRows(html: string, maxRows: number): { html: string; totalRows: number } {
  if (typeof DOMParser === 'undefined') return { html, totalRows: 0 }
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return { html, totalRows: 0 }
  const rows = Array.from(root.querySelectorAll('tbody tr'))
  if (rows.length <= maxRows) return { html, totalRows: rows.length }
  for (const tr of rows.slice(maxRows)) tr.remove()
  // Drop tables that lost every body row so no orphan header rows remain.
  for (const tbl of Array.from(root.querySelectorAll('table'))) {
    if (!tbl.querySelector('tbody tr')) tbl.remove()
  }
  return { html: root.innerHTML, totalRows: rows.length }
}

// The IPS sections, in IG order. `selKey` is the DataSelection toggle that gates
// the section ('results' is gated by labReports; orphan observations are folded
// in by IPS curation). `titleKey` indexes t.ipsExport.sections.
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

export function IpsDataScopePanel({ bundle, curatedData }: IpsDataScopePanelProps) {
  const { t } = useLanguage()
  const x = t.ipsExport
  const sectionTitles = x.sections as unknown as Record<string, string>
  const [expandedNarratives, setExpandedNarratives] = useState<Set<string>>(() => new Set())

  const composition = bundle.entry?.[0]?.resource
  const sections = ((composition?.section as IpsCompositionSection[] | undefined) ?? [])

  // Per-section selection edits ONLY the 'ips' profile.
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

  // IPS 專屬:labReportVersion 多一個 'latestPerAnalyte' 選項。只注入到這個
  // panel 用的 category 副本,chat/insights 的資料選擇面板不受影響(那邊直接
  // 讀 registry 的原始 filters)。
  const labCategoryForIps = useMemo<DataCategory | undefined>(() => {
    const category = dataCategoryRegistry.get('labReports')
    if (!category?.filters) return category
    return {
      ...category,
      filters: category.filters.map((f) =>
        f.key === 'labReportVersion'
          ? { ...f, options: [...(f.options ?? []), { value: 'latestPerAnalyte', label: 'Latest 3 per test' }] }
          : f,
      ),
    }
  }, [])

  // P1-2 — labs 空窗回饋:labReports 已勾選、curation 後 Results 完全為空,但
  // 病人其實有檢驗資料 → 提示最近一筆檢驗日期 + 一鍵套用建議
  // (labReportTimeRange 'all' + latestPerAnalyte)。
  const labsEmptyFeedback = useMemo(() => {
    if (!ips.selection.labReports || !curatedData) return null
    const isImaging = (r: { category?: unknown }) => inferGroupFromCategory(r.category as never) === 'imaging'
    const curatedLabCount =
      curatedData.diagnosticReports.filter((r) => !isImaging(r)).length + curatedData.observations.length
    if (curatedLabCount > 0) return null
    const allLabReports = mappedData.diagnosticReports.filter((r) => !isImaging(r))
    const orphans = orphanResultObservations(mappedData.diagnosticReports, mappedData.observations)
    const dates = [
      ...allLabReports.map((r) => r.effectiveDateTime),
      ...orphans.map((o) => o.effectiveDateTime),
    ].filter((d): d is string => !!d)
    if (dates.length === 0) return null // 病人真的沒有任何檢驗 → 空區段是事實,不提示
    return { latestDate: dates.sort((a, b) => b.localeCompare(a))[0].slice(0, 10) }
  }, [ips.selection.labReports, curatedData, mappedData])

  const applyLabsSuggestion = () =>
    setFiltersFor('ips', {
      ...ips.filters,
      labReportTimeRange: 'all',
      labReportVersion: 'latestPerAnalyte',
    })

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

      <div className="space-y-2">
        {IPS_SECTIONS.map((sec) => {
          const included = !!ips.selection[sec.selKey]
          const category = sec.selKey === 'labReports' ? labCategoryForIps : dataCategoryRegistry.get(sec.selKey)
          const hasFilters = (category?.filters?.length ?? 0) > 0
          const curated = byLoinc[sec.loinc]
          const count = included && curated ? (curated.entry?.length ?? 0) : catCount(sec.selKey)
          const narrative = curated?.text?.div
          const showLabsFeedback = sec.selKey === 'labReports' && included && !!labsEmptyFeedback
          const hasNarrativeRows = included && count > 0 && !!narrative
          const isExpanded = expandedNarratives.has(sec.loinc)
          const truncated = hasNarrativeRows
            ? truncateNarrativeRows(DOMPurify.sanitize(narrative), isExpanded ? Number.POSITIVE_INFINITY : NARRATIVE_PREVIEW_MAX_ROWS)
            : null
          const isTruncatable = !!truncated && truncated.totalRows > NARRATIVE_PREVIEW_MAX_ROWS
          return (
            <div key={sec.loinc} className={`rounded-md border ${included ? 'bg-card' : 'bg-muted/20'}`}>
              <div className={`flex items-center justify-between gap-2 px-3 py-2 ${hasNarrativeRows || showLabsFeedback ? 'border-b' : ''}`}>
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

              {showLabsFeedback && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    {x.labsEmptyWindow.replace('{date}', labsEmptyFeedback.latestDate)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={applyLabsSuggestion}
                  >
                    {x.labsEmptyWindowAction}
                  </Button>
                </div>
              )}

              {hasNarrativeRows && truncated && (
                <>
                  <div
                    className="ips-narrative overflow-x-auto px-3 py-2 text-xs [&_p]:mb-1 [&_p]:mt-2 [&_p]:text-muted-foreground [&_p:first-child]:mt-0 [&_p_strong]:font-semibold [&_p_strong]:text-foreground [&_table]:mb-2 [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:border-border/50 [&_td]:py-1 [&_td]:pr-3 [&_th]:py-1 [&_th]:pr-3 [&_th]:font-medium [&_th]:text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: truncated.html }}
                  />
                  {isTruncatable && (
                    <div className="border-t px-3 py-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        onClick={() =>
                          setExpandedNarratives((prev) => {
                            const next = new Set(prev)
                            if (next.has(sec.loinc)) next.delete(sec.loinc)
                            else next.add(sec.loinc)
                            return next
                          })
                        }
                      >
                        {isExpanded
                          ? x.narrativeCollapse
                          : x.narrativeShowAll.replace('{count}', String(truncated.totalRows))}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
