'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { storedTimestampForDisplay } from '@/src/shared/contracts/cdss-stored-save-v2'
import { cancelCdssGatewayRequests, cdssGatewayStatus, saveCdssSnapshot } from '../telemetry/cdss-gateway'
import { listCdssHistory, readCdssHistory, type CdssHistoryList, type CdssHistoryRecord } from '../telemetry/cdss-history'
import { authorizeFhir, disconnectFhir, fhirAuthStatus, fhirOAuthEnabled, subscribeFhirAuth } from '../telemetry/fhir-auth'

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value : ''
const subscribeSite = (notify: () => void) => {
  window.addEventListener('popstate', notify)
  return () => window.removeEventListener('popstate', notify)
}
const fieldNames: Record<string, string> = { clinicVitals: '門診量測', hfpefInputs: '心超輸入', phenotypeAnswer: '疾病分型',
  evidenceOverrides: '證據選擇', afAnswers: 'AF 回答', nhiLipidReview: '血脂回答', nhiLipidReviewProvenance: '血脂資料來源',
  preventInputs: 'PREVENT 回答', visitAnswers: '本次問診回答', decision: '決策', reasons: '理由', note: '備註',
  entries: '量測項目', value: '數值', measuredOn: '日期', updatedAt: '更新時間', source: '來源' }

/** Saved data only. No rule evaluation, HTML injection, or writes to current answer stores. */
function SavedFields({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) return <span>—</span>
  if (typeof value !== 'object') return <span className="whitespace-pre-wrap break-words">{String(value)}</span>
  if (depth >= 8) return <span>…</span>
  if (Array.isArray(value)) return <ul className="list-inside list-disc space-y-1">{value.map((item, index) =>
    <li key={index}><SavedFields value={item} depth={depth + 1} /></li>)}</ul>
  return <dl className="space-y-1">{Object.entries(value).map(([key, item]) => <div key={key} className="grid gap-1 border-b border-border py-1 sm:grid-cols-[10rem_1fr]">
    <dt className="break-words text-muted-foreground">{fieldNames[key] ?? key}</dt>
    <dd className="min-w-0"><SavedFields value={item} depth={depth + 1} /></dd>
  </div>)}</dl>
}

function SavedRecommendation({ value, english }: { value: unknown; english: boolean }) {
  const recommendation = object(value)
  const title = text(recommendation.title)
  const moduleName = text(recommendation.moduleName)
  const fields = [
    ['status', english ? 'Stored status' : '當時狀態'],
    ['recommendation', english ? 'Recommendation' : '建議'],
    ['rationale', english ? 'Rationale' : '判斷理由'],
    ['patientEvidence', english ? 'Patient evidence' : '病人證據'],
    ['missingData', english ? 'Missing data' : '缺少資料'],
    ['nextActions', english ? 'Next actions' : '下一步'],
    ['safetyBoundary', english ? 'Safety boundary' : '安全範圍'],
  ] as const
  return <section className="space-y-2 border-t border-border pt-2" data-testid="cdss-history-recommendation">
    <h4 className="whitespace-pre-wrap break-words font-medium">{title || moduleName}</h4>
    {title && moduleName && <p className="whitespace-pre-wrap break-words text-muted-foreground">{moduleName}</p>}
    <dl className="space-y-2">{fields.map(([key, label]) => <div key={key} className="space-y-1">
      <dt className="font-medium">{label}</dt>
      <dd className="min-w-0"><SavedFields value={recommendation[key]} /></dd>
    </div>)}</dl>
  </section>
}

export function CdssStorageActions({ input, sourceRecords, english = false, saveTarget }: {
  /** Keep the save controller mounted when its button moves into the full-window header. */
  saveTarget?: HTMLElement | null
  input: Omit<Parameters<typeof saveCdssSnapshot>[0], 'sourceRecords'>
  sourceRecords: () => Parameters<typeof saveCdssSnapshot>[0]['sourceRecords']; english?: boolean
}) {
  const enabled = useSyncExternalStore(subscribeSite, () => cdssGatewayStatus().enabled, () => false)
  const authorized = useSyncExternalStore(subscribeFhirAuth, fhirAuthStatus, () => false)
  const [authorizing, setAuthorizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [history, setHistory] = useState<CdssHistoryList | null>(null)
  const [selected, setSelected] = useState<CdssHistoryRecord | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false; controller.current?.abort(); cancelCdssGatewayRequests()
  } }, [])
  const run = async (saveId?: string) => {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setLoading(true); setError(false); setSelected(null)
    if (!saveId) setHistory(null)
    try {
      if (saveId) {
        const result = await readCdssHistory(input.patient, saveId, request.signal)
        if (!request.signal.aborted) setSelected(result)
      } else {
        const result = await listCdssHistory(input.patient, request.signal)
        if (!request.signal.aborted) setHistory(result)
      }
    } catch { if (!request.signal.aborted) setError(true) }
    finally { if (!request.signal.aborted) setLoading(false) }
  }
  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await saveCdssSnapshot({ ...input, sourceRecords: sourceRecords() })
      if (mounted.current) toast.success(english ? 'CDSS record saved.' : 'CDSS 紀錄已儲存。')
    } catch { if (mounted.current) toast.error(english ? 'Record was not saved. Please try again.' : '紀錄未儲存，請稍後重試。') }
    finally { if (mounted.current) setSaving(false) }
  }
  if (!enabled) return null
  const label = english ? 'Saved CDSS records' : 'CDSS 歷史紀錄'
  const result = object(selected?.save.result)
  const recommendations = Array.isArray(result.recommendations) ? result.recommendations : []
  const saveButton = <Button type="button" variant="outline" className="min-h-[44px] shadow-none" onClick={() => void save()} disabled={saving} aria-busy={saving} data-testid="cdss-save-record">
      {saving ? english ? 'Saving…' : '儲存中…' : english ? 'Save CDSS record' : '儲存 CDSS 紀錄'}
    </Button>
  return <div className="flex flex-wrap gap-2">
    {fhirOAuthEnabled() && <Button type="button" variant="outline" className="min-h-[44px] shadow-none" disabled={authorizing}
      data-testid="cdss-fhir-authorize" onClick={() => {
        if (authorized) { disconnectFhir(); return }
        setAuthorizing(true)
        void authorizeFhir().catch(() => { if (mounted.current) toast.error(english ? 'FHIR authorization failed. Please try again.' : 'FHIR 授權未完成，請重試。') })
          .finally(() => { if (mounted.current) setAuthorizing(false) })
      }}>{authorizing ? english ? 'Authorizing…' : '授權中…' : authorized ? english ? 'Disconnect FHIR' : '斷開 FHIR 授權' : english ? 'Authorize FHIR' : '登入 FHIR 授權'}</Button>}
    {saveTarget ? createPortal(saveButton, saveTarget) : saveButton}
    <Button type="button" variant="outline" className="min-h-[44px] shadow-none"
      onClick={() => { setOpen(true); void run() }} data-testid="cdss-history-records">{label}</Button>
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) controller.current?.abort() }}>
      <DialogContent className="sm:max-w-3xl" showCloseButton={false}>
        <DialogHeader><DialogTitle>{label}</DialogTitle>
          <DialogDescription>{english ? 'Saved snapshots for this patient. Viewing leaves the current assessment unchanged.' : '此病人的已儲存快照；調閱時保留目前的評估。'}</DialogDescription>
        </DialogHeader>
        {loading && <p role="status">{english ? 'Loading…' : '載入中…'}</p>}
        {error && <div role="alert"><p>{english ? 'Records unavailable. Please try again.' : '目前無法取得紀錄，請稍後重試。'}</p>
          <Button type="button" variant="outline" className="mt-2 min-h-[44px]" onClick={() => void run()}>{english ? 'Retry' : '重試'}</Button></div>}
        {!loading && !error && !selected && history && <div className="space-y-2">
          {history.records.length === 0 && <p>{english ? 'No saved records.' : '尚無儲存紀錄。'}</p>}
          {history.records.map(item => <Button key={item.saveId} type="button" variant="outline" className="h-auto min-h-[44px] w-full justify-start whitespace-normal text-left shadow-none"
            onClick={() => void run(item.saveId)}><span className="min-w-0 break-words">{new Date(item.receivedAt).toLocaleString(english ? 'en' : 'zh-TW')} · {item.packId}</span></Button>)}
          {history.hasMore && <p className="text-muted-foreground">{english ? 'Showing the 10 most recently received records.' : '目前顯示最近收到的 10 筆紀錄。'}</p>}
        </div>}
        {!loading && !error && selected && <article className="space-y-4 text-sm">
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setSelected(null)}>{english ? 'Back to records' : '返回清單'}</Button>
          <header><h3 className="font-semibold">{text(result.title) || selected.packId}</h3>
            <p>{english ? 'Saved at: ' : '儲存時間：'}{new Date(storedTimestampForDisplay(selected.savedAt)).toLocaleString(english ? 'en' : 'zh-TW')}</p>
            <p className="text-muted-foreground">{english ? 'Historical snapshot · clinician identity unverified' : '歷史快照・醫師身分尚未驗證'}</p></header>
          <p className="whitespace-pre-wrap break-words">{text(result.summary)}</p>
          {recommendations.map((item, index) => <SavedRecommendation key={index} value={item} english={english} />)}
          <details><summary className="min-h-[44px] cursor-pointer py-3 font-medium">{english ? 'Clinician inputs' : '人工輸入'}</summary><SavedFields value={selected.save.physician_inputs} /></details>
          <details><summary className="min-h-[44px] cursor-pointer py-3 font-medium">{english ? 'Clinician decisions' : '醫師決策'}</summary><SavedFields value={selected.save.physician_decisions} /></details>
        </article>}
        <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => { setOpen(false); controller.current?.abort() }}>{english ? 'Close' : '關閉'}</Button>
      </DialogContent>
    </Dialog>
  </div>
}
