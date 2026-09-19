'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { tr } from '../types'
import { HF_PROGNOSIS_MODELS, evidenceForModel, type PrognosisEvidence, type HfPrognosisModelId } from './models'
import { PrognosisModelDetail } from './PrognosisModelDetail'

export function HfPrognosisModels({ locale, evidence = {} }: { locale: string; evidence?: PrognosisEvidence }) {
  const [selected, setSelected] = useState<HfPrognosisModelId | null>(null)
  const model = HF_PROGNOSIS_MODELS.find(item => item.id === selected)
  const en = locale === 'en'
  return <div data-testid="hf-prognosis-models" className="min-w-0">
    {HF_PROGNOSIS_MODELS.map(item => {
      const values = evidenceForModel(item, evidence)
      const missing = item.fields.filter(field => !values[field.key]?.value)
      return <details key={item.id} className="border-t border-border" data-testid={`hf-prognosis-model-${item.id}`}>
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="font-semibold">{item.name}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{tr(locale, item.outcome)} · {en ? 'Formula pending' : '公式待串接'}</span>
          <span data-cdss-action="" className="mt-1 block font-medium text-primary">{item.setting === 'hf-admission'
            ? (en ? 'Select and verify admission data' : '需選定並核對入院資料')
            : missing.length ? (en ? `Review ${missing.length} missing data items` : `需補齊／核對 ${missing.length} 項資料`)
              : (en ? 'Verify model inputs' : '核對模型輸入資料')}</span>
        </summary>
        <div className="space-y-2 px-3 pb-3">
          <p className="text-sm text-muted-foreground">{tr(locale, item.population)}</p>
          {missing.length ? <p className="text-xs leading-relaxed">{en ? 'To verify: ' : '待補／核對：'}{missing.map(field => tr(locale, field.label)).join('、')}</p> : null}
          <Button type="button" variant="outline" className="min-h-11 whitespace-normal text-sm" onClick={() => setSelected(item.id)} data-testid={`open-prognosis-calculator-${item.id}`}>
            {en ? 'Open medical calculator · data and references' : '開啟醫學計算機・資料與引用'}
          </Button>
        </div>
      </details>
    })}
    <p className="border-t border-border px-3 py-3 text-xs text-muted-foreground">{en ? 'Team AI-SaMD: not connected; no predictions available.' : '團隊 AI-SaMD：尚未接入，目前沒有預測結果。'}</p>
    <Dialog open={!!model} onOpenChange={open => { if (!open) setSelected(null) }}>
      {model ? <DialogContent className="@container max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{model.name}</DialogTitle>
          <DialogDescription>{en ? 'Medical calculator · HF prognosis' : '醫學計算機・HF 預後'}</DialogDescription>
        </DialogHeader>
        <PrognosisModelDetail model={model} evidence={evidence} locale={locale} />
      </DialogContent> : null}
    </Dialog>
  </div>
}
