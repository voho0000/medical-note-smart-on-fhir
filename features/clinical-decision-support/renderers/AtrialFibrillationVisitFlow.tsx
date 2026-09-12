'use client'
import { type ReactNode, useState } from 'react'
import { AF_CLINICAL_QUESTIONS } from '@voho0000/personalized-care'
import { ChevronDown, Copy, PencilLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import type { CdssRecommendation, CdssResult } from '../types'
import type { AfAnswers } from '../stores/af-answers.store'
import type { ClinicVitals, ClinicVitalsPatch } from '../stores/clinic-vitals.store'
import type {
  PhysicianDecisionInput,
  PhysicianDecisionKind,
  PhysicianDecisionMap,
} from '../stores/physician-decisions.store'
import { ClinicVitalsForm } from './ClinicVitalsForm'
import { afSummary, type DiseaseBoardModel } from './disease-board'
import { statusLabel, statusStyle, StatusIcon } from './status-presentation'

interface Props {
  board: DiseaseBoardModel
  result: CdssResult
  isEnglish: boolean
  now: Date
  expandedId: string | null
  onToggle: (id: string) => void
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  answers?: AfAnswers
  onAnswer?: (id: string, value: boolean | undefined) => void
  clinicVitals?: ClinicVitals
  onSaveClinicVitals?: (patch: ClinicVitalsPatch) => void
  onClearClinicVitals?: () => void
  decisions?: PhysicianDecisionMap
  onRecordDecision?: (id: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (id: string) => void
}
const QUESTION_GROUPS = [
  { id: 'diagnosis', zh: '確認 AF', en: 'Confirm AF' },
  { id: 'stroke', zh: '血栓風險病史', en: 'Stroke risk history' },
  { id: 'safety', zh: '瓣膜與當下安全', en: 'Valves and immediate safety' },
  { id: 'rate', zh: '心率與節律', en: 'Rate and rhythm' },
  { id: 'antithrombotic', zh: '抗栓適應症', en: 'Antithrombotic indications' },
  { id: 'comorbidity', zh: '共病與生活型態', en: 'Comorbidities and lifestyle' },
]
const DECISIONS: { id: PhysicianDecisionKind; zh: string; en: string }[] = [
  { id: 'reviewed', zh: '已評估', en: 'Reviewed' },
  { id: 'prescribed', zh: '已開立', en: 'Prescribed' },
  { id: 'dose-adjusted', zh: '已調整劑量', en: 'Dose adjusted' },
  { id: 'ordered', zh: '已安排檢查', en: 'Test ordered' },
  { id: 'contraindicated', zh: '有禁忌', en: 'Contraindicated' },
  { id: 'deferred', zh: '暫緩', en: 'Deferred' },
  { id: 'patient-preference', zh: '依病人意願', en: 'Patient preference' },
]
function Section({
  id,
  title,
  children,
  aside,
}: {
  id: string
  title: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <section
      id={`af-${id}`}
      aria-label={title}
      className="overflow-hidden rounded-lg border border-border bg-card"
      data-testid={`cdss-af-${id}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  )
}
export function AtrialFibrillationVisitFlow({
  board,
  result,
  isEnglish: en,
  now,
  expandedId,
  onToggle,
  renderDetail,
  answers = {},
  onAnswer,
  clinicVitals,
  onSaveClinicVitals,
  onClearClinicVitals,
  decisions = {},
  onRecordDecision,
  onClearDecision,
}: Props) {
  const [vitalsOpen, setVitalsOpen] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const { copied, copy } = useCopyToClipboard()
  const pending = board.items.filter((r) => r.status !== 'no-action' && !decisions[r.id])
  const next =
    board.alerts[0] ??
    board.groups.flatMap((g) => g.items).find((r) => r.status !== 'no-action' && !decisions[r.id])
  const sectionTitles = en
    ? ['Visit progress', 'From the record', 'Assessment today', 'Today’s decisions', 'Record and follow-up']
    : ['看診進度', '系統已從病歷讀到', '本次評估', '今日處置', '紀錄與追蹤']
  const stages = en
    ? ['Confirm AF', 'Complete inputs', 'Review treatment', 'Record decisions']
    : ['確認 AF', '補齊本次評估', '檢視治療', '紀錄與追蹤']
  const summary = afSummary(result, decisions, en ? 'en' : 'zh-TW')
  const jump = (id: string) => {
    const element = document.getElementById(id)
    element?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
    const target = element?.querySelector<HTMLElement>('button,h3')
    if (target) {
      target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    }
  }
  const evidenceFor = (id: string) =>
    result.recommendations
      .flatMap((r) => r.evidenceTables ?? [])
      .flatMap((t) => t.items)
      .find((row) => row.id === `af-stroke:${id}` || row.id === `af-clinic:${id}`)

  function renderRow(r: CdssRecommendation) {
    return (
      <div
        key={r.id}
        id={`af-action-${r.id}`}
        className="border-t border-border first:border-t-0"
        data-testid={`cdss-af-action-${r.id}`}
      >
        <button
          type="button"
          className="flex min-h-11 w-full items-start gap-2 px-3 py-3 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => onToggle(r.id)}
          aria-expanded={expandedId === r.id}
        >
          <StatusIcon status={r.status} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <Badge className={statusStyle[r.status]}>{statusLabel(r.status, en)}</Badge>
              <span className="text-xs text-muted-foreground">{r.moduleName}</span>
            </span>
            <span data-testid={`cdss-module-cell-${r.id}`} className="mt-1 block text-sm font-semibold">
              {r.title}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {r.recommendation}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'mt-1 h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none',
              expandedId === r.id && 'rotate-180',
            )}
          />
        </button>
        {onRecordDecision ? (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
            <label className="text-xs text-muted-foreground" htmlFor={`af-decision-${r.id}`}>
              {en ? 'Your decision' : '你的決定'}
            </label>
            <select
              id={`af-decision-${r.id}`}
              aria-label={`${r.moduleName}：${en ? 'decision' : '處置'}`}
              className="min-h-11 max-w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={decisions[r.id]?.decision ?? ''}
              onChange={(e) =>
                e.target.value
                  ? onRecordDecision(r.id, {
                      decision: e.target.value as PhysicianDecisionKind,
                      reasons: [],
                      packVersion: result.packVersion,
                    })
                  : onClearDecision?.(r.id)
              }
            >
              <option value="">{en ? 'Not recorded' : '尚未記錄'}</option>
              {DECISIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {en ? d.en : d.zh}
                </option>
              ))}
            </select>
            {decisions[r.id] ? (
              <span className="text-xs text-muted-foreground">
                {new Date(decisions[r.id].recordedAt).toLocaleDateString(en ? 'en-CA' : 'zh-TW')}
              </span>
            ) : null}
          </div>
        ) : null}
        {expandedId === r.id ? (
          <div className="border-t border-border bg-muted/10 px-3 py-2">{renderDetail(r)}</div>
        ) : null}
      </div>
    )
  }
  return (
    <div className="space-y-3" data-testid="cdss-af-visit-flow">
      <Section id="progress" title={sectionTitles[0]}>
        <ol className="grid grid-cols-2 divide-x divide-y divide-border @min-[40rem]:grid-cols-4">
          {stages.map((stage, i) => (
            <li key={stage}>
              <button
                className="min-h-11 w-full px-3 py-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() =>
                  jump(
                    i === 0
                      ? 'af-assessment'
                      : i === 1
                        ? 'af-inputs'
                        : i === 2
                          ? 'af-actions'
                          : 'af-follow-up',
                  )
                }
              >
                <span className="mr-2 text-primary">{i + 1}</span>
                <span className="font-semibold">{stage}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-primary/5 px-3 py-2">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{en ? 'Next: ' : '接下來：'}</span>
            {next?.title ?? (en ? 'Review and copy the visit summary' : '檢視並複製本次摘要')}
          </p>
          <Button
            className="min-h-11"
            size="sm"
            onClick={() => {
              if (next) {
                onToggle(next.id)
                jump(`af-action-${next.id}`)
              } else jump('af-follow-up')
            }}
          >
            {en ? 'Go to' : '前往'}
          </Button>
        </div>
      </Section>
      <Section
        id="inputs"
        title={sectionTitles[1]}
        aside={
          onSaveClinicVitals ? (
            <Button
              className="min-h-11"
              variant="ghost"
              size="sm"
              onClick={() => {
                setVitalsOpen(!vitalsOpen)
              }}
            >
              <PencilLine className="mr-1 h-4 w-4" />
              {en ? 'Clinic measurements' : '門診量測'}
            </Button>
          ) : null
        }
      >
        <dl className="grid grid-cols-2 @min-[40rem]:grid-cols-4">
          {board.metrics.map((m) => (
            <div
              key={m.key}
              className="min-w-0 border-b border-r border-border px-3 py-2"
              style={!m.value ? { backgroundImage: 'var(--clinical-missing-data-pattern)' } : undefined}
              data-testid={`cdss-af-metric-${m.key}`}
            >
              <dt className="text-xs text-muted-foreground">{m.label}</dt>
              <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
                {m.value ?? (en ? 'Not in record' : '紀錄無值')}
              </dd>
              {m.date ? (
                <dd
                  className={cn(
                    'mt-1 text-xs tabular-nums',
                    m.stale ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                  )}
                >
                  {m.date}
                  {m.stale ? (en ? ' · repeat advised' : ' · 建議複驗') : ''}
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
        {vitalsOpen && onSaveClinicVitals ? (
          <div className="p-3">
            <ClinicVitalsForm
              isEnglish={en}
              now={now}
              initial={clinicVitals}
              onSave={onSaveClinicVitals}
              onClear={onClearClinicVitals}
              onClose={() => setVitalsOpen(false)}
            />
          </div>
        ) : null}
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {en
            ? 'Missing inputs remain unknown. Old results retain their date and stay in the assessment.'
            : '缺少資料保留未知；過期資料標示日期並仍納入判斷。'}
        </p>
      </Section>
      <Section id="assessment" title={sectionTitles[2]}>
        {board.headline ? (
          <div className="border-b border-border bg-primary/5 px-3 py-3">
            <p className="text-sm font-semibold tabular-nums">{board.headline.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {en
                ? 'From the medical calculator · missing history stays unknown'
                : '引用醫療計算機結果 · 未填病史保留未知'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {board.headline.recommendation}
            </p>
          </div>
        ) : null}
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {en
            ? 'Answers recompute the rules. They remain in memory for this patient and clear when the patient changes.'
            : '回答後會重算下方建議。答案暫存於本次病人畫面，切換病人即清除。'}
        </p>
        {QUESTION_GROUPS.map((group, index) => (
          <details key={group.id} open={index < 3} className="border-t border-border">
            <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {en ? group.en : group.zh}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {
                  AF_CLINICAL_QUESTIONS.filter((q) => q.group === group.id && answers[q.id] === undefined)
                    .length
                }{' '}
                {en ? 'to confirm' : '項待確認'}
              </span>
            </summary>
            <div className="divide-y divide-border">
              {AF_CLINICAL_QUESTIONS.filter((q) => q.group === group.id).map((q) => (
                <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 text-sm">
                    {en ? q.en : q.zh}
                    {answers[q.id] === undefined && evidenceFor(q.id)?.direction === 'supports' ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {en ? 'Record evidence: ' : '病歷已記錄：'}
                        {evidenceFor(q.id)?.value}
                      </span>
                    ) : null}
                  </span>
                  <div
                    role="group"
                    aria-label={en ? q.en : q.zh}
                    className="flex overflow-hidden rounded-md border border-border"
                  >
                    {[
                      { label: en ? 'Yes' : '有', value: true },
                      { label: en ? 'No' : '無', value: false },
                      { label: en ? 'Not assessed' : '未評估', value: undefined },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        disabled={!onAnswer}
                        aria-pressed={answers[q.id] === option.value}
                        onClick={() => onAnswer?.(q.id, option.value)}
                        className={cn(
                          'min-h-11 min-w-11 border-r border-border px-3 text-xs last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50',
                          answers[q.id] === option.value
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'hover:bg-muted/30',
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </Section>
      <Section
        id="actions"
        title={sectionTitles[3]}
        aside={
          <span className="text-xs text-muted-foreground">
            {en ? 'Unrecorded' : '待記錄'} {pending.length}
          </span>
        }
      >
        {board.alerts.length ? (
          <div role="region" aria-label={en ? 'Safety alerts' : '優先安全警訊'}>
            <h4 className="bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              {en ? 'Safety first' : '優先安全警訊'}
            </h4>
            {board.alerts.map(renderRow)}
          </div>
        ) : null}
        {board.groups.map((g) => (
          <details
            key={g.status}
            open={g.status !== 'no-action' || (board.groups.length === 1 && board.alerts.length === 0)}
            className="border-t border-border"
          >
            <summary className="min-h-11 cursor-pointer bg-muted/20 px-3 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {statusLabel(g.status, en)} · {g.items.length}
              {g.status === 'no-action' ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {g.items.map((r) => r.moduleName).join(' · ')}
                </span>
              ) : null}
            </summary>
            {g.items.map(renderRow)}
          </details>
        ))}
      </Section>
      <Section
        id="follow-up"
        title={sectionTitles[4]}
        aside={
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={async () => {
              const ok = await copy(summary)
              setCopyError(!ok)
            }}
          >
            <Copy className="mr-1 h-4 w-4" />
            {copied ? (en ? 'Copied' : '已複製') : en ? 'Copy visit summary' : '複製本次摘要'}
          </Button>
        }
      >
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {en
            ? 'Recording a decision does not prescribe or close a finding; future assessments continue to use the medical record.'
            : '處置紀錄不等於開立處方，也不會消除規則提示；下次仍依病歷重新判斷。'}
        </p>
        {copyError ? (
          <p role="alert" className="px-3 pb-2 text-sm text-destructive">
            {en
              ? 'Copy failed. Select the summary below to copy manually.'
              : '複製失敗，請展開摘要後手動複製。'}
          </p>
        ) : null}
        <details className="border-t border-border">
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium">
            {en ? 'Full visit summary' : '完整本次摘要'}
          </summary>
          <pre className="whitespace-pre-wrap break-words px-3 pb-3 font-sans text-xs leading-relaxed">
            {summary}
          </pre>
        </details>
      </Section>
    </div>
  )
}
