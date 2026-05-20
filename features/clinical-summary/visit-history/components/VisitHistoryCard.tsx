"use client"

import { useMemo, useState } from "react"
import { Search, Building2, AlertCircle, X } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { cn } from "@/src/shared/utils/cn.utils"
import { buildIcdDictionary } from "@/src/shared/utils/icd-lookup"
import { useVisitHistory } from "../hooks/useVisitHistory"
import { useEncounterDetails } from "../hooks/useEncounterDetails"
import { useClinicalNotes } from "../hooks/useClinicalNotes"
import { useVisitStats } from "../hooks/useVisitStats"
import { VisitItem } from "./VisitItem"

type VisitTypeFilter = 'all' | 'outpatient' | 'inpatient' | 'emergency' | 'pharmacy'
type SortMode = 'date-desc' | 'date-asc' | 'abnormal'
type ContentFlag = 'tests' | 'medications' | 'procedures'

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
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null)
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
      // search across visit-level fields + content (tests, medications,
      // procedures, diagnoses) + the visit date in multiple common formats
      if (q) {
        const parts: string[] = [
          v.institution, v.location, v.department, v.diagnosis, v.physician, v.reason,
        ].filter(Boolean) as string[]
        if (v.date) {
          const d = new Date(v.date)
          if (!isNaN(d.getTime())) {
            const y = d.getFullYear()
            const m = d.getMonth() + 1
            const day = d.getDate()
            const mp = String(m).padStart(2, '0')
            const dp = String(day).padStart(2, '0')
            parts.push(
              d.toLocaleDateString(),                  // 1/22/2026
              `${y}/${m}/${day}`,                      // 2026/1/22
              `${y}/${mp}/${dp}`,                      // 2026/01/22
              `${y}-${mp}-${dp}`,                      // 2026-01-22
              `${m}/${day}`,                           // 1/22
              `${mp}/${dp}`,                           // 01/22
              `${m}/${day}/${y}`,                      // 1/22/2026 plain
            )
          }
        }
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
  }, [visitHistory, typeFilter, institutionFilter, contentFlags, searchQuery, sortMode, visitStats])

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleFilterChange = (f: VisitTypeFilter) => {
    setTypeFilter(f)
    setExpandedVisitId(null)
  }
  const toggleContent = (f: ContentFlag) => {
    setContentFlags((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f); else next.add(f)
      return next
    })
    setExpandedVisitId(null)
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
  return (
    <Card className={CARD_BORDER_CLASSES.clinical}>
      <CardHeader>
        <CardTitle>{t.tabs.visits}</CardTitle>
      </CardHeader>
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
            {/* ── Search + sort row ──────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
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

            {/* ── Type chips ─────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTER_TYPES.map((f) => {
                const label = f === 'all' ? vt.filterAll : vt.badges[f]
                const count = counts[f]
                if (f !== 'all' && count === 0) return null
                const active = typeFilter === f
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleFilterChange(f)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border bg-background text-foreground hover:bg-muted"
                    )}
                  >
                    {label}
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      active ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* ── Institution + content filters row ─────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
              {institutions.length > 0 && (
                <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <select
                    value={institutionFilter}
                    onChange={(e) => { setInstitutionFilter(e.target.value); setExpandedVisitId(null) }}
                    className="rounded-md border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="all">{vt.institutionAll}</option>
                    {institutions.map((inst) => (
                      <option key={inst} value={inst}>{inst}</option>
                    ))}
                  </select>
                </label>
              )}
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
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                  {vt.clearFilters}
                </button>
              )}
            </div>

            {/* ── Result count ───────────────────────────────────────── */}
            <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>
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
              filteredVisits.map((visit) => (
                <VisitItem
                  key={visit.id}
                  visit={visit}
                  details={encounterDetails.get(visit.id)}
                  abnormalCount={visitStats.get(visit.id)?.abnormalCount ?? 0}
                  isExpanded={expandedVisitId === visit.id}
                  onToggle={() => setExpandedVisitId((prev) => (prev === visit.id ? null : visit.id))}
                />
              ))
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
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}
