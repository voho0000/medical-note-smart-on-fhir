"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { todayIsoDate, type ClinicVitals, type ClinicVitalsPatch } from '../stores/clinic-vitals.store'
import { EMPTY_HF_HISTORY, type HfFollowUpHistory, type SymptomChange, type FollowUpComplaint } from '../utils/hf-follow-up'

export function HfFollowUpPriorities({ history = EMPTY_HF_HISTORY, vitals, onSave, now, isEnglish, onBreathDetails }: {
  history?: HfFollowUpHistory; vitals?: ClinicVitals; onSave?: (patch: ClinicVitalsPatch) => void; now: Date; isEnglish: boolean; onBreathDetails: () => void
}) {
  const today = todayIsoDate(now)
  const [text, setText] = useState('')
  const [date, setDate] = useState(today)
  const [weight, setWeight] = useState('')
  const [weightDate, setWeightDate] = useState(today)
  const local = vitals?.hfFollowUp ?? EMPTY_HF_HISTORY
  const complaints = [...history.complaints, ...local.complaints].filter(item => item.date <= today)
  const previousDate = complaints.filter(item => item.date < today).map(item => item.date).sort().at(-1)
  const previous = complaints.filter(item => item.date === previousDate)
  const current = complaints.filter(item => item.date === today)
  const recordedRows = [...new Map([...previous, ...current].map(item => [item.text, item])).values()]
  const rows = recordedRows.some(item => /喘|breath|dyspn/i.test(item.text)) ? recordedRows : [{ text: isEnglish ? 'Breathlessness' : '喘', date: today, source: 'clinic' }, ...recordedRows]
  const weightChange = local.weightChanges?.find(item => item.date === today)?.value
  const saveComplaint = (item: FollowUpComplaint) => onSave?.({ hfFollowUp: { ...local, complaints: [...local.complaints.filter(row => !(row.date === item.date && row.text === item.text)), { ...local.complaints.find(row => row.date === item.date && row.text === item.text), ...item }] } })
  const points = [...new Map([...history.weights, ...local.weights, ...(vitals?.entries.bodyWeight ? [{ value: vitals.entries.bodyWeight.value, date: vitals.entries.bodyWeight.measuredOn, source: 'clinic' }] : [])].filter(point => point.date <= today).sort((a, b) => a.date.localeCompare(b.date)).map(point => [point.date, point])).values()]
  const latest = points.at(-1)
  const prior = points.at(-2)
  const currentWeight = latest?.date === today ? latest : undefined
  const range = points.slice(-12)
  const low = Math.min(...range.map(point => point.value))
  const high = Math.max(...range.map(point => point.value))
  const start = Date.parse(range[0]?.date ?? today)
  const end = Date.parse(range.at(-1)?.date ?? today)
  const xy = range.map(point => `${10 + (Date.parse(point.date) - start) / Math.max(1, end - start) * 280},${70 - (point.value - low) / Math.max(1, high - low) * 50}`).join(' ')
  const choices: [SymptomChange, string, string][] = [['worse', '惡化', 'Worse'], ['unchanged', '穩定', 'Stable'], ['improved', '進步', 'Improved']]
  const sourceName = (source: string) => source === 'clinic' ? (isEnglish ? 'Clinic entry' : '門診輸入') : source
  return <div className="space-y-4 px-3 py-3" data-testid="cdss-followup-priorities">
    <section className="space-y-3" aria-label={isEnglish ? 'Chief complaint follow-up' : '主訴追蹤'}>
      <h4 className="font-semibold">{isEnglish ? 'Chief complaint · change since last visit' : '主要主訴・與上次相比'}</h4>
      <p className="text-xs text-muted-foreground">{previousDate ? `${isEnglish ? 'Previous record' : '上次紀錄'}：${previousDate}` : (isEnglish ? 'No previous chief complaint available. Add the symptom to follow.' : '未取得上次主訴，請新增要追蹤的症狀。')}</p>
      {rows.map(item => { const answer = current.find(row => row.text === item.text); const baseline = previous.find(row => row.text === item.text); return <div key={item.text} className="space-y-2 rounded-md border border-border bg-card p-3">
        <p className="break-words font-medium">{item.text}</p>
        <p className="break-words text-xs text-muted-foreground">{baseline ? `${baseline.date} · ${sourceName(baseline.source)}` : answer ? `${item.date} · ${sourceName(item.source)}` : (isEnglish ? 'Not yet recorded' : '尚未記錄')}</p>
        {!answer?.change ? <p data-cdss-action="" className="text-sm">{isEnglish ? 'Confirm today’s symptom status' : '請確認本次症狀變化'}</p> : null}
        {answer?.change === 'worse' ? <p data-cdss-action="" className="text-sm">{isEnglish ? 'Worsening reported · review this visit' : '主訴加重・請於本次評估'}</p> : null}
        <div role="group" aria-label={`${item.text} ${isEnglish ? 'change' : '變化'}`} className="flex flex-wrap gap-1">{choices.map(([value, zh, en]) => <Button key={value} variant={answer?.change === value ? 'default' : 'outline'} className="min-h-11" disabled={!onSave} aria-pressed={answer?.change === value} onClick={() => saveComplaint({ text: item.text, date: today, source: 'clinic', change: value, comparedWith: baseline?.date })}>{isEnglish ? en : zh}</Button>)}</div>
        {answer?.change === 'resolved' ? <p className="text-sm">{isEnglish ? 'Previously recorded: resolved' : '既有紀錄：已消失'}</p> : null}
        <details data-testid="cdss-symptom-details"><summary className="min-h-11 cursor-pointer py-3 text-sm">{isEnglish ? 'Record details' : '展開紀錄細節'}{answer?.note ? (isEnglish ? ' · note saved' : '・已記錄') : ''}</summary>
          <label className="block text-sm">{isEnglish ? 'Details (saved on leaving field)' : '補充細節（離開欄位時儲存）'}<Input key={`${item.text}-${today}`} defaultValue={answer?.note ?? ''} disabled={!onSave} maxLength={1000} onBlur={event => { if (event.target.value !== (answer?.note ?? '')) saveComplaint({ text: item.text, date: today, source: 'clinic', note: event.target.value, comparedWith: baseline?.date }) }} /></label>
          {/喘|breath|dyspn/i.test(item.text) ? <Button variant="outline" className="mt-2 min-h-11" onClick={onBreathDetails}>{isEnglish ? 'Breathlessness assessment' : '記錄喘的細節'}</Button> : null}
        </details>
      </div> })}
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm">{isEnglish ? 'Add another complaint' : '新增／補記其他主訴'}</summary>
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (!text.trim() || !date || date > today) return; saveComplaint({ text: text.trim(), date, source: 'clinic' }); setText('') }}>
        <label className="block text-sm">{isEnglish ? 'Add / supplement chief complaint' : '新增／補記主訴'}<Input value={text} maxLength={500} onChange={event => setText(event.target.value)} placeholder={isEnglish ? 'e.g. breathlessness when walking' : '例如：走路會喘、腳腫'} disabled={!onSave} /></label>
        <label className="block text-sm">{isEnglish ? 'Complaint date' : '主訴日期'}<Input type="date" value={date} max={today} onChange={event => setDate(event.target.value)} disabled={!onSave} /></label>
        <Button variant="outline" type="submit" disabled={!onSave || !text.trim() || !date || date > today}>{isEnglish ? 'Save complaint' : '儲存主訴'}</Button>
      </form>
      </details>
    </section>
    <section className="space-y-3 border-t border-border pt-3" aria-label={isEnglish ? 'Weight trend' : '體重趨勢'}>
      <h4 className="font-semibold">{isEnglish ? 'Weight · kg' : '體重・kg'}</h4>
      <div role="group" aria-label={isEnglish ? 'Weight change' : '體重變化'} className="flex flex-wrap gap-1">{([['increased', '增加', 'Increased'], ['unchanged', '不變', 'Unchanged'], ['decreased', '減少', 'Decreased']] as const).map(([value, zh, en]) => <Button key={value} variant={weightChange === value ? 'default' : 'outline'} className="min-h-11" disabled={!onSave} aria-pressed={weightChange === value} onClick={() => onSave?.({ hfFollowUp: { ...local, weightChanges: [...(local.weightChanges ?? []).filter(item => item.date !== today), { date: today, value }] } })}>{isEnglish ? en : zh}</Button>)}</div>
      <p className="text-xs text-muted-foreground">{isEnglish ? 'Reported change this visit; measured values are shown separately.' : '本次回報的體重變化；實際量測差值另列如下。'}</p>
      <p>{isEnglish ? 'Today' : '本日'}：{currentWeight ? `${currentWeight.value.toFixed(1)} kg` : (isEnglish ? 'Not recorded' : '尚未量測')}</p>
      <details data-testid="cdss-weight-records"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{isEnglish ? 'Weight records · chart and new entry' : '體重紀錄・圖表與新增量測'}</summary>
      {latest ? <p className="text-sm">{isEnglish ? 'Latest' : '最近一次'}：{latest.value.toFixed(1)} kg · {latest.date}{prior ? ` ／ ${isEnglish ? 'Previous' : '前次'}：${prior.value.toFixed(1)} kg · ${prior.date} ／ Δ ${(latest.value - prior.value).toFixed(1)} kg` : ''}</p> : <p data-cdss-action="" className="text-sm">{isEnglish ? 'Record weight to start tracking' : '請記錄體重以開始追蹤'}</p>}
      {range.length > 1 ? <svg viewBox="0 0 300 90" role="img" aria-label={isEnglish ? 'Weight trend; dated measurements below' : '體重趨勢，日期與數值詳見下表'} className="h-28 w-full text-primary"><polyline points={xy} fill="none" stroke="currentColor" strokeWidth="2" />{xy.split(' ').map((pair, index) => <circle key={range[index].date} cx={pair.split(',')[0]} cy={pair.split(',')[1]} r="3" fill="currentColor" />)}</svg> : <p className="text-xs text-muted-foreground">{isEnglish ? 'At least two dated weights are needed for a trend.' : '至少兩筆不同日期的體重才能顯示趨勢。'}</p>}
      {range.length > 1 ? <p className="text-xs text-muted-foreground">{range[0].date} → {range.at(-1)?.date} · {low.toFixed(1)}–{high.toFixed(1)} kg</p> : null}
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm">{isEnglish ? 'Measurements and sources' : '量測紀錄與來源'}</summary><ul className="space-y-1 text-xs">{range.map(point => <li key={point.date} className="break-words">{point.date} · {point.value.toFixed(1)} kg · {sourceName(point.source)}</li>)}</ul></details>
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); const value = Number(weight); if (!Number.isFinite(value) || value <= 0 || !weightDate || weightDate > today) return; onSave?.({ entries: { bodyWeight: { value, measuredOn: weightDate } } }); setWeight('') }}>
        <label className="block text-sm">{isEnglish ? 'Weight (kg)' : '輸入體重（kg）'}<Input type="number" step="0.1" min="0.1" value={weight} onChange={event => setWeight(event.target.value)} disabled={!onSave} /></label>
        <label className="block text-sm">{isEnglish ? 'Measurement date' : '量測日期'}<Input type="date" max={today} value={weightDate} onChange={event => setWeightDate(event.target.value)} disabled={!onSave} /></label>
        <Button variant="outline" type="submit" disabled={!onSave || !weight || Number(weight) <= 0 || !weightDate || weightDate > today}>{isEnglish ? 'Save weight' : '儲存體重'}</Button>
      </form>
      </details>
    </section>
  </div>
}
