"use client"

import { useMemo, useState } from "react"
import { Search, AlertCircle, X } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { Card, CardContent } from "@/components/ui/card"
import { CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { cn } from "@/src/shared/utils/cn.utils"
import { dateSearchTokens } from "@/src/shared/utils/date.utils"
import { buildIcdDictionary } from "@/src/shared/utils/icd-lookup"
import { useVisitHistory } from "../hooks/useVisitHistory"
import { useEncounterDetails } from "../hooks/useEncounterDetails"
import { useClinicalNotes } from "../hooks/useClinicalNotes"
import { useVisitStats } from "../hooks/useVisitStats"
import { useDocumentSummaries } from "@/features/clinical-summary/document-summary/hooks/useDocumentSummaries"
import { useDocumentSummaryStrings } from "@/features/clinical-summary/document-summary/utils/strings"
import type { DocumentEntry } from "@/features/clinical-summary/document-summary/types"
import { VisitItem } from "./VisitItem"

type VisitTypeFilter = 'all' | 'outpatient' | 'inpatient' | 'emergency' | 'pharmacy'
type SortMode = 'date-desc' | 'date-asc' | 'abnormal'
type ContentFlag = 'tests' | 'medications' | 'procedures' | 'discharge'

const FILTER_TYPES: VisitTypeFilter[] = ['all', 'outpatient', 'inpatient', 'emergency', 'pharmacy']

export function VisitHistoryCard() {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const {
    encounters = [],
    medications = [],
    diagnosticReports = [],
    observations = [],
    procedures = [],
    conditions = [],
    documentReferences = [],
    compositions = [],
    isLoading,
    error,
  } = useClinicalData()

  // ── State ──────────────────────────────────────────────────────────────
  // Set (not a single id) so several visits can stay expanded at once —
  // opening one no longer collapses the others.
  const [expandedVisitIds, setExpandedVisitIds] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<VisitTypeFilter>('all')
  const [institutionFilter, setInstitutionFilter] = useState<string>('all')
  const [contentFlags, setContentFlags] = useState<Set<ContentFlag>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('date-desc')

  // ── Data derivation ────────────────────────────────────────────────────
  const clinicalNotes = useClinicalNotes(documentReferences, compositions)
  const encounterDetails = useEncounterDetails(
    medications, diagnosticReports, observations, procedures,
    clinicalNotes, conditions, locale, audience,
  )
  // ICD dict prefers Chinese when UI is zh-TW; English coding[].display when UI is en.
  const icdDict = useMemo(() => buildIcdDictionary(conditions, locale), [conditions, locale])
  const visitHistory = useVisitHistory(encounters, icdDict)
  const visitStats = useVisitStats(encounterDetails)

  // Documents that reference an Encounter (e.g. 出院病摘 / discharge summaries)
  // are surfaced inline on their linked visit. Keyed by encounter id so each
  // VisitItem can pull its own.
  const docStrings = useDocumentSummaryStrings()
  const { entries: documentEntries } = useDocumentSummaries(docStrings.docTypes)
  const docsByEncounter = useMemo(() => {
    const map = new Map<string, DocumentEntry[]>()
    for (const e of documentEntries) {
      const encId = e.encounterRef?.split('/').pop()
      if (!encId) continue
      const arr = map.get(encId) ?? []
      arr.push(e)
      map.set(encId, arr)
    }
    return map
  }, [documentEntries])
  const hasAnyDischargeSummary = useMemo(
    () => documentEntries.some((e) => e.isDischargeSummary),
    [documentEntries],
  )

  // Unique institutions for the dropdown
  const institutions = useMemo(() => {
    const set = new Set<string>()
    for (const v of visitHistory) if (v.institution) set.add(v.institution)
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [visitHistory])

  // Counts per type filter (always reflect type only; institution / content
  // filters narrow the result list but the per-type chip count remains stable
  // for orientation).
  const counts = useMemo(() => {
    const c = { all: visitHistory.length, outpatient: 0, inpatient: 0, emergency: 0, pharmacy: 0 }
    for (const v of visitHistory) {
      if (v.type === 'outpatient') c.outpatient++
      else if (v.type === 'inpatient') c.inpatient++
      else if (v.type === 'emergency') c.emergency++
      else if (v.type === 'pharmacy') c.pharmacy++
    }
    return c
  }, [visitHistory])

  // ── Filter + sort pipeline ─────────────────────────────────────────────
  const filteredVisits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const wantsTests = contentFlags.has('tests')
    const wantsMeds  = contentFlags.has('medications')
    const wantsProcs = contentFlags.has('procedures')
    const wantsDischarge = contentFlags.has('discharge')

    const result = visitHistory.filter((v) => {
      // type
      if (typeFilter !== 'all' && v.type !== typeFilter) return false
      // institution
      if (institutionFilter !== 'all' && v.institution !== institutionFilter) return false
      // content flags
      if (wantsTests || wantsMeds || wantsProcs) {
        const s = visitStats.get(v.id)
        if (!s) return false
        if (wantsTests && !s.hasTests) return false
        if (wantsMeds  && !s.hasMedications) return false
        if (wantsProcs && !s.hasProcedures) return false
      }
      // 含出院病摘 — only visits with a linked 出院病摘 / discharge summary.
      if (wantsDischarge) {
        const docs = docsByEncounter.get(v.id)
        if (!docs?.some((d) => d.isDischargeSummary)) return false
      }
      // search across visit-level fields + content (tests, medications,
      // procedures, diagnoses) + the visit date in multiple common formats
      if (q) {
        const parts: string[] = [
          v.institution, v.location, v.department, v.diagnosis, v.physician, v.reason,
        ].filter(Boolean) as string[]
        // Gregorian + 民國(ROC) date tokens so 2025/11/20 and 114/11/20 both match.
        if (v.date) parts.push(...dateSearchTokens(v.date))
        const d = encounterDetails.get(v.id)
        if (d) {
          for (const t of d.tests) {
            if (t.title) parts.push(t.title)
            if (t.value) parts.push(t.value)
            if (Array.isArray(t.components)) {
              for (const c of t.components) {
                if (c.title) parts.push(c.title)
                if (c.value) parts.push(c.value)
              }
            }
          }
          for (const m of d.medications) {
            if (m.name) parts.push(m.name)
          }
          for (const p of d.procedures) {
            if (p.title) parts.push(p.title)
          }
          for (const dx of d.diagnoses) {
            if (dx.title) parts.push(dx.title)
            if (dx.code) parts.push(dx.code)
          }
        }
        const haystack = parts.join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    // sort
    const cmp = (() => {
      if (sortMode === 'date-asc') {
        return (a: typeof result[number], b: typeof result[number]) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      }
      if (sortMode === 'abnormal') {
        return (a: typeof result[number], b: typeof result[number]) => {
          const ab = visitStats.get(a.id)?.abnormalCount ?? 0
          const bb = visitStats.get(b.id)?.abnormalCount ?? 0
          if (ab !== bb) return bb - ab
          return new Date(b.date).getTime() - new Date(a.date).getTime()
        }
      }
      return (a: typeof result[number], b: typeof result[number]) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    })()

    return [...result].sort(cmp)
  }, [visitHistory, typeFilter, institutionFilter, contentFlags, searchQuery, sortMode, visitStats, docsByEncounter])

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleFilterChange = (f: VisitTypeFilter) => {
    setTypeFilter(f)
    setExpandedVisitIds(new Set())
  }
  const toggleContent = (f: ContentFlag) => {
    setContentFlags((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f); else next.add(f)
      return next
    })
    setExpandedVisitIds(new Set())
  }
  const clearAllFilters = () => {
    setTypeFilter('all')
    setInstitutionFilter('all')
    setContentFlags(new Set())
    setSearchQuery('')
    setSortMode('date-desc')
  }
  const hasActiveFilters =
    typeFilter !== 'all' ||
    institutionFilter !== 'all' ||
    contentFlags.size > 0 ||
    searchQuery.trim() !== '' ||
    sortMode !== 'date-desc'

  const vt = (t.visitHistory as any)

  // ── Render ────────────────────────────────────────────────────────────
  // No CardHeader/title here — the 就診紀錄 tab label already identifies this
  // card, so the heading would be redundant. gap-2 py-3 mirrors FeatureCard
  // for consistent spacing (base Card is gap-6 py-6).
  return (
    <Card className={`${CARD_BORDER_CLASSES.clinical} gap-2 py-3`}>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">{t.common.loading}</div>
        ) : error ? (
          <div className="text-sm text-red-600">
            {error instanceof Error ? error.message : t.errors.fetchClinicalData}
          </div>
        ) : visitHistory.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t.procedures.noData}</div>
        ) : (
          <div className="space-y-3">
            {/* ── Search + sort row (sort isn't a filter, so it stays here;
                the actual filters live on the row below). ────────────────── */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={vt.searchPlaceholder}
                  className="w-full rounded-md border bg-background pl-7 pr-7 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                aria-label={vt.sortLabel}
              >
                <option value="date-desc">{vt.sortDateDesc}</option>
                <option value="date-asc">{vt.sortDateAsc}</option>
                <option value="abnormal">{vt.sortAbnormal}</option>
              </select>
            </div>

            {/* ── Filters row: 就診類型 + 機構 (single-select dropdowns) followed
                by the content toggles (multi-select) + result count — all the
                filters grouped together, separate from search/sort above. ──── */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {/* 就診類型 is single-select (擇一), so a dropdown is both
                  semantically right and far more compact than five chips; counts
                  stay visible inside each option, e.g. "門診 (117)". */}
              <select
                value={typeFilter}
                onChange={(e) => handleFilterChange(e.target.value as VisitTypeFilter)}
                className="rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                aria-label={(vt as any).typeLabel ?? '就診類型'}
              >
                {FILTER_TYPES.map((f) => {
                  const label = f === 'all' ? vt.filterAll : vt.badges[f]
                  const count = counts[f]
                  if (f !== 'all' && count === 0) return null
                  return <option key={f} value={f}>{label} ({count})</option>
                })}
              </select>
              {institutions.length > 0 && (
                <select
                  value={institutionFilter}
                  onChange={(e) => { setInstitutionFilter(e.target.value); setExpandedVisitIds(new Set()) }}
                  className="rounded-md border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  aria-label={vt.institutionAll}
                >
                  <option value="all">{vt.institutionAll}</option>
                  {institutions.map((inst) => (
                    <option key={inst} value={inst}>{inst}</option>
                  ))}
                </select>
              )}
              {/* Divider between the single-select filters and the content toggles */}
              <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
              <ContentToggle
                label={vt.hasTests}
                active={contentFlags.has('tests')}
                onClick={() => toggleContent('tests')}
              />
              <ContentToggle
                label={vt.hasMedications}
                active={contentFlags.has('medications')}
                onClick={() => toggleContent('medications')}
              />
              <ContentToggle
                label={vt.hasProcedures}
                active={contentFlags.has('procedures')}
                onClick={() => toggleContent('procedures')}
              />
              {/* 含出院病摘 — only offered when the dataset actually has one
                  (discharge summaries are inpatient-only and relatively rare). */}
              {hasAnyDischargeSummary && (
                <ContentToggle
                  label={(vt as any).hasDischarge ?? '含出院病摘'}
                  active={contentFlags.has('discharge')}
                  onClick={() => toggleContent('discharge')}
                />
              )}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                  {vt.clearFilters}
                </button>
              )}
              {/* Result count — right-aligned at the end of the filters row. */}
              <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                {hasActiveFilters
                  ? `${(vt.resultCount as string ?? 'Results')}: ${filteredVisits.length} / ${visitHistory.length}`
                  : `${(vt.totalCount as string ?? 'Total')}: ${visitHistory.length}`}
              </span>
            </div>

            {/* ── Visit list ─────────────────────────────────────────── */}
            {filteredVisits.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <AlertCircle className="h-5 w-5" />
                <span>{vt.noMatch}</span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-muted"
                  >
                    {vt.clearFilters}
                  </button>
                )}
              </div>
            ) : (
              // Tighter list spacing (space-y-2) than the panel's space-y-3 so
              // more collapsed visits fit on screen at once. border-t keeps the
              // filters visually separated from the list now that the standalone
              // count row (which carried that divider) is gone.
              <div className="space-y-2 border-t pt-2">
                {filteredVisits.map((visit) => (
                  <VisitItem
                    key={visit.id}
                    visit={visit}
                    details={encounterDetails.get(visit.id)}
                    documents={docsByEncounter.get(visit.id)}
                    abnormalCount={visitStats.get(visit.id)?.abnormalCount ?? 0}
                    isExpanded={expandedVisitIds.has(visit.id)}
                    onToggle={() => setExpandedVisitIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(visit.id)) next.delete(visit.id); else next.add(visit.id)
                      return next
                    })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ContentToggle({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}
