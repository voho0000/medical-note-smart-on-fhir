"use client"

import { useCallback, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  ChevronDown,
  CircleArrowRight,
  CircleHelp,
  ExternalLink,
  FileSearch,
  Gauge,
  PanelLeftOpen,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  leftTabForResourceType,
  NAV_CLAIM_TIMEOUT_MS,
  type ResourceNavTarget,
  useResourceNavigationStore,
} from '@/src/application/stores/resource-navigation.store'
import type {
  CdssFactSource,
  CdssLocale,
  CdssRecommendation,
  CdssResult,
  CdssSourceAssessmentStatus,
  CdssStatus,
  DcsiSummary,
} from '../types'
import { dedupeFactSources } from '../utils/dedupe-fact-sources'

interface ClinicalDecisionSupportViewProps {
  result: CdssResult
  locale: CdssLocale
}

const statusStyle: Record<CdssStatus, string> = {
  actionable: 'bg-slate-100 text-slate-800 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-100',
  'needs-data': 'bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200',
  review: 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200',
  'no-action': 'bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200',
}

const sourceStatusStyle: Record<CdssSourceAssessmentStatus, string> = {
  recommended: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  consider: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  covered: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  'not-covered': 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  'needs-data': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  'no-special-rule': 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  'not-applicable': 'bg-muted text-muted-foreground',
}

function compactSourceMetadata(source: CdssFactSource): string {
  return [
    source.date,
    source.facility,
  ].filter(Boolean).join(' · ')
}

function isIcd10System(system?: string): boolean {
  const normalized = system?.toLowerCase() ?? ''
  return (
    normalized.includes('icd-10')
    || normalized.includes('icd10')
    || normalized === 'urn:oid:2.16.840.1.113883.6.90'
  )
}

function sourceIcdCodings(source: CdssFactSource): readonly {
  code: string
  display?: string
}[] {
  const seen = new Set<string>()
  return (source.coding ?? []).flatMap((coding) => {
    if (!coding.code || !isIcd10System(coding.system)) return []
    const code = coding.code.toUpperCase()
    const key = `${code}|${coding.display ?? ''}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ code, display: coding.display }]
  })
}

function EvidenceSources({
  sources,
  isEnglish,
  evidenceLabel,
  evidenceValue,
  onNavigate,
  compact = false,
}: {
  sources: readonly CdssFactSource[]
  isEnglish: boolean
  evidenceLabel: string
  evidenceValue: string
  onNavigate: (target: ResourceNavTarget) => void
  compact?: boolean
}) {
  const navigableSources = dedupeFactSources(sources).filter((source) => Boolean(
    source.resourceId && leftTabForResourceType(source.resourceType),
  ))
  if (navigableSources.length === 0) return null

  const facilities = new Set(navigableSources.map((source) => source.facility).filter(Boolean))
  const dates = navigableSources.map((source) => source.date).filter((date): date is string => Boolean(date)).sort()
  const dateRange = dates.length > 1 && dates[0] !== dates.at(-1)
    ? `${dates[0]}–${dates.at(-1)}`
    : dates[0]
  const summary = [
    isEnglish
      ? `${navigableSources.length} source record${navigableSources.length === 1 ? '' : 's'}`
      : `${navigableSources.length} 筆原始資料`,
    facilities.size > 0
      ? (isEnglish ? `${facilities.size} facilit${facilities.size === 1 ? 'y' : 'ies'}` : `${facilities.size} 家院所`)
      : undefined,
    dateRange,
  ].filter(Boolean).join(' · ')
  const compactSummary = [
    isEnglish
      ? `Sources ${navigableSources.length}`
      : `來源 ${navigableSources.length}`,
  ].filter(Boolean).join(' · ')

  if (compact && navigableSources.length === 1) {
    const source = navigableSources[0]
    const sourceValue = source.value !== undefined
      ? `${source.value}${source.unit ? ` ${source.unit}` : ''}`
      : undefined

    return (
      <button
        type="button"
        onClick={() => onNavigate({
          resourceType: source.resourceType,
          resourceId: source.resourceId,
          display: `${evidenceLabel} ${sourceValue ?? evidenceValue}`,
          date: source.date,
        })}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-primary/25 bg-background px-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={isEnglish ? 'Locate this record in the left panel' : '在左側資料中定位此筆紀錄'}
        aria-label={isEnglish ? 'Open source record in the left panel' : '在左側開啟來源紀錄'}
      >
        <PanelLeftOpen className="h-3.5 w-3.5" />
        {isEnglish ? 'Source' : '來源'}
      </button>
    )
  }

  return (
    <details
      className={cn(
        'group rounded-md border border-border/70 bg-muted/15',
        compact ? 'w-fit max-w-full' : 'mt-2',
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          compact
            ? 'min-h-6 px-1.5 text-[11px]'
            : 'min-h-9 px-2.5 py-1.5 text-xs',
        )}
      >
        <FileSearch className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
        <span className="min-w-0 break-words">{compact ? compactSummary : summary}</span>
        <ChevronDown className={cn(
          'ml-auto shrink-0 transition-transform group-open:rotate-180',
          compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
        )} />
      </summary>
      <ul className="divide-y divide-border/60 border-t border-border/70 px-2.5">
        {navigableSources.map((source) => {
          const sourceValue = source.value !== undefined
            ? `${source.value}${source.unit ? ` ${source.unit}` : ''}`
            : undefined
          const icdCodings = sourceIcdCodings(source)
          return (
          <li
            key={`${source.resourceType}-${source.resourceId}`}
            className="py-1.5"
          >
            <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md px-1.5 py-1">
              <span className="min-w-0 select-text">
                <span className="block break-words text-sm font-medium text-foreground">
                  {compactSourceMetadata(source) || (isEnglish ? 'Clinical source record' : '臨床來源紀錄')}
                </span>
                {icdCodings.length > 0 ? (
                  <span className="mt-1 block space-y-1">
                    {icdCodings.map((coding) => (
                      <span
                        key={`${coding.code}-${coding.display ?? ''}`}
                        className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
                      >
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                          {coding.code}
                        </span>
                        {coding.display ? (
                          <span className="break-words text-xs text-muted-foreground">
                            {coding.display}
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              {sourceValue ? (
                <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
                  {sourceValue}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onNavigate({
                  resourceType: source.resourceType,
                  resourceId: source.resourceId,
                  display: `${evidenceLabel} ${sourceValue ?? evidenceValue}`,
                  date: source.date,
                })}
                className="group inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={isEnglish ? 'Locate this record in the left panel' : '在左側資料中定位此筆紀錄'}
                aria-label={isEnglish ? 'Open this record in the left panel' : '在左側開啟此筆紀錄'}
              >
                <PanelLeftOpen className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              </button>
            </div>
          </li>
          )
        })}
      </ul>
    </details>
  )
}

function EvidenceValue({
  value,
  sources,
  isEnglish,
}: {
  value: string
  sources?: readonly CdssFactSource[]
  isEnglish: boolean
}) {
  const trendPoints = dedupeFactSources(sources ?? []).filter((source): source is CdssFactSource & {
    date: string
    value: number
  } => (
    Boolean(source.date)
    && typeof source.value === 'number'
    && Number.isFinite(source.value)
  ))
  const isNumericTrend = trendPoints && trendPoints.length >= 2

  if (!isNumericTrend) {
    const datedValue = value.match(
      /^(.*?)(?:（(\d{4}-\d{2}-\d{2})）|\s+\((\d{4}-\d{2}-\d{2})\))$/,
    )
    const primaryValue = datedValue?.[1]?.trim() || value
    const date = datedValue?.[2] ?? datedValue?.[3]

    return (
      <span className="block min-w-0">
        <span className="block break-words text-sm font-semibold leading-snug">
          {primaryValue}
        </span>
        {date ? (
          <span className="mt-0.5 block text-[11px] font-normal leading-none tabular-nums text-muted-foreground">
            {date}
          </span>
        ) : null}
      </span>
    )
  }

  const unit = trendPoints.find((point) => point.unit)?.unit
  return (
    <div
      className="rounded-lg border border-border bg-muted/10 p-2.5"
      role="img"
      aria-label={value}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {isEnglish ? 'Change over time' : '歷次變化'}
        </span>
        {unit ? (
          <span className="text-xs text-muted-foreground">{unit}</span>
        ) : null}
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-stretch">
          {trendPoints.map((point, index) => {
          const isLatest = index === trendPoints.length - 1
          return (
            <div key={`${point.resourceType}-${point.resourceId}`} className="flex items-center">
              {index > 0 ? (
                <ArrowRight className="mx-1.5 h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
              ) : null}
              <div
                className={cn(
                  'min-w-[6.25rem] rounded-md border px-2 py-2 text-center',
                  isLatest
                    ? 'border-primary/30 bg-primary/10'
                    : 'border-border/70 bg-background',
                )}
              >
                <div className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {point.date}
                </div>
                <div
                  className={cn(
                    'mt-1 text-xl font-semibold leading-none tabular-nums tracking-tight',
                    isLatest ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {point.value}
                </div>
                {isLatest ? (
                  <div className="mt-1 text-xs font-medium text-primary">
                    {isEnglish ? 'Latest' : '最新'}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-transparent" aria-hidden="true">—</div>
                )}
              </div>
            </div>
          )
          })}
        </div>
      </div>
    </div>
  )
}

function evidenceDisplayRank(
  evidence: CdssRecommendation['patientEvidence'][number],
): number {
  const factKeys = evidence.factKeys.map((key) => key.toLowerCase())
  if (factKeys.includes('age')) return 0
  if (factKeys.some((key) => key.includes('diagnosis'))) return 1
  if (
    factKeys.some((key) => key.includes('therapy') || key.includes('medication'))
    || /^(?:系統核對|system check)/i.test(evidence.label)
  ) return 3
  return 2
}

function StatusIcon({ status }: { status: CdssStatus }) {
  if (status === 'actionable') return <CircleArrowRight className="mr-1 h-3.5 w-3.5" />
  if (status === 'needs-data') return <FileSearch className="mr-1 h-3.5 w-3.5" />
  if (status === 'no-action') return <ShieldCheck className="mr-1 h-3.5 w-3.5" />
  return <CircleHelp className="mr-1 h-3.5 w-3.5" />
}

function DcsiModuleDetail({
  dcsi,
  isEnglish,
  onNavigate,
}: {
  dcsi: DcsiSummary
  isEnglish: boolean
  onNavigate: (target: ResourceNavTarget) => void
}) {
  const assessedLabel = isEnglish
    ? `${dcsi.assessedDomainCount}/${dcsi.totalDomainCount} domains evaluable`
    : `${dcsi.assessedDomainCount}/${dcsi.totalDomainCount} 類可判讀`
  const assessedDomains = dcsi.domains.filter((domain) => domain.state === 'assessed')
  const affectedDomains = assessedDomains.filter((domain) => (domain.score ?? 0) > 0)
  const unavailableCount = dcsi.totalDomainCount - dcsi.assessedDomainCount

  return (
    <div className="space-y-3 px-3 py-3 @min-[36rem]:px-4" data-testid="dcsi-module-detail">
      <section className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md bg-muted/30 px-2.5 py-2">
        <div className="text-base font-semibold tabular-nums text-foreground">
          {dcsi.headline}
        </div>
        <div className="text-xs leading-relaxed text-muted-foreground">
          {affectedDomains.length > 0
            ? affectedDomains.map((domain) => `${domain.label} ${domain.score}`).join(isEnglish ? ', ' : '、')
            : (isEnglish ? 'No points in currently evaluable domains' : '目前可判讀構面未計分')}
        </div>
        <Badge
          className={cn(
            'ml-auto h-6 w-fit px-2 text-xs',
            dcsi.isComplete
              ? 'bg-slate-100 text-slate-800 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-100'
              : 'bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200',
          )}
        >
          {assessedLabel}
        </Badge>
      </section>

      <section aria-label={isEnglish ? 'Complete DCSI score map' : '完整 DCSI 計分地圖'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-xs font-semibold text-foreground">
            {isEnglish ? 'Complete 13-point score map' : '完整 13 分構成'}
          </h5>
          <span className="text-xs tabular-nums text-muted-foreground">
            {isEnglish
              ? 'Eye 2 + kidney 2 + nerve 1 + four other domains 2 each'
              : '眼 2＋腎 2＋神經 1＋腦血管 2＋心血管 2＋周邊血管 2＋代謝 2'}
          </span>
        </div>
        <div className="mt-1.5 divide-y divide-border/70 overflow-hidden rounded-md border border-border/70">
          {dcsi.domains.map((domain) => (
            <details
              key={domain.id}
              className="group bg-background text-xs leading-relaxed"
              data-testid={`dcsi-domain-${domain.id}`}
            >
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                <span className="min-w-0 flex-1 font-semibold text-foreground">{domain.label}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'h-6 whitespace-nowrap px-2 text-xs',
                    domain.state === 'assessed'
                      ? 'border-primary/30 bg-primary/5 text-primary'
                      : 'bg-muted/30 text-muted-foreground',
                  )}
                >
                  {domain.state === 'assessed'
                    ? (isEnglish
                        ? `${domain.score}/${domain.maxScore}`
                        : `${domain.score}/${domain.maxScore} 分`)
                    : (isEnglish ? `Unknown · max ${domain.maxScore}` : `未判定 · 最高 ${domain.maxScore}`)}
                </Badge>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div className="border-t border-border/60 px-2.5 py-2">
                <div className="space-y-0.5 text-muted-foreground">
                    {domain.scoreCriteria.map((criterion) => (
                      <div key={`${domain.id}-${criterion.score}`}>
                        <strong className="font-medium text-foreground">
                          {criterion.score} {isEnglish ? 'pt' : '分'}：
                        </strong>
                        {criterion.summary}
                      </div>
                    ))}
                </div>

                {domain.state === 'assessed' && domain.evidence.length > 0 ? (
                  <div className="mt-2 rounded-md bg-muted/25 px-2.5 py-2">
                    <div className="font-medium text-foreground">
                      {isEnglish ? 'Patient evidence' : '本病人依據'}
                    </div>
                    {domain.evidence.map((evidence) => (
                      <div key={`${domain.id}-${evidence.label}`} className="mt-0.5 text-muted-foreground">
                        {evidence.value}
                        {evidence.sources && evidence.sources.length > 0 ? (
                          <EvidenceSources
                            sources={evidence.sources}
                            isEnglish={isEnglish}
                            evidenceLabel={evidence.label}
                            evidenceValue={evidence.value}
                            onNavigate={onNavigate}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      </section>

      {unavailableCount > 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isEnglish
            ? `${unavailableCount} domains are not available in the current data and are not counted as zero.`
            : `其餘 ${unavailableCount} 類目前無可判讀資料，不列為 0 分。`}
        </p>
      ) : null}

      <details className="group rounded-md border border-border/70 bg-background">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <BookOpenCheck className="h-4 w-4 text-primary" />
          {isEnglish ? 'Scoring method and evidence' : '計分方法與研究依據'}
          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-border/70 px-3 py-2.5">
          {dcsi.evidenceReferences.map((reference) => (
            <a
              key={reference.id}
              href={reference.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-1 text-xs font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{reference.title} · {reference.version}</span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            </a>
          ))}
        </div>
      </details>

      <section className="flex gap-2 border-t border-border/70 pt-2.5 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {isEnglish
            ? 'Use DCSI to summarize burden and prioritize review; do not use it alone to change treatment.'
            : 'DCSI 僅摘要併發症負荷與安排檢視順序，不單獨用來調整治療。'}
        </p>
      </section>
    </div>
  )
}

function RecommendationDetail({
  recommendation,
  isEnglish,
  onNavigate,
  label,
}: {
  recommendation: CdssRecommendation
  isEnglish: boolean
  onNavigate: (target: ResourceNavTarget) => void
  label: {
    evidence: string
    missing: string
    missingShort: string
    next: string
    nextStep: string
    guidelines: string
    safety: string
    sourceComparison: string
  }
}) {
  const orderedPatientEvidence = recommendation.patientEvidence
    .map((evidence, originalIndex) => ({ evidence, originalIndex }))
    .sort((a, b) => (
      evidenceDisplayRank(a.evidence) - evidenceDisplayRank(b.evidence)
      || a.originalIndex - b.originalIndex
    ))
    .map(({ evidence }) => evidence)

  if (recommendation.dcsi) {
    return (
      <DcsiModuleDetail
        dcsi={recommendation.dcsi}
        isEnglish={isEnglish}
        onNavigate={onNavigate}
      />
    )
  }

  const sourceStatusLabel: Record<CdssSourceAssessmentStatus, string> = {
    recommended: isEnglish ? 'Recommended' : '建議',
    consider: isEnglish ? 'Consider' : '可考慮',
    covered: isEnglish ? 'Covered' : '符合給付',
    'not-covered': isEnglish ? 'Not covered' : '不符合給付',
    'needs-data': isEnglish ? 'Verify data' : '待補資料',
    'no-special-rule': isEnglish ? 'No special rule' : '無專款門檻',
    'not-applicable': isEnglish ? 'Not applicable' : '不適用',
  }

  return (
    <div className="space-y-2 px-3 py-2.5 @min-[36rem]:px-4">
      {!recommendation.hideNarrative ? (
        <section aria-label={isEnglish ? 'Recommendation and rationale' : '建議與理由'}>
          <p className="text-sm font-medium leading-relaxed text-foreground">
            {recommendation.recommendation}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {recommendation.rationale}
          </p>
        </section>
      ) : null}

      {recommendation.sourceAssessments && recommendation.sourceAssessments.length > 0 ? (
        <section aria-label={label.sourceComparison}>
          <h5 className="text-xs font-semibold text-foreground">{label.sourceComparison}</h5>
          <div
            className="mt-1.5 grid overflow-hidden rounded-md border border-border @min-[38rem]:grid-cols-3"
            data-testid={`cdss-source-comparison-${recommendation.id}`}
          >
            {recommendation.sourceAssessments.map((item, index) => (
              <div
                key={`${recommendation.id}-${item.sourceId}`}
                className={cn(
                  'min-w-0 space-y-2 p-3 text-xs leading-relaxed',
                  index > 0 && 'border-t border-border @min-[38rem]:border-l @min-[38rem]:border-t-0',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-1.5">
                  <div>
                    <div className="font-semibold text-foreground">{item.sourceLabel}</div>
                    <div className="text-muted-foreground">{item.version}</div>
                  </div>
                  <Badge className={cn('h-6 px-2 text-xs', sourceStatusStyle[item.status])}>
                    {sourceStatusLabel[item.status]}
                  </Badge>
                </div>
                <p className="text-foreground">{item.summary}</p>
                {item.verifiedData && item.verifiedData.length > 0 ? (
                  <div className="rounded bg-emerald-50 px-2 py-1.5 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100">
                    <span className="font-semibold">{isEnglish ? 'Verified: ' : '已自動核對：'}</span>
                    {item.verifiedData.join(isEnglish ? '; ' : '、')}
                  </div>
                ) : null}
                {item.missingData && item.missingData.length > 0 ? (
                  <div className="rounded bg-amber-50 px-2 py-1.5 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                    <span className="font-semibold">{isEnglish ? 'Needed: ' : '還需：'}</span>
                    {item.missingData.join(isEnglish ? '; ' : '、')}
                  </div>
                ) : null}
                {item.references.map((reference) => reference.page || reference.directLink ? (
                  <a
                    key={reference.id}
                    href={reference.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <BookOpenCheck className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {reference.recommendationId
                          ? `${reference.recommendationId} · `
                          : ''}
                        {reference.page
                          ? isEnglish
                            ? `Open original page ${reference.page}`
                            : `直接開啟原文第 ${reference.page} 頁`
                          : isEnglish
                            ? 'Open original recommendation'
                            : '直接開啟原文條文'}
                      </span>
                      {reference.locator ? (
                        <span className="mt-0.5 block break-words text-[11px] text-muted-foreground">
                          {reference.locator}
                        </span>
                      ) : null}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <details
                    key={reference.id}
                    className="group rounded-md border border-border/70 bg-background"
                  >
                    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                      <BookOpenCheck className="h-3.5 w-3.5" />
                      {isEnglish ? 'Exact evidence' : '查看精準依據'}
                      {reference.recommendationId ? ` · ${reference.recommendationId}` : ''}
                      <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="space-y-2 border-t border-border/70 px-2.5 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {reference.recommendationId ? (
                          <Badge variant="outline" className="h-6 bg-muted/30 px-2 text-xs">
                            {isEnglish ? 'Recommendation' : '建議條號'} {reference.recommendationId}
                          </Badge>
                        ) : null}
                        {reference.evidenceGrade ? (
                          <Badge variant="outline" className="h-6 bg-muted/30 px-2 text-xs">
                            {isEnglish ? 'Evidence' : '證據等級'} {reference.evidenceGrade}
                          </Badge>
                        ) : null}
                      </div>
                      {reference.locator ? (
                        <p className="font-medium text-foreground">{reference.locator}</p>
                      ) : null}
                      <p className="leading-relaxed text-foreground">{reference.summary}</p>
                      <a
                        href={reference.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                      >
                        {isEnglish ? 'Open official source' : '開啟官方原文'}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </details>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {orderedPatientEvidence.length > 0 ? (
        <section>
          <h5 className="text-xs font-semibold text-foreground">{label.evidence}</h5>
          <dl className="mt-1 flex flex-wrap gap-1.5">
            {orderedPatientEvidence.map((evidence) => {
              const isLongEvidence = evidence.value.length > 48
              return (
                <div
                  key={`${recommendation.id}-${evidence.label}`}
                  className={cn(
                    'flex min-w-0 items-center gap-x-2 rounded-md border border-border/70 bg-muted/10 px-2.5 py-1.5 text-xs leading-relaxed',
                    isLongEvidence ? 'basis-full' : 'min-w-[14rem] flex-1 basis-[14rem]',
                  )}
                >
                  <dt className="shrink-0 font-semibold text-muted-foreground">{evidence.label}</dt>
                  <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
                    <EvidenceValue
                      value={evidence.value}
                      sources={evidence.sources}
                      isEnglish={isEnglish}
                    />
                    {evidence.sources && evidence.sources.length > 0 ? (
                      <EvidenceSources
                        sources={evidence.sources}
                        isEnglish={isEnglish}
                        evidenceLabel={evidence.label}
                        evidenceValue={evidence.value}
                        onNavigate={onNavigate}
                        compact
                      />
                    ) : null}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ) : null}

      <div className="grid gap-1.5 @min-[48rem]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)]">
        {recommendation.missingData && recommendation.missingData.length > 0 ? (
          <section className="flex min-w-0 items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>{label.missingShort}：</strong>
              {recommendation.missingData.join(isEnglish ? '; ' : '、')}
            </span>
          </section>
        ) : null}

        <section
          className={cn(
            'flex min-w-0 items-start gap-2 rounded-md border border-primary/20 bg-primary/[0.04] px-2.5 py-2 text-xs leading-relaxed',
            !(recommendation.missingData && recommendation.missingData.length > 0) && '@min-[48rem]:col-span-2',
          )}
        >
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h5 className="inline font-semibold text-primary">{label.nextStep}：</h5>{' '}
            {recommendation.nextActions.length === 1 ? (
              <span className="font-medium text-foreground">{recommendation.nextActions[0]}</span>
            ) : (
              <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-foreground marker:font-semibold">
                {recommendation.nextActions.map((action) => <li key={action}>{action}</li>)}
              </ol>
            )}
          </div>
        </section>
      </div>

      {recommendation.guidelineReferences.length > 0 ? (
        <details className="group rounded-md border border-border/70 bg-background">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
            <BookOpenCheck className="h-3.5 w-3.5 text-primary" />
            {label.guidelines} · {recommendation.guidelineReferences.length}
            <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-border/70 px-3 py-2.5">
            {recommendation.guidelineReferences.map((reference) => (
              <div key={reference.id} className="text-xs leading-relaxed">
                <a
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {reference.title}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <div className="mt-0.5 text-muted-foreground">
                  {reference.publisher} · {reference.version}
                  {reference.recommendationId ? ` · ${reference.recommendationId}` : ''}
                  {reference.locator ? ` · ${reference.locator}` : ''}
                </div>
                <p className="mt-1 text-foreground">{reference.summary}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <details className="group border-t border-border/70 pt-1">
        <summary className="flex min-h-7 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {label.safety}
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <p className="select-text pb-1 pl-5 text-xs leading-relaxed text-muted-foreground">
          {recommendation.safetyBoundary}
        </p>
      </details>
    </div>
  )
}

export function ClinicalDecisionSupportView({
  result,
  locale,
}: ClinicalDecisionSupportViewProps) {
  const isEnglish = locale === 'en'
  const label = {
    high: isEnglish ? 'High priority' : '優先處理',
    medium: isEnglish ? 'Review next' : '接續檢視',
    routine: isEnglish ? 'Routine' : '例行盤點',
    actionable: isEnglish ? 'Actionable now' : '可立即處理',
    'needs-data': isEnglish ? 'Data needed' : '需先補資料',
    review: isEnglish ? 'Clinical review' : '需臨床確認',
    'no-action': isEnglish ? 'No action now' : '目前無需處理',
    decision: isEnglish ? 'Decision question' : '決策問題',
    statusAndEvidence: isEnglish ? 'Patient status and key evidence' : '個案狀態與關鍵依據',
    nextStep: isEnglish ? 'Next step' : '下一步',
    evidence: isEnglish ? 'Patient evidence' : '本病人依據',
    missing: isEnglish ? 'Missing for this decision' : '這項決策還缺',
    missingShort: isEnglish ? 'Missing' : '缺',
    next: isEnglish ? 'Suggested next actions' : '建議下一步',
    guidelines: isEnglish ? 'Guideline summary and location' : '指引摘要與章節定位',
    safety: isEnglish ? 'Decision boundary' : '決策邊界',
    sourceComparison: isEnglish ? 'Guideline and coverage comparison' : '三來源比較',
    notEvaluated: isEnglish ? 'Not evaluated in this POC' : '本次未評估',
    showDetails: isEnglish ? 'Show decision details' : '展開決策詳情',
    hideDetails: isEnglish ? 'Hide decision details' : '收合決策詳情',
    automatedChecks: isEnglish ? 'Automatically checked' : '已自動核對',
  } as const

  const [requestedExpandedId, setRequestedExpandedId] = useState<string | null>(null)
  const pointerGestureRef = useRef<{
    recommendationId: string
    startX: number
    startY: number
    dragged: boolean
  } | null>(null)
  const navigateToResource = useCallback((target: ResourceNavTarget) => {
    const store = useResourceNavigationStore.getState()
    store.navigate(target)
    const requestSequence = useResourceNavigationStore.getState().seq
    window.setTimeout(() => {
      const latest = useResourceNavigationStore.getState()
      if (!latest.pending || latest.seq !== requestSequence) return
      latest.consume()
      toast.warning(
        isEnglish
          ? 'The data section opened, but the exact record could not be located.'
          : '已切換至左側資料，但目前無法定位到確切紀錄。',
        { duration: 5000 },
      )
    }, NAV_CLAIM_TIMEOUT_MS)
  }, [isEnglish])
  const expandedId = requestedExpandedId === null
    ? null
    : result.recommendations.some((item) => item.id === requestedExpandedId)
      ? requestedExpandedId
      : (result.recommendations[0]?.id ?? null)

  return (
    <div className="space-y-3" data-testid="clinical-decision-support-view">
      {result.knowledgePacks && result.knowledgePacks.length > 0 ? (
        <section
          className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden rounded-lg border border-border bg-muted/20 px-3 py-2"
          aria-label={isEnglish ? 'Enabled knowledge packs' : '已啟用知識包'}
          data-testid="cdss-enabled-knowledge-packs"
        >
          <span className="mr-1 shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground">
            {isEnglish ? 'Enabled sources' : '已啟用來源'}
          </span>
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-hidden">
            {result.knowledgePacks.map((pack) => {
              const labelIncludesVersion = pack.label
                .toLocaleLowerCase()
                .includes(pack.version.toLocaleLowerCase())
              const fullLabel = labelIncludesVersion
                ? pack.label
                : `${pack.label} · ${pack.version}`
              return (
                <Tooltip key={pack.id}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="h-6 min-w-0 flex-1 overflow-hidden bg-background px-2 text-xs"
                      title={fullLabel}
                    >
                      <span className="truncate">{fullLabel}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-lg">
                    {fullLabel}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </section>
      ) : null}

      {result.automatedChecks && result.automatedChecks.length > 0 ? (
        <details
          className="group rounded-lg border border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20"
          data-testid="cdss-automated-checks"
        >
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-xs font-semibold text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-200">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{label.automatedChecks} · {result.automatedChecks.length}</span>
            <span className="font-normal text-muted-foreground">
              {isEnglish ? 'No separate decision row needed' : '目前無需另佔決策列'}
            </span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-emerald-200/60 border-t border-emerald-200/60 px-3 dark:divide-emerald-900 dark:border-emerald-900">
            {result.automatedChecks.map((check) => (
              <li
                key={check.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-xs"
              >
                <span className="font-medium text-foreground">{check.label}</span>
                <span className="min-w-0 flex-1 break-words text-muted-foreground">
                  {check.value}
                </span>
                {check.sources && check.sources.length > 0 ? (
                  <EvidenceSources
                    sources={check.sources}
                    isEnglish={isEnglish}
                    evidenceLabel={check.label}
                    evidenceValue={check.value}
                    onNavigate={navigateToResource}
                    compact
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <section
        className="overflow-hidden rounded-lg border border-border"
        aria-label={isEnglish ? 'Patient decision overview' : '個案決策總覽'}
      >
        <div
          className="hidden grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)_2.75rem] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground @min-[40rem]:grid"
          aria-hidden="true"
        >
          <span>{label.decision}</span>
          <span>{label.statusAndEvidence}</span>
          <span>{label.nextStep}</span>
          <span />
        </div>

        {result.recommendations.map((recommendation, index) => {
          const isExpanded = expandedId === recommendation.id
          const isRiskStratification = recommendation.kind === 'risk-stratification'
          const triggerId = `cdss-trigger-${recommendation.id}`
          const detailId = `cdss-detail-${recommendation.id}`
          const overviewEvidence = recommendation.patientEvidence.find((evidence) => (
            recommendation.overviewEvidenceFactKey
              ? evidence.factKeys.includes(recommendation.overviewEvidenceFactKey)
              : false
          ))
          const overviewMissing = recommendation.missingData?.[0]

          return (
            <article
              key={recommendation.id}
              className="border-b border-border last:border-b-0"
              data-testid={`cdss-recommendation-${recommendation.id}`}
            >
              <div
                id={triggerId}
                role="button"
                tabIndex={0}
                className={cn(
                  'grid min-h-11 w-full select-text gap-2 px-3 py-2.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  'hover:bg-muted/30',
                  '@min-[40rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)_2.75rem] @min-[40rem]:items-start @min-[40rem]:gap-3',
                  isExpanded && 'bg-muted/25',
                )}
                aria-expanded={isExpanded}
                aria-controls={detailId}
                data-testid={`cdss-recommendation-trigger-${recommendation.id}`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  pointerGestureRef.current = {
                    recommendationId: recommendation.id,
                    startX: event.clientX,
                    startY: event.clientY,
                    dragged: false,
                  }
                }}
                onPointerMove={(event) => {
                  const gesture = pointerGestureRef.current
                  if (!gesture || gesture.recommendationId !== recommendation.id || gesture.dragged) return
                  if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 4) {
                    gesture.dragged = true
                  }
                }}
                onPointerCancel={() => {
                  pointerGestureRef.current = null
                }}
                onClick={() => {
                  const gesture = pointerGestureRef.current
                  pointerGestureRef.current = null
                  if (gesture?.recommendationId === recommendation.id && gesture.dragged) return
                  const selection = window.getSelection()
                  if (selection && !selection.isCollapsed) return
                  setRequestedExpandedId(isExpanded ? null : recommendation.id)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  setRequestedExpandedId(isExpanded ? null : recommendation.id)
                }}
              >
                <span className="min-w-0 cursor-text">
                  <span className="block text-xs font-semibold text-muted-foreground">
                    {index + 1} · {label[recommendation.priority]}
                  </span>
                  <span className="mt-1 block break-words text-sm font-semibold leading-snug text-foreground">
                    {recommendation.title}
                  </span>
                </span>

                <span className="min-w-0 cursor-text">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground @min-[40rem]:hidden">
                    {label.statusAndEvidence}
                  </span>
                  <Badge
                    className={cn(
                      'h-6 px-2 text-xs',
                      isRiskStratification
                        ? 'bg-violet-100 text-violet-900 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-200'
                        : statusStyle[recommendation.status],
                    )}
                  >
                    {isRiskStratification
                      ? <Gauge className="mr-1 h-3.5 w-3.5" />
                      : <StatusIcon status={recommendation.status} />}
                    {isRiskStratification
                      ? (isEnglish ? 'Risk stratification' : '風險分層')
                      : label[recommendation.status]}
                  </Badge>
                  {overviewEvidence ? (
                    <span className="mt-1.5 block break-words text-xs leading-relaxed text-muted-foreground">
                      <strong className="font-medium text-foreground">{overviewEvidence.label}：</strong>
                      {overviewEvidence.value}
                    </span>
                  ) : null}
                  {overviewMissing ? (
                    <span className="mt-0.5 block break-words text-xs leading-relaxed text-muted-foreground">
                      <strong className="font-medium text-foreground">{label.missingShort}：</strong>
                      {overviewMissing}
                    </span>
                  ) : null}
                </span>

                <span className="min-w-0 cursor-text">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground @min-[40rem]:hidden">
                    {label.nextStep}
                  </span>
                  <span className="block break-words text-xs leading-relaxed text-foreground">
                    {recommendation.nextActions[0]}
                  </span>
                </span>

                <span
                  className="flex min-h-8 select-none items-center justify-end gap-1 rounded-md px-1 text-xs font-medium text-primary @min-[40rem]:justify-center"
                  aria-hidden="true"
                >
                  <span className="@min-[40rem]:sr-only">
                    {isExpanded ? label.hideDetails : label.showDetails}
                  </span>
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
                    aria-hidden="true"
                  />
                </span>
              </div>

              {isExpanded ? (
                <div
                  id={detailId}
                  role="region"
                  aria-labelledby={triggerId}
                  className="border-t border-border bg-background"
                  data-testid={`cdss-recommendation-detail-${recommendation.id}`}
                >
                  <RecommendationDetail
                    recommendation={recommendation}
                    isEnglish={isEnglish}
                    onNavigate={navigateToResource}
                    label={label}
                  />
                </div>
              ) : null}
            </article>
          )
        })}
      </section>

      <section className="border-t border-border pt-3">
        <h4 className="text-xs font-semibold">{label.notEvaluated}</h4>
        <ul className="mt-1.5 grid gap-1 text-xs leading-relaxed text-muted-foreground @min-[32rem]:grid-cols-3">
          {result.notEvaluated.map((item) => (
            <li key={item} className="flex gap-1.5">
              <span aria-hidden="true">—</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">{result.disclaimer}</p>
    </div>
  )
}
