"use client"

import { useId, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  type ClinicEntryValue,
  type ClinicMetricKey,
  type ClinicRhythm,
  type ClinicValueInputs,
  type ClinicVitals,
  isClinicMetricKey,
  todayIsoDate,
} from '../stores/clinic-vitals.store'
import { CLINIC_METRIC_STEP, CLINIC_METRIC_UNIT } from '../utils/apply-clinic-vitals'
import {
  formatMetricDate,
  type HeartFailureMetric,
  metricRecordReading,
} from './heart-failure-board'

/**
 * 「修改今日數值」 — every value on the status line, corrected in one place.
 *
 * The record lags the room. An echo read this morning is not in it, a
 * potassium drawn an hour ago is not in it, and the cuff, the scale and the
 * pulse were never going to be. A page that can only show what was fetched
 * makes the clinician discount the whole line, so the physician gets the last
 * word on every number on it — and gets it in one pass, because a clinic visit
 * produces the weight, the pressure and the morning's laboratory together, not
 * one value at a time.
 *
 * A saved value becomes the fact the pack reads — dated the day it was entered
 * and marked as entered — so every module recomputes from it. Nothing patches
 * a rendered card, and nothing is written back to the record.
 */

/** The rhythm a clinician can state in the room, for the follow-up card. */
const RHYTHM_CHIPS: readonly { id: ClinicRhythm; zh: string; en: string }[] = [
  { id: 'sinus', zh: '竇性', en: 'Sinus' },
  { id: 'atrial-fibrillation', zh: 'AF', en: 'AF' },
  { id: 'other', zh: '其他', en: 'Other' },
]

type Draft = readonly [primary: string, secondary: string]

function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * The numbers inside a printed reading — 「118/72」 — so the record's own value
 * can stand as the box's placeholder. Nothing downstream reads this; an
 * unparsable reading simply leaves the placeholder empty.
 */
function readingNumbers(value: string | undefined): Draft {
  const numbers = value?.match(/\d+(?:\.\d+)?/g) ?? []
  return [numbers[0] ?? '', numbers[1] ?? '']
}

/** The values the dialog can take, in the order the status line prints them. */
function editableMetrics(metrics: readonly HeartFailureMetric[]): readonly HeartFailureMetric[] {
  return metrics.filter((metric) => metric.editable && isClinicMetricKey(metric.factKey))
}

/** The dialog opens on what is already entered, so a save can be a no-op. */
function seedDrafts(
  metrics: readonly HeartFailureMetric[],
  vitals: ClinicVitals | undefined,
): Record<string, Draft> {
  const drafts: Record<string, Draft> = {}
  for (const metric of metrics) {
    const entry = vitals?.entries?.[metric.factKey as ClinicMetricKey]
    drafts[metric.factKey] = [
      entry?.value?.toString() ?? '',
      entry?.diastolic?.toString() ?? '',
    ]
  }
  return drafts
}

/** 「紀錄 63.6%（06-24）」, or 「紀錄 無」 where the chart holds nothing. */
function recordHelper(metric: HeartFailureMetric, isEnglish: boolean, now: Date): string {
  const label = isEnglish ? 'Record' : '紀錄'
  const reading = metricRecordReading(metric)
  if (!reading.value) return `${label} ${isEnglish ? 'none' : '無'}`
  const unit = reading.unit ? ` ${reading.unit}` : ''
  const date = formatMetricDate(reading.date, now)
  const dated = date ? (isEnglish ? ` (${date})` : `（${date}）`) : ''
  return `${label} ${reading.value}${unit}${dated}`
}

interface ClinicValuesDialogProps {
  /** The status line's values, in its own order; only editable ones are shown. */
  metrics: readonly HeartFailureMetric[]
  vitals?: ClinicVitals
  isEnglish: boolean
  now: Date
  onSave: (values: ClinicValueInputs) => void
}

export function ClinicValuesDialog({
  metrics,
  vitals,
  isEnglish,
  now,
  onSave,
}: ClinicValuesDialogProps) {
  const [open, setOpen] = useState(false)
  const label = isEnglish ? 'Edit today’s values' : '修改今日數值'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          // The glyph belongs on a dense line of numbers; the target does not.
          // The `after` box gives the 44px touch area without the button's own
          // 18px box growing and pushing the line apart.
          className={cn(
            'relative ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            'text-muted-foreground transition-colors hover:bg-muted/40 hover:text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'after:absolute after:-inset-[13px] after:content-[\'\']',
          )}
          data-testid="cdss-hf-values-trigger"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </DialogTrigger>
      {/* Mounted only while open, so every opening starts from what is saved
          rather than from a draft the clinician abandoned on the last chart. */}
      {open ? (
        <DialogContent className="sm:max-w-md" data-testid="cdss-hf-values-dialog">
          <ClinicValuesForm
            metrics={metrics}
            vitals={vitals}
            isEnglish={isEnglish}
            now={now}
            onSave={onSave}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function ClinicValuesForm({
  metrics,
  vitals,
  isEnglish,
  now,
  onSave,
  onDone,
}: ClinicValuesDialogProps & { onDone: () => void }) {
  const id = useId()
  const fields = editableMetrics(metrics)
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => seedDrafts(fields, vitals))
  const [rhythm, setRhythm] = useState<ClinicRhythm | undefined>(vitals?.rhythm)
  // 「全部撤銷」 throws away work, so it asks once before it does — in place,
  // because a second dialog over this one buries the values it is about to
  // discard.
  const [confirmingClearAll, setConfirmingClearAll] = useState(false)

  const draftOf = (factKey: string): Draft => drafts[factKey] ?? ['', '']
  const setDraft = (factKey: string, next: Draft) => {
    setDrafts((current) => ({ ...current, [factKey]: next }))
  }

  const systolic = parseNumber(draftOf('bloodPressure')[0])
  const diastolic = parseNumber(draftOf('bloodPressure')[1])
  // A blood pressure is two numbers or none; one half cannot be read.
  const bpHalfEntered = (systolic === undefined) !== (diastolic === undefined)
  const hasEntered = Object.keys(vitals?.entries ?? {}).length > 0 || vitals?.rhythm !== undefined

  const submit = (entries: Readonly<Partial<Record<ClinicMetricKey, ClinicEntryValue>>>,
    savedRhythm: ClinicRhythm | undefined) => {
    onSave({ entries, ...(savedRhythm ? { rhythm: savedRhythm } : {}), measuredOn: todayIsoDate(now) })
    onDone()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (bpHalfEntered) return
        const entries: Partial<Record<ClinicMetricKey, ClinicEntryValue>> = {}
        for (const metric of fields) {
          const factKey = metric.factKey as ClinicMetricKey
          const [primary, secondary] = draftOf(factKey)
          const value = parseNumber(primary)
          if (value === undefined) continue
          if (factKey === 'bloodPressure') {
            const lower = parseNumber(secondary)
            if (lower === undefined) continue
            entries[factKey] = { value, diastolic: lower }
            continue
          }
          entries[factKey] = { value }
        }
        submit(entries, rhythm)
      }}
    >
      <DialogHeader className="mb-3">
        <DialogTitle>{isEnglish ? 'Today’s values' : '今日數值'}</DialogTitle>
        <DialogDescription>
          {isEnglish
            ? 'A value entered here replaces the record’s for this visit; an empty box leaves the record’s own.'
            : '在這裡填入的數值，本次看診改用它；留白就用紀錄本來的值。'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2.5">
        {fields.map((metric) => {
          const factKey = metric.factKey as ClinicMetricKey
          const isBloodPressure = factKey === 'bloodPressure'
          const [primary, secondary] = draftOf(factKey)
          const placeholders = readingNumbers(metricRecordReading(metric).value)
          const invalid = isBloodPressure && bpHalfEntered
          return (
            <div key={factKey} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5">
              <label
                htmlFor={`${id}-${factKey}`}
                className="text-xs font-medium text-foreground"
              >
                {metric.label}
              </label>
              <div className="flex items-center gap-1.5">
                <Input
                  id={`${id}-${factKey}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={CLINIC_METRIC_STEP[factKey]}
                  value={primary}
                  placeholder={placeholders[0]}
                  onChange={(event) => setDraft(factKey, [event.target.value, secondary])}
                  className="h-8 w-[5rem] px-2 text-sm tabular-nums md:text-sm"
                  aria-invalid={invalid ? true : undefined}
                  aria-label={isEnglish
                    ? (isBloodPressure ? 'Systolic' : metric.label)
                    : (isBloodPressure ? '收縮壓' : metric.label)}
                  data-testid={`cdss-hf-value-input-${factKey}`}
                />
                {isBloodPressure ? (
                  <>
                    <span className="text-muted-foreground" aria-hidden="true">/</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="1"
                      value={secondary}
                      placeholder={placeholders[1]}
                      onChange={(event) => setDraft(factKey, [primary, event.target.value])}
                      className="h-8 w-[5rem] px-2 text-sm tabular-nums md:text-sm"
                      aria-invalid={invalid ? true : undefined}
                      aria-label={isEnglish ? 'Diastolic' : '舒張壓'}
                      data-testid={`cdss-hf-value-input-${factKey}-diastolic`}
                    />
                  </>
                ) : null}
                <span className="text-[11px] text-muted-foreground">
                  {CLINIC_METRIC_UNIT[factKey]}
                </span>
              </div>
              <span aria-hidden="true" />
              <span
                className="text-[11px] leading-4 text-muted-foreground/80"
                data-testid={`cdss-hf-value-record-${factKey}`}
              >
                {recordHelper(metric, isEnglish, now)}
              </span>
            </div>
          )
        })}

        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3">
          <span className="text-xs font-medium text-foreground">
            {isEnglish ? 'Rhythm' : '心律'}
          </span>
          <div className="flex gap-1" role="group" aria-label={isEnglish ? 'Rhythm' : '心律'}>
            {RHYTHM_CHIPS.map((chip) => {
              const selected = rhythm === chip.id
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    'inline-flex h-8 items-center rounded-full border px-2.5 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:bg-muted/40',
                  )}
                  onClick={() => setRhythm(selected ? undefined : chip.id)}
                  data-testid={`cdss-hf-values-rhythm-${chip.id}`}
                >
                  {isEnglish ? chip.en : chip.zh}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {bpHalfEntered ? (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300" role="alert">
          {isEnglish ? 'Enter both systolic and diastolic.' : '收縮壓與舒張壓要一起填。'}
        </p>
      ) : null}

      <DialogFooter className="mt-4 sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8', confirmingClearAll && 'text-destructive')}
          disabled={!hasEntered}
          onClick={() => {
            if (!confirmingClearAll) {
              setConfirmingClearAll(true)
              return
            }
            submit({}, undefined)
          }}
          data-testid="cdss-hf-values-clear-all"
        >
          {confirmingClearAll
            ? (isEnglish ? 'Undo all — confirm' : '確定全部撤銷')
            : (isEnglish ? 'Undo all' : '全部撤銷')}
        </Button>
        <span className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onDone}
            data-testid="cdss-hf-values-cancel"
          >
            {isEnglish ? 'Cancel' : '取消'}
          </Button>
          <Button
            type="submit"
            size="sm"
            className="h-8"
            disabled={bpHalfEntered}
            data-testid="cdss-hf-values-save"
          >
            {isEnglish ? 'Save' : '存入'}
          </Button>
        </span>
      </DialogFooter>
    </form>
  )
}
