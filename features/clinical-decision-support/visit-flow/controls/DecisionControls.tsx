"use client"

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/src/shared/utils/cn.utils'
import type {
  PhysicianDecisionInput,
  PhysicianDecisionKind,
} from '../../stores/physician-decisions.store'
import {
  VISIT_DECISIONS,
  decisionLabel,
  decisionReasonLabel,
  formatStamp,
} from '../build-visit-flow'
import type { VisitActionRow, VisitFlowDiseaseConfig } from '../types'
import { DoseAdjustmentEditor } from './DoseAdjustmentEditor'

/**
 * What was decided about one row, and the reason where the decision needs one.
 *
 * The decision words are the host's — the pack neither writes nor reads them —
 * and which of them a row offers is its `decisionKind`. The reasons behind a
 * refusal or a deferral are the disease's, and come from its config: a
 * beta-blocker is not deferred for the reasons a statin is.
 */
export function DecisionControls({
  row,
  config,
  isEnglish,
  now,
  editing,
  onEdit,
  onRecordDecision,
  onClearDecision,
  packVersion,
  readOnly,
  defaultDoseMedication,
}: {
  row: VisitActionRow
  config: VisitFlowDiseaseConfig
  isEnglish: boolean
  now: Date
  editing: boolean
  onEdit: (editing: boolean) => void
  onRecordDecision?: (moduleId: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (moduleId: string) => void
  packVersion: string
  readOnly: boolean
  defaultDoseMedication?: string
}) {
  const [note, setNote] = useState(row.decision?.note ?? '')
  const prefix = config.testIdPrefix
  if (row.decisionKind === 'none' || readOnly || !onRecordDecision) return null
  const moduleId = row.recommendation.id
  const options = VISIT_DECISIONS[row.decisionKind]
  const decision = row.decision
  const recordedStamp = formatStamp(decision?.recordedAt, now, isEnglish)
  const reasonLabel = (id: string) => decisionReasonLabel(config.decisionReasons, id, isEnglish)

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
        data-testid={`${prefix}-decision-recorded-${moduleId}`}
        data-decision={decision.decision}
      >
        <Badge className="h-5 bg-primary/10 px-1.5 text-[11px] text-primary hover:bg-primary/10">
          {decisionLabel(decision.decision, isEnglish)}
        </Badge>
        {decision.reasons.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {decision.reasons.map(reasonLabel).join(' · ')}
          </span>
        ) : null}
        {decision.note ? (
          <span className="text-[11px] text-foreground">{decision.note}</span>
        ) : null}
        {row.decisionSource === 'medication-record' ? (
          <span className="text-[11px] text-muted-foreground">
            {isEnglish ? 'From current medication record' : '依目前用藥紀錄帶入'}
          </span>
        ) : null}
        {recordedStamp ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">{recordedStamp}</span>
        ) : null}
        <button
          type="button"
          className="min-h-8 min-w-14 shrink-0 rounded-md px-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onEdit(true)}
          data-testid={`${prefix}-decision-edit-${moduleId}`}
        >
          {isEnglish ? 'Edit' : '修改'}
        </button>
      </div>
    )
  }

  const needsReasons = decision?.decision === 'contraindicated' || decision?.decision === 'deferred'
  const needsNote = decision?.decision === 'dose-adjusted'
  const reasonIds = config.decisionReasonIds(moduleId, row.decisionKind, decision?.decision)

  return (
    <div className="mt-1.5 space-y-1.5" data-testid={`${prefix}-decision-${moduleId}`}>
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
                const allowedReasons = config.decisionReasonIds(moduleId, row.decisionKind, option)
                const sameDecision = decision?.decision === option
                const reasons = sameDecision
                  ? (decision?.reasons ?? []).filter((reason) => allowedReasons.includes(reason))
                  : []
                record({
                  decision: option,
                  reasons,
                  note: sameDecision && reasons.includes('other') ? decision?.note ?? '' : '',
                })
                // A refusal and a deferral are only half a record without the
                // reason, and a dose change without the new dose says nothing,
                // so those three keep the editor open for the second half.
                onEdit(option === 'contraindicated' || option === 'deferred' || option === 'dose-adjusted')
              }}
              data-testid={`${prefix}-decision-${moduleId}-${option}`}
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
            data-testid={`${prefix}-decision-clear-${moduleId}`}
          >
            {isEnglish ? 'Clear' : '清除'}
          </button>
        ) : null}
      </div>

      {needsReasons ? (
        <div className="flex items-end gap-2" data-testid={`${prefix}-decision-reasons-${moduleId}`}>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {config.decisionReasons.filter((reason) => reasonIds.includes(reason.id)).map((reason) => {
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
                    const current = (decision?.reasons ?? []).filter((item) => reasonIds.includes(item))
                    const reasons = selected
                      ? current.filter((item) => item !== reason.id)
                      : [...current, reason.id]
                    if (decision) {
                      if (reason.id === 'other' && selected) {
                        setNote('')
                        record({ decision: decision.decision, reasons, note: '' })
                      } else {
                        record({ decision: decision.decision, reasons })
                      }
                    }
                  }}
                  data-testid={`${prefix}-decision-reason-${moduleId}-${reason.id}`}
                >
                  {isEnglish ? reason.en : reason.zh}
                </button>
              )
            })}
            {decision?.reasons.includes('other') ? (
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={isEnglish ? 'Specify other reason' : '其他想記的一行'}
                className="h-8 w-56 px-2 text-sm md:text-sm"
                aria-label={isEnglish ? 'Other decision reason' : '其他處置原因'}
                data-testid={`${prefix}-decision-note-${moduleId}`}
              />
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 px-3 text-sm"
            disabled={!decision || (decision.reasons.includes('other') && !note.trim())}
            onClick={() => {
              if (!decision) return
              record({ decision: decision.decision, note: decision.reasons.includes('other') ? note.trim() : '' })
              onEdit(false)
            }}
            data-testid={`${prefix}-decision-save-${moduleId}`}
          >
            {isEnglish ? 'Record' : '記錄'}
          </Button>
        </div>
      ) : null}

      {needsNote ? (
        <DoseAdjustmentEditor
          initialNote={decision?.note ?? ''}
          medications={row.medications}
          defaultMedication={defaultDoseMedication}
          isEnglish={isEnglish}
          onSave={doseNote => { record({ decision: 'dose-adjusted', note: doseNote }); onEdit(false) }} />
      ) : null}
    </div>
  )
}
