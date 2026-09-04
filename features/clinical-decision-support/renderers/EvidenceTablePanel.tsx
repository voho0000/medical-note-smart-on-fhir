"use client"

import { ChevronDown, ListChecks, Quote } from 'lucide-react'
import { isEvidenceItemEnabled } from '@voho0000/personalized-care'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  leftTabForResourceType,
  type ResourceNavTarget,
} from '@/src/application/stores/resource-navigation.store'
import type {
  CdssFactSource,
  CdssLocale,
  EvidenceDirection,
  EvidenceItem,
  EvidenceItemCategory,
  EvidenceTable,
} from '../types'
import {
  useEvidenceOverrides,
  useEvidenceOverridesStore,
} from '../stores/evidence-overrides.store'

/**
 * The rows a concept-level conclusion was drawn from, each with its own switch.
 *
 * 「有沒有鬱血」 is not a question the record answers; it is a list of items —
 * an NT-proBNP against an age-adjusted threshold, a weight that moved, a
 * sentence in a chest film, a sign only an examination can settle. Showing the
 * word without the list gives the physician nothing to disagree with, so this
 * renders the list and lets a row be switched off. Switching writes to the
 * override store, which feeds `CdssPatientProfile.evidenceOverrides` back into
 * the pack: the module recomputes and its counts change. Nothing here edits the
 * card it is sitting in.
 */

/** A visit reads the numbers first, then the pictures, then the bedside. */
const CATEGORY_ORDER: readonly EvidenceItemCategory[] = [
  'biomarker',
  'weight',
  'imaging',
  'examination',
  'context',
]

const CATEGORY_LABELS: Record<EvidenceItemCategory, { zh: string; en: string }> = {
  biomarker: { zh: '生物標記與檢驗', en: 'Biomarkers and laboratory' },
  weight: { zh: '體重', en: 'Weight' },
  imaging: { zh: '影像與心超', en: 'Imaging and echocardiography' },
  examination: { zh: '理學檢查徵象', en: 'Examination signs' },
  context: { zh: '臨床背景', en: 'Clinical context' },
}

const CONCEPT_LABELS: Record<EvidenceTable['concept'], { zh: string; en: string }> = {
  congestion: { zh: '鬱血證據', en: 'Congestion evidence' },
  'lv-filling-pressure': {
    zh: 'LV filling pressure 證據',
    en: 'LV filling pressure evidence',
  },
}

const DIRECTION_LABELS: Record<EvidenceDirection, { zh: string; en: string }> = {
  supports: { zh: '支持', en: 'Supports' },
  against: { zh: '不支持', en: 'Against' },
  unknown: { zh: '無法判定', en: 'Undetermined' },
}

/**
 * The chip palette this file already uses for a source assessment: a finding
 * that argues for the concept reads like an abnormal result, one that argues
 * against it reads like a cleared one, and an absent input stays muted so it is
 * never mistaken for a weak negative.
 */
const DIRECTION_CHIP_STYLE: Record<EvidenceDirection, string> = {
  supports: 'bg-rose-100 text-rose-900 dark:bg-rose-500/10 dark:text-rose-200',
  against: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200',
  unknown: 'bg-muted text-muted-foreground',
}

const RESOURCE_TYPE_LABELS: Record<CdssFactSource['resourceType'], { zh: string; en: string }> = {
  Patient: { zh: '病人資料', en: 'Patient' },
  Condition: { zh: '診斷', en: 'Condition' },
  Encounter: { zh: '就醫紀錄', en: 'Encounter' },
  Observation: { zh: '檢驗／量測', en: 'Observation' },
  MedicationRequest: { zh: '處方', en: 'Medication order' },
  MedicationStatement: { zh: '用藥紀錄', en: 'Medication statement' },
  AllergyIntolerance: { zh: '過敏紀錄', en: 'Allergy' },
  Procedure: { zh: '處置', en: 'Procedure' },
  Immunization: { zh: '疫苗', en: 'Immunization' },
  CarePlan: { zh: '照護計畫', en: 'Care plan' },
  DiagnosticReport: { zh: '檢查報告', en: 'Diagnostic report' },
  DocumentReference: { zh: '病歷文件', en: 'Clinical document' },
}

function pick(label: { zh: string; en: string }, isEnglish: boolean): string {
  return isEnglish ? label.en : label.zh
}

/** The quoted sentence a text-matched source travels with. */
function sourceFragment(source: CdssFactSource): string | undefined {
  if (typeof source.value !== 'string') return undefined
  const fragment = source.value.trim()
  return fragment.length > 0 ? fragment : undefined
}

function EvidenceRowSources({
  item,
  isEnglish,
  onNavigate,
  testId,
}: {
  item: EvidenceItem
  isEnglish: boolean
  onNavigate: (target: ResourceNavTarget) => void
  testId: string
}) {
  const sources = item.sources ?? []
  const matchedTerms = item.matchedTerms ?? []
  if (sources.length === 0 && matchedTerms.length === 0) return null

  const summary = [
    sources.length > 0
      ? isEnglish
        ? `${sources.length} source record${sources.length === 1 ? '' : 's'}`
        : `${sources.length} 筆原始資料`
      : undefined,
    matchedTerms.length > 0
      ? isEnglish
        ? `${matchedTerms.length} matched term${matchedTerms.length === 1 ? '' : 's'}`
        : `比對到 ${matchedTerms.length} 個詞`
      : undefined,
  ].filter(Boolean).join(' · ')

  return (
    <details className="group/source mt-1" data-testid={testId}>
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 rounded-sm text-[11px] font-medium text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {summary}
        <ChevronDown className="h-3 w-3 shrink-0 transition-transform group-open/source:rotate-180" />
      </summary>

      <div className="mt-1 space-y-1.5 border-l-2 border-border/70 pl-2">
        {matchedTerms.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground">
              {isEnglish ? 'Matched terms' : '比對詞'}
            </span>
            {matchedTerms.map((term) => (
              <Badge
                key={term}
                variant="outline"
                className="h-5 bg-background px-1.5 font-mono text-[10px] font-normal"
              >
                {term}
              </Badge>
            ))}
          </div>
        ) : null}

        {sources.map((source, index) => {
          const fragment = sourceFragment(source)
          const typeLabel = pick(RESOURCE_TYPE_LABELS[source.resourceType], isEnglish)
          const metadata = [typeLabel, source.date, source.facility].filter(Boolean).join(' · ')
          const navigable = Boolean(source.resourceId && leftTabForResourceType(source.resourceType))

          return (
            <div key={`${source.resourceType}-${source.resourceId}-${index}`} className="min-w-0">
              {navigable ? (
                <button
                  type="button"
                  onClick={() => onNavigate({
                    resourceType: source.resourceType,
                    resourceId: source.resourceId,
                    display: pick(item.label, isEnglish),
                    date: source.date,
                  })}
                  className="inline-flex min-h-6 items-center rounded-sm text-[11px] font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={isEnglish ? 'Locate this record in the left panel' : '在左側資料中定位此筆紀錄'}
                >
                  {metadata}
                </button>
              ) : (
                <span className="text-[11px] text-muted-foreground">{metadata}</span>
              )}

              {fragment ? (
                <p className="mt-0.5 flex gap-1 text-[11px] leading-relaxed text-foreground/80">
                  <Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 break-words">{fragment}</span>
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
    </details>
  )
}

function EvidenceRow({
  item,
  isEnglish,
  enabled,
  onToggle,
  onNavigate,
}: {
  item: EvidenceItem
  isEnglish: boolean
  enabled: boolean
  onToggle: (enabled: boolean) => void
  onNavigate: (target: ResourceNavTarget) => void
}) {
  const physicianEntered = item.derivability === 'physician-entered'
  const label = pick(item.label, isEnglish)
  const value = item.value ?? (isEnglish ? 'Not recorded' : '紀錄中沒有這一項')

  return (
    <div
      className={cn(
        'flex min-w-0 items-start gap-2 px-2.5 py-2',
        !enabled && 'opacity-60',
      )}
      data-testid={`cdss-evidence-row-${item.id}`}
      data-enabled={enabled ? 'true' : 'false'}
    >
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        // The track is dense on purpose; the thumb is not the touch target. The
        // pseudo-element grows the hit area into the row's own padding, so a
        // thumb tapped on a phone lands without loosening the table.
        className="relative mt-0.5 shrink-0 after:absolute after:-inset-2 after:content-['']"
        aria-label={isEnglish
          ? `Include ${label} in the reading`
          : `將「${label}」納入判定`}
        data-testid={`cdss-evidence-switch-${item.id}`}
      />

      <div className="min-w-0 flex-1 @min-[46rem]:flex @min-[46rem]:items-start @min-[46rem]:gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 @min-[46rem]:w-[13rem] @min-[46rem]:shrink-0">
          <span className="text-xs font-medium text-foreground">{label}</span>
          {physicianEntered ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="h-5 cursor-help bg-background px-1.5 text-[10px] font-normal text-muted-foreground"
                  tabIndex={0}
                  data-testid={`cdss-evidence-physician-${item.id}`}
                >
                  {isEnglish ? 'Physician-entered' : '醫師填'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                sideOffset={6}
                className="max-w-[min(90vw,30rem)] whitespace-normal text-left text-xs leading-relaxed"
              >
                {isEnglish
                  ? 'Only an examination settles this sign, so nothing in the record switched it on.'
                  : '這一項只有理學檢查能確認，紀錄無法自動判定，因此預設不納入。'}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs leading-relaxed text-muted-foreground">
            <span className="break-words">{value}</span>
            {item.date ? (
              <span className="ml-1.5 whitespace-nowrap tabular-nums text-[11px] text-muted-foreground/80">
                {item.date}
              </span>
            ) : null}
          </div>
          <EvidenceRowSources
            item={item}
            isEnglish={isEnglish}
            onNavigate={onNavigate}
            testId={`cdss-evidence-sources-${item.id}`}
          />
        </div>
      </div>

      <Badge
        className={cn(
          'h-5 shrink-0 whitespace-nowrap px-1.5 text-[11px] hover:bg-inherit',
          DIRECTION_CHIP_STYLE[item.direction],
        )}
        data-testid={`cdss-evidence-direction-${item.id}`}
      >
        {pick(DIRECTION_LABELS[item.direction], isEnglish)}
      </Badge>
    </div>
  )
}

export function EvidenceTablePanel({
  table,
  recommendationId,
  locale,
  patientId,
  onNavigate,
}: {
  table: EvidenceTable
  recommendationId: string
  locale: CdssLocale
  patientId?: string
  onNavigate: (target: ResourceNavTarget) => void
}) {
  const isEnglish = locale === 'en'
  const overrides = useEvidenceOverrides(patientId)
  const setOverride = useEvidenceOverridesStore((state) => state.setOverride)

  const groups = CATEGORY_ORDER
    .map((category) => ({
      category,
      items: table.items.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0)

  const conceptLabel = pick(CONCEPT_LABELS[table.concept], isEnglish)
  const counts = [
    isEnglish ? `Supports ${table.supportsCount}` : `支持 ${table.supportsCount}`,
    isEnglish ? `Against ${table.againstCount}` : `不支持 ${table.againstCount}`,
    isEnglish ? `Undetermined ${table.unknownCount}` : `無法判定 ${table.unknownCount}`,
  ].join(' · ')

  return (
    <section
      className="overflow-hidden rounded-md border border-border/70 bg-background"
      aria-label={conceptLabel}
      data-testid={`cdss-evidence-table-${recommendationId}-${table.concept}`}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/70 bg-muted/[0.12] px-2.5 py-2">
        <ListChecks className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <h5 className="text-xs font-semibold text-foreground">{conceptLabel}</h5>
        <span
          className="ml-auto text-[11px] tabular-nums text-muted-foreground"
          data-testid={`cdss-evidence-counts-${table.concept}`}
        >
          {counts}
        </span>
      </header>

      <div className="divide-y divide-border/60">
        {groups.map((group) => (
          <div key={group.category} data-testid={`cdss-evidence-group-${group.category}`}>
            <h6 className="bg-muted/[0.06] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {pick(CATEGORY_LABELS[group.category], isEnglish)}
            </h6>
            <div className="divide-y divide-border/40">
              {group.items.map((item) => (
                <EvidenceRow
                  key={item.id}
                  item={item}
                  isEnglish={isEnglish}
                  enabled={isEvidenceItemEnabled(item, overrides)}
                  onToggle={(enabled) => {
                    if (!patientId) return
                    setOverride(patientId, item.id, enabled)
                  }}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {table.limitations.length > 0 ? (
        <ul
          className="space-y-1 border-t border-border/70 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
          data-testid={`cdss-evidence-limitations-${table.concept}`}
        >
          {table.limitations.map((limitation) => (
            <li key={limitation} className="flex gap-1.5">
              <span aria-hidden="true">•</span>
              <span className="min-w-0">{limitation}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
