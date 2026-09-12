"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { todayIsoDate } from '../stores/clinic-vitals.store'
import type { HeartFailureMetric } from './heart-failure-board'

export interface RecordValueChange {
  metric: HeartFailureMetric
  values: number[] | null
  measuredOn: string
}

export function RecordValuesEditor({ metrics, isEnglish, now, onSave, onClose }: {
  metrics: readonly HeartFailureMetric[]
  isEnglish: boolean
  now: Date
  onSave: (changes: RecordValueChange[]) => void
  onClose: () => void
}) {
  const columnOrder = ['LVEF', 'NTproBNP', 'eGFR', 'potassium', 'sodium', 'bloodPressure', 'heartRate', 'oxygenSaturation', 'bodyWeight', 'bodyHeight']
  const orderedMetrics = metrics.map((metric, index) => ({ metric, index })).sort((a, b) => {
    const rank = (key: string) => { const index = columnOrder.indexOf(key); return index < 0 ? columnOrder.length : index }
    return rank(a.metric.factKey) - rank(b.metric.factKey)
  })
  const today = todayIsoDate(now)
  const [drafts, setDrafts] = useState(() => metrics.map(metric => {
    const text = metric.value?.replace(/,/g, '') ?? ''
    const numbers = /[<>≤≥]/.test(text) ? [] : text.match(/\d+(?:\.\d+)?/g) ?? []
    return { first: numbers[0] ?? '', second: metric.factKey === 'bloodPressure' ? numbers[1] ?? '' : '', date: metric.date?.slice(0, 10) ?? today, dirty: false, restore: false }
  }))
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
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>{isEnglish ? 'Edit clinical values' : '修改臨床數值'}</DialogTitle>
        <DialogDescription>{isEnglish ? 'Save all changes together. Restoring removes your override and uses the original record value, or leaves the field missing when no record value exists.' : '修改數值與日期後一次儲存；恢復預設會使用病歷原始值，無原始值則留空。'}</DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 flex-col gap-3" onSubmit={event => {
        event.preventDefault()
        if (valid) onSave(drafts.flatMap((draft, index) => !draft.dirty ? [] : [{ metric: metrics[index], values: draft.restore ? null : (metrics[index].factKey === 'bloodPressure' ? [draft.first, draft.second] : [draft.first]).map(Number), measuredOn: draft.date }]))
      }}>
        <div className="grid min-h-0 grid-cols-1 gap-x-5 gap-y-2 overflow-y-auto pr-1 md:grid-cols-2 md:grid-flow-col md:grid-rows-5">
          {orderedMetrics.map(({ metric, index }) => {
            const draft = drafts[index]
            const bp = metric.factKey === 'bloodPressure'
            return <fieldset key={metric.factKey} className="min-w-0 border-b border-border pb-2" data-testid={`record-values-${metric.factKey}`}>
              <legend className="mb-1 text-sm font-medium">{metric.label} {metric.unit ?? ({ LVEF: '%', bloodPressure: 'mmHg', heartRate: 'bpm', potassium: 'mmol/L', eGFR: 'mL/min/1.73m²', sodium: 'mmol/L', bodyWeight: 'kg', NTproBNP: 'pg/mL' } as Record<string, string>)[metric.factKey]}</legend>
              <div className="flex flex-wrap items-end gap-1.5">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                  {bp ? (isEnglish ? 'Systolic' : '收縮壓') : (isEnglish ? 'Value' : '數值')}
                  <Input type="number" inputMode="decimal" step="any" className="h-9 min-w-14 shadow-none" aria-label={bp ? (isEnglish ? 'Systolic' : '收縮壓') : metric.label} value={draft.first} disabled={draft.restore} onChange={event => patch(index, { first: event.target.value })} />
                </label>
                {bp ? <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">{isEnglish ? 'Diastolic' : '舒張壓'}<Input type="number" inputMode="decimal" step="any" className="h-9 min-w-14 shadow-none" value={draft.second} disabled={draft.restore} onChange={event => patch(index, { second: event.target.value })} /></label> : null}
                <label className="flex flex-col gap-1 text-xs">{isEnglish ? 'Date' : '日期'}<Input type="date" aria-label={`${metric.label} ${isEnglish ? 'date' : '日期'}`} className="h-9 w-36 shadow-none" max={today} value={draft.date} disabled={draft.restore} onChange={event => patch(index, { date: event.target.value })} /></label>
                <Button type="button" variant="outline" className="h-9 px-2 text-xs shadow-none" onClick={() => patch(index, { restore: !draft.restore })}>{draft.restore ? (isEnglish ? 'Undo restore' : '取消恢復') : (isEnglish ? 'Restore default' : '恢復預設')}</Button>
              </div>
            </fieldset>
          })}
        </div>
        {!valid ? <p role="alert" className="text-sm text-destructive">{isEnglish ? 'Check the changed values and dates before saving.' : '請確認修改的數值與日期；若要移除修改值，請選「恢復預設」。'}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => setDrafts(current => current.map(draft => ({ ...draft, dirty: true, restore: true })))}>{isEnglish ? 'Restore all defaults' : '全部恢復預設'}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>{isEnglish ? 'Cancel' : '取消'}</Button>
          <Button type="submit" disabled={!valid || !drafts.some(draft => draft.dirty)}>{isEnglish ? 'Save all' : '儲存修改'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
