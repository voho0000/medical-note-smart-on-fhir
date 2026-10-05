'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Calculator, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useMedcloudHfDryRun } from '@/src/application/hooks/hf-risk/use-medcloud-hf-dry-run.hook'
import { useHfIntranet } from '@/src/application/hooks/hf-risk/use-hf-intranet.hook'
import { HfMedcloudDetail } from './HfMedcloudDryRun'

/** Hospital presentation gate only; the service still enforces network authorization. */
export function HfSamdCalculator({ locale }: { locale: string }) {
  const params = useSearchParams()
  const hospitalSite = params?.get('site') === 'vghtpe'
  const intranet = useHfIntranet(hospitalSite)
  return hospitalSite || intranet ? <HospitalHfCalculator locale={locale} /> : null
}

function HospitalHfCalculator({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false)
  const state = useMedcloudHfDryRun()
  const en = locale === 'en'
  const title = en ? 'HF outpatient prognosis' : 'HF 門診預後模型'
  const scored = state.prediction?.verdict === 'scored' ? state.prediction : null
  const probability = scored ? (scored.probability > 0 && scored.probability < 0.0001 ? '<0.01%' : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(scored.probability * 100) + '%') : null
  return <>
    <Card className="rounded-lg border-border py-0 shadow-none" data-testid="hf-samd-calculator-card">
      <button type="button" onClick={() => setOpen(true)} aria-label={en ? 'Open TVGH SaMD HF calculator' : '開啟北榮 SaMD HF 計算機'} className="min-h-11 w-full rounded-lg text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CardContent className="flex items-start gap-2 px-3 py-2.5">
          <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap gap-1">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{en ? 'TVGH SaMD' : '北榮 SaMD'}</span>
              <span className="text-xs text-muted-foreground">{en ? 'Research pilot' : '研究試辦'}</span>
            </div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{en ? 'TVGH in-hospital death within 1 or 3 months of visit. Check inputs before prediction.' : '就診後 1、3 個月內北榮院內死亡；先檢查輸入，再執行預測。'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-right text-xs text-muted-foreground">{scored ? <><span className="block font-semibold tabular-nums text-foreground">{probability}</span>{en ? `${scored.horizonMonths} month(s)` : `${scored.horizonMonths} 個月`}</> : (en ? 'Not calculated' : '尚未計算')}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
        </CardContent>
      </button>
    </Card>
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <DialogContent className="@container max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title} · {en ? 'TVGH SaMD' : '北榮 SaMD'}</DialogTitle>
          <DialogDescription>{en ? 'Medical calculator · inputs, prediction and detailed results' : '醫學計算機 · 輸入檢查、預測與詳細結果'}</DialogDescription>
        </DialogHeader>
        <HfMedcloudDetail locale={locale} state={state} />
      </DialogContent>}
    </Dialog>
  </>
}
