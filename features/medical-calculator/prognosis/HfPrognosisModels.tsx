'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { tr } from '../types'
import { CALCULATORS } from '../calculators'
import { CalculatorDetail } from '../components/CalculatorDetail'
import { computeAutofilledResult } from '../autofill-compute'
import type { Autofill } from '../hooks/use-lab-autofill.hook'
import { useCalcFavorites } from '../hooks/use-calc-favorites.hook'
import { HF_PROGNOSIS_MODELS, evidenceForModel, type PrognosisEvidence, type HfPrognosisModelId } from './models'
import { PrognosisModelDetail } from './PrognosisModelDetail'

/** The LVEF the evidence carries, as a number, where it reads as one. */
function lvefOf(evidence: PrognosisEvidence): number | undefined {
  const value = Number.parseFloat(evidence.LVEF?.value ?? '')
  return Number.isFinite(value) ? value : undefined
}

/**
 * The HF prognosis models. A model the medical calculator already implements
 * (MAGGIC, LIFE-Preserved) opens that calculator — its inputs, autofill from
 * the patient's data and its result — and its row shows the result once the
 * record fills every input; the others stay a checklist of what they would
 * need (clinician feedback 2026-09-28: 「醫療計算機明明有，直接複用就好」).
 * `defaultOpen`: each model starts unfolded (the decision map's 03); it still folds.
 */
export function HfPrognosisModels({ locale, evidence = {}, defaultOpen = false, autofill }: {
  locale: string
  evidence?: PrognosisEvidence
  defaultOpen?: boolean
  /** The page's patient data, for a linked calculator's result on its row; without it the row asks to open the calculator. */
  autofill?: Autofill
}) {
  const [selected, setSelected] = useState<HfPrognosisModelId | null>(null)
  const { isFavorite, toggleFavorite } = useCalcFavorites()
  const en = locale === 'en'
  const lvef = lvefOf(evidence)
  // LIFE-Preserved is an HFpEF model: not offered beside an LVEF below 50%.
  const models = HF_PROGNOSIS_MODELS.filter((item) => item.id !== 'life-preserved' || lvef === undefined || lvef >= 50)
  const model = models.find(item => item.id === selected)
  const calcOf = (calculatorId: string | undefined) => (calculatorId ? CALCULATORS.find((calc) => calc.id === calculatorId) : undefined)
  const selectedCalc = calcOf(model?.calculatorId)
  return <div data-testid="hf-prognosis-models" className="min-w-0">
    {models.map(item => {
      const calc = calcOf(item.calculatorId)
      const computed = calc && autofill ? computeAutofilledResult(calc, autofill) : null
      const values = evidenceForModel(item, evidence)
      const missing = item.fields.filter(field => !values[field.key]?.value)
      return <details key={item.id} open={defaultOpen || undefined} className="border-t border-border" data-testid={`hf-prognosis-model-${item.id}`}>
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="font-semibold">{calc ? tr(locale, calc.name) : item.name}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {tr(locale, item.outcome)}{calc ? '' : ` · ${en ? 'Formula pending' : '公式待串接'}`}
          </span>
          {calc ? (
            computed ? (
              <span className="mt-1 block font-medium text-foreground" data-testid={`hf-prognosis-result-${item.id}`}>
                {computed.result.value}{computed.result.unit ? ` ${computed.result.unit}` : ''}
                {computed.result.interpretation ? <span className="ml-1 text-xs font-normal text-muted-foreground">{tr(locale, computed.result.interpretation)}</span> : null}
              </span>
            ) : (
              <span data-cdss-action="" className="mt-1 block font-medium text-primary">{en ? 'Fill in the calculator' : '在計算機填入缺的項目'}</span>
            )
          ) : (
            <span data-cdss-action="" className="mt-1 block font-medium text-primary">{item.setting === 'hf-admission'
              ? (en ? 'Select and verify admission data' : '需選定並核對入院資料')
              : missing.length ? (en ? `Review ${missing.length} missing data items` : `需補齊／核對 ${missing.length} 項資料`)
                : (en ? 'Verify model inputs' : '核對模型輸入資料')}</span>
          )}
        </summary>
        <div className="space-y-2 px-3 pb-3">
          <p className="text-sm text-muted-foreground">{tr(locale, item.population)}</p>
          {!calc && missing.length ? <p className="text-xs leading-relaxed">{en ? 'To verify: ' : '待補／核對：'}{missing.map(field => tr(locale, field.label)).join('、')}</p> : null}
          <Button type="button" variant="outline" className="min-h-11 whitespace-normal text-sm" onClick={() => setSelected(item.id)} data-testid={`open-prognosis-calculator-${item.id}`}>
            {calc
              ? (en ? 'Open the medical calculator' : '開啟醫學計算機')
              : (en ? 'Open medical calculator · data and references' : '開啟醫學計算機・資料與引用')}
          </Button>
        </div>
      </details>
    })}
    <p className="border-t border-border px-3 py-3 text-xs text-muted-foreground">{en ? 'Team AI-SaMD: not connected; no predictions available.' : '團隊 AI-SaMD：尚未接入，目前沒有預測結果。'}</p>
    <Dialog open={!!model} onOpenChange={open => { if (!open) setSelected(null) }}>
      {model ? <DialogContent className="@container max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{selectedCalc ? tr(locale, selectedCalc.name) : model.name}</DialogTitle>
          <DialogDescription>{en ? 'Medical calculator · HF prognosis' : '醫學計算機・HF 預後'}</DialogDescription>
        </DialogHeader>
        {selectedCalc ? (
          <CalculatorDetail
            calc={selectedCalc}
            onBack={() => setSelected(null)}
            isFavorite={isFavorite(selectedCalc.id)}
            onToggleFavorite={() => toggleFavorite(selectedCalc.id)}
          />
        ) : (
          <PrognosisModelDetail model={model} evidence={evidence} locale={locale} />
        )}
      </DialogContent> : null}
    </Dialog>
  </div>
}
