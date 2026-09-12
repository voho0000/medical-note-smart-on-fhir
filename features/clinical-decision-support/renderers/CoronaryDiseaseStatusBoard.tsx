"use client"

import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ClipboardList, Copy, PencilLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import type { CdssRecommendation } from '../types'
import type { ClinicVitals, ClinicVitalsPatch } from '../stores/clinic-vitals.store'
import type { PhysicianDecisionInput, PhysicianDecisionMap } from '../stores/physician-decisions.store'
import { ClinicVitalsForm } from './ClinicVitalsForm'
import { PhysicianDecisionControls } from './PhysicianDecisionControls'
import { coronaryActionRow, type CoronaryDiseaseBoardModel, type CoronaryTherapyGroup } from './coronary-disease-board'
import { statusLabel, statusStyle, StatusIcon } from './status-presentation'
import { decisionLabel, decisionReasonLabel } from './heart-failure-visit-flow'

interface Props {
  board: CoronaryDiseaseBoardModel
  isEnglish: boolean
  now: Date
  expandedId: string | null
  onToggle: (id: string) => void
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  clinicVitals?: ClinicVitals
  onSaveClinicVitals?: (patch: ClinicVitalsPatch) => void
  onClearClinicVitals?: () => void
  decisions?: PhysicianDecisionMap
  onRecordDecision?: (moduleId: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (moduleId: string) => void
  calculator?: ReactNode
  packVersion: string
}

function Section({ id, title, eyebrow, action, children }: {
  id: string; title: string; eyebrow: string; action?: ReactNode; children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby={`${id}-title`} data-testid={id}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{eyebrow}</span>
        <h2 id={`${id}-title`} className="text-sm font-semibold text-foreground">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

function Status({ recommendation, isEnglish }: { recommendation: CdssRecommendation; isEnglish: boolean }) {
  return <Badge className={cn('shrink-0 px-1.5 text-xs', statusStyle[recommendation.status])}>
    <StatusIcon status={recommendation.status} />{statusLabel(recommendation.status, isEnglish)}
  </Badge>
}

export function CoronaryDiseaseStatusBoard({
  board, isEnglish, now, expandedId, onToggle, renderDetail,
  clinicVitals, onSaveClinicVitals, onClearClinicVitals,
  decisions = {}, onRecordDecision, onClearDecision, packVersion, calculator,
}: Props) {
  const [vitalsOpen, setVitalsOpen] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set())
  const { copy, copied } = useCopyToClipboard()
  const active = board.remaining.filter(item => item.status !== 'no-action')
  const done = board.remaining.filter(item => item.status === 'no-action')
  const showDone = doneOpen || active.length === 0
  const decidable = board.recommendations.filter(item => coronaryActionRow(item, decisions).decisionKind !== 'none')
  const decided = decidable.filter(item => decisions[item.id])
  const next = [...board.alerts, ...board.recommendations.filter(item => item.status === 'actionable'), ...decidable]
    .find(item => !decisions[item.id])
  const summary = [
    `${isEnglish ? 'Coronary disease visit' : '冠心病看診紀錄'} · ${now.toLocaleDateString('sv-SE')}`,
    board.headline?.title,
    ...decidable.map(item => `${item.moduleName ?? item.title}：${item.title}\n${isEnglish ? 'Plan' : '建議'}：${item.recommendation}${decisions[item.id]
      ? `\n${isEnglish ? 'Recorded decision' : '本次處置'}：${decisionLabel(decisions[item.id].decision, isEnglish)}${decisions[item.id].reasons.length ? ` · ${decisions[item.id].reasons.map(reason => decisionReasonLabel(reason, isEnglish)).join('、')}` : ''}${decisions[item.id].note ? ` · ${decisions[item.id].note}` : ''}`
      : `\n${isEnglish ? 'No decision recorded' : '尚未記錄處置'}`}`),
    `${isEnglish ? 'Rules version' : '規則版本'}：${packVersion}`,
  ].filter(Boolean).join('\n\n')

  const focusModule = (id: string) => {
    if (done.some(item => item.id === id)) setDoneOpen(true)
    requestAnimationFrame(() => {
      const el = document.getElementById(`cdss-ccd-module-${id}`)
      el?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      el?.querySelector<HTMLButtonElement>('button')?.focus()
    })
  }
  const moduleRow = (rec: CdssRecommendation, group?: CoronaryTherapyGroup) => {
    const expanded = expandedId === rec.id
    const row = coronaryActionRow(rec, decisions)
    return (
      <article key={rec.id} id={`cdss-ccd-module-${rec.id}`} className="border-b border-border last:border-b-0" data-testid={`cdss-ccd-module-${rec.id}`}>
        {group ? (
          <div className="border-b border-border/60 px-3 py-2">
            <h3 className="text-sm font-semibold">{group.label}</h3>
            <div className="mt-2 grid grid-cols-1 gap-2 @min-[32rem]:grid-cols-3">
              {group.drugs.map(drug => (
                <div key={drug.factKey} className="min-w-0 rounded-md bg-muted/30 px-2.5 py-2" data-testid={`cdss-ccd-drug-${drug.factKey}`}>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-semibold">{drug.label}</span>
                    <span className="text-muted-foreground">{drug.taking === undefined ? (isEnglish ? 'Not available' : '未取得')
                      : drug.taking ? (isEnglish ? 'Taking' : '使用中') : (isEnglish ? 'Not taking' : '未使用')}</span>
                  </div>
                  {drug.taking && drug.text ? <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{drug.text.replace(/^(?:目前用藥中|Currently taking)[：:]\s*/, '')}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="px-3 py-2.5">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><Status recommendation={rec} isEnglish={isEnglish} />
                <span className="text-xs text-muted-foreground">{rec.moduleName}</span>
              </div>
              <h3 className="mt-1 text-sm font-semibold leading-relaxed">{rec.title}</h3>
              {rec.status !== 'no-action' ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{rec.recommendation}</p> : null}
              {rec.missingData?.length ? <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200">{isEnglish ? 'Missing' : '還缺'}：{rec.missingData.join(isEnglish ? ', ' : '、')}</p> : null}
              <PhysicianDecisionControls key={`${rec.id}-${decisions[rec.id]?.recordedAt ?? 'none'}`} row={row} isEnglish={isEnglish} now={now}
                editing={editing.has(rec.id)} onEdit={value => setEditing(previous => {
                  const next = new Set(previous); if (value) next.add(rec.id); else next.delete(rec.id); return next
                })} onRecordDecision={onRecordDecision} onClearDecision={onClearDecision} packVersion={packVersion}
                readOnly={!onRecordDecision} testIdPrefix="cdss-ccd" />
            </div>
            <button type="button" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-primary hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={expanded} aria-controls={`cdss-ccd-detail-${rec.id}`} aria-label={`${expanded ? (isEnglish ? 'Hide' : '收合') : (isEnglish ? 'Show' : '展開')} ${rec.moduleName ?? rec.title}`}
              onClick={() => onToggle(rec.id)} data-testid={`cdss-ccd-expand-${rec.id}`}>
              <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} aria-hidden="true" />
            </button>
          </div>
        </div>
        {expanded ? <div id={`cdss-ccd-detail-${rec.id}`} role="region" aria-label={rec.moduleName ?? rec.title} className="border-t border-border bg-background">{renderDetail(rec)}</div> : null}
      </article>
    )
  }

  return (
    <div className="space-y-3 max-md:[&_button]:min-h-11" data-testid="cdss-coronary-board">
      <nav aria-label={isEnglish ? 'Coronary visit steps' : '冠心病看診步驟'} className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card @min-[40rem]:grid-cols-4">
        {[
          { id: 'cdss-ccd-context', label: isEnglish ? 'Verify evidence' : '核對冠心病', note: isEnglish ? 'Evidence and event dates' : '證據與事件日期' },
          { id: 'cdss-ccd-record', label: isEnglish ? 'Review inputs' : '檢視臨床資訊', note: isEnglish ? `${board.metrics.filter(item => item.value !== undefined).length} / ${board.metrics.length} available` : `已取得 ${board.metrics.filter(item => item.value !== undefined).length} / ${board.metrics.length} 項` },
          { id: board.alerts.length ? 'cdss-ccd-safety' : board.groups.length ? 'cdss-ccd-therapy' : 'cdss-ccd-context', label: isEnglish ? "Today's actions" : '今日處置', note: isEnglish ? `${decided.length} / ${decidable.length} decided` : `已決定 ${decided.length} / ${decidable.length}` },
          { id: 'cdss-ccd-follow-up', label: isEnglish ? 'Record and follow-up' : '紀錄與追蹤', note: isEnglish ? 'Copy visit summary' : '複製本次摘要' },
        ].map((step, index) => <button key={index} type="button" aria-label={step.label} className="flex min-h-14 items-start gap-2 border-r border-border px-3 py-2.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => {
            const el = document.querySelector<HTMLElement>(`[data-testid="${step.id}"]`)
            el?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
            const target = el?.querySelector<HTMLElement>('h2')
            target?.setAttribute('tabindex', '-1'); target?.focus({ preventScroll: true })
          }}>
          <span className="text-xs font-medium tabular-nums text-primary">{index + 1}</span>
          <span className="min-w-0"><span className="block text-sm font-semibold">{step.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{step.note}</span></span>
        </button>)}
      </nav>
      <Section id="cdss-ccd-context" eyebrow={isEnglish ? 'This visit' : '本次看診'} title={isEnglish ? 'Coronary disease evidence and phase' : '冠心病證據與分期'}>
        {board.events.length ? <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border px-3 py-2 text-xs">
          {board.events.map(event => <p key={event.factKey}><span className="font-semibold">{event.label}</span> <span className="tabular-nums">{event.date}</span><span className="ml-2 text-muted-foreground">{isEnglish ? `${event.ageDays} days ago` : `${event.ageDays} 天前`}</span></p>)}
        </div> : null}
        {board.headline ? moduleRow(board.headline) : <p className="px-3 py-3 text-sm">{isEnglish ? 'No coronary disease assessment was returned.' : '尚未取得冠心病評估。'}</p>}
        {next ? <div className="flex flex-wrap items-center gap-2 border-t border-border bg-primary/[0.04] px-3 py-2">
          <p className="min-w-0 flex-1 text-xs leading-relaxed"><span className="font-semibold">{isEnglish ? 'Next' : '接下來'}：</span>{next.title}</p>
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => focusModule(next.id)}>{isEnglish ? 'Go to decision' : '前往處置'}</Button>
        </div> : null}
      </Section>

      <Section id="cdss-ccd-record" eyebrow={isEnglish ? 'Read from the record' : '系統已從病歷讀到'} title={isEnglish ? 'Clinical inputs for the decisions' : '決策所需臨床資訊'}
        action={onSaveClinicVitals ? <Button size="sm" variant="ghost" className="min-h-11" aria-expanded={vitalsOpen} onClick={() => setVitalsOpen(!vitalsOpen)}><PencilLine className="mr-1 h-3.5 w-3.5" />{isEnglish ? 'Clinic measurements' : '補填／修改門診量測'}</Button> : undefined}>
        <div className="grid grid-cols-2 @min-[32rem]:grid-cols-4 @min-[60rem]:grid-cols-7">
          {board.metrics.map(metric => <div key={metric.factKey} className="min-w-0 border-b border-r border-border/60 px-2.5 py-2.5" style={metric.value === undefined ? { backgroundImage: 'var(--clinical-missing-data-pattern)' } : undefined}
            data-testid={`cdss-ccd-metric-${metric.factKey}`} data-missing={metric.value === undefined || undefined} data-stale={metric.stale || undefined} data-entered={metric.entered || undefined}>
            <p className="text-xs text-muted-foreground">{metric.label} <span>{metric.unit}</span></p>
            <p className={cn('mt-1 break-words text-base font-semibold tabular-nums', metric.stale && 'text-amber-800 dark:text-amber-200')}>{metric.value ?? (isEnglish ? 'No value' : '紀錄無值')}</p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">{metric.date?.slice(0, 10) ?? (metric.value === undefined ? (metric.kind === 'measure' ? (isEnglish ? 'Measure in clinic' : '診間量測') : (isEnglish ? 'Obtain a report' : '補齊檢驗／檢查')) : (isEnglish ? 'Date unavailable' : '日期未提供'))}
              {metric.entered ? (isEnglish ? ' · entered' : ' · 門診輸入') : metric.ageDays !== undefined ? (isEnglish ? ` · ${metric.ageDays}d` : ` · ${metric.ageDays} 天`) : ''}</p>
            {metric.stale ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{isEnglish ? 'Past window · repeat advised' : '已超過時效窗 · 建議複驗'}</p> : null}
            {metric.value !== undefined && !metric.evaluated ? <p className="text-xs text-muted-foreground">{isEnglish ? 'Not assessed this visit' : '本次未判定'}</p> : null}
          </div>)}
        </div>
        {vitalsOpen && onSaveClinicVitals ? <ClinicVitalsForm isEnglish={isEnglish} now={now} initial={clinicVitals} onSave={onSaveClinicVitals} onClear={onClearClinicVitals} onClose={() => setVitalsOpen(false)} /> : null}
      </Section>

      {calculator && board.groups.length ? <Section id="cdss-ccd-calculator" eyebrow={isEnglish ? 'Result from Medical Calculator' : '引用醫療計算機結果'} title={isEnglish ? 'ASCVD very-high-risk classification' : 'ASCVD 極高風險分類'}>{calculator}</Section> : null}

      {board.alerts.length ? <Section id="cdss-ccd-safety" eyebrow={isEnglish ? 'Review first' : '優先處理'} title={isEnglish ? 'Medication safety alerts' : '用藥安全警訊'}>{board.alerts.map(item => moduleRow(item))}</Section> : null}

      {board.groups.length ? <Section id="cdss-ccd-therapy" eyebrow={isEnglish ? 'Regimen and next steps' : '目前處方與下一步'} title={isEnglish ? 'Antithrombotic and lipid therapy' : '抗栓與降脂治療'}>{board.groups.map(group => moduleRow(group.recommendation, group))}</Section> : null}

      {board.remaining.length ? <Section id="cdss-ccd-actions" eyebrow={isEnglish ? 'Recommendations and your decisions' : '建議與你的決定'} title={isEnglish ? "Today's other actions" : '其餘今日處置'}
        action={<span className="text-xs tabular-nums text-muted-foreground">{isEnglish ? 'Decided' : '已決定'} {decided.length} / {decidable.length}</span>}>
        {active.map(item => moduleRow(item))}
        {done.length ? <>
          <button type="button" className="flex min-h-11 w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" aria-expanded={showDone} onClick={() => setDoneOpen(!showDone)}>
            <Check className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" /><span className="shrink-0 font-medium">{isEnglish ? 'No action needed' : '目前無需處理'} · {done.length}</span>
            {!showDone ? <span className="min-w-0 text-muted-foreground">{done.map(item => item.moduleName ?? item.title).join(' · ')}</span> : null}<ChevronDown className={cn('ml-auto h-4 w-4 shrink-0', showDone && 'rotate-180')} />
          </button>
          {showDone ? done.map(item => moduleRow(item)) : null}
        </> : null}
      </Section> : null}

      <Section id="cdss-ccd-follow-up" eyebrow={isEnglish ? 'Visit record' : '本次處置紀錄'} title={isEnglish ? 'Record and follow-up' : '紀錄與追蹤'}
        action={<Button size="sm" variant="outline" className="min-h-11" onClick={async () => {
          if (!await copy(summary)) toast.error(isEnglish ? 'Could not copy. Please allow clipboard access and try again.' : '複製失敗，請允許剪貼簿存取後重試。')
        }}><Copy className="mr-1.5 h-3.5 w-3.5" />{copied ? (isEnglish ? 'Copied' : '已複製') : (isEnglish ? 'Copy visit summary' : '複製本次摘要')}</Button>}>
        <p className="flex items-center gap-2 px-3 py-2 text-xs leading-relaxed text-muted-foreground"><ClipboardList className="h-4 w-4 shrink-0" />{isEnglish ? 'Decisions record what you chose today; they do not place orders or change the guideline assessment.' : '記錄本次決定；不會開立醫囑，也不會改寫指引判斷。'}</p>
        {decided.length ? <ul className="space-y-1 border-t border-border px-3 py-2 text-xs">{decided.map(item => <li key={item.id}>{item.moduleName} · {decisionLabel(decisions[item.id].decision, isEnglish)}{decisions[item.id].note ? ` · ${decisions[item.id].note}` : ''}</li>)}</ul> : null}
      </Section>
    </div>
  )
}
