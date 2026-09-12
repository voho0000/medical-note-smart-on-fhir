'use client'
import { useId } from 'react'
import { PREVENT_ASCVD, PREVENT_RANGES } from '../calculators/prevent'
import type { PreventReading } from '../prevent-reading'
import type { PreventInputsPatch } from '../prevent-inputs.store'
import { CALC_SCORING } from '../calculators/scoring'
import { tr } from '../types'

export function PreventCalculatorPanel({ reading, locale, onChange, onReset, ready = true }: {
  reading: PreventReading; locale: string; onChange: (patch: PreventInputsPatch) => void; onReset?: () => void; ready?: boolean
}) {
  const id = useId()
  const en = locale === 'en'
  const result = reading.result
  return <div className="space-y-3 border-t border-border p-4" data-testid="prevent-calculator">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{en ? 'Medical Calculator · PREVENT' : '醫療計算機 · PREVENT'}</h4>{onReset ? <button type="button" disabled={!ready} onClick={onReset} className="min-h-11 text-xs text-primary underline">{en ? 'Restore record values' : '還原病歷資料'}</button> : null}</div>
    <div aria-live="polite" className="rounded-md bg-muted/40 p-3 text-sm leading-relaxed">
      {!ready ? (en ? 'Loading saved inputs…' : '正在讀取已保存的輸入…') : reading.excluded ? (en ? 'Not applicable: known cardiovascular disease. Use the corresponding disease pathway.' : '不適用：已有心血管疾病，請依對應疾病路徑評估。') : result ? <><strong className="text-xl tabular-nums">{result.value}%</strong> {en ? '10-year ASCVD risk' : '10 年 ASCVD 風險'}<div className="mt-1 text-xs">{result.risk.ascvd30 !== undefined ? `${en ? '30-year ASCVD risk' : '30 年 ASCVD 風險'} ${result.risk.ascvd30.toFixed(1)}%` : (en ? '30-year estimate applies only at ages 30–59.' : '30 年風險僅適用 30–59 歲。')}</div></> : <>{en ? 'Complete or correct: ' : '請補齊或修正：'}{reading.invalid.map(key => tr(locale, PREVENT_ASCVD.inputs.find(input => input.key === key)!.label)).join('、')}</>}
    </div>
    <details open={!reading.excluded && !result}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{en ? 'Inputs and sources' : '計算資料與來源'}</summary>
      <fieldset disabled={!ready} className="grid min-w-0 gap-3 sm:grid-cols-2">
        {PREVENT_ASCVD.inputs.map(input => {
          const meta = reading.inputs.find(item => item.key === input.key)!
          const range = PREVENT_RANGES[input.key]
          const invalid = reading.invalid.includes(input.key)
          return <div key={input.key} className="min-w-0"><label htmlFor={`${id}-${input.key}`} className="mb-1 block text-xs font-medium">{tr(locale, input.label)}{input.type === 'number' && input.unit ? ` (${input.unit})` : ''}</label>
            {input.type === 'select' ? <select id={`${id}-${input.key}`} value={reading.values[input.key]} disabled={input.key === 'cvd' && meta.origin === 'record'} onChange={event => onChange({ [input.key]: { value: event.target.value } })} className="min-h-11 w-full rounded-md border border-input bg-background px-2 text-sm"><option value="">{en ? 'Confirm' : '請確認'}</option>{input.options.map(option => <option key={option.value} value={option.value}>{tr(locale, option.label)}</option>)}</select> : <input id={`${id}-${input.key}`} type="number" step="any" min={range?.[0]} max={range?.[1]} aria-invalid={invalid && !!reading.values[input.key]} value={reading.values[input.key]} onChange={event => onChange({ [input.key]: { value: event.target.value } })} placeholder={range?.join('–')} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />}
            <p className="mt-1 text-xs text-muted-foreground">{meta.origin === 'manual' ? (en ? 'You entered' : '本次輸入') : meta.origin === 'record' ? (en ? 'From record' : '病歷帶入') : (en ? 'Not confirmed' : '尚未確認')}{meta.date ? ` · ${meta.date.slice(0, 10)}` : ''}{meta.invalidUnit ? (en ? ' · Incompatible unit; enter a confirmed value' : ' · 單位無法換算，請核對後輸入') : ''}{input.type === 'number' && range ? ` · ${en ? 'Model range' : '模型範圍'} ${range.join('–')}` : ''}</p>
          </div>
        })}
      </fieldset>
    </details>
    <p className="text-xs leading-relaxed text-muted-foreground">{en ? 'Base model; no UACR, HbA1c or social deprivation index. Ages 30–79 without known CVD. Confirm that dated measurements and current medications describe this visit. US model, not recalibrated for Taiwan.' : '基礎模型，未加入 UACR、HbA1c 或社會剝奪指數。適用 30–79 歲且無已知心血管疾病者。請核對各筆日期與目前用藥是否符合本次評估；此美國模型尚未經台灣族群再校準。'}</p>
    <details><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">{en ? 'Calculation method' : '計算說明'}</summary><p className="text-xs leading-relaxed">{tr(locale, CALC_SCORING['prevent-ascvd'].formula!)} {tr(locale, CALC_SCORING['prevent-ascvd'].note!)}</p></details>
    <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10910659/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs text-primary underline">Khan et al., Circulation 2024 · PREVENT</a>
  </div>
}
