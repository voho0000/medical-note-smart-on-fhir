"use client"
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/src/shared/utils/cn.utils'
import type { PhysicianDecisionInput, PhysicianDecisionKind } from '../stores/physician-decisions.store'
import { DECISION_REASONS, decisionLabel, decisionReasonLabel, formatStamp, type VisitActionRow } from './heart-failure-visit-flow'
const MEDICATION_DECISIONS: readonly PhysicianDecisionKind[] = ['prescribed', 'dose-adjusted', 'contraindicated', 'deferred', 'patient-preference']
const TEST_DECISIONS: readonly PhysicianDecisionKind[] = ['ordered', 'deferred']
export function PhysicianDecisionControls({
  row,
  isEnglish,
  now,
  editing,
  onEdit,
  onRecordDecision,
  onClearDecision,
  packVersion,
  readOnly,
  testIdPrefix = 'cdss-hf',
}: {
  row: VisitActionRow
  isEnglish: boolean
  now: Date
  editing: boolean
  onEdit: (editing: boolean) => void
  onRecordDecision?: (moduleId: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (moduleId: string) => void
  packVersion: string
  readOnly: boolean
  testIdPrefix?: string
}) {
  const [note, setNote] = useState(row.decision?.note ?? '')
  if (row.decisionKind === 'none' || readOnly || !onRecordDecision) return null
  const moduleId = row.recommendation.id
  const options = row.decisionKind === 'test' ? TEST_DECISIONS : MEDICATION_DECISIONS
  const decision = row.decision
  const recordedStamp = formatStamp(decision?.recordedAt, now, isEnglish)

  const record = (next: Partial<PhysicianDecisionInput> & { decision: PhysicianDecisionKind }) => {
    onRecordDecision(moduleId, {
      decision: next.decision,
      reasons: next.reasons ?? decision?.reasons ?? [],
      ...(next.note !== undefined ? { note: next.note } : decision?.note ? { note: decision.note } : {}),
      packVersion,
    })
  }

  if (decision && !editing) {
    return (
      <div
        className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1"
        data-testid={`${testIdPrefix}-decision-recorded-${moduleId}`}
        data-decision={decision.decision}
      >
        <Badge className="h-5 bg-primary/10 px-1.5 text-[11px] text-primary hover:bg-primary/10">
          {decisionLabel(decision.decision, isEnglish)}
        </Badge>
        {decision.reasons.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {decision.reasons.map((reason) => decisionReasonLabel(reason, isEnglish)).join(' · ')}
          </span>
        ) : null}
        {decision.note ? (
          <span className="text-[11px] text-foreground">{decision.note}</span>
        ) : null}
        {recordedStamp ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">{recordedStamp}</span>
        ) : null}
        <button
          type="button"
          className="min-h-7 rounded-md px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onEdit(true)}
          data-testid={`${testIdPrefix}-decision-edit-${moduleId}`}
        >
          {isEnglish ? 'Change' : '改'}
        </button>
      </div>
    )
  }

  const needsReasons = decision?.decision === 'contraindicated' || decision?.decision === 'deferred'
  const needsNote = decision?.decision === 'dose-adjusted'

  return (
    <div className="mt-1.5 space-y-1.5" data-testid={`${testIdPrefix}-decision-${moduleId}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {isEnglish ? 'Your decision' : '你的處置'}
        </span>
        {options.map((option) => {
          const selected = decision?.decision === option
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              className={cn(
                'inline-flex min-h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted/40',
              )}
              onClick={() => {
                record({ decision: option })
                // A refusal and a deferral are only half a record without the
                // reason, and a dose change without the new dose says nothing,
                // so those three keep the editor open for the second half.
                onEdit(option === 'contraindicated' || option === 'deferred' || option === 'dose-adjusted')
              }}
              data-testid={`${testIdPrefix}-decision-${moduleId}-${option}`}
            >
              {decisionLabel(option, isEnglish)}
            </button>
          )
        })}
        {decision && onClearDecision ? (
          <button
            type="button"
            className="min-h-7 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => { onClearDecision(moduleId); onEdit(false) }}
            data-testid={`${testIdPrefix}-decision-clear-${moduleId}`}
          >
            {isEnglish ? 'Clear' : '清除'}
          </button>
        ) : null}
      </div>

      {needsReasons ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid={`${testIdPrefix}-decision-reasons-${moduleId}`}>
          {DECISION_REASONS.map((reason) => {
            const selected = decision?.reasons.includes(reason.id) ?? false
            return (
              <button
                key={reason.id}
                type="button"
                aria-pressed={selected}
                className={cn(
                  'inline-flex min-h-8 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/40',
                )}
                onClick={() => {
                  const current = decision?.reasons ?? []
                  const reasons = selected
                    ? current.filter((item) => item !== reason.id)
                    : [...current, reason.id]
                  if (decision) record({ decision: decision.decision, reasons })
                }}
                data-testid={`${testIdPrefix}-decision-reason-${moduleId}-${reason.id}`}
              >
                {isEnglish ? reason.en : reason.zh}
              </button>
            )
          })}
        </div>
      ) : null}

      {needsReasons || needsNote ? (
        <div className="flex flex-wrap items-end gap-1.5">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={needsNote
              ? (isEnglish ? 'e.g. 2.5 → 5 mg' : '例：2.5 → 5 mg')
              : (isEnglish ? 'Anything else worth recording' : '其他想記的一行')}
            className="h-8 w-56 px-2 text-sm md:text-sm"
            aria-label={isEnglish ? 'Decision note' : '處置備註'}
            data-testid={`${testIdPrefix}-decision-note-${moduleId}`}
          />
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={!decision}
            onClick={() => {
              if (!decision) return
              record({ decision: decision.decision, note })
              onEdit(false)
            }}
            data-testid={`${testIdPrefix}-decision-save-${moduleId}`}
          >
            {isEnglish ? 'Record' : '記錄'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

