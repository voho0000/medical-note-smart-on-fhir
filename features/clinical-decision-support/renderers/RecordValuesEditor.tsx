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
    <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{isEnglish ? 'Edit clinical values' : '修改臨床數值'}</DialogTitle>
        <DialogDescription>{isEnglish ? 'Save all changes together. Restoring removes your override and uses the original record value, or leaves the field missing when no record value exists.' : '一次儲存所有修改。恢復預設會移除醫師修改值，重新使用病歷原始值；病歷未記錄的欄位則恢復為未填。'}</DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 flex-col gap-3" onSubmit={event => {
        event.preventDefault()
        if (valid) onSave(drafts.flatMap((draft, index) => !draft.dirty ? [] : [{ metric: metrics[index], values: draft.restore ? null : (metrics[index].factKey === 'bloodPressure' ? [draft.first, draft.second] : [draft.first]).map(Number), measuredOn: draft.date }]))
      }}>
        <div className="min-h-0 space-y-3 overflow-y-auto pr-2">
          {metrics.map((metric, index) => {
            const draft = drafts[index]
            const bp = metric.factKey === 'bloodPressure'
            return <fieldset key={metric.factKey} className="rounded-md border border-border p-3" data-testid={`record-values-${metric.factKey}`}>
              <legend className="px-1 text-sm font-medium">{metric.label} {metric.unit ?? ({ LVEF: '%', bloodPressure: 'mmHg', heartRate: 'bpm', potassium: 'mmol/L', eGFR: 'mL/min/1.73m²', sodium: 'mmol/L', bodyWeight: 'kg', NTproBNP: 'pg/mL' } as Record<string, string>)[metric.factKey]}</legend>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                  {bp ? (isEnglish ? 'Systolic' : '收縮壓') : (isEnglish ? 'Value' : '數值')}
                  <Input type="number" inputMode="decimal" step="any" className="h-11 min-w-20" aria-label={bp ? (isEnglish ? 'Systolic' : '收縮壓') : metric.label} value={draft.first} disabled={draft.restore} onChange={event => patch(index, { first: event.target.value })} />
                </label>
                {bp ? <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">{isEnglish ? 'Diastolic' : '舒張壓'}<Input type="number" inputMode="decimal" step="any" className="h-11 min-w-20" value={draft.second} disabled={draft.restore} onChange={event => patch(index, { second: event.target.value })} /></label> : null}
                <label className="flex flex-col gap-1 text-xs">{isEnglish ? 'Measurement / test date' : '量測／檢驗日期'}<Input type="date" aria-label={`${metric.label} ${isEnglish ? 'date' : '日期'}`} className="h-11" max={today} value={draft.date} disabled={draft.restore} onChange={event => patch(index, { date: event.target.value })} /></label>
                <Button type="button" variant="ghost" className="h-11" onClick={() => patch(index, { restore: !draft.restore })}>{draft.restore ? (isEnglish ? 'Undo restore' : '取消恢復') : (isEnglish ? 'Restore default' : '恢復預設')}</Button>
              </div>
              {draft.restore ? <p className="mt-2 text-xs text-muted-foreground">{isEnglish ? 'The original record value will be used after saving.' : '儲存後恢復病歷原始值；沒有原始值則恢復為未填。'}</p> : null}
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
