"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { HeartFailureMetric } from './heart-failure-board'
import { todayIsoDate } from '../stores/clinic-vitals.store'

export function RecordMetricEditor({ metric, isEnglish, now, onSave, onRestore, onClose }: {
  metric: HeartFailureMetric
  isEnglish: boolean
  now: Date
  onSave: (values: number[], date: string) => void
  onRestore: () => void
  onClose: () => void
}) {
  const bp = metric.factKey === 'bloodPressure'
  const text = metric.value?.replace(/,/g, '') ?? ''
  const numbers = /[<>≤≥]/.test(text) ? [] : text.match(/\d+(?:\.\d+)?/g) ?? []
  const [first, setFirst] = useState(numbers[0] ?? '')
  const [second, setSecond] = useState(bp ? numbers[1] ?? '' : '')
  const [date, setDate] = useState(metric.date?.slice(0, 10) ?? todayIsoDate(now))
  const values = (bp ? [first, second] : [first]).map(Number)
  const valid = first.trim() !== '' && (!bp || second.trim() !== '') && values.every(Number.isFinite)
    && values.every(v => metric.factKey === 'NTproBNP' ? v >= 0 : v > 0)
    && (metric.factKey !== 'LVEF' || values[0] <= 100)
    && (!bp || values[0] > values[1]) && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && date <= todayIsoDate(now)
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isEnglish ? 'Edit' : '修改'} {metric.label}</DialogTitle>
        <DialogDescription>{isEnglish ? 'Enter the measured value and date. The care recommendations will be recalculated.' : '填入實際數值與量測／檢驗日期，儲存後重新計算照護建議。'}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (valid) onSave(values, date) }}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {bp ? (isEnglish ? 'Systolic' : '收縮壓') : metric.label}
            <Input autoFocus type="number" inputMode="decimal" step="any" value={first} onChange={e => setFirst(e.target.value)} className="h-11 w-32" />
          </label>
          {bp ? <label className="flex flex-col gap-1 text-sm">
            {isEnglish ? 'Diastolic' : '舒張壓'}
            <Input type="number" inputMode="decimal" step="any" value={second} onChange={e => setSecond(e.target.value)} className="h-11 w-32" />
          </label> : null}
          <span className="pb-3 text-sm text-muted-foreground">{metric.unit ?? (metric.factKey === 'LVEF' ? '%' : '')}</span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          {isEnglish ? 'Measurement / test date' : '量測／檢驗日期'}
          <Input type="date" value={date} max={todayIsoDate(now)} required onChange={e => setDate(e.target.value)} className="h-11" />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          {metric.entered ? <Button type="button" variant="outline" onClick={onRestore}>{isEnglish ? 'Restore record value' : '恢復病歷數值'}</Button> : null}
          <Button type="button" variant="ghost" onClick={onClose}>{isEnglish ? 'Cancel' : '取消'}</Button>
          <Button type="submit" disabled={!valid}>{isEnglish ? 'Save' : '儲存'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
