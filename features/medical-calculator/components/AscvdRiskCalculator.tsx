"use client"

import { useEffect } from 'react'
import type { CdssPatientProfile } from '@voho0000/personalized-care'
import { Button } from '@/components/ui/button'
import { ASCVD_VHR_CALCULATOR } from '../calculators/ascvd-vhr'
import { buildAscvdRiskReading } from '../ascvd-risk-profile'
import { useAscvdRiskInputs, useAscvdRiskInputsStore } from '../stores/ascvd-risk-inputs.store'

/** The same Medical Calculator input/result component is embedded by CDSS.
 * Its inputs, computation, storage and citations remain owned by this module. */
export function AscvdRiskCalculator({ profile, isEnglish = false }: { profile: CdssPatientProfile; isEnglish?: boolean }) {
  const patientId = profile.id
  const inputs = useAscvdRiskInputs(patientId)
  const hydrated = useAscvdRiskInputsStore(state => state.hydratedPatientIds[patientId])
  useEffect(() => { useAscvdRiskInputsStore.getState().hydrate(patientId) }, [patientId])
  const reading = buildAscvdRiskReading(profile, inputs, isEnglish ? 'en' : 'zh-TW')
  const result = reading.result
  return <div className="space-y-3 px-3 py-3 text-xs" data-testid="ascvd-risk-calculator">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-xs text-muted-foreground">{isEnglish ? 'Medical Calculator · AHA/ACC 2023 Table 10 · v1' : '醫療計算機 · AHA/ACC 2023 Table 10 · v1'}</p>
        <h3 className="mt-1 text-sm font-semibold">{!hydrated ? (isEnglish ? 'Loading saved inputs…' : '讀取已儲存輸入…') : isEnglish ? result.interpretation!.en : result.interpretation!.zh}</h3>
        <p className="mt-1 text-muted-foreground" data-testid="ascvd-risk-counts">{!hydrated ? '—' : isEnglish ? `Confirmed: ≥${result.majorEvents} major event(s) · ${result.highRiskConditions} high-risk conditions · ${result.missing.length} unconfirmed` : `已確認主要事件至少 ${result.majorEvents} 項 · 高風險條件 ${result.highRiskConditions} 項 · 未確認 ${result.missing.length} 項`}</p>
      </div>
      <Button variant="ghost" size="sm" className="min-h-11" disabled={!hydrated} onClick={() => useAscvdRiskInputsStore.getState().clearInputs(patientId)}>{isEnglish ? 'Restore chart inputs' : '還原病歷帶入值'}</Button>
    </div>
    <p className="leading-relaxed text-muted-foreground">{isEnglish ? result.notes!.en : result.notes!.zh}</p>
    <details className="rounded-md border border-border" data-testid="ascvd-risk-inputs">
      <summary className="min-h-11 cursor-pointer px-3 py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{isEnglish ? 'Review / complete calculator inputs' : '檢視／補齊計算機輸入'}</summary>
      <div className="divide-y divide-border border-t border-border px-3">
        {ASCVD_VHR_CALCULATOR.inputs.map(input => {
          const row = reading.table.items.find(item => item.id === input.key)
          const excluded = reading.excluded.includes(input.key)
          return <div key={input.key} className="grid gap-2 py-3 @min-[36rem]:grid-cols-[1fr_12rem]">
            <div><label htmlFor={`ascvd-${input.key}`} className="font-medium">{isEnglish ? input.label.en : input.label.zh}</label>
              <p className="mt-1 leading-relaxed text-muted-foreground">{excluded ? (isEnglish ? 'Evidence excluded; re-enable it in the evidence table before using it.' : '此列證據已排除；如要採用，請先在證據表重新啟用。') : inputs?.entries[input.key] ? (isEnglish ? 'Physician-confirmed · ' : '醫師確認 · ') + inputs.entries[input.key].modifiedAt.slice(0, 10) : row?.value ?? (isEnglish ? 'No chart data' : '病歷未提供')}{!inputs?.entries[input.key] && row?.date ? ` · ${row.date.slice(0, 10)}` : ''}</p>
            </div>
            <select id={`ascvd-${input.key}`} data-testid={`ascvd-input-${input.key}`} disabled={!hydrated || excluded} value={reading.values[input.key]} className="min-h-11 w-full self-start rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              onChange={event => useAscvdRiskInputsStore.getState().setInputs(patientId, { [input.key]: { value: event.target.value } })}>
              {input.options.map(option => <option key={option.value} value={option.value}>{isEnglish ? option.label.en : option.label.zh}</option>)}
            </select>
          </div>
        })}
      </div>
    </details>
    <p className="text-muted-foreground">{isEnglish ? 'Inputs stay with this patient in this browser tab and update the coronary CDSS.' : '輸入依病人儲存在此瀏覽器分頁，並同步更新冠心病 CDSS。'} <a className="text-primary underline underline-offset-2" href="https://doi.org/10.1016/j.jacc.2023.04.003" target="_blank" rel="noreferrer">AHA/ACC 2023 · Table 10 · p.867</a></p>
  </div>
}
