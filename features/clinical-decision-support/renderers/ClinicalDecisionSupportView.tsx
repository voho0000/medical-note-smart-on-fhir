"use client"

import { useCallback, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  ChevronDown,
  CircleArrowRight,
  CircleHelp,
  ClipboardList,
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
  CdssAutomatedCheck,
  CdssLocale,
  CdssModuleGroupId,
  CdssRecommendation,
  CdssResult,
  CdssSourceAssessmentStatus,
  CdssStatus,
  DcsiSummary,
  GuidelineReference,
} from '../types'
import { buildPhysicianSemanticCard } from '../utils/build-physician-semantic-card'
import { clinicalModuleLabel } from '../utils/clinical-module-labels'
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

const SUMMARY_FOCUS_LIMIT = 3
const SUMMARY_MISSING_LIMIT = 4

const MODULE_GROUPS: readonly {
  id: CdssModuleGroupId
  zh: string
  en: string
  toneClass: string
  dividerClass: string
}[] = [
  {
    id: 'assessment',
    zh: '評估與分層',
    en: 'Assessment & stratification',
    toneClass: 'text-blue-700 dark:text-blue-300',
    dividerClass: 'bg-blue-200/90 dark:bg-blue-800/70',
  },
  {
    id: 'treatment',
    zh: '治療決策',
    en: 'Treatment decisions',
    toneClass: 'text-violet-700 dark:text-violet-300',
    dividerClass: 'bg-violet-200/90 dark:bg-violet-800/70',
  },
  {
    id: 'monitoring',
    zh: '監測與安全',
    en: 'Monitoring & safety',
    toneClass: 'text-teal-700 dark:text-teal-300',
    dividerClass: 'bg-teal-200/90 dark:bg-teal-800/70',
  },
  {
    id: 'care',
    zh: '照護安排',
    en: 'Care planning',
    toneClass: 'text-orange-700 dark:text-orange-300',
    dividerClass: 'bg-orange-200/90 dark:bg-orange-800/70',
  },
]

type ModuleDisplayRow =
  | {
    kind: 'group'
    group: (typeof MODULE_GROUPS)[number]
    count: number
    isCollapsed: boolean
  }
  | {
    kind: 'recommendation'
    recommendation: CdssRecommendation
  }

const missingAssessmentCue = /(缺少|仍缺|待補|補做|未取得|無法使用|missing|unusable|not available)/i
const missingConcepts = [
  /uacr|尿(?:中)?白蛋白(?:[／/]?(?:肌酸酐|creatinine))?|urine albumin(?:-to-creatinine|[ /]creatinine)?/i,
  /血壓|blood pressure/i,
  /體液狀態|volume status/i,
  /egfr|腎絲球過濾率/i,
  /性別|\bsex\b/i,
  /年齡|\bage\b/i,
  /血鉀|potassium/i,
  /碳酸氫鹽|bicarbonate/i,
  /\bpth\b|副甲狀腺素/i,
  /ldl(?:-c)?|低密度脂蛋白/i,
] as const

/**
 * Collapsed rows should not repeat the same missing concept twice. The full,
 * precise missing input remains available in the expanded decision detail.
 */
function isMissingPreviewRedundant(title: string, missingInput: string): boolean {
  const normalizedTitle = title.normalize('NFKC')
  if (!missingAssessmentCue.test(normalizedTitle)) return false

  const normalizedMissingInput = missingInput.normalize('NFKC')
  return missingConcepts.some((concept) => (
    concept.test(normalizedTitle) && concept.test(normalizedMissingInput)
  ))
}

function normalizedDisplayText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function characterBigrams(value: string): Set<string> {
  const normalized = normalizedDisplayText(value)
  const bigrams = new Set<string>()
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.add(normalized.slice(index, index + 2))
  }
  return bigrams
}

/**
 * Keeps the more specific evidence sentence when the assessment is mostly a
 * paraphrase of it (for example, the same historical medication status).
 */
function isAssessmentPreviewRedundant(title: string, evidenceValue?: string): boolean {
  if (!evidenceValue) return false
  const titleBigrams = characterBigrams(title)
  const evidenceBigrams = characterBigrams(evidenceValue)
  const smallerSize = Math.min(titleBigrams.size, evidenceBigrams.size)
  if (smallerSize < 8) return false

  let sharedCount = 0
  titleBigrams.forEach((bigram) => {
    if (evidenceBigrams.has(bigram)) sharedCount += 1
  })
  return sharedCount / smallerSize >= 0.7
}

type CkdModulePresentationKind = 'classification' | 'medication' | 'monitoring' | 'recommendation'

const CKD_MODULE_PRESENTATION_KIND: Readonly<Record<string, CkdModulePresentationKind>> = {
  'ckd-classification': 'classification',
  'ckd-kidney-failure-risk': 'classification',
  'ckd-rasi-strategy': 'medication',
  'ckd-sglt2-strategy': 'medication',
  'ckd-finerenone-strategy': 'medication',
  'ckd-cardiovascular-risk': 'medication',
  'ckd-medication-safety': 'monitoring',
  'ckd-monitoring': 'monitoring',
  'ckd-blood-pressure-volume': 'monitoring',
  'ckd-anemia-monitoring': 'monitoring',
  'ckd-potassium-acidosis': 'monitoring',
  'ckd-mbd-monitoring': 'monitoring',
  'ckd-nutrition': 'recommendation',
  'immunization-review': 'recommendation',
  'ckd-referral-care': 'recommendation',
}

function ckdModulePresentationCopy(
  recommendation: CdssRecommendation,
  isEnglish: boolean,
): { guidelineHeading: string } {
  const kind = CKD_MODULE_PRESENTATION_KIND[recommendation.id]
    ?? (
      recommendation.domain === 'diagnosis'
        ? 'classification'
        : recommendation.domain === 'medication' || recommendation.domain === 'safety'
          ? 'medication'
          : recommendation.domain === 'monitoring' || recommendation.domain === 'complication'
            ? 'monitoring'
            : 'recommendation'
    )

  switch (kind) {
    case 'classification':
      return {
        guidelineHeading: isEnglish ? 'Classification / risk basis' : '分級／風險依據',
      }
    case 'medication':
      return {
        guidelineHeading: isEnglish ? 'Guideline treatment criteria' : '指引用藥條件',
      }
    case 'monitoring':
      return {
        guidelineHeading: isEnglish ? 'Monitoring basis / threshold' : '監測依據／門檻',
      }
    case 'recommendation':
      return {
        guidelineHeading: isEnglish ? 'Guideline recommendation' : '指引建議',
      }
  }
}

function restoreCompletedModules(result: CdssResult): {
  recommendations: CdssRecommendation[]
  standaloneChecks: CdssAutomatedCheck[]
} {
  const completedModules = (result.automatedChecks ?? []).filter(
    (check): check is CdssAutomatedCheck & { recommendation: CdssRecommendation } => (
      Boolean(check.recommendation)
    ),
  )
  const standaloneChecks = (result.automatedChecks ?? []).filter(
    (check) => !check.recommendation,
  )
  if (completedModules.length === 0) {
    return {
      recommendations: [...result.recommendations],
      standaloneChecks,
    }
  }

  const completedByPosition = new Map<number, typeof completedModules[number]>()
  completedModules.forEach((check) => {
    if (
      typeof check.displayOrder === 'number'
      && Number.isInteger(check.displayOrder)
      && check.displayOrder >= 0
    ) {
      completedByPosition.set(check.displayOrder, check)
    }
  })

  const restored: CdssRecommendation[] = []
  const usedIds = new Set<string>()
  let decisionIndex = 0
  const slotCount = result.recommendations.length + completedModules.length
  for (let position = 0; position < slotCount; position += 1) {
    const completed = completedByPosition.get(position)
    if (completed) {
      restored.push(completed.recommendation)
      usedIds.add(completed.id)
      continue
    }
    const decision = result.recommendations[decisionIndex]
    if (decision) {
      restored.push(decision)
      decisionIndex += 1
    }
  }
  restored.push(...result.recommendations.slice(decisionIndex))
  completedModules.forEach((check) => {
    if (!usedIds.has(check.id)) restored.push(check.recommendation)
  })

  return { recommendations: restored, standaloneChecks }
}

function summarizeMissingInput(input: string, locale: CdssLocale) {
  const normalized = input.normalize('NFKC').toLocaleLowerCase()
  if (
    normalized.includes('uacr')
    || normalized.includes('urine albumin-to-creatinine')
    || normalized.includes('urine albumin/creatinine')
  ) {
    return {
      key: 'quantitative-uacr',
      label: locale === 'en'
        ? 'Quantitative UACR (mg/g; valid value above 0)'
        : '定量 UACR（mg/g；需為有效正值）',
    }
  }

  return {
    key: normalized
      .replace(/[、，,；;：:（）()[\]\s]/g, '')
      .replace(/[><=≥≤]/g, ''),
    label: input,
  }
}

export function buildClinicalDecisionSummary(
  result: CdssResult,
  locale: CdssLocale,
) {
  const priorityOrder: Readonly<Record<CdssRecommendation['priority'], number>> = {
    high: 0,
    medium: 1,
    routine: 2,
  }
  const actionRecommendations = result.recommendations.filter(
    (recommendation) => (
      recommendation.status === 'actionable'
      || recommendation.status === 'review'
    ),
  ).sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, SUMMARY_FOCUS_LIMIT)
  const missingInputByKey = new Map<string, {
    label: string
    recommendationIds: Set<string>
  }>()
  result.recommendations.forEach((recommendation) => {
    recommendation.missingData?.forEach((input) => {
      const summarized = summarizeMissingInput(input, locale)
      const existing = missingInputByKey.get(summarized.key)
      if (existing) {
        existing.recommendationIds.add(recommendation.id)
        return
      }
      missingInputByKey.set(summarized.key, {
        label: summarized.label,
        recommendationIds: new Set([recommendation.id]),
      })
    })
  })
  const allMissingInputs = Array.from(missingInputByKey.values()).map((item) => ({
    label: item.label,
    relatedRecommendationCount: item.recommendationIds.size,
  }))

  return {
    actionRecommendations,
    missingInputs: allMissingInputs.slice(0, SUMMARY_MISSING_LIMIT),
    missingInputCount: allMissingInputs.length,
    automatedCheckCount: result.automatedChecks?.length ?? 0,
  }
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
  const isMedicationHistory = navigableSources.every((source) => (
    source.resourceType === 'MedicationRequest'
    || source.resourceType === 'MedicationStatement'
  ))
  const summary = [
    isMedicationHistory
      ? isEnglish
        ? `${navigableSources.length} medication record${navigableSources.length === 1 ? '' : 's'}`
        : `${navigableSources.length} 筆用藥歷程`
      : isEnglish
        ? `${navigableSources.length} source record${navigableSources.length === 1 ? '' : 's'}`
        : `${navigableSources.length} 筆原始資料`,
    facilities.size > 0
      ? (isEnglish ? `${facilities.size} facilit${facilities.size === 1 ? 'y' : 'ies'}` : `${facilities.size} 家院所`)
      : undefined,
    dateRange,
  ].filter(Boolean).join(' · ')
  const compactSummary = [
    isMedicationHistory
      ? isEnglish
        ? `Medication history ${navigableSources.length}`
        : `用藥歷程 ${navigableSources.length} 筆`
      : isEnglish
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
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={isEnglish ? 'Locate this record in the left panel' : '在左側資料中定位此筆紀錄'}
        aria-label={isEnglish ? 'Open source record in the left panel' : '在左側開啟來源紀錄'}
      >
        <PanelLeftOpen className="h-3.5 w-3.5" />
        {isEnglish ? 'View source' : '查看來源'}
      </button>
    )
  }

  return (
    <details
      className={cn(
        'group rounded-md',
        compact
          ? 'w-fit max-w-full text-muted-foreground'
          : 'mt-2 border border-border/70 bg-muted/15',
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          compact
            ? 'min-h-7 rounded-md px-1.5 text-[11px] transition-colors hover:bg-primary/5 hover:text-primary'
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
      <ul
        className={cn(
          'divide-y divide-border/60 px-2.5',
          compact
            ? 'mt-1 min-w-[18rem] overflow-hidden rounded-md border border-border/70 bg-background shadow-sm'
            : 'border-t border-border/70',
        )}
      >
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

function SourceGuidelineReference({
  reference,
  isEnglish,
}: {
  reference: GuidelineReference
  isEnglish: boolean
}) {
  const citedStatements = reference.citedStatements ?? []
  const sourceLinkLabel = reference.page
    ? isEnglish
      ? `Open official page ${reference.page}`
      : `開啟官方原文第 ${reference.page} 頁`
    : isEnglish
      ? 'Open official recommendation'
      : '開啟官方原文條文'

  if (citedStatements.length > 0) {
    return (
      <details
        className="group overflow-hidden rounded-md border border-primary/30 bg-primary/5"
        data-testid={`guideline-statement-toggle-${reference.id}`}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <BookOpenCheck className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {reference.recommendationId ?? reference.title}
            </span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {isEnglish ? 'Show cited text' : '展開引用原文'}
              {reference.page
                ? isEnglish
                  ? ` · official page ${reference.page}`
                  : ` · 原文第 ${reference.page} 頁`
                : ''}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2.5 border-t border-primary/20 bg-background/80 px-2.5 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {isEnglish
              ? 'Original-language text for the statements cited by this card. Verify the official source before clinical use.'
              : '以下僅顯示本卡引用的指引原文；臨床使用前請核對官方來源。'}
          </p>
          <dl className="space-y-2">
            {citedStatements.map((statement) => (
              <div key={`${reference.id}-${statement.label}`}>
                <dt className="font-semibold text-foreground">{statement.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line leading-relaxed text-foreground">
                  {statement.text}
                </dd>
              </div>
            ))}
          </dl>
          <a
            href={reference.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-8 items-center gap-1 font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sourceLinkLabel}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </details>
    )
  }

  if (reference.page || reference.directLink) {
    return (
      <a
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
    )
  }

  return (
    <details className="group rounded-md border border-border/70 bg-background">
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
    supporting: string
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

  const semanticCard = buildPhysicianSemanticCard(
    recommendation,
    isEnglish ? 'en' : 'zh-TW',
  )
  const presentationCopy = ckdModulePresentationCopy(recommendation, isEnglish)
  const primaryGuidelineRule = semanticCard.guidelineRules.find(
    (rule) => rule.sourceKind === 'guideline',
  ) ?? semanticCard.guidelineRules[0]
  const primaryGuidelineSummary = primaryGuidelineRule?.reference.summary
    ?? semanticCard.clinicalReasoning

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
      <section
        className="rounded-md border border-primary/20 bg-primary/[0.025] px-3 py-2.5"
        aria-label={isEnglish ? 'Automatically generated physician semantic card' : '自動產生的醫師語意卡片'}
        data-testid={`cdss-semantic-card-${recommendation.id}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <BookOpenCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
          <h5 className="text-xs font-semibold text-foreground">
            {presentationCopy.guidelineHeading}
          </h5>
          {primaryGuidelineRule ? (
            <>
              <Badge variant="outline" className="h-5 bg-background px-1.5 text-[11px]">
                {primaryGuidelineRule.sourceLabel} · {primaryGuidelineRule.sourceVersion}
              </Badge>
              {primaryGuidelineRule.reference.evidenceGrade ? (
                <Badge variant="outline" className="h-5 bg-background px-1.5 text-[11px]">
                  {primaryGuidelineRule.reference.evidenceGrade}
                </Badge>
              ) : null}
            </>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm font-medium leading-relaxed text-foreground">
          {primaryGuidelineSummary}
        </p>
        {primaryGuidelineRule ? (
          <a
            href={primaryGuidelineRule.reference.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
          >
            {isEnglish ? 'Open guideline source' : '查看指引原文'}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}

      </section>

      {orderedPatientEvidence.length > 0 ? (
        <section aria-labelledby={`patient-evidence-${recommendation.id}`}>
          <h5
            id={`patient-evidence-${recommendation.id}`}
            className="text-xs font-semibold text-foreground"
          >
            {label.evidence}
          </h5>
          <dl
            className="mt-1.5 divide-y divide-border/60 overflow-hidden rounded-md border border-border/70 bg-background"
            data-testid={`cdss-patient-evidence-${recommendation.id}`}
          >
            {orderedPatientEvidence.map((evidence) => {
              return (
                <div
                  key={`${recommendation.id}-${evidence.label}`}
                  className="grid min-w-0 gap-x-3 gap-y-1.5 px-3 py-2.5 text-xs leading-relaxed @min-[32rem]:grid-cols-[minmax(7rem,0.28fr)_minmax(0,1fr)_auto] @min-[32rem]:items-center"
                >
                  <dt className="min-w-0 font-medium text-muted-foreground">
                    {evidence.label}
                  </dt>
                  <dd className="min-w-0 font-medium text-foreground">
                    <EvidenceValue
                      value={evidence.value}
                      sources={evidence.sources}
                      isEnglish={isEnglish}
                    />
                  </dd>
                  {evidence.sources && evidence.sources.length > 0 ? (
                    <dd className="min-w-0 @min-[32rem]:justify-self-end">
                      <EvidenceSources
                        sources={evidence.sources}
                        isEnglish={isEnglish}
                        evidenceLabel={evidence.label}
                        evidenceValue={evidence.value}
                        onNavigate={onNavigate}
                        compact
                      />
                    </dd>
                  ) : (
                    <dd className="hidden @min-[32rem]:block" aria-hidden="true" />
                  )}
                </div>
              )
            })}
          </dl>
        </section>
      ) : null}

      <section
        className="overflow-hidden rounded-md border border-border/70 bg-muted/[0.08]"
        aria-label={isEnglish ? 'Items to confirm and next steps' : '待確認與建議下一步'}
        data-testid={`cdss-action-plan-${recommendation.id}`}
      >
        {recommendation.missingData && recommendation.missingData.length > 0 ? (
          <div className="grid min-w-0 gap-x-3 gap-y-1 px-3 py-2.5 text-xs leading-relaxed @min-[32rem]:grid-cols-[minmax(7rem,0.28fr)_minmax(0,1fr)]">
            <h5 className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {isEnglish ? 'To confirm' : '尚待確認'}
            </h5>
            <ul className="space-y-1 text-foreground">
              {recommendation.missingData.map((item) => (
                <li key={item} className="flex gap-1.5">
                  <span className="text-amber-700 dark:text-amber-300" aria-hidden="true">•</span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div
          className={cn(
            'grid min-w-0 gap-x-3 gap-y-1 px-3 py-2.5 text-xs leading-relaxed @min-[32rem]:grid-cols-[minmax(7rem,0.28fr)_minmax(0,1fr)]',
            recommendation.missingData && recommendation.missingData.length > 0
              ? 'border-t border-border/60'
              : '',
          )}
        >
          <h5 className="flex items-center gap-1.5 font-semibold text-primary">
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            {label.nextStep}
          </h5>
          <div className="min-w-0 text-foreground">
            {recommendation.nextActions.length === 1 ? (
              <span>{recommendation.nextActions[0]}</span>
            ) : (
              <ol className="list-decimal space-y-1 pl-4 marker:font-semibold">
                {recommendation.nextActions.map((action) => <li key={action}>{action}</li>)}
              </ol>
            )}
          </div>
        </div>
      </section>

      <details
        className="group rounded-md border border-border/70 bg-background"
        data-testid={`cdss-supporting-context-${recommendation.id}`}
      >
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <CircleHelp className="h-3.5 w-3.5 shrink-0" />
          {label.supporting}
          <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-border/70 px-3 py-2.5 text-xs leading-relaxed">
          <section>
            <h5 className="font-semibold text-foreground">
              {isEnglish ? 'Clinical rationale' : '判斷理由'}
            </h5>
            <p className="mt-1 text-muted-foreground">{semanticCard.clinicalReasoning}</p>
          </section>

          {recommendation.sourceAssessments && recommendation.sourceAssessments.length > 0 ? (
            <section aria-label={label.sourceComparison}>
              <h5 className="font-semibold text-foreground">{label.sourceComparison}</h5>
              <div
                className="mt-1.5 grid overflow-hidden rounded-md border border-border @min-[38rem]:grid-cols-3"
                data-testid={`cdss-source-comparison-${recommendation.id}`}
              >
                {recommendation.sourceAssessments.map((item, index) => (
                  <div
                    key={`${recommendation.id}-${item.sourceId}`}
                    className={cn(
                      'min-w-0 space-y-2 p-3',
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
                        <span className="font-semibold">{isEnglish ? 'Verified: ' : '已核對：'}</span>
                        {item.verifiedData.join(isEnglish ? '; ' : '、')}
                      </div>
                    ) : null}
                    {item.missingData && item.missingData.length > 0 ? (
                      <div className="rounded bg-amber-50 px-2 py-1.5 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                        <span className="font-semibold">{isEnglish ? 'Needed: ' : '還需：'}</span>
                        {item.missingData.join(isEnglish ? '; ' : '、')}
                      </div>
                    ) : null}
                    {item.references.map((reference) => (
                      <SourceGuidelineReference
                        key={reference.id}
                        reference={reference}
                        isEnglish={isEnglish}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ) : semanticCard.guidelineRules.length > 0 ? (
            <section>
              <h5 className="font-semibold text-foreground">{label.guidelines}</h5>
              <div className="mt-1.5 space-y-2">
                {semanticCard.guidelineRules.map((rule) => (
                  <div key={`${rule.sourceId ?? rule.sourceLabel}-${rule.reference.id}`}>
                    <p className="font-medium text-foreground">
                      {rule.sourceLabel} · {rule.sourceVersion}
                      {rule.reference.recommendationId ? ` · ${rule.reference.recommendationId}` : ''}
                      {rule.reference.evidenceGrade
                        ? ` · ${isEnglish ? 'Grade' : '等級'} ${rule.reference.evidenceGrade}`
                        : ''}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">{rule.reference.summary}</p>
                    <a
                      href={rule.reference.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                    >
                      {isEnglish ? 'Open source' : '查看原文'}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h5 className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              {label.safety}
            </h5>
            <p className="mt-1 select-text text-muted-foreground">
              {recommendation.safetyBoundary}
            </p>
          </section>
        </div>
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
    'no-action': isEnglish ? 'No action needed' : '目前無需處理',
    decision: isEnglish ? 'Module / current assessment' : '模組／本次判斷',
    statusAndEvidence: isEnglish ? 'Key evidence' : '關鍵依據',
    nextStep: isEnglish ? 'Next step' : '下一步',
    evidence: isEnglish ? 'Patient evidence' : '本病人依據',
    missing: isEnglish ? 'Missing for this decision' : '這項決策還缺',
    missingShort: isEnglish ? 'Missing' : '缺',
    next: isEnglish ? 'Suggested next actions' : '建議下一步',
    guidelines: isEnglish ? 'Guideline summary and location' : '指引摘要與章節定位',
    safety: isEnglish ? 'Decision boundary' : '決策邊界',
    sourceComparison: isEnglish ? 'Source comparison' : '來源比較',
    supporting: isEnglish ? 'Other sources and safety notes' : '其他來源與安全提醒',
    notEvaluated: isEnglish ? 'Not evaluated in this POC' : '本次未評估',
    limitations: isEnglish ? 'Scope and limitations' : '使用限制',
    showDetails: isEnglish ? 'Show decision details' : '展開決策詳情',
    hideDetails: isEnglish ? 'Hide decision details' : '收合決策詳情',
    automatedChecks: isEnglish ? 'No action needed' : '目前無需處理',
  } as const

  const [requestedExpandedId, setRequestedExpandedId] = useState<string | null>(null)
  const [collapsedModuleGroups, setCollapsedModuleGroups] = useState<Set<CdssModuleGroupId>>(
    () => new Set(),
  )
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
  const restoredModules = restoreCompletedModules(result)
  const displayRecommendations = restoredModules.recommendations
  const standaloneAutomatedChecks = restoredModules.standaloneChecks
  const hasCompleteModuleGrouping = displayRecommendations.length > 0
    && displayRecommendations.every((item) => item.moduleGroup !== undefined)
  const moduleDisplayRows: ModuleDisplayRow[] = hasCompleteModuleGrouping
    ? MODULE_GROUPS.flatMap((group): ModuleDisplayRow[] => {
      const groupRecommendations = displayRecommendations.filter(
        (item) => item.moduleGroup === group.id,
      )
      if (groupRecommendations.length === 0) return []
      const isCollapsed = collapsedModuleGroups.has(group.id)
      return [
        {
          kind: 'group',
          group,
          count: groupRecommendations.length,
          isCollapsed,
        },
        ...(isCollapsed
          ? []
          : groupRecommendations.map((recommendation): ModuleDisplayRow => ({
            kind: 'recommendation',
            recommendation,
          }))),
      ]
    })
    : displayRecommendations.map((recommendation): ModuleDisplayRow => ({
      kind: 'recommendation',
      recommendation,
    }))
  const expandedId = requestedExpandedId === null
    ? null
    : displayRecommendations.some((item) => item.id === requestedExpandedId)
      ? requestedExpandedId
      : (displayRecommendations[0]?.id ?? null)
  const clinicalSummary = buildClinicalDecisionSummary(result, locale)

  return (
    <div className="space-y-3" data-testid="clinical-decision-support-view">
      <section
        className="rounded-lg border border-primary/25 bg-primary/[0.035] px-3 py-3"
        aria-labelledby="cdss-clinical-summary-title"
        data-testid="cdss-clinical-summary"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <h3
            id="cdss-clinical-summary-title"
            className="text-sm font-semibold text-foreground"
          >
            {isEnglish ? 'Clinical summary' : '臨床摘要'}
          </h3>
          <Badge variant="outline" className="h-5 bg-background px-1.5 text-[11px]">
            {isEnglish
              ? `${displayRecommendations.length + standaloneAutomatedChecks.length} decision modules`
              : `${displayRecommendations.length + standaloneAutomatedChecks.length} 個決策模組`}
          </Badge>
          {clinicalSummary.automatedCheckCount > 0 ? (
            <Badge variant="outline" className="h-5 bg-background px-1.5 text-[11px]">
              {isEnglish
                ? `${clinicalSummary.automatedCheckCount} need no action`
                : `${clinicalSummary.automatedCheckCount} 項無需處理`}
            </Badge>
          ) : null}
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {result.summary}
        </p>

        <div className="mt-3 grid gap-3 @min-[42rem]:grid-cols-[minmax(15rem,1fr)_minmax(0,1.35fr)]">
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              {isEnglish ? 'Data to complete' : '需補資料'}
            </h4>
            {clinicalSummary.missingInputs.length > 0 ? (
              <ul className="mt-1.5 space-y-2 text-xs">
                {clinicalSummary.missingInputs.map((item) => (
                  <li key={item.label} className="flex gap-1.5">
                    <span className="text-amber-700 dark:text-amber-300" aria-hidden="true">•</span>
                    <span className="min-w-0">
                      <span className="font-medium leading-relaxed text-foreground">
                        {item.label}
                      </span>
                      {item.relatedRecommendationCount > 1 ? (
                        <span className="mt-0.5 block leading-relaxed text-muted-foreground">
                          {isEnglish
                            ? `Affects ${item.relatedRecommendationCount} decision modules`
                            : `同時影響 ${item.relatedRecommendationCount} 個決策模組`}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {isEnglish
                  ? 'No explicit missing input is listed in the current decision modules.'
                  : '目前決策模組沒有列出明確缺少的輸入資料。'}
              </p>
            )}
            {clinicalSummary.missingInputCount > clinicalSummary.missingInputs.length ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {isEnglish
                  ? `Plus ${clinicalSummary.missingInputCount - clinicalSummary.missingInputs.length} additional inputs in the modules below.`
                  : `另有 ${clinicalSummary.missingInputCount - clinicalSummary.missingInputs.length} 項，請見下方模組。`}
              </p>
            ) : null}
          </div>

          <div className="@min-[42rem]:border-l @min-[42rem]:border-border @min-[42rem]:pl-3">
            <h4 className="text-xs font-semibold text-foreground">
              {isEnglish ? 'Recommended actions' : '建議處理'}
            </h4>
            {clinicalSummary.actionRecommendations.length > 0 ? (
              <ul className="mt-1.5 space-y-2">
                {clinicalSummary.actionRecommendations.map((recommendation) => {
                  const moduleName = clinicalModuleLabel(
                    recommendation.id,
                    locale,
                    recommendation.title,
                  )
                  return (
                    <li key={recommendation.id} className="text-xs">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold leading-relaxed text-foreground">
                          {moduleName}
                        </span>
                        <Badge className={cn('h-5 px-1.5 text-[11px]', statusStyle[recommendation.status])}>
                          <StatusIcon status={recommendation.status} />
                          {label[recommendation.status]}
                        </Badge>
                      </span>
                      {recommendation.title !== moduleName ? (
                        <span className="mt-0.5 block leading-relaxed text-foreground">
                          {recommendation.title}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block leading-relaxed text-muted-foreground">
                        {recommendation.nextActions[0]}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {isEnglish
                  ? 'Complete the data on the left before determining further action.'
                  : '目前先補齊左側資料，完成後再判斷進一步處理。'}
              </p>
            )}
          </div>
        </div>
      </section>

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

        {moduleDisplayRows.map((row) => {
          if (row.kind === 'group') {
            const groupLabel = isEnglish ? row.group.en : row.group.zh
            return (
              <button
                key={`module-group-${row.group.id}`}
                type="button"
                className="flex h-6 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                aria-expanded={!row.isCollapsed}
                data-testid={`cdss-module-group-trigger-${row.group.id}`}
                onClick={() => {
                  setCollapsedModuleGroups((current) => {
                    const next = new Set(current)
                    if (next.has(row.group.id)) next.delete(row.group.id)
                    else next.add(row.group.id)
                    return next
                  })
                }}
              >
                <span
                  className={cn('flex shrink-0 items-center gap-1.5', row.group.toneClass)}
                  data-testid={`cdss-module-group-tone-${row.group.id}`}
                >
                  <span className="text-[11px] font-semibold leading-none">
                    {groupLabel}
                  </span>
                  <span
                    className="text-[10px] leading-none opacity-75"
                    aria-label={isEnglish
                      ? `${row.count} modules`
                      : `${row.count} 個模組`}
                  >
                    · {row.count}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 opacity-75 transition-transform',
                      !row.isCollapsed && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className={cn('h-px min-w-4 flex-1', row.group.dividerClass)}
                  aria-hidden="true"
                  data-testid={`cdss-module-group-divider-${row.group.id}`}
                />
              </button>
            )
          }

          const recommendation = row.recommendation
          const isExpanded = expandedId === recommendation.id
          const isRiskStratification = recommendation.kind === 'risk-stratification'
          const moduleName = clinicalModuleLabel(
            recommendation.id,
            locale,
            recommendation.title,
          )
          const triggerId = `cdss-trigger-${recommendation.id}`
          const detailId = `cdss-detail-${recommendation.id}`
          const overviewEvidence = recommendation.patientEvidence.find((evidence) => (
            recommendation.overviewEvidenceFactKey
              ? evidence.factKeys.includes(recommendation.overviewEvidenceFactKey)
              : false
          ))
          const overviewMissing = recommendation.hideMissingDataPreview
            ? undefined
            : recommendation.missingData?.[0]
          const overviewMissingForPreview = overviewMissing
            && !isMissingPreviewRedundant(recommendation.title, overviewMissing)
            ? overviewMissing
            : undefined
          const assessmentPreview = recommendation.title !== moduleName
            && !isAssessmentPreviewRedundant(recommendation.title, overviewEvidence?.value)
            ? recommendation.title
            : undefined

          return (
            <article
              key={recommendation.id}
              className={cn(
                'border-b border-border last:border-b-0',
                recommendation.status === 'no-action'
                  && 'bg-emerald-50/50 dark:bg-emerald-950/20',
              )}
              data-testid={`cdss-recommendation-${recommendation.id}`}
            >
              <div
                id={triggerId}
                role="button"
                tabIndex={0}
                className={cn(
                  'grid min-h-11 w-full select-text gap-2 px-3 py-2.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  recommendation.status === 'no-action'
                    ? 'hover:bg-emerald-100/50 dark:hover:bg-emerald-950/35'
                    : 'hover:bg-muted/30',
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
                <span
                  className="min-w-0 cursor-text"
                  data-testid={`cdss-module-cell-${recommendation.id}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-foreground"
                      title={moduleName}
                    >
                      {moduleName}
                    </span>
                    {isRiskStratification ? (
                      <Badge className="h-5 shrink-0 bg-violet-100 px-1.5 text-[11px] text-violet-900 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-200">
                        <Gauge className="mr-1 h-3.5 w-3.5" />
                        {isEnglish ? 'Risk stratification' : '風險分層'}
                      </Badge>
                    ) : null}
                  </span>
                  {assessmentPreview ? (
                    <span
                      className="mt-1 line-clamp-1 break-words text-xs leading-relaxed text-muted-foreground"
                      title={assessmentPreview}
                    >
                      {assessmentPreview}
                    </span>
                  ) : null}
                </span>

                <span
                  className="min-w-0 cursor-text"
                  data-testid={`cdss-evidence-preview-${recommendation.id}`}
                >
                  {overviewEvidence ? (
                    <span className={cn(
                      'block break-words text-xs leading-relaxed text-muted-foreground',
                      overviewMissingForPreview ? 'line-clamp-1' : 'line-clamp-2',
                    )} title={`${overviewEvidence.label}：${overviewEvidence.value}`}>
                      <strong className="font-medium text-foreground">{overviewEvidence.label}：</strong>
                      {overviewEvidence.value}
                    </span>
                  ) : null}
                  {overviewMissingForPreview ? (
                    <span
                      className="mt-0.5 line-clamp-1 break-words text-xs leading-relaxed text-muted-foreground"
                      title={`${label.missingShort}：${overviewMissingForPreview}`}
                    >
                      <strong className="font-medium text-foreground">{label.missingShort}：</strong>
                      {overviewMissingForPreview}
                    </span>
                  ) : null}
                </span>

                <span
                  className="min-w-0 cursor-text"
                  data-testid={`cdss-next-step-preview-${recommendation.id}`}
                >
                  <span
                    className="line-clamp-2 break-words text-xs leading-relaxed text-foreground"
                    title={recommendation.nextActions[0]}
                  >
                    {!isRiskStratification ? (
                      <Badge
                        className={cn(
                          'mr-1 inline-flex h-5 px-1.5 align-middle text-[11px]',
                          statusStyle[recommendation.status],
                        )}
                      >
                        <StatusIcon status={recommendation.status} />
                        {label[recommendation.status]}
                      </Badge>
                    ) : null}
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

        {standaloneAutomatedChecks.map((check) => {
          const moduleName = clinicalModuleLabel(check.id, locale, check.label)
          return (
            <article
              key={check.id}
              className="border-b border-border bg-emerald-50/50 last:border-b-0 dark:bg-emerald-950/20"
              data-testid={`cdss-automated-check-row-${check.id}`}
            >
              <div className="grid min-h-11 gap-2 px-3 py-2.5 text-left @min-[40rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)_2.75rem] @min-[40rem]:items-start @min-[40rem]:gap-3">
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug text-foreground"
                      title={moduleName}
                    >
                      {moduleName}
                    </span>
                    <Badge className={cn('h-6 shrink-0 px-2 text-xs', statusStyle['no-action'])}>
                      <StatusIcon status="no-action" />
                      {label['no-action']}
                    </Badge>
                  </span>
                  {check.label !== moduleName ? (
                    <span
                      className="mt-1 line-clamp-1 break-words text-xs leading-relaxed text-muted-foreground"
                      title={check.label}
                    >
                      {check.label}
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span
                    className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground"
                    title={check.value}
                  >
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
                </span>
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </div>
            </article>
          )
        })}
      </section>

      <details
        className="group border-t border-border pt-1"
        data-testid="cdss-limitations"
      >
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <CircleHelp className="h-3.5 w-3.5 shrink-0" />
          {label.limitations}
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 pb-1 pl-5 text-xs leading-relaxed text-muted-foreground">
          {result.notEvaluated.length > 0 ? (
            <section>
              <h4 className="font-semibold text-foreground">{label.notEvaluated}</h4>
              <ul className="mt-1 grid gap-1 @min-[32rem]:grid-cols-3">
                {result.notEvaluated.map((item) => (
                  <li key={item} className="flex gap-1.5">
                    <span aria-hidden="true">—</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p>{result.disclaimer}</p>
        </div>
      </details>
    </div>
  )
}
