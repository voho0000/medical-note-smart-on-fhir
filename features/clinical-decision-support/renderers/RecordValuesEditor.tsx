"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { HfpefInputsPatch } from '../stores/hfpef-inputs.store'
import { todayIsoDate } from '../stores/clinic-vitals.store'
import type { HeartFailureMetric } from './heart-failure-board'

export interface RecordValueChange {
  metric: HeartFailureMetric
  values: number[] | null
  measuredOn: string
}

export function RecordValuesEditor({ metrics, isEnglish, now, onSave, onClose, rhythm, onSaveRhythm }: {
  rhythm?: string
  onSaveRhythm?: (patch: HfpefInputsPatch) => void
  metrics: readonly HeartFailureMetric[]
  isEnglish: boolean
  now: Date
  onSave: (changes: RecordValueChange[]) => void
  onClose: () => void
}) {
  const [rhythmDraft, setRhythmDraft] = useState(rhythm ?? '')
  const [rhythmDirty, setRhythmDirty] = useState(false)
  const today = todayIsoDate(now)
  const recordDrafts = metrics.map(metric => {
    const text = metric.value?.replace(/,/g, '') ?? ''
    const numbers = /[<>≤≥]/.test(text) ? [] : text.match(/\d+(?:\.\d+)?/g) ?? []
    return { first: numbers[0] ?? '', second: metric.factKey === 'bloodPressure' ? numbers[1] ?? '' : '', date: metric.date?.slice(0, 10) ?? today, dirty: false, restore: false }
  })
  const [drafts, setDrafts] = useState(() => recordDrafts)
  const patch = (index: number, value: Partial<typeof drafts[number]>) => setDrafts(current => current.map((draft, i) => i === index ? { ...draft, ...value, dirty: true } : draft))
  const valid = drafts.every((draft, index) => {
    if (!draft.dirty || draft.restore) return true
    const key = metrics[index].factKey
    const values = key === 'bloodPressure' ? [draft.first, draft.second] : [draft.first]
    return values.every(value => value.trim() !== '' && Number.isFinite(Number(value)) && (key === 'NTproBNP' ? Number(value) >= 0 : Number(value) > 0))
      && (!['LVEF', 'oxygenSaturation'].includes(key) || Number(draft.first) <= 100)
      && (key !== 'bloodPressure' || Number(draft.first) > Number(draft.second))
      && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && draft.date <= today
  })
  const metricEntries = metrics.map((metric, index) => ({ metric, index }))
  const metricByKey = new Map(metricEntries.map((entry) => [entry.metric.factKey, entry]))
  const knownKeys = new Set([
    'LVEF', 'heartRate', 'NTproBNP', 'bloodPressure', 'oxygenSaturation',
    'eGFR', 'potassium', 'sodium', 'hemoglobin', 'bodyWeight', 'bodyHeight',
  ])
  const standaloneItems = ['LVEF', 'rhythm']
    .filter((key) => key === 'rhythm' ? Boolean(onSaveRhythm) : metricByKey.has(key))
  const sections = [
    {
      id: 'labs',
      label: isEnglish ? 'Laboratory tests' : '抽血檢驗',
      items: ['NTproBNP', 'eGFR', 'potassium', 'sodium', 'hemoglobin'],
    },
    {
      id: 'vitals',
      label: isEnglish ? 'Vital signs' : '生命徵象',
      items: ['bloodPressure', 'heartRate', 'oxygenSaturation'],
    },
    {
      id: 'body',
      label: isEnglish ? 'Height & weight' : '身高體重',
      items: ['bodyWeight', 'bodyHeight'],
    },
  ].map((section) => ({
    ...section,
    items: section.items.filter((key) => key === 'rhythm' ? Boolean(onSaveRhythm) : metricByKey.has(key)),
  })).filter((section) => section.items.length > 0)
  const remainingMetrics = metricEntries.filter((entry) => !knownKeys.has(entry.metric.factKey))

  const metricField = ({ metric, index }: { metric: HeartFailureMetric; index: number }) => {
    const draft = drafts[index]
    const displayedDraft = draft.restore ? recordDrafts[index] : draft
    const bp = metric.factKey === 'bloodPressure'
    const dateInputId = `record-values-${metric.factKey}-date`
    const fallbackUnits: Record<string, string> = {
      LVEF: '%',
      bloodPressure: 'mmHg',
      heartRate: 'bpm',
      potassium: 'mmol/L',
      eGFR: 'mL/min/1.73m²',
      sodium: 'mmol/L',
      bodyWeight: 'kg',
      bodyHeight: 'cm',
      NTproBNP: 'pg/mL',
      hemoglobin: 'g/dL',
    }
    return (
      <fieldset
        key={metric.factKey}
        className="min-w-0 border-b border-border pb-2"
        data-testid={`record-values-${metric.factKey}`}
      >
        <legend className="mb-1 text-sm font-medium">
          {metric.label} {metric.unit ?? fallbackUnits[metric.factKey]}
        </legend>
        <div className="flex flex-wrap items-end gap-1.5">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
            {bp ? (isEnglish ? 'Systolic' : '收縮壓') : (isEnglish ? 'Value' : '數值')}
            <Input type="number" inputMode="decimal" step="any" className="h-9 min-w-14 shadow-none" aria-label={bp ? (isEnglish ? 'Systolic' : '收縮壓') : metric.label} value={displayedDraft.first} disabled={draft.restore} onChange={event => patch(index, { first: event.target.value })} />
          </label>
          {bp ? <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">{isEnglish ? 'Diastolic' : '舒張壓'}<Input type="number" inputMode="decimal" step="any" className="h-9 min-w-14 shadow-none" value={displayedDraft.second} disabled={draft.restore} onChange={event => patch(index, { second: event.target.value })} /></label> : null}
          <div className="flex w-36 flex-col gap-1 text-xs">
            <span className="flex items-center justify-between gap-2">
              <label htmlFor={dateInputId}>{isEnglish ? 'Date' : '日期'}</label>
              <button type="button" className="font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50" disabled={draft.restore || draft.date === today} onClick={() => patch(index, { date: today })}>{isEnglish ? 'Today' : '今天'}</button>
            </span>
            <Input id={dateInputId} type="date" aria-label={`${metric.label} ${isEnglish ? 'date' : '日期'}`} className="h-9 shadow-none" max={today} value={displayedDraft.date} disabled={draft.restore} onChange={event => patch(index, { date: event.target.value })} />
          </div>
          <Button type="button" variant="outline" className="h-9 px-2 text-xs shadow-none" onClick={() => patch(index, { restore: !draft.restore })}>{draft.restore ? (isEnglish ? 'Undo restore' : '取消恢復') : (isEnglish ? 'Restore default' : '恢復預設')}</Button>
        </div>
      </fieldset>
    )
  }

  const rhythmField = onSaveRhythm ? (
    <fieldset key="rhythm" className="min-w-0 border-b border-border pb-2" data-testid="record-values-rhythm">
      <legend className="mb-1 text-sm font-medium">{isEnglish ? 'Rhythm' : '心律'}</legend>
      <div className="flex items-end gap-1.5">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">{isEnglish ? 'Result' : '結果'}
          <select aria-label={isEnglish ? 'Rhythm' : '心律'} className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-sm" value={rhythmDraft} onChange={event => { setRhythmDraft(event.target.value); setRhythmDirty(true) }}>
            <option value="">{isEnglish ? 'Use record value' : '使用病歷預設值'}</option><option value="sr">Sinus rhythm</option><option value="af">AF</option>
          </select>
        </label>
        <Button type="button" variant="outline" className="h-9 px-2 text-xs shadow-none" onClick={() => { setRhythmDraft(''); setRhythmDirty(true) }}>{isEnglish ? 'Restore default' : '恢復預設'}</Button>
      </div>
    </fieldset>
  ) : null

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{isEnglish ? 'Edit clinical values' : '修改臨床數值'}</DialogTitle>
        <DialogDescription>{isEnglish ? 'Save all changes together. Restoring removes your override and uses the original record value, or leaves the field missing when no record value exists.' : '修改數值與日期後一次儲存；恢復預設會使用病歷原始值，無原始值則留空。'}</DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 flex-col gap-3" onSubmit={event => {
        event.preventDefault()
        if (valid && rhythmDirty) onSaveRhythm?.({ rhythm: rhythmDraft ? { value: rhythmDraft, measuredOn: today } : null })
        if (valid) onSave(drafts.flatMap((draft, index) => !draft.dirty ? [] : [{ metric: metrics[index], values: draft.restore ? null : (metrics[index].factKey === 'bloodPressure' ? [draft.first, draft.second] : [draft.first]).map(Number), measuredOn: draft.date }]))
      }}>
        <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
          {standaloneItems.length > 0 ? (
            <div
              className="grid grid-cols-1 gap-x-5 gap-y-2 md:grid-cols-2"
              data-testid="record-values-standalone"
            >
              {standaloneItems.map((key) => key === 'rhythm'
                ? rhythmField
                : metricField(metricByKey.get(key)!))}
            </div>
          ) : null}
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`record-values-section-${section.id}`}>
              <h3
                id={`record-values-section-${section.id}`}
                className="mb-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs font-bold text-foreground"
                data-testid={`record-values-section-${section.id}`}
              >
                {section.label}
              </h3>
              <div className="grid grid-cols-1 gap-x-5 gap-y-2 md:grid-cols-2">
                {section.items.map((key) => key === 'rhythm'
                  ? rhythmField
                  : metricField(metricByKey.get(key)!))}
              </div>
            </section>
          ))}
          {remainingMetrics.length > 0 ? (
            <section aria-labelledby="record-values-section-additional">
              <h3 id="record-values-section-additional" className="mb-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs font-bold text-foreground">
                {isEnglish ? 'Additional measurements' : '其他量測'}
              </h3>
              <div className="grid grid-cols-1 gap-x-5 gap-y-2 md:grid-cols-2">
                {remainingMetrics.map(metricField)}
              </div>
            </section>
          ) : null}
        </div>

        {!valid ? <p role="alert" className="text-sm text-destructive">{isEnglish ? 'Check the changed values and dates before saving.' : '請確認修改的數值與日期；若要移除修改值，請選「恢復預設」。'}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => { setDrafts(current => current.map(draft => ({ ...draft, dirty: true, restore: true }))); setRhythmDraft(''); setRhythmDirty(true) }}>{isEnglish ? 'Restore all defaults' : '全部恢復預設'}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>{isEnglish ? 'Cancel' : '取消'}</Button>
          <Button type="submit" disabled={!valid || !rhythmDirty && !drafts.some(draft => draft.dirty)}>{isEnglish ? 'Save all' : '儲存修改'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
