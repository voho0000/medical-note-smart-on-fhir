"use client"

import { type ReactNode, useState } from 'react'
import { ChevronDown, TriangleAlert, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssDecisionOption, CdssRecommendation, PhysicianDecision } from '../types'
import {
  type ClinicMetricKey,
  type ClinicSymptomInputs,
  type ClinicValueInputs,
  type ClinicVitals,
  type HeartFailureSymptomId,
  isClinicMetricKey,
  todayIsoDate,
} from '../stores/clinic-vitals.store'
import { ClinicValuesDialog } from './ClinicValuesDialog'
import {
  formatMetricDate,
  type HeartFailureBoardModel,
  type HeartFailureMetric,
  type HeartFailurePillar,
  stripDecisionSuffix,
} from './heart-failure-board'
import { statusLabel, statusStyle, StatusIcon } from './status-presentation'

/**
 * The heart-failure page: three blocks and nothing else.
 *
 * 1. **這是誰、今天量什麼** — the phenotype word, every safety number on one
 *    wrapping line with one pencil at the end of it, and the symptom chips.
 *    Every number is corrected in one dialog rather than value by value,
 *    because a visit produces the weight, the pressure and the morning's
 *    laboratory together. Asking for a symptom in three places is how a page
 *    teaches people to stop answering it, so it is asked here, once.
 * 2. **決定** — one row per therapy: the drug, what the record says, the pack's
 *    own sentence, and the buttons for what a physician does about it.
 * 3. **其他** — every remaining module, one row each: name, status, the card's
 *    finding, its decisions, and a chevron to the full detail.
 *
 * Every sentence on the page is the pack's. This component composes no
 * clinical text: a gate line the pack did not state does not appear, and a
 * decision the card does not declare cannot be pressed.
 */
interface HeartFailureStatusBoardProps {
  board: HeartFailureBoardModel
  isEnglish: boolean
  now: Date
  expandedId: string | null
  onToggle: (id: string) => void
  /** The same decision detail the module list opens, so nothing is repeated here. */
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  /** What the clinician measured and saw in the room this visit, if anything. */
  clinicVitals?: ClinicVitals
  /**
   * 「修改今日數值」 — every value on the line and the rhythm, saved together.
   * They travel to the pack as facts, so every module that reads one
   * recomputes from it. Absent when this surface cannot take values at all
   * (no patient to attach them to).
   */
  onSaveClinicValues?: (values: ClinicValueInputs) => void
  /** The chip strip's save, made on every tap. Absent for the same reason. */
  onSaveClinicSymptoms?: (symptoms: ClinicSymptomInputs) => void
  /** 「撤銷」 — one value on the line, back to the record's own. */
  onClearMetric?: (factKey: ClinicMetricKey) => void
  /** Records what the physician decided about one module. */
  onRecordDecision?: (moduleId: string, decision: PhysicianDecision) => void
  onWithdrawDecision?: (moduleId: string) => void
}

/**
 * The symptoms and signs the strip asks about — ESC 2026 Table 7's list, plus
 * the two NYHA classes a clinician says out loud. The ids are the pack's own
 * evidence-row terms, so a tick lands on the rows the pack already reads.
 */
const SYMPTOM_CHIPS: readonly { id: HeartFailureSymptomId; zh: string; en: string }[] = [
  { id: 'dyspnea', zh: '呼吸困難', en: 'Dyspnoea' },
  { id: 'orthopnea', zh: '端坐呼吸', en: 'Orthopnoea' },
  { id: 'paroxysmal-nocturnal-dyspnea', zh: '夜間陣發性呼吸困難', en: 'PND' },
  { id: 'pitting-edema', zh: '下肢水腫', en: 'Pitting oedema' },
  { id: 'jvp', zh: '頸靜脈怒張', en: 'Raised JVP' },
  { id: 'rales', zh: '囉音', en: 'Rales' },
  { id: 'nyha-class-ii', zh: 'NYHA II', en: 'NYHA II' },
  { id: 'nyha-class-iii', zh: 'NYHA III', en: 'NYHA III' },
]

/** 「門診輸入」, with the day when it was not entered today. */
function enteredNote(metric: HeartFailureMetric, isEnglish: boolean, now: Date): string {
  const tag = isEnglish ? 'entered in clinic' : '門診輸入'
  const day = metric.enteredAt && metric.enteredAt !== todayIsoDate(now)
    ? formatMetricDate(metric.enteredAt, now)
    : undefined
  return day ? `${tag} ${day}` : tag
}

function ageNote(metric: HeartFailureMetric, isEnglish: boolean, now: Date): string | undefined {
  const date = formatMetricDate(metric.date, now)
  if (metric.entered) return enteredNote(metric, isEnglish, now)
  if (metric.stale) {
    return metric.ageDays === undefined
      ? (isEnglish ? 'past its window' : '已超過窗期')
      : (isEnglish ? `${metric.ageDays}d old` : `${metric.ageDays} 天前`)
  }
  return date
}

/** What the entered value replaced, for the hover. */
function recordNote(metric: HeartFailureMetric, isEnglish: boolean): string | undefined {
  if (!metric.entered) return metric.fullValue
  if (!metric.recordValue) return isEnglish ? 'Record: none' : '紀錄：無'
  return isEnglish ? `Record: ${metric.recordValue}` : `紀錄：${metric.recordValue}`
}

/**
 * One value on the status line: the number, then how old it is — and, where
 * the physician entered it, the 「撤銷」 that puts the record's own value back.
 *
 * Correcting a value is the pencil's dialog, where every number is corrected
 * together. Taking one back is a single click and stays on the line, because a
 * dialog opened to press one button is a dialog nobody opens.
 */
function StatusValue({
  label,
  metric,
  isEnglish,
  now,
  onClear,
}: {
  label: string
  metric: HeartFailureMetric
  isEnglish: boolean
  now: Date
  onClear?: (factKey: ClinicMetricKey) => void
}) {
  const missing = metric.value === undefined
  const note = missing ? undefined : ageNote(metric, isEnglish, now)
  const editable = metric.editable && isClinicMetricKey(metric.factKey)
  const factKey = metric.factKey as ClinicMetricKey

  return (
    <span
      className="inline-flex items-center whitespace-nowrap text-muted-foreground"
      data-testid={`cdss-hf-metric-${metric.factKey}`}
      data-missing={missing ? 'true' : undefined}
      data-stale={metric.stale ? 'true' : undefined}
      data-entered={metric.entered ? 'true' : undefined}
      data-editable={editable ? 'true' : undefined}
      title={recordNote(metric, isEnglish)}
    >
      {label}{' '}
      {missing ? (
        <span className="font-medium text-amber-700 dark:text-amber-300">
          {isEnglish ? 'none' : '無'}
        </span>
      ) : (
        <>
          <strong
            className={cn(
              'font-semibold tabular-nums',
              metric.entered ? 'text-primary' : 'text-foreground',
            )}
          >
            {metric.value}
          </strong>
          {note ? (
            <span
              className={cn(
                'ml-1 text-[11px] tabular-nums',
                metric.stale
                  ? 'font-medium text-amber-700 dark:text-amber-300'
                  : metric.entered
                    ? 'font-medium text-primary'
                    : 'text-muted-foreground/80',
              )}
            >
              {note}
            </span>
          ) : null}
        </>
      )}
      {metric.entered && editable && onClear ? (
        <button
          type="button"
          className="ml-0.5 inline-flex items-center gap-0.5 rounded px-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onClear(factKey)}
          data-testid={`cdss-hf-metric-undo-${metric.factKey}`}
        >
          <Undo2 className="h-3 w-3" aria-hidden="true" />
          {isEnglish ? 'Undo' : '撤銷'}
        </button>
      ) : null}
    </span>
  )
}

function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/**
 * Line 2 of block 1: what the physician saw in the room this visit, and what
 * the patient reports having had before.
 *
 * These chips are tapped every visit, so the tap is the save — a strip that
 * also wanted a button pressed would collect ticks nobody ever stored. It
 * writes only the chips: the numbers live behind the pencil on the line above,
 * and a tap here leaves every one of them exactly as it was.
 *
 * Unticked is never "absent": only a chip the physician actually pressed is
 * written, and 「過去曾有」 is kept apart from today's examination because ESC
 * 2026 §5.2.2 (i) accepts a prior symptom for the diagnosis while today's
 * volume status does not.
 */
function SymptomStrip({
  isEnglish,
  now,
  vitals,
  onSave,
}: {
  isEnglish: boolean
  now: Date
  vitals?: ClinicVitals
  onSave: (symptoms: ClinicSymptomInputs) => void
}) {
  // 「過去曾有」 is a mode the chips are pressed in, not a chip of its own: the
  // same eight names answer both questions, and two rows of them would ask the
  // reader to find the same name twice.
  const [priorMode, setPriorMode] = useState(false)
  const symptoms = vitals?.symptoms ?? []
  const priorSymptoms = vitals?.priorSymptoms ?? []
  const active = priorMode ? priorSymptoms : symptoms
  const other = priorMode ? symptoms : priorSymptoms

  const save = (next: readonly HeartFailureSymptomId[]) => {
    onSave({
      symptoms: priorMode ? symptoms : next,
      priorSymptoms: priorMode ? next : priorSymptoms,
      measuredOn: todayIsoDate(now),
    })
  }

  return (
    <div
      className="flex flex-wrap items-end gap-x-3 gap-y-2.5 border-t border-border px-3.5 py-2.5"
      data-testid="cdss-hf-symptoms"
    >
      <div className="flex w-full min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          {isEnglish ? 'Symptoms and signs' : '症狀／徵象'}
          <button
            type="button"
            aria-pressed={priorMode}
            className={cn(
              'inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              priorMode
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-dashed border-border text-muted-foreground hover:bg-muted/40',
            )}
            onClick={() => setPriorMode((value) => !value)}
            data-testid="cdss-hf-prior-mode"
          >
            {isEnglish ? 'Past history' : '過去曾有'}
          </button>
        </span>
        <div className="flex flex-wrap gap-1" role="group" aria-label={isEnglish ? 'Symptoms and signs' : '症狀／徵象'}>
          {SYMPTOM_CHIPS.map((chip) => {
            const selected = active.includes(chip.id)
            const inOther = other.includes(chip.id)
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={selected}
                title={inOther
                  ? (priorMode
                    ? (isEnglish ? 'Also entered for today' : '今天也已選取')
                    : (isEnglish ? 'Also entered as past history' : '也已選取為過去曾有'))
                  : undefined}
                className={cn(
                  'inline-flex h-8 items-center rounded-full border px-2.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? priorMode
                      ? 'border-dashed border-primary bg-primary/5 text-primary'
                      : 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:bg-muted/40',
                  !selected && inOther && 'border-primary/40 text-primary/70',
                )}
                onClick={() => save(toggled(active, chip.id))}
                data-testid={`cdss-hf-symptom-${chip.id}`}
                data-prior={priorMode ? 'true' : undefined}
              >
                {isEnglish ? chip.en : chip.zh}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** The buttons a card declares, and the quiet line a pressed one leaves behind. */
function DecisionControls({
  moduleId,
  options,
  decision,
  isEnglish,
  now,
  onRecord,
  onWithdraw,
}: {
  moduleId: string
  options: readonly CdssDecisionOption[]
  decision?: PhysicianDecision
  isEnglish: boolean
  now: Date
  onRecord?: (moduleId: string, decision: PhysicianDecision) => void
  onWithdraw?: (moduleId: string) => void
}) {
  if (!onRecord) return null
  if (decision) {
    const chosen = options.find((option) => option.id === decision.option)
    return (
      <span
        className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
        data-testid={`cdss-hf-decision-recorded-${moduleId}`}
      >
        <span className="font-medium text-foreground">
          {isEnglish ? 'Decided' : '醫師已決定'}：
          {chosen ? (isEnglish ? chosen.en : chosen.zh) : decision.option}
        </span>
        <span className="tabular-nums">
          · {formatMetricDate(decision.recordedAt, now) ?? decision.recordedAt}
        </span>
        {onWithdraw ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-1 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => { event.stopPropagation(); onWithdraw(moduleId) }}
            data-testid={`cdss-hf-decision-withdraw-${moduleId}`}
          >
            <Undo2 className="h-3 w-3" aria-hidden="true" />
            {isEnglish ? 'Undo' : '撤銷'}
          </button>
        ) : null}
      </span>
    )
  }
  return (
    <span className="flex flex-wrap gap-1.5" data-testid={`cdss-hf-decisions-${moduleId}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={cn(
            'inline-flex h-7 items-center rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground',
            'transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          onClick={(event) => {
            event.stopPropagation()
            onRecord(moduleId, { option: option.id, recordedAt: todayIsoDate(now) })
          }}
          data-testid={`cdss-hf-decision-${moduleId}-${option.id}`}
        >
          {isEnglish ? option.en : option.zh}
        </button>
      ))}
    </span>
  )
}

/** The status word a therapy row shows, and the badge style it wears. */
function therapyStatus(
  pillar: HeartFailurePillar,
  isEnglish: boolean,
): { label: string; className: string } {
  if (pillar.outOfScope) {
    return { label: pillar.outOfScope, className: 'bg-muted text-muted-foreground hover:bg-muted' }
  }
  if (pillar.taking) {
    return { label: isEnglish ? 'Taking' : '使用中', className: statusStyle['no-action'] }
  }
  if (!pillar.evaluated || !pillar.status) {
    return {
      label: isEnglish ? 'Not assessed' : '本次未判定',
      className: 'bg-muted text-muted-foreground hover:bg-muted',
    }
  }
  return {
    label: isEnglish ? 'No prescription' : '無處方',
    className: statusStyle[pillar.status],
  }
}

const ROW_GRID = 'grid gap-x-3 gap-y-1 px-3 py-2 @min-[40rem]:grid-cols-[6rem_7.5rem_minmax(0,1fr)_auto] @min-[40rem]:items-baseline'

export function HeartFailureStatusBoard({
  board,
  isEnglish,
  now,
  expandedId,
  onToggle,
  renderDetail,
  clinicVitals,
  onSaveClinicValues,
  onSaveClinicSymptoms,
  onClearMetric,
  onRecordDecision,
  onWithdrawDecision,
}: HeartFailureStatusBoardProps) {
  const hfpEf = board.pillarPathway === 'hfpEF'
  // The FMT safety card is one amber line here when it has a verdict to give,
  // and nothing at all when it does not: a safety line nobody has to act on
  // teaches the eye to skip that corner of the screen.
  const fmtSafetyAlert = board.fmtSafety && board.fmtSafety.status !== 'no-action'
    ? board.fmtSafety
    : undefined

  return (
    <div className="space-y-3" data-testid="cdss-hf-board">
      {/* Block 1 — who this is, and what is measured today. */}
      <section
        className="overflow-hidden rounded-lg border border-border bg-card"
        aria-label={isEnglish ? 'Patient status and today’s inputs' : '病人狀態與今天的量測'}
        data-testid="cdss-hf-status"
      >
        <div
          className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-3.5 py-2 text-xs"
          data-testid="cdss-hf-status-line"
        >
          <span
            className="rounded-sm bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-secondary-foreground"
            data-testid="cdss-hf-phenotype-word"
          >
            {board.phenotypeWord}
          </span>
          {[board.lvef, ...board.metrics].map((metric) => (
            <StatusValue
              key={metric.factKey}
              label={metric.label}
              metric={metric}
              isEnglish={isEnglish}
              now={now}
              onClear={onClearMetric}
            />
          ))}
          {onSaveClinicValues ? (
            <ClinicValuesDialog
              // The height is asked in the dialog next to the weight it is
              // divided into, and printed nowhere on the line: the BMI is what
              // a reader wants from the pair, and it is already on the line.
              metrics={[board.lvef, ...board.metrics].flatMap((metric) => (
                metric.factKey === 'bodyWeight' ? [metric, board.height] : [metric]
              ))}
              vitals={clinicVitals}
              isEnglish={isEnglish}
              now={now}
              onSave={onSaveClinicValues}
            />
          ) : null}
        </div>

        {onSaveClinicSymptoms ? (
          <>
            <SymptomStrip
              isEnglish={isEnglish}
              now={now}
              vitals={clinicVitals}
              onSave={onSaveClinicSymptoms}
            />
            <p className="border-t border-border bg-muted/20 px-3.5 py-1.5 text-[11px] leading-4 text-muted-foreground">
              {isEnglish
                ? 'Measurements and symptoms are asked once, here; they re-read FMT safety, congestion, and follow-up. Every value on the line above is corrected together behind the pencil. An unticked chip is undetermined, never absent.'
                : '量測與症狀只在這裡問一次，存入後 FMT 安全、鬱血、追蹤自動改判。上方數值用鉛筆一次修改。未選取的項目代表未判定，不代表沒有。'}
            </p>
          </>
        ) : null}
      </section>

      {/* Block 2 — the drug decisions. */}
      <section
        className="overflow-hidden rounded-lg border border-border bg-card"
        aria-label={isEnglish ? 'Treatment decisions' : '治療決策'}
        data-testid="cdss-hf-decisions-block"
        data-pillar-pathway={board.pillarPathway ?? 'none'}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-1.5">
          <span className="text-sm font-semibold text-foreground" data-testid="cdss-hf-decisions-title">
            {board.pillarPathway === undefined
              ? (isEnglish ? 'Medical therapy' : '藥物決定')
              // On the HFrEF pathway the pack itself counts the pillars and
              // names the missing ones, so the heading is its sentence; a
              // second count computed here would sit beside it and disagree.
              : !hfpEf && board.gdmt
                ? board.gdmt.title
                : hfpEf
                  ? (isEnglish
                    ? `HFpEF medical therapy · ${board.takingCount}/${board.pillars.length} in use`
                    : `HFpEF 藥物 · ${board.takingCount}／${board.pillars.length} 在用`)
                  : (isEnglish
                    ? `Four FMT pillars · ${board.takingCount}/4 in use`
                    : `四支柱 · ${board.takingCount}／4 在用`)}
          </span>
          {hfpEf ? (
            <span className="text-xs text-muted-foreground" data-testid="cdss-hf-decisions-note">
              {isEnglish
                ? 'ESC 2026 recommends an SGLT2 inhibitor and an MRA independent of LVEF; an ARNI, ACE inhibitor, or ARB is Class IIb; there is no beta-blocker recommendation in HFpEF.'
                : 'SGLT2i 與 MRA 不分 LVEF 建議；ARNI／ACEI／ARB 為 IIb；β 阻斷劑無 HFpEF 建議。'}
            </span>
          ) : null}
        </div>

        {fmtSafetyAlert ? (
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-500/[0.08] dark:text-amber-200"
            data-testid="cdss-hf-fmt-safety-line"
          >
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="font-medium">{fmtSafetyAlert.title}</span>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 rounded px-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onToggle(fmtSafetyAlert.id)}
              aria-expanded={expandedId === fmtSafetyAlert.id}
              data-testid="cdss-hf-fmt-safety-trigger"
            >
              {fmtSafetyAlert.moduleName ?? (isEnglish ? 'FMT safety' : 'FMT 調整安全')}
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform', expandedId === fmtSafetyAlert.id && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
          </div>
        ) : null}
        {fmtSafetyAlert && expandedId === fmtSafetyAlert.id ? (
          <div className="border-b border-border bg-background" data-testid={`cdss-hf-detail-${fmtSafetyAlert.id}`}>
            {renderDetail(fmtSafetyAlert)}
          </div>
        ) : null}

        {board.pillars.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-muted-foreground" data-testid="cdss-hf-no-pathway">
            {isEnglish
              ? 'Phenotype not established: drug decisions follow an LVEF or a confirmed diagnosis.'
              : '尚未分型：LVEF 或診斷確立後才有藥物決定。'}
          </p>
        ) : (
          <ul>
            {board.pillars.map((pillar) => {
              const expanded = expandedId === pillar.id
              const pill = therapyStatus(pillar, isEnglish)
              return (
                <li key={pillar.id} className="border-b border-border last:border-b-0">
                  <div
                    className={ROW_GRID}
                    data-testid={`cdss-hf-therapy-${pillar.id}`}
                    data-taking={pillar.taking ? 'true' : 'false'}
                  >
                    <span className="text-sm font-semibold leading-5 text-foreground">{pillar.label}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      {/* The word is the state, so the row carries no status
                          icon: a question mark beside 「無處方」 reads as a
                          doubt about the prescription rather than as the
                          module's status. */}
                      <Badge className={cn('h-5 shrink-0 px-1.5 text-[11px]', pill.className)}>
                        {pill.label}
                      </Badge>
                      {pillar.note ? (
                        <Badge
                          className="h-5 shrink-0 border border-border bg-transparent px-1.5 text-[11px] font-normal text-muted-foreground hover:bg-transparent"
                          data-testid={`cdss-hf-therapy-note-${pillar.id}`}
                        >
                          {pillar.note}
                        </Badge>
                      ) : null}
                    </span>
                    {pillar.recommendation ? (
                      <button
                        type="button"
                        className="min-w-0 text-left text-xs leading-relaxed text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onToggle(pillar.id)}
                        aria-expanded={expanded}
                        data-testid={`cdss-hf-therapy-trigger-${pillar.id}`}
                      >
                        {pillar.sentence}
                      </button>
                    ) : (
                      <span
                        className="min-w-0 text-xs leading-relaxed text-muted-foreground"
                        data-testid={`cdss-hf-therapy-sentence-${pillar.id}`}
                      >
                        {pillar.sentence}
                      </span>
                    )}
                    <span className="flex flex-wrap items-center gap-1.5">
                      {pillar.decisionOptions ? (
                        <DecisionControls
                          moduleId={pillar.id}
                          options={pillar.decisionOptions}
                          decision={pillar.decision}
                          isEnglish={isEnglish}
                          now={now}
                          onRecord={onRecordDecision}
                          onWithdraw={onWithdrawDecision}
                        />
                      ) : null}
                      {pillar.recommendation ? (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => onToggle(pillar.id)}
                          aria-expanded={expanded}
                          aria-label={isEnglish ? 'Show decision details' : '展開決策詳情'}
                        >
                          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                        </button>
                      ) : null}
                    </span>
                  </div>
                  {expanded && pillar.recommendation ? (
                    <div className="border-t border-border bg-background" data-testid={`cdss-hf-detail-${pillar.id}`}>
                      {renderDetail(pillar.recommendation)}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Block 3 — everything the first two blocks did not consume. */}
      {board.listRows.length > 0 ? (
        <section
          className="overflow-hidden rounded-lg border border-border bg-card"
          aria-label={isEnglish ? 'Other modules' : '其他'}
          data-testid="cdss-hf-list"
        >
          <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-sm font-semibold text-foreground">
            {isEnglish ? 'Other' : '其他'}
          </div>
          <ul>
            {board.listRows.map((row) => {
              const expanded = expandedId === row.id
              // A module with nothing left to do stays on the page and reads
              // quietly: folding it into a separate group hides which
              // questions were asked and answered.
              const done = row.status === 'no-action'
              return (
                <li key={row.id} className="border-b border-border last:border-b-0">
                  <div
                    className={cn(ROW_GRID, done && 'text-muted-foreground')}
                    data-testid={`cdss-hf-row-${row.id}`}
                    data-status={row.status}
                  >
                    <span className={cn('text-sm font-semibold leading-5', done ? 'text-muted-foreground' : 'text-foreground')}>
                      {row.moduleName ?? row.id}
                    </span>
                    <span>
                      <Badge className={cn('h-5 shrink-0 px-1.5 text-[11px]', statusStyle[row.status])}>
                        <StatusIcon status={row.status} />
                        {statusLabel(row.status, isEnglish)}
                      </Badge>
                    </span>
                    <button
                      type="button"
                      className={cn(
                        'min-w-0 text-left text-xs leading-relaxed hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        done ? 'text-muted-foreground' : 'text-foreground',
                      )}
                      onClick={() => onToggle(row.id)}
                      aria-expanded={expanded}
                      data-testid={`cdss-hf-row-trigger-${row.id}`}
                    >
                      {stripDecisionSuffix(row.title)}
                    </button>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {row.decisionOptions ? (
                        <DecisionControls
                          moduleId={row.id}
                          options={row.decisionOptions}
                          decision={row.physicianDecision}
                          isEnglish={isEnglish}
                          now={now}
                          onRecord={onRecordDecision}
                          onWithdraw={onWithdrawDecision}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onToggle(row.id)}
                        aria-expanded={expanded}
                        aria-label={isEnglish ? 'Show decision details' : '展開決策詳情'}
                      >
                        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                  {expanded ? (
                    <div className="border-t border-border bg-background" data-testid={`cdss-hf-detail-${row.id}`}>
                      {renderDetail(row)}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
