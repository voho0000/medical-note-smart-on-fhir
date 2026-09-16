"use client"

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssCoverageCheck, CdssCoverageSummary } from '../types'

/**
 * 表一 as the published table draws it, with this patient's position on it.
 *
 * The screen a clinician already knows: five tier columns, each listing the
 * criteria that put a patient in it, and the two thresholds underneath. What
 * this adds is which criteria the record can speak to — lit — and which it
 * cannot, which stay open circles. An open circle is 「查不到」, never 「沒有」,
 * and that distinction is the whole reason the panel exists: a tier read one
 * row too low denies a covered statin, one row too high claims coverage the
 * record cannot support.
 *
 * Every string here comes from the pack, including each clause's bracket. The
 * only thing this file decides is where a criterion sits on screen.
 */

/** The 表一 columns, left to right, as the published table orders them. */
const COLUMNS = ['low', 'moderate', 'high', 'very-high', 'extreme'] as const

/** A single-hue ramp: order without implying clinical alarm. */
const TINT: Record<string, string> = {
  low: 'bg-primary/5',
  moderate: 'bg-primary/10',
  high: 'bg-primary/20',
  'very-high': 'bg-primary/30',
  extreme: 'bg-primary/45',
}

const MARK: Record<CdssCoverageCheck['state'], { glyph: string; lit: boolean }> = {
  yes: { glyph: '●', lit: true },
  no: { glyph: '–', lit: false },
  unknown: { glyph: '○', lit: false },
}

/** 表一 prints a number; the pack formats it. Read it back for the bar height. */
function threshold(initiation: string): number {
  const digits = initiation.replace(/[^0-9]/g, '')
  return digits ? Number(digits) : 0
}

const ANSWER_LABEL: Record<CdssCoverageCheck['state'], [zh: string, en: string]> = {
  yes: ['符合', 'Met'],
  no: ['不符合', 'Not met'],
  unknown: ['未確認', 'Unconfirmed'],
}

/**
 * One 表一 criterion: a mark, the clause's label, and what the record says.
 *
 * The clause's bracket and the clinician's answer live behind one press rather
 * than on the row. Twenty-six criteria each carrying three answer buttons is a
 * screen that asks everything and is read by nobody; the tier only moves on a
 * few of them, and those are the ones a clinician opens.
 */
function Criterion({
  check,
  isEnglish,
  onAnswer,
}: {
  check: CdssCoverageCheck
  isEnglish: boolean
  onAnswer?: (id: string, state: CdssCoverageCheck['state'] | undefined) => void
}) {
  const mark = MARK[check.state]
  const fromCode = check.state === 'yes' && check.origin === 'record'
  const glyph = check.origin === 'physician' ? '✓' : fromCode && check.evidenceKind !== 'measurement' ? '◐' : mark.glyph
  const states: readonly CdssCoverageCheck['state'][] = ['yes', 'no', 'unknown']
  const interactive = Boolean(onAnswer && check.editable) || Boolean(check.detail)

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn('w-3 shrink-0 font-semibold', mark.lit ? 'text-primary' : 'text-muted-foreground/70')}
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5 text-left">
        <span
          className={cn(
            'block',
            mark.lit ? 'font-medium text-foreground' : 'text-muted-foreground',
            check.detail && 'underline decoration-dotted decoration-muted-foreground/50 underline-offset-4',
          )}
        >
          {check.label}
        </span>
        <span className={cn('block text-xs tabular-nums', mark.lit ? 'text-primary' : 'text-muted-foreground')}>
          {check.value}
          {check.origin === 'physician'
            ? ` · ${isEnglish ? 'physician verified' : '醫師核對'}`
            : ''}
        </span>
      </span>
    </>
  )

  if (!interactive) {
    return <div className="flex gap-2 py-1.5 text-[13px] leading-relaxed">{body}</div>
  }

  return (
    <Popover>
      <PopoverTrigger
        className="flex w-full gap-2 rounded-sm py-1.5 text-[13px] leading-relaxed hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={check.label}
      >
        {body}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 text-xs leading-relaxed">
        <div className="space-y-1">
          <p className="text-sm font-medium">{check.label}</p>
          {check.detail ? <p className="text-muted-foreground">{check.detail}</p> : null}
          <p className="tabular-nums text-muted-foreground">{check.value}</p>
        </div>
        {onAnswer && check.editable ? (
          <div className="space-y-2 border-t border-border pt-2">
            <p className="text-muted-foreground">
              {isEnglish
                ? 'Answering recalculates the tier and is kept for this visit only.'
                : '回答後重新計算分級；僅保留於本次看診。'}
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={check.label}>
              {states.map((state) => (
                <button
                  key={state}
                  type="button"
                  aria-pressed={check.state === state}
                  onClick={() => onAnswer(check.id, state)}
                  className={cn(
                    'min-h-11 flex-1 rounded-md border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    check.state === state
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border hover:bg-muted/40',
                  )}
                >
                  {isEnglish ? ANSWER_LABEL[state][1] : ANSWER_LABEL[state][0]}
                </button>
              ))}
            </div>
            {check.origin === 'physician' ? (
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => onAnswer(check.id, undefined)}
              >
                {isEnglish ? 'Restore the record reading' : '恢復資料判讀'}
              </button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function NhiTable1Panel({
  summary,
  locale,
  onAnswer,
}: {
  summary: CdssCoverageSummary
  locale: string
  onAnswer?: (id: string, state: CdssCoverageCheck['state'] | undefined) => void
}) {
  const isEnglish = locale === 'en'
  const tiers = COLUMNS.map((id) => summary.tiers.find((tier) => tier.id === id)).filter(
    (tier): tier is CdssCoverageSummary['tiers'][number] => Boolean(tier),
  )
  if (tiers.length === 0) return null

  const tallest = Math.max(...tiers.map((tier) => threshold(tier.initiation)), 1)
  const forTier = (id: string) => summary.diseaseChecks.filter((check) => check.tier === id)
  const groupsOf = (id: string) => {
    const checks = forTier(id)
    const order: string[] = []
    for (const check of checks) {
      const key = check.group ?? ''
      if (!order.includes(key)) order.push(key)
    }
    return order.map((key) => ({ key, checks: checks.filter((check) => (check.group ?? '') === key) }))
  }

  return (
    <section className="space-y-3 px-3 pb-4" aria-label={summary.title} data-testid="nhi-table1-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold">{summary.conclusion}</p>
        <a
          className="text-xs text-primary underline underline-offset-2"
          href={summary.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {summary.source}
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <span className="font-medium text-muted-foreground">{isEnglish ? 'Key' : '符號'}</span>
        <span><span className="font-semibold text-primary">●</span> {isEnglish ? 'Established' : '資料可證'}</span>
        <span><span className="font-semibold text-primary">◐</span> {isEnglish ? 'Claims code; confirm clinically' : '申報碼支持，須臨床確認'}</span>
        <span className="text-muted-foreground"><span className="font-semibold">○</span> {isEnglish ? 'Not in the record — unknown, not absent' : '紀錄讀不到 — 未知，不等於沒有'}</span>
        <span className="text-muted-foreground"><span className="font-semibold">–</span> {isEnglish ? 'Measured and not met' : '有數值且不符合'}</span>
      </div>

      {summary.therapy ? (
        <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-muted-foreground">{summary.therapy.label}</span>
            <span className="font-medium tabular-nums">{summary.therapy.value}</span>
            {summary.therapy.duration ? (
              <span className="tabular-nums text-primary">{summary.therapy.duration}</span>
            ) : null}
          </div>
          {summary.therapy.timeline && summary.therapy.timeline.length > 0 ? (
            <ol className="flex flex-wrap items-stretch gap-1.5">
              {summary.therapy.timeline.map((span) => (
                <li
                  key={`${span.from}-${span.label}`}
                  className={cn(
                    'flex min-w-0 flex-col gap-0.5 rounded border px-2.5 py-1.5',
                    span.changed ? 'border-primary bg-primary/10' : 'border-border bg-muted/30',
                  )}
                >
                  <span className={cn('text-xs font-medium', span.changed && 'text-primary')}>
                    {span.changed ? '↗ ' : ''}{span.label}
                    {span.dose ? <span className="ml-1.5 font-normal tabular-nums">{span.dose}</span> : null}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {span.from}
                    {span.to !== span.from ? ` – ${span.to}` : ''}
                    {' · '}
                    {span.count} {isEnglish ? 'prescriptions' : '筆處方'}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          {summary.therapy.timeline && summary.therapy.timeline.length > 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {isEnglish
                ? 'Prescribing events from the claims record, folded where nothing changed. A span ends at its last prescription, not at a stop, and a daily dose appears only where the prescription stated one.'
                : '為申報紀錄的處方事件，品項未變者併為一段。一段的結束是最後一筆處方，不代表停藥；每日劑量只在處方本身寫明時顯示。'}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div className="grid min-w-[62rem] grid-cols-5 gap-2">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                'rounded-t-md px-3 py-2 text-center text-base font-semibold',
                TINT[tier.id],
                tier.selected && 'ring-2 ring-inset ring-primary',
              )}
            >
              {tier.label}
              {tier.selected ? (
                <span className="ml-2 rounded border border-primary bg-background px-1.5 py-0.5 align-middle text-[11px] font-medium text-primary">
                  {tier.status}
                </span>
              ) : null}
            </div>
          ))}

          <div className="col-span-2 space-y-2 rounded-b-md border border-t-0 border-border bg-card p-3">
            <p className="text-center text-xs font-medium leading-relaxed">
              {isEnglish
                ? 'One risk factor is low risk; two or more is moderate risk.'
                : '若帶有一項風險因子，為低風險；若帶有兩項以上，則為中風險'}
            </p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {summary.factors.map((check) => (
                <Criterion key={check.id} check={check} isEnglish={isEnglish} onAnswer={onAnswer} />
              ))}
            </div>
            <details className="border-t border-border pt-1">
              <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium text-primary">
                {isEnglish ? 'Metabolic syndrome components' : '代謝性症候群五項細節'}
              </summary>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {summary.metabolicChecks.map((check) => (
                  <Criterion key={check.id} check={check} isEnglish={isEnglish} onAnswer={onAnswer} />
                ))}
              </div>
            </details>
          </div>

          {(['high', 'very-high', 'extreme'] as const).map((id) => (
            <div key={id} className="space-y-1 rounded-b-md border border-t-0 border-border bg-card p-3">
              {groupsOf(id).map((group) => (
                <div key={group.key} className="space-y-0.5">
                  {group.key ? (
                    <p className="pt-1 text-xs font-semibold leading-snug">{group.key}</p>
                  ) : null}
                  {group.checks.map((check) => (
                    <Criterion key={check.id} check={check} isEnglish={isEnglish} onAnswer={onAnswer} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[62rem] space-y-2">
          <div className="grid grid-cols-[7rem_repeat(5,minmax(0,1fr))] items-end gap-2">
            <p className="pb-1 text-right text-xs font-medium leading-snug">
              {isEnglish ? 'LDL-C treatment goal' : '治療目標值'}
              <span className="block font-normal text-muted-foreground">mg/dL</span>
            </p>
            {tiers.map((tier) => (
              <div key={tier.id} className="flex flex-col items-center gap-1">
                <span className={cn('text-xl font-bold tabular-nums', tier.selected && 'text-primary')}>
                  {tier.target.split(' / ')[0]}
                </span>
                <div
                  className={cn('w-full rounded-t border border-border', TINT[tier.id], tier.selected && 'ring-2 ring-inset ring-primary')}
                  style={{ height: `${Math.round((threshold(tier.initiation) / tallest) * 108)}px` }}
                />
                <span className={cn('text-[11px] tabular-nums', tier.selected ? 'font-medium text-primary' : 'text-muted-foreground')}>
                  {tier.targetMet === undefined
                    ? isEnglish ? 'No LDL-C on record' : '紀錄無 LDL-C'
                    : tier.targetMet
                      ? isEnglish ? 'At goal' : '已達標'
                      : isEnglish ? 'Above goal' : '未達標'}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[7rem_repeat(5,minmax(0,1fr))] items-stretch gap-2">
            <p className="pt-2 text-right text-xs font-medium leading-snug">
              {isEnglish ? 'Drug initiation level' : '起始藥物治療血脂值'}
            </p>
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md border px-2 py-2',
                  tier.selected ? 'border-primary bg-primary/10' : 'border-border bg-muted/30',
                )}
              >
                <span className={cn('text-base font-semibold tabular-nums', tier.selected && 'text-primary')}>
                  {tier.initiation}
                </span>
                <span className={cn('text-[11px] tabular-nums', tier.selected ? 'font-medium text-primary' : 'text-muted-foreground')}>
                  {tier.initiationReached === undefined
                    ? '—'
                    : tier.initiationReached
                      ? isEnglish ? 'Reached' : '已達起始值'
                      : isEnglish ? 'Not reached' : '未達起始值'}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[7rem_repeat(5,minmax(0,1fr))] items-stretch gap-2">
            <p className="pt-2 text-right text-xs font-medium leading-snug">
              {isEnglish ? 'Prescribing rule' : '處方規定'}
              <span className="block font-normal text-primary">
                {isEnglish ? 'Lit = allowed at this tier' : '亮 = 表一此級允許'}
              </span>
              <span className="block font-normal text-muted-foreground">
                {isEnglish ? 'not a coverage approval' : '非給付核准'}
              </span>
            </p>
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className={cn(
                  'space-y-1 rounded-md border p-2',
                  tier.selected ? 'border-primary bg-card' : 'border-border bg-muted/30',
                )}
              >
                {(tier.prescribing ?? []).map((step) => (
                  <Popover key={step.text}>
                    <PopoverTrigger
                      className={cn(
                        'flex w-full gap-1.5 rounded px-2 py-1 text-left text-xs leading-snug hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        step.state === 'yes'
                          ? 'bg-primary/10 font-medium text-foreground'
                          : step.state === 'no'
                            ? 'text-muted-foreground/70 line-through decoration-muted-foreground/40'
                            : 'text-muted-foreground',
                      )}
                    >
                      <span aria-hidden="true" className={cn('shrink-0 font-semibold', step.state === 'yes' ? 'text-primary' : 'text-muted-foreground/70')}>
                        {MARK[step.state].glyph}
                      </span>
                      <span className="min-w-0">{step.text}</span>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 space-y-1 text-xs leading-relaxed">
                      <p className="text-sm font-medium">{step.text}</p>
                      <p className="text-primary">
                        {step.state === 'yes'
                          ? isEnglish ? 'Supported by the record' : '紀錄支持走到這一階'
                          : step.state === 'no'
                            ? isEnglish ? 'Not reached' : '尚未走到這一階'
                            : isEnglish ? 'The record cannot say' : '紀錄無法判讀'}
                      </p>
                      {step.evidence ? <p className="text-muted-foreground">{step.evidence}</p> : null}
                    </PopoverContent>
                  </Popover>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1 border-t border-border pt-3">
        <p className="text-xs font-medium">{isEnglish ? 'Pending verification' : '待核對與可能升級條件'}</p>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
          {summary.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
