"use client"

import { type ReactNode, useId, useState } from 'react'
import { ChevronDown, ClipboardList, Copy, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import type { CdssRecommendation, CdssResult } from '../types'
import type { PhysicianDecisionInput, PhysicianDecisionMap, PhysicianDecisionKind } from '../stores/physician-decisions.store'
import { decisionLabel, formatStamp } from './heart-failure-visit-flow'
import { buildDyslipidemiaBoard } from './dyslipidemia-board'
import { MetricStrip, PillarTile, ageLabel } from './status-board-parts'
import { sourceStatusLabel, sourceStatusStyle, statusLabel, statusStyle, StatusIcon } from './status-presentation'

interface Props {
  calculator?: ReactNode
  result: CdssResult
  isEnglish: boolean
  now: Date
  expandedId: string | null
  onToggle: (id: string) => void
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  decisions?: PhysicianDecisionMap
  onRecordDecision?: (moduleId: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (moduleId: string) => void
}

const SECTIONS = [
  ['risk', '風險與目標', 'Risk and goal'],
  ['labs', '檢驗資料', 'Laboratory data'],
  ['therapy', '治療決策', 'Treatment'],
  ['coverage', '健保條件', 'NHI coverage'],
  ['followup', '追蹤與紀錄', 'Follow-up'],
] as const

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={`cdss-lipid-${id}`} aria-label={title} className="scroll-mt-4 overflow-hidden rounded-lg border border-border bg-card" data-testid={`cdss-lipid-${id}`}>
    <h3 className="border-b border-border bg-muted/30 px-4 py-2.5 text-sm font-semibold">{title}</h3>
    {children}
  </section>
}

/** Placement only: all decisions, targets, evidence and coverage come from the pack. */
export function DyslipidemiaVisitFlow({ calculator, result, isEnglish, now, expandedId, onToggle, renderDetail, decisions = {}, onRecordDecision, onClearDecision }: Props) {
  const board = buildDyslipidemiaBoard(result, isEnglish ? 'en' : 'zh-TW', now)
  const { copied, copy } = useCopyToClipboard()
  if (!board) return null
  const modules = [...new Map([
    ...result.recommendations,
    ...(result.automatedChecks ?? []).flatMap(check => check.recommendation ? [check.recommendation] : []),
  ].map(rec => [rec.id, rec])).values()]
  const risk = board.headline
  const therapy = board.pillarHeading
  const monitoring = modules.find(rec => rec.id === 'dyslipidemia-monitoring-and-markers')
  const safetyIds = new Set(board.alerts.map(rec => rec.id))
  const riskRows = modules.filter(rec => rec !== therapy && rec !== monitoring && !safetyIds.has(rec.id))
  const openCount = modules.filter(rec => rec.status !== 'no-action').length
  const recorded = modules.filter(rec => decisions[rec.id]).length
  const summary = [
    result.title,
    ...modules.map(rec => `${rec.moduleName ?? rec.title}：${rec.title}\n${rec.recommendation}${decisions[rec.id] ? `\n${isEnglish ? 'Recorded decision' : '本次紀錄'}：${decisionLabel(decisions[rec.id].decision, isEnglish)}${decisions[rec.id].note ? ` — ${decisions[rec.id].note}` : ''}` : ''}`),
    `${isEnglish ? 'Rules version' : '規則版本'}：${result.packVersion}`,
  ].join('\n\n')
  const row = (rec: CdssRecommendation) => <DecisionRow key={rec.id} rec={rec} isEnglish={isEnglish}
    expanded={expandedId === rec.id} onToggle={() => onToggle(rec.id)} renderDetail={renderDetail}
    decision={decisions[rec.id]} now={now} onRecord={onRecordDecision ? (input) => onRecordDecision(rec.id, input) : undefined}
    onClear={onClearDecision ? () => onClearDecision(rec.id) : undefined} packVersion={result.packVersion} />

  return <div className="space-y-3" data-testid="cdss-lipid-visit-flow">
    <nav aria-label={isEnglish ? 'Dyslipidemia visit sections' : '高血脂看診流程'} className="rounded-lg border border-border bg-card">
      <ol className="grid grid-cols-2 divide-border @min-[40rem]:grid-cols-5">
        {SECTIONS.map(([id, zh, en], index) => <li key={id}>
          <a href={`#cdss-lipid-${id}`} className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="text-muted-foreground tabular-nums">{index + 1}</span>{isEnglish ? en : zh}
          </a>
        </li>)}
      </ol>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <ClipboardList className="h-4 w-4" aria-hidden="true" />
        {isEnglish ? `${openCount} open assessments · ${recorded} decisions recorded` : `${openCount} 項待處理評估 · 已記錄 ${recorded} 項決策`}
      </div>
    </nav>

    {board.alerts.length ? <div role="region" aria-label={isEnglish ? 'Safety alerts' : '優先安全提醒'} data-testid="cdss-lipid-alerts" className="overflow-hidden rounded-lg border border-border bg-amber-50/50 dark:bg-amber-950/15">
      <div className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold"><TriangleAlert className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />{isEnglish ? 'Safety first' : '先確認安全'}</div>
      {board.alerts.map(row)}
    </div> : null}

    <Section id="risk" title={isEnglish ? 'Risk and goal' : '風險與目標'}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 px-4 py-3">
        <div>
          <div className="text-xs text-muted-foreground">LDL-C</div>
          <div className="text-2xl font-semibold tabular-nums" data-testid="cdss-lipid-headline-value">{board.headlineMetric?.value ?? (isEnglish ? 'Not available' : '未取得')}
            {board.headlineMetric?.unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{board.headlineMetric.unit}</span> : null}
          </div>
          {board.headlineMetric ? <div className={cn('text-xs', board.headlineMetric.stale ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>{ageLabel(board.headlineMetric, isEnglish, now)}</div> : null}
        </div>
        {risk ? <p className="min-w-0 flex-1 basis-52 text-sm leading-relaxed">{risk.recommendation}</p> : null}
      </div>
      {riskRows.map(row)}
      {calculator}
    </Section>

    <Section id="labs" title={isEnglish ? 'Laboratory data' : '檢驗資料'}>
      <MetricStrip metrics={board.metrics} columnsClass="grid-cols-2 @min-[30rem]:grid-cols-3 @min-[46rem]:grid-cols-5" isEnglish={isEnglish} now={now} testIdPrefix="cdss-lipid" />
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{isEnglish ? 'Dates remain visible. Older results inform the assessment with a repeat-test reminder. Non-HDL-C is derived from same-day TC and HDL-C.' : '保留採檢日期；較舊數值仍參與判定並提醒複驗。non-HDL-C 由同日 TC 與 HDL-C 計算。'}</p>
    </Section>

    <Section id="therapy" title={isEnglish ? 'Treatment decisions' : '治療決策'}>
      <div className="px-4 pt-3 text-xs text-muted-foreground">{isEnglish ? 'Current treatment and add-on options; select according to the clinical assessment below.' : '目前治療與加成選項；是否加藥依下方臨床判斷。'}</div>
      <div className="grid gap-2 p-3 @min-[36rem]:grid-cols-3">
        {board.pillars.map(pillar => <PillarTile key={pillar.id} detailId={therapy ? `cdss-lipid-detail-${therapy.id}` : undefined} pillar={pillar} variant="row" isEnglish={isEnglish} now={now} expanded={Boolean(therapy && expandedId === therapy.id)} expandable={Boolean(therapy)} onToggle={() => therapy && onToggle(therapy.id)} testIdPrefix="cdss-lipid" />)}
      </div>
      {therapy ? <p className="px-4 pb-3 text-sm leading-relaxed">{therapy.recommendation}</p> : null}
      {therapy ? row(therapy) : <p className="p-4 text-sm">{isEnglish ? 'No treatment assessment returned.' : '本次未產生降脂治療判斷。'}</p>}
    </Section>

    <Section id="coverage" title={isEnglish ? 'NHI coverage conditions' : '健保給付條件'}>
      <p className="px-4 py-3 text-xs text-muted-foreground">{isEnglish ? 'Clinical goals and coverage are assessed separately. The rule check is not an authorization or payment result.' : '指引目標與健保條件分開核對；條文核對不等於事前審查或核付結果。'}</p>
      {modules.flatMap(rec => (rec.sourceAssessments ?? []).filter(source => source.sourceKind === 'coverage' && source.status !== 'not-applicable').map(source =>
        <div key={`${rec.id}-${source.sourceId}`} className="space-y-2 border-t border-border px-4 py-3" data-testid={`cdss-lipid-coverage-${rec.id}`}>
          <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{rec.moduleName ?? rec.title}</span><Badge className={sourceStatusStyle[source.status]}>{sourceStatusLabel(source.status, isEnglish)}</Badge></div>
          <p className="text-sm leading-relaxed">{source.summary}</p>
          {source.missingData?.length ? <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-200">{source.missingData.map(item => <li key={item}>{item}</li>)}</ul> : null}
          <button type="button" className="min-h-11 text-xs font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { onToggle(rec.id); document.getElementById(`cdss-lipid-module-${rec.id}`)?.scrollIntoView({ block: 'center' }) }}>{isEnglish ? 'Review supporting evidence and source' : '查看判定依據與條文'}</button>
        </div>))}
    </Section>

    <Section id="followup" title={isEnglish ? 'Follow-up and visit record' : '追蹤與本次紀錄'}>
      {monitoring ? row(monitoring) : null}
      <div className="border-t border-border px-4 py-3">
        <Button type="button" variant="outline" className="min-h-11" onClick={async () => {
          if (!await copy(summary)) toast.error(isEnglish ? 'Could not copy. Please try again.' : '無法複製，請重試。')
        }}><Copy className="mr-2 h-4 w-4" aria-hidden="true" />{copied ? (isEnglish ? 'Copied' : '已複製') : (isEnglish ? 'Copy visit summary' : '複製本次摘要')}</Button>
        <p className="mt-2 text-xs text-muted-foreground">{isEnglish ? 'Recording a decision does not place an order or change the clinical assessment.' : '決策紀錄不會直接開立醫囑，也不會改變原本的臨床判定。'}</p>
      </div>
    </Section>
  </div>
}

function DecisionRow({ rec, isEnglish, expanded, onToggle, renderDetail, decision, onRecord, onClear, packVersion, now }: {
  rec: CdssRecommendation; isEnglish: boolean; expanded: boolean; onToggle: () => void
  renderDetail: (rec: CdssRecommendation) => ReactNode
  decision?: PhysicianDecisionMap[string]; onRecord?: (input: PhysicianDecisionInput) => void
  onClear?: () => void; packVersion: string; now: Date
}) {
  const controlId = useId()
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<PhysicianDecisionKind | ''>('')
  const actions: PhysicianDecisionKind[] = rec.domain === 'medication'
    ? ['prescribed', 'dose-adjusted', 'contraindicated', 'deferred', 'patient-preference']
    : ['ordered', 'deferred', 'patient-preference']
  const detailId = `cdss-lipid-detail-${rec.id}`
  return <article id={`cdss-lipid-module-${rec.id}`} className="border-t border-border" data-testid={`cdss-lipid-row-${rec.id}`}>
    <button type="button" className="flex min-h-11 w-full items-start gap-2 px-4 py-3 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{rec.moduleName ?? rec.title}</span><Badge className={statusStyle[rec.status]}><StatusIcon status={rec.status} />{statusLabel(rec.status, isEnglish)}</Badge></div>
        <p className="text-sm leading-relaxed">{rec.title}</p>
        {rec.nextActions[0] ? <p className="text-xs leading-relaxed text-muted-foreground">{rec.nextActions[0]}</p> : null}
      </div><ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
    </button>
    <div id={detailId} hidden={!expanded}>
      {expanded ? renderDetail(rec) : null}
    </div>
    {decision ? <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs"><span>{isEnglish ? 'Recorded' : '已記錄'}：{decisionLabel(decision.decision, isEnglish)}{decision.note ? ` · ${decision.note}` : ''} · {formatStamp(decision.recordedAt, now, isEnglish)} · v{decision.packVersion}</span>{onClear ? <button type="button" onClick={onClear} className="min-h-11 px-2 text-primary underline focus-visible:ring-2 focus-visible:ring-ring">{isEnglish ? 'Clear decision' : '清除紀錄'}</button> : null}</div> : onRecord && rec.status !== 'no-action' ?
      <form className="flex flex-wrap items-end gap-2 px-4 pb-3" onSubmit={event => { event.preventDefault(); if (kind) { onRecord({ decision: kind, reasons: [], note: note.trim() || undefined, packVersion }); setKind(''); setNote('') } }}>
        <label htmlFor={`${controlId}-kind`} className="min-w-0 text-xs text-muted-foreground">{isEnglish ? 'Decision' : '本次決策'}<select id={`${controlId}-kind`} value={kind} onChange={event => setKind(event.target.value as PhysicianDecisionKind)} className="mt-1 block min-h-11 max-w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">{isEnglish ? 'Select…' : '選擇處置…'}</option>{actions.map(action => <option key={action} value={action}>{decisionLabel(action, isEnglish)}</option>)}</select></label>
        <label htmlFor={`${controlId}-note`} className="min-w-0 flex-1 basis-36 text-xs text-muted-foreground">{isEnglish ? 'Reason / note (optional)' : '原因／備註（選填）'}<input id={`${controlId}-note`} value={note} onChange={event => setNote(event.target.value)} className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        <Button type="submit" variant="outline" disabled={!kind} className="min-h-11">{isEnglish ? 'Record' : '記錄'}</Button>
      </form> : null}
  </article>
}
