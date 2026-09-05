"use client"

import { type ReactNode, useId, useState } from 'react'
import { ArrowRight, Check, ChevronDown, PencilLine, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssRecommendation } from '../types'
import { type ClinicVitals, todayIsoDate } from '../stores/clinic-vitals.store'
import {
  formatMetricDate,
  type HeartFailureBoardModel,
  type HeartFailureMetric,
  type HeartFailurePillar,
} from './heart-failure-board'
import { statusLabel, statusStyle, StatusIcon } from './status-presentation'

interface HeartFailureStatusBoardProps {
  board: HeartFailureBoardModel
  isEnglish: boolean
  now: Date
  expandedId: string | null
  onToggle: (id: string) => void
  /** The same decision detail the module list opens, so nothing is repeated here. */
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  /** What the clinician measured in the room this visit, if anything. */
  clinicVitals?: ClinicVitals
  /** Absent when this surface cannot take measurements (no patient to attach them to). */
  onSaveClinicVitals?: (vitals: ClinicVitals) => void
  onClearClinicVitals?: () => void
}

const MISSING_PATTERN_STYLE = { backgroundImage: 'var(--clinical-missing-data-pattern)' } as const

function ageLabel(metric: HeartFailureMetric, isEnglish: boolean, now: Date): string | undefined {
  const date = formatMetricDate(metric.date, now)
  if (!date) return undefined
  if (metric.entered) {
    return metric.ageDays === 0
      ? (isEnglish ? 'Entered today' : '今天 · 門診輸入')
      : `${date} · ${isEnglish ? 'entered' : '門診輸入'}`
  }
  if (metric.ageDays === undefined) return date
  if (metric.ageDays === 0) return `${date} · ${isEnglish ? 'today' : '今天'}`
  return `${date} · ${isEnglish ? `${metric.ageDays}d` : `${metric.ageDays}天`}`
}

function MetricCell({
  metric,
  isEnglish,
  now,
  className,
}: {
  metric: HeartFailureMetric
  isEnglish: boolean
  now: Date
  className?: string
}) {
  const missing = metric.value === undefined
  const howToGet = metric.kind === 'lab'
    ? (isEnglish ? 'Laboratory order' : '可開單檢驗')
    : (isEnglish ? 'Measure in clinic' : '診間量測')
  return (
    <div
      className={cn(
        'min-w-0 px-2 py-2',
        missing && 'bg-muted/50',
        className,
      )}
      style={missing ? MISSING_PATTERN_STYLE : undefined}
      title={metric.fullValue}
      data-testid={`cdss-hf-metric-${metric.factKey}`}
      data-missing={missing ? 'true' : undefined}
      data-stale={metric.stale ? 'true' : undefined}
      data-entered={metric.entered ? 'true' : undefined}
    >
      <div className="truncate text-[11px] font-medium leading-4 text-muted-foreground">
        {metric.label}
        {metric.unit ? <span className="ml-1 font-normal opacity-80">{metric.unit}</span> : null}
      </div>
      {missing ? (
        <>
          <div className="mt-0.5 text-sm font-medium leading-5 text-muted-foreground">
            {isEnglish ? 'Not available' : '未取得'}
          </div>
          <div className="text-[11px] leading-4 text-amber-700 dark:text-amber-300">{howToGet}</div>
        </>
      ) : (
        <>
          <div className="mt-0.5 truncate text-base font-semibold leading-5 tabular-nums text-foreground">
            {metric.value}
          </div>
          <div
            className={cn(
              'truncate text-[11px] leading-4 tabular-nums',
              metric.stale
                ? 'font-medium text-amber-700 dark:text-amber-300'
                : metric.entered
                  ? 'font-medium text-primary'
                  : 'text-muted-foreground',
            )}
          >
            {ageLabel(metric, isEnglish, now) ?? (metric.stale ? (isEnglish ? 'Past window' : '已超過窗期') : '')}
          </div>
        </>
      )}
    </div>
  )
}

function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * The cuff, the pulse and the scale, typed in: a room's measurements are often
 * not synced to the record the pack reads, and the freshest numbers a titration
 * decision needs are the ones on the clinician's paper. Nothing is stored past
 * this tab; saving hands the values to the pack, which recomputes every module
 * that reads them.
 */
function ClinicVitalsForm({
  isEnglish,
  now,
  initial,
  onSave,
  onClear,
  onClose,
}: {
  isEnglish: boolean
  now: Date
  initial?: ClinicVitals
  onSave: (vitals: ClinicVitals) => void
  onClear?: () => void
  onClose: () => void
}) {
  const id = useId()
  const [systolic, setSystolic] = useState(initial?.systolic?.toString() ?? '')
  const [diastolic, setDiastolic] = useState(initial?.diastolic?.toString() ?? '')
  const [heartRate, setHeartRate] = useState(initial?.heartRate?.toString() ?? '')
  const [bodyWeight, setBodyWeight] = useState(initial?.bodyWeight?.toString() ?? '')
  const parsed = {
    systolic: parseNumber(systolic),
    diastolic: parseNumber(diastolic),
    heartRate: parseNumber(heartRate),
    bodyWeight: parseNumber(bodyWeight),
  }
  // A blood pressure is two numbers or none; one half cannot be read.
  const bpHalfEntered = (parsed.systolic === undefined) !== (parsed.diastolic === undefined)
  const hasAnything = parsed.heartRate !== undefined
    || parsed.bodyWeight !== undefined
    || (parsed.systolic !== undefined && parsed.diastolic !== undefined)
  const canSave = hasAnything && !bpHalfEntered

  const fields: readonly {
    key: 'systolic' | 'diastolic' | 'heartRate' | 'bodyWeight'
    label: string
    unit: string
    value: string
    set: (value: string) => void
    step: string
  }[] = [
    { key: 'systolic', label: isEnglish ? 'Systolic' : '收縮壓', unit: 'mmHg', value: systolic, set: setSystolic, step: '1' },
    { key: 'diastolic', label: isEnglish ? 'Diastolic' : '舒張壓', unit: 'mmHg', value: diastolic, set: setDiastolic, step: '1' },
    { key: 'heartRate', label: isEnglish ? 'Heart rate' : '心率', unit: 'bpm', value: heartRate, set: setHeartRate, step: '1' },
    { key: 'bodyWeight', label: isEnglish ? 'Weight' : '體重', unit: 'kg', value: bodyWeight, set: setBodyWeight, step: '0.1' },
  ]

  return (
    <form
      className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-border bg-muted/20 px-3.5 py-2.5"
      aria-label={isEnglish ? 'Measured in clinic' : '門診量測'}
      data-testid="cdss-hf-clinic-vitals-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSave) return
        onSave({
          ...(parsed.systolic !== undefined && parsed.diastolic !== undefined
            ? { systolic: parsed.systolic, diastolic: parsed.diastolic }
            : {}),
          ...(parsed.heartRate !== undefined ? { heartRate: parsed.heartRate } : {}),
          ...(parsed.bodyWeight !== undefined ? { bodyWeight: parsed.bodyWeight } : {}),
          measuredOn: todayIsoDate(now),
        })
        onClose()
      }}
    >
      <span className="w-full text-xs text-muted-foreground @min-[40rem]:w-auto @min-[40rem]:self-center">
        {isEnglish
          ? 'Measured in clinic today. Kept for this tab only; every module recomputes from it.'
          : '今日門診量測。只保留在這個分頁；各模組會依此重新判定。'}
      </span>
      {fields.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
          <span>{field.label} <span className="font-normal">{field.unit}</span></span>
          <Input
            id={`${id}-${field.key}`}
            type="number"
            inputMode="decimal"
            min="0"
            step={field.step}
            value={field.value}
            onChange={(event) => field.set(event.target.value)}
            className="h-8 w-20 px-2 text-sm tabular-nums md:text-sm"
            aria-invalid={bpHalfEntered && (field.key === 'systolic' || field.key === 'diastolic') ? true : undefined}
            data-testid={`cdss-hf-clinic-vitals-${field.key}`}
          />
        </label>
      ))}
      <div className="flex items-center gap-1.5">
        <Button type="submit" size="sm" className="h-8" disabled={!canSave} data-testid="cdss-hf-clinic-vitals-save">
          {isEnglish ? 'Apply' : '套用'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onClose}>
          {isEnglish ? 'Cancel' : '取消'}
        </Button>
        {initial && onClear ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground"
            onClick={() => { onClear(); onClose() }}
            data-testid="cdss-hf-clinic-vitals-clear"
          >
            {isEnglish ? 'Clear' : '清除'}
          </Button>
        ) : null}
      </div>
      {bpHalfEntered ? (
        <span className="w-full text-[11px] text-amber-700 dark:text-amber-300" role="alert">
          {isEnglish ? 'Enter both systolic and diastolic.' : '收縮壓與舒張壓要一起填。'}
        </span>
      ) : null}
    </form>
  )
}

function ExpandChevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronDown
      className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
      aria-hidden="true"
    />
  )
}

function PillarTile({
  pillar,
  isEnglish,
  now,
  expanded,
  onToggle,
}: {
  pillar: HeartFailurePillar
  isEnglish: boolean
  now: Date
  expanded: boolean
  onToggle: () => void
}) {
  const therapyDate = formatMetricDate(pillar.therapyDate, now)
  const gap = pillar.status === 'actionable' || pillar.status === 'needs-data'
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-11 min-w-0 flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        expanded && 'bg-muted/25',
      )}
      aria-expanded={expanded}
      aria-controls={`cdss-hf-pillar-detail-${pillar.id}`}
      onClick={onToggle}
      data-testid={`cdss-hf-pillar-${pillar.id}`}
      data-taking={pillar.taking ? 'true' : 'false'}
    >
      <span className="flex min-w-0 flex-col items-start gap-1">
        <span className="text-xs font-semibold leading-4 text-muted-foreground">{pillar.label}</span>
        <Badge className={cn('h-5 shrink-0 px-1.5 text-[11px]', statusStyle[pillar.status])}>
          <StatusIcon status={pillar.status} />
          {pillar.taking && pillar.status === 'no-action'
            ? (isEnglish ? 'Taking' : '使用中')
            : statusLabel(pillar.status, isEnglish)}
        </Badge>
      </span>
      <span className="min-w-0">
        {pillar.taking ? (
          <>
            <span className="line-clamp-2 break-words text-sm font-semibold leading-5 text-foreground" title={pillar.medicationNames}>
              {pillar.medicationNames}
            </span>
            <span className="block truncate text-[11px] leading-4 tabular-nums text-muted-foreground">
              {[therapyDate, isEnglish ? 'Taking' : '使用中'].filter(Boolean).join(' · ')}
            </span>
          </>
        ) : (
          <span
            className="line-clamp-2 max-w-full break-words rounded-sm bg-muted/50 px-1.5 text-sm font-medium leading-5 text-muted-foreground"
            style={MISSING_PATTERN_STYLE}
            title={pillar.therapyText}
          >
            {pillar.therapyText ?? (isEnglish ? 'No prescription found' : '未見處方')}
          </span>
        )}
      </span>
      {pillar.nextAction ? (
        <span className={cn(
          'flex min-w-0 gap-1.5 border-t border-border/60 pt-1.5 text-xs leading-relaxed',
          gap ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {gap
            ? <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span className="line-clamp-3 break-words">{pillar.nextAction}</span>
        </span>
      ) : null}
    </button>
  )
}

export function HeartFailureStatusBoard({
  board,
  isEnglish,
  now,
  expandedId,
  onToggle,
  renderDetail,
  clinicVitals,
  onSaveClinicVitals,
  onClearClinicVitals,
}: HeartFailureStatusBoardProps) {
  const [vitalsFormOpen, setVitalsFormOpen] = useState(false)
  const lvefAge = board.lvef ? ageLabel(board.lvef, isEnglish, now) : undefined
  const expandedPillar = board.pillars.find((pillar) => pillar.id === expandedId)
  const gdmtExpanded = board.gdmt !== undefined && expandedId === board.gdmt.id
  const actionablePillars = board.pillars.filter((pillar) => pillar.status === 'actionable').length

  return (
    <div className="space-y-3" data-testid="cdss-hf-board">
      {/* Phenotype and the safety inputs every FMT decision reads. */}
      <section
        className="overflow-hidden rounded-lg border border-border bg-card"
        aria-label={isEnglish ? 'Patient status' : '病人狀態'}
        data-testid="cdss-hf-status"
      >
        <div className="grid @min-[40rem]:grid-cols-[10.5rem_minmax(0,1fr)]">
          <div className="flex flex-col justify-center gap-0.5 border-b border-border px-3.5 py-2.5 @min-[40rem]:border-b-0 @min-[40rem]:border-r">
            <span className="text-[11px] font-medium text-muted-foreground">
              {isEnglish ? 'Phenotype' : '表型'}
            </span>
            {board.lvef?.value ? (
              <span className="text-[22px] font-semibold leading-7 tracking-tight tabular-nums text-foreground" title={board.lvef.fullValue}>
                LVEF {board.lvef.value}
              </span>
            ) : (
              <span
                className="w-fit rounded-sm bg-muted/50 px-1.5 text-sm font-medium leading-6 text-muted-foreground"
                style={MISSING_PATTERN_STYLE}
                data-testid="cdss-hf-lvef-missing"
              >
                {isEnglish ? 'LVEF not available' : 'LVEF 未取得'}
              </span>
            )}
            {board.phenotype ? (
              <span className="text-xs leading-4 text-foreground" data-testid="cdss-hf-phenotype-title">
                {board.phenotype.title}
              </span>
            ) : null}
            {lvefAge ? (
              <span className="text-[11px] leading-4 tabular-nums text-muted-foreground">
                {isEnglish ? 'Echo' : '心超'} {lvefAge}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-4 divide-x divide-border/60 @min-[40rem]:grid-cols-7">
            {board.metrics.map((metric, index) => (
              <MetricCell
                key={metric.factKey}
                metric={metric}
                isEnglish={isEnglish}
                now={now}
                className={cn(
                  index >= 4 && 'border-t border-border/60 @min-[40rem]:border-t-0',
                  // Four then three: the last row's first cell sits at the
                  // left edge, where a divider would draw against nothing.
                  index === 4 && 'border-l-0',
                )}
              />
            ))}
          </div>
        </div>
        {onSaveClinicVitals ? (
          vitalsFormOpen ? (
            <ClinicVitalsForm
              isEnglish={isEnglish}
              now={now}
              initial={clinicVitals}
              onSave={onSaveClinicVitals}
              onClear={onClearClinicVitals}
              onClose={() => setVitalsFormOpen(false)}
            />
          ) : (
            <div className="flex items-center border-t border-border px-2 py-1">
              <button
                type="button"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setVitalsFormOpen(true)}
                aria-expanded={false}
                data-testid="cdss-hf-clinic-vitals-open"
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                {clinicVitals
                  ? (isEnglish ? 'Edit clinic measurements' : '修改門診量測')
                  : (isEnglish ? 'Enter clinic measurements (BP, HR, weight)' : '輸入門診量測（血壓、心率、體重）')}
              </button>
            </div>
          )
        ) : null}
        {board.fmtSafety ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-muted/40 px-3.5 py-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-secondary-foreground/80" aria-hidden="true" />
            <span className="font-medium text-foreground">
              {board.fmtSafety.moduleName ?? (isEnglish ? 'FMT safety' : 'FMT 調整安全')}：
            </span>
            <span className="min-w-0" data-testid="cdss-hf-fmt-safety-title">{board.fmtSafety.title}</span>
            {board.fmtSafety.status !== 'no-action' ? (
              <Badge className={cn('h-5 px-1.5 text-[11px]', statusStyle[board.fmtSafety.status])}>
                <StatusIcon status={board.fmtSafety.status} />
                {statusLabel(board.fmtSafety.status, isEnglish)}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Safety modules the pack marked actionable: the one thing to see before anything else. */}
      {board.alerts.map((alert) => {
        const expanded = expandedId === alert.id
        const overviewKeys = alert.overviewEvidenceFactKeys
          ?? (alert.overviewEvidenceFactKey ? [alert.overviewEvidenceFactKey] : [])
        const overview = overviewKeys.flatMap((key) => {
          const item = alert.patientEvidence.find((evidence) => evidence.factKeys.includes(key))
          return item ? [item] : []
        })
        const detailId = `cdss-hf-alert-detail-${alert.id}`
        return (
          <section
            key={alert.id}
            className="overflow-hidden rounded-lg border border-border bg-card"
            aria-label={isEnglish ? 'Safety alert' : '安全警訊'}
            data-testid={`cdss-hf-alert-${alert.id}`}
          >
            <button
              type="button"
              className={cn(
                'grid min-h-11 w-full gap-x-3 gap-y-1 bg-amber-50 px-3 py-2.5 text-left transition-colors hover:bg-amber-100/60 dark:bg-amber-500/[0.08] dark:hover:bg-amber-500/[0.14]',
                'grid-cols-[1.25rem_minmax(0,1fr)_1rem] @min-[40rem]:grid-cols-[1.25rem_minmax(0,1.15fr)_minmax(0,0.9fr)_1rem] @min-[40rem]:items-start',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              )}
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => onToggle(alert.id)}
              data-testid={`cdss-hf-alert-trigger-${alert.id}`}
            >
              <TriangleAlert className="mt-0.5 h-[18px] w-[18px] text-amber-700 dark:text-amber-300" aria-hidden="true" />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold leading-5 text-foreground">{alert.title}</span>
                  <Badge className={cn('h-5 px-1.5 text-[11px]', statusStyle[alert.status])}>
                    <StatusIcon status={alert.status} />
                    {statusLabel(alert.status, isEnglish)}
                    {alert.priority === 'high' ? (isEnglish ? ' · Priority' : ' · 優先') : ''}
                  </Badge>
                </span>
                {overview.map((evidence) => (
                  <span
                    key={`${evidence.label}-${evidence.value}`}
                    className="mt-0.5 block text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">{evidence.label}：</span>
                    {evidence.value}
                  </span>
                ))}
              </span>
              <span className="col-span-full pl-8 text-xs leading-relaxed text-foreground @min-[40rem]:col-span-1 @min-[40rem]:pl-0">
                {alert.nextActions[0]}
              </span>
              <span className="col-start-3 row-start-1 @min-[40rem]:col-start-4">
                <ExpandChevron expanded={expanded} />
              </span>
            </button>
            {expanded ? (
              <div id={detailId} role="region" className="border-t border-border bg-background" data-testid={detailId}>
                {renderDetail(alert)}
              </div>
            ) : null}
          </section>
        )
      })}

      {/* The four pillars as a board: what the patient is on, what is missing, what next. */}
      {board.pillars.length > 0 ? (
        <section
          className="overflow-hidden rounded-lg border border-border bg-card"
          aria-label={isEnglish ? 'Foundational medical therapy' : 'HFrEF 四大 FMT 支柱'}
          data-testid="cdss-hf-pillars"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-1.5">
            <span className="text-[11px] font-semibold text-violet-700 dark:text-secondary-foreground/80">
              {isEnglish ? 'Treatment decisions' : '治療決策'}
            </span>
            <span className="text-sm font-semibold text-foreground" data-testid="cdss-hf-pillars-title">
              {board.gdmt?.title ?? (isEnglish ? 'HFrEF foundational medical therapy' : 'HFrEF 四大 FMT 支柱')}
            </span>
            {actionablePillars > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {isEnglish ? `${actionablePillars} actionable` : `${actionablePillars} 項可處理`}
              </span>
            ) : null}
            {board.gdmt ? (
              <button
                type="button"
                className="ml-auto inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={gdmtExpanded}
                aria-controls={`cdss-hf-pillar-detail-${board.gdmt.id}`}
                onClick={() => onToggle(board.gdmt!.id)}
                data-testid="cdss-hf-gdmt-trigger"
              >
                <Badge className={cn('h-5 px-1.5 text-[11px]', statusStyle[board.gdmt.status])}>
                  <StatusIcon status={board.gdmt.status} />
                  {statusLabel(board.gdmt.status, isEnglish)}
                </Badge>
                {isEnglish ? 'Details' : '四支柱詳情'}
                <ExpandChevron expanded={gdmtExpanded} />
              </button>
            ) : null}
          </div>
          <div className="grid gap-2 p-3 @min-[28rem]:grid-cols-2 @min-[40rem]:grid-cols-4">
            {board.pillars.map((pillar) => (
              <PillarTile
                key={pillar.id}
                pillar={pillar}
                isEnglish={isEnglish}
                now={now}
                expanded={expandedId === pillar.id}
                onToggle={() => onToggle(pillar.id)}
              />
            ))}
          </div>
          {expandedPillar ? (
            <div
              id={`cdss-hf-pillar-detail-${expandedPillar.id}`}
              role="region"
              className="border-t border-border bg-background"
              data-testid={`cdss-hf-pillar-detail-${expandedPillar.id}`}
            >
              <div className="flex items-center gap-2 px-3 pt-2.5 text-xs font-semibold text-foreground">
                {expandedPillar.label}
                <span className="font-normal text-muted-foreground">· {expandedPillar.recommendation.title}</span>
              </div>
              {renderDetail(expandedPillar.recommendation)}
            </div>
          ) : null}
          {gdmtExpanded && board.gdmt ? (
            <div
              id={`cdss-hf-pillar-detail-${board.gdmt.id}`}
              role="region"
              className="border-t border-border bg-background"
              data-testid={`cdss-hf-pillar-detail-${board.gdmt.id}`}
            >
              {renderDetail(board.gdmt)}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
