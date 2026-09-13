"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const DOSE_EXPRESSION = '\\d+(?:\\.\\d+)?(?:/\\d+(?:\\.\\d+)?)?'

export function doseAdjustmentDefaults(medications?: string): {
  medication: string
  previous: string
  unit: string
} {
  const medication = medications?.split(/[、,;]/)[0]?.trim() ?? ''
  const hasStrength = new RegExp(
    `^.+?\\s+${DOSE_EXPRESSION}\\s*(?:mg|mcg|g|mL|units|錠)(?:\\b|$)`,
    'i',
  ).test(medication)
  return {
    medication,
    previous: hasStrength ? '1' : '',
    unit: hasStrength ? '錠' : 'mg',
  }
}

export function DoseAdjustmentEditor({ initialNote, medications, defaultMedication, isEnglish, onSave }: {
  initialNote: string
  medications?: string
  defaultMedication?: string
  isEnglish: boolean
  onSave: (note: string) => void
}) {
  const dosePattern = DOSE_EXPRESSION
  const parsed = new RegExp(`^(?:(.+?)[：:])?(${dosePattern}) → (${dosePattern}) (mg|mcg|g|mL|units|錠)(?:(?: · | )(PO|IV|IM|SC))?(?:(?: · | )(QD|BID|TID|QID|QAM|QHS|PRN))?(?:；([\\s\\S]*))?$`).exec(initialNote)
  const inferred = doseAdjustmentDefaults(medications)
  // Keep the dispensed strength with the drug name. The editable numbers are
  // units per administration, so combination strengths such as 49/51 mg stay
  // intact and a change can read 1 → 0.5 tablet.
  const [medication, setMedication] = useState(parsed?.[1]?.trim() || inferred.medication || defaultMedication || '')
  const [previous, setPrevious] = useState(parsed?.[2] ?? inferred.previous)
  const [next, setNext] = useState(parsed?.[3] ?? '')
  const [unit, setUnit] = useState(parsed?.[4] ?? inferred.unit)
  const [route, setRoute] = useState(parsed?.[5] ?? 'PO')
  const [frequency, setFrequency] = useState(parsed?.[6] ?? 'QD')
  const [extra, setExtra] = useState(parsed ? parsed[7] ?? '' : initialNote)
  const validDose = (value: string, allowZero: boolean) => {
    if (!new RegExp(`^${dosePattern}$`).test(value.trim())) return false
    return value.split('/').every((part) => allowZero ? Number(part) >= 0 : Number(part) > 0)
  }
  const valid = medication.trim() !== '' && route !== '' && frequency !== ''
    && validDose(previous, true) && validDose(next, false)
    && previous.trim() !== next.trim()
  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-1.5">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {isEnglish ? 'Medication / strength' : '藥品規格'}
            <Input value={medication} onChange={event => setMedication(event.target.value)}
              className="h-8 w-40 px-2 text-sm" placeholder={isEnglish ? 'Drug and strength' : '藥名＋規格'} />
          </label>
          <label className="flex w-14 flex-col gap-1 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">{isEnglish ? 'Previous' : '原用量'}</span>
            <Input type="text" inputMode="decimal" value={previous}
              aria-label={isEnglish ? 'Previous amount' : '原每次用量'}
              onChange={event => setPrevious(event.target.value)} className="h-8 w-14 px-2 text-sm"
              placeholder="1" />
          </label>
          <span className="pb-1.5 text-sm text-muted-foreground" aria-hidden="true">→</span>
          <label className="flex w-14 flex-col gap-1 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">{isEnglish ? 'New' : '新用量'}</span>
            <Input type="text" inputMode="decimal" value={next}
              aria-label={isEnglish ? 'New amount' : '新每次用量'}
              onChange={event => setNext(event.target.value)} className="h-8 w-14 px-2 text-sm" placeholder="0.5" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {isEnglish ? 'Unit' : '單位'}
            <select value={unit} onChange={event => setUnit(event.target.value)}
              className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {['錠', '顆', '包', 'mg', 'mcg', 'g', 'mL', 'units'].map(value => <option key={value} value={value}>{value === '錠' && isEnglish ? 'tablets' : value === '顆' && isEnglish ? 'capsules' : value === '包' && isEnglish ? 'packets' : value}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {isEnglish ? 'Route' : '途徑'}
            <select value={route} onChange={event => setRoute(event.target.value)}
              className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {['PO', 'IV', 'IM', 'SC'].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {isEnglish ? 'Frequency' : '頻次'}
            <select value={frequency} onChange={event => setFrequency(event.target.value)}
              className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">{isEnglish ? 'Select' : '選擇'}</option>
              {['QD', 'BID', 'TID', 'QID', 'QAM', 'QHS', 'PRN'].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <Button type="button" size="sm" className="h-8 shrink-0 px-3 text-sm" disabled={!valid}
          onClick={() => onSave([`${medication.trim()}：${previous.trim()} → ${next.trim()} ${unit} · ${route} · ${frequency}`, extra.trim()].filter(Boolean).join('；'))}>
          {isEnglish ? 'Record' : '記錄'}
        </Button>
      </div>
      {extra ? <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {isEnglish ? 'Existing note' : '原有備註'}
        <Input value={extra} onChange={event => setExtra(event.target.value)} className="h-9 text-sm" />
      </label> : null}
    </div>
  )
}
