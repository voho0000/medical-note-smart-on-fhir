"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import type { PhenotypeAnswer } from '../stores/phenotype-answer.store'
import { todayIsoDate } from '../stores/clinic-vitals.store'

/** Confirmation changes workflow only; it never guesses a phenotype or test result. */
export function HfDiagnosisConfirmation({ answer, onConfirm, now, isEnglish, basis, followUp }: {
  answer?: PhenotypeAnswer
  onConfirm?: (answer: PhenotypeAnswer) => void
  now: Date
  isEnglish: boolean
  basis: string
  followUp: boolean
}) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<'current' | 'existing'>('existing')
  const [note, setNote] = useState('')
  const confirmation = answer?.diagnosisConfirmation
  return <div className="space-y-2 px-4 py-3" data-testid="cdss-diagnosis-confirmation">
    {followUp ? <p className="text-sm font-medium">{isEnglish ? 'Established heart-failure diagnosis' : '心衰竭診斷已確認'}</p> : null}
    {confirmation ? <p className="break-words text-xs text-muted-foreground">{confirmation.method === 'existing' ? (isEnglish ? 'Existing diagnosis adopted' : '沿用既有確診') : (isEnglish ? 'Confirmed this visit' : '本次確認診斷')} · {new Date(confirmation.confirmedAt).toLocaleString(isEnglish ? 'en-US' : 'zh-TW')}<br />{confirmation.basis}</p> : onConfirm ? <Button variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => setOpen(true)}>{followUp ? (isEnglish ? 'Record diagnosis confirmation' : '補記診斷確認紀錄') : (isEnglish ? 'Confirm diagnosis and enter follow-up' : '確認診斷並進入追蹤')}</Button> : null}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>{isEnglish ? 'Confirm heart-failure diagnosis' : '確認心衰竭診斷'}</DialogTitle>
        <DialogDescription>{isEnglish ? 'After confirmation, diagnosis is collapsed and follow-up opens. You can reopen diagnostic evidence at any time.' : '確認後收起診斷模組，開啟追蹤模組；仍可隨時展開診斷依據。'}</DialogDescription>
        <p className="break-words text-sm">{basis}</p>
        <label className="space-y-2 text-sm">{isEnglish ? 'Confirmation method' : '確認方式'}
          <select className="block min-h-11 w-full rounded-md border bg-background px-3" value={method} onChange={event => setMethod(event.target.value as 'current' | 'existing')}>
            <option value="existing">{isEnglish ? 'Adopt an established diagnosis' : '沿用既有確診'}</option>
            <option value="current">{isEnglish ? 'Confirm at this visit' : '本次確認診斷'}</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">{isEnglish ? 'Source / note (optional)' : '診斷來源／備註（選填）'}<Input value={note} onChange={event => setNote(event.target.value)} /></label>
        <p className="text-xs text-muted-foreground">{isEnglish ? 'Missing phenotype data remains pending. Confirmation does not assign an HF subtype.' : '尚缺的分型資料仍保留待辦，確認心衰竭不會自動指定分型。'}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{isEnglish ? 'Cancel' : '取消'}</Button>
          <Button onClick={() => { onConfirm?.({ ...answer, hfSuspicion: 'suspected', answeredOn: todayIsoDate(now), diagnosisConfirmation: { method, confirmedAt: new Date().toISOString(), basis: [basis, note.trim()].filter(Boolean).join(' · ') } }); setOpen(false) }}>{isEnglish ? 'Confirm and enter follow-up' : '確認並進入追蹤'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
