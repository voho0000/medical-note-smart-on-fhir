"use client"

import { useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, PencilLine, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssRecommendation } from '../types'
import type { ClinicVitals, ClinicVitalsPatch } from '../stores/clinic-vitals.store'
import type { HypertensionBoardModel } from './hypertension-board'
import { ClinicVitalsForm } from './ClinicVitalsForm'
import { formatMetricDate, type ClinicalMetric } from './status-metrics'
import { statusLabel, statusStyle, StatusIcon } from './status-presentation'

/** The same flat sections, dated measurements and action/basis reading order as HF. */
export function DiseaseStatusBoard({ board, isEnglish, now, expandedId, onToggle, renderDetail, clinicVitals, onSaveClinicVitals }: {
  board: HypertensionBoardModel
  isEnglish: boolean
  now: Date
  expandedId: string | null
  onToggle: (id: string) => void
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  clinicVitals?: ClinicVitals
  onSaveClinicVitals?: (patch: ClinicVitalsPatch) => void
}) {
  const [editing, setEditing] = useState(false)
  const counts = board.statusCounts
  const first = board.firstAction
  const open = (id: string) => {
    if (expandedId !== id) onToggle(id)
    requestAnimationFrame(() => {
      const row = document.getElementById(`cdss-trigger-${id}`)
      row?.scrollIntoView?.({ block: 'center', behavior: 'instant' })
      row?.focus()
    })
  }
  const decisionRow = (item: CdssRecommendation) => (
    <div key={item.id} className="min-w-0" data-testid={`cdss-htn-module-${item.id}`}>
      <button type="button" id={`cdss-trigger-${item.id}`}
        className="flex min-h-11 w-full items-start gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={expandedId === item.id} aria-controls={`cdss-htn-detail-${item.id}`} onClick={() => onToggle(item.id)}>
        <span className="mt-0.5 shrink-0"><StatusIcon status={item.status} /></span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-muted-foreground">{item.moduleName}</span><Badge className={cn('text-xs', statusStyle[item.status])}>{statusLabel(item.status, isEnglish)}</Badge></span>
          <span className="block break-words text-sm font-semibold leading-6">{item.title}</span>
          {item.nextActions[0] ? <span className="block break-words text-xs leading-5 text-muted-foreground">{item.nextActions[0]}</span> : null}
        </span>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground', expandedId === item.id && 'rotate-180')} aria-hidden="true" />
      </button>
      <div id={`cdss-htn-detail-${item.id}`} hidden={expandedId !== item.id}>
        {expandedId === item.id ? renderDetail(item) : null}
      </div>
    </div>
  )

  return <div className="space-y-3" data-testid="cdss-htn-board">
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={isEnglish ? 'Today’s priorities' : '本次看診重點'}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2 text-xs">
        <h3 className="font-semibold">{isEnglish ? 'Today’s priorities' : '本次看診重點'}</h3>
        <span>{isEnglish ? 'Action needed' : '可採取行動'} <strong className="tabular-nums">{counts.actionable}</strong></span>
        <span>{isEnglish ? 'Need data' : '需補資料'} <strong className="tabular-nums">{counts['needs-data']}</strong></span>
        <span>{isEnglish ? 'Clinical review' : '需臨床確認'} <strong className="tabular-nums">{counts.review}</strong></span>
        <span className="text-muted-foreground">{isEnglish ? 'No action' : '目前無需處理'} {counts['no-action']}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-3 py-3">
        <div className="min-w-0 flex-1 text-sm leading-6"><span className="block text-xs text-muted-foreground">{first?.moduleName ?? (isEnglish ? 'Current assessment' : '本次判定')}</span>
          <p className="font-semibold">{first?.title ?? (isEnglish ? 'No additional action raised by the modules.' : '本次模組未提出額外處置。')}</p>
        </div>
        {first ? <Button variant="outline" className="min-h-11" onClick={() => open(first.id)}>{isEnglish ? 'Review' : '前往處理'}<ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" /></Button> : null}
      </div>
    </section>

    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={isEnglish ? 'Available measurements' : '病歷已有資料'}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">{isEnglish ? 'Available measurements' : '病歷已有資料'}</h3>
        {onSaveClinicVitals ? <Button variant="ghost" className="min-h-11 text-xs" onClick={() => setEditing(!editing)} aria-expanded={editing} aria-controls="cdss-htn-bp-form"><PencilLine className="mr-1.5 h-4 w-4" aria-hidden="true" />{isEnglish ? 'Enter clinic BP' : '輸入門診血壓'}</Button> : null}
      </div>
      <div className="grid grid-cols-2 @min-[30rem]:grid-cols-3 @min-[48rem]:grid-cols-6">
        {board.metrics.map((metric) => <DiseaseMetricCell key={metric.factKey} metric={metric} isEnglish={isEnglish} now={now} />)}
      </div>
      <p className="border-t border-border px-3 py-2 text-xs leading-5 text-muted-foreground">{isEnglish ? 'Dated values remain available for assessment; past-window values need repeat measurement.' : '保留原始量測日期；超過窗期的數值仍參與判定，並提醒複驗。'}</p>
      <div id="cdss-htn-bp-form" hidden={!editing} className="[&_input]:min-h-11 [&_button]:min-h-11 [&_label]:text-xs">
        {editing && onSaveClinicVitals ? <ClinicVitalsForm isEnglish={isEnglish} now={now} initial={clinicVitals}
          fieldKeys={['systolic', 'diastolic']} testIdPrefix="cdss-htn-clinic-vitals"
          onSave={onSaveClinicVitals} onClose={() => setEditing(false)}
          onClear={clinicVitals?.entries.systolic || clinicVitals?.entries.diastolic ? () => onSaveClinicVitals({ entries: { systolic: null, diastolic: null } }) : undefined}
          footnote={isEnglish ? 'Enter clinic BP only. This does not confirm a home or ambulatory average.' : '此處為門診量測，不會當作居家平均或 ABPM，也不會完成量測品質確認。'} /> : null}
      </div>
    </section>

    {board.alerts.length ? <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={isEnglish ? 'Safety alerts' : '安全提醒'}>
      <h3 className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-semibold"><TriangleAlert className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />{isEnglish ? 'Safety alerts' : '安全提醒'}</h3>
      <div className="divide-y divide-border">{board.alerts.map(decisionRow)}</div>
    </section> : null}

    {board.assessment.length ? <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={isEnglish ? 'BP category, target and confirmation' : '血壓分類、目標與確認'}>
      <h3 className="border-b border-border px-3 py-2 text-sm font-semibold">{isEnglish ? 'BP category, target and confirmation' : '血壓分類、目標與確認'}</h3>
      <div className="divide-y divide-border">{board.assessment.map(decisionRow)}</div>
    </section> : null}

    {board.therapyRecommendation ? <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={isEnglish ? 'Current treatment' : '目前降壓治療'}>
      <h3 className="border-b border-border px-3 py-2 text-sm font-semibold">{isEnglish ? 'Current treatment' : '目前降壓治療'}</h3>
      <div className="grid divide-y divide-border @min-[30rem]:grid-cols-2 @min-[48rem]:grid-cols-5">
        {board.therapies.map(({ factKey, evidence }) => <div key={factKey} className="min-w-0 px-3 py-3" data-testid={`cdss-htn-therapy-${factKey}`}>
          <div className="text-xs font-medium text-muted-foreground">{evidence.label}</div><div className="mt-1 break-words text-sm leading-6">{evidence.value}</div>
        </div>)}
      </div>
      <div className="border-t border-border">{decisionRow(board.therapyRecommendation)}</div>
    </section> : null}
  </div>
}

function DiseaseMetricCell({ metric, isEnglish, now }: { metric: ClinicalMetric; isEnglish: boolean; now: Date }) {
  const missing = metric.value === undefined
  return <div className={cn('min-w-0 px-3 py-3', missing && 'bg-muted/50')}
    style={missing ? { backgroundImage: 'var(--clinical-missing-data-pattern)' } : undefined}
    data-testid={`cdss-htn-metric-${metric.factKey}`} data-missing={missing || undefined} data-stale={metric.stale || undefined} data-entered={metric.entered || undefined}>
    <div className="break-words text-xs font-medium text-muted-foreground">{metric.label} {metric.unit ? <span className="font-normal">{metric.unit}</span> : null}</div>
    <div className="mt-1 break-words text-base font-semibold tabular-nums" title={metric.fullValue}>{metric.value ?? (isEnglish ? 'Not available' : '未取得')}</div>
    {missing ? <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">{metric.kind === 'lab' ? (isEnglish ? 'Laboratory test' : '可開單檢驗') : (isEnglish ? 'Measure in clinic' : '診間量測')}</div>
      : <div className="mt-1 text-xs leading-5 text-muted-foreground">{formatMetricDate(metric.date, now) ?? (isEnglish ? 'Date unavailable' : '日期未取得')}{metric.ageDays !== undefined ? ` · ${metric.ageDays}${isEnglish ? 'd' : '天'}` : ''}{metric.entered ? (isEnglish ? ' · entered in clinic' : ' · 門診輸入') : ''}</div>}
    {metric.stale ? <div className="text-xs leading-5 text-amber-700 dark:text-amber-300">{isEnglish ? 'Past window · repeat' : '超過窗期 · 建議複驗'}</div> : null}
    {!missing && !metric.evaluated ? <div className="text-xs leading-5 text-muted-foreground">{isEnglish ? 'Not assessed this visit' : '本次未判定'}</div> : null}
  </div>
}
