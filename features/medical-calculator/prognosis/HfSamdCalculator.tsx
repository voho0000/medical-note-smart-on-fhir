'use client'

import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { Calculator, ChevronRight, ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useMedcloudHfDryRun } from '@/src/application/hooks/hf-risk/use-medcloud-hf-dry-run.hook'
import { useHfIntranet } from '@/src/application/hooks/hf-risk/use-hf-intranet.hook'
import { HfMedcloudDetail } from './HfMedcloudDryRun'

export type HfSamdSessionState = { allowed: boolean; state: ReturnType<typeof useMedcloudHfDryRun> }

/** Session state survives list filters and opening other calculators. */
export function HfSamdSession({ children }: { children: (session: HfSamdSessionState) => ReactNode }) {
  const params = useSearchParams()
  const sites = params?.getAll('site') ?? []
  const hospitalSite = sites.length === 1 && sites[0] === 'vghtpe'
  const intranet = useHfIntranet(hospitalSite)
  const state = useMedcloudHfDryRun()
  return children({ allowed: hospitalSite || intranet, state })
}

export function HfSamdCalculator({ locale }: { locale: string }) {
  return <HfSamdSession>{session => <HfSamdNavigation locale={locale} session={session} />}</HfSamdSession>
}

function HfSamdNavigation({ locale, session }: { locale: string; session: HfSamdSessionState }) {
  const [open, setOpen] = useState(false)
  if (!session.allowed) return null
  return open ? <HfSamdPage locale={locale} state={session.state} onBack={() => setOpen(false)} /> :
    <HfSamdCard locale={locale} state={session.state} onOpen={() => setOpen(true)} />
}

export function HfSamdPage({ locale, state, onBack }: { locale: string; state: HfSamdSessionState['state']; onBack: () => void }) {
  const en = locale === 'en'
  return <section className="@container space-y-2" aria-label={en ? 'TVGH SaMD HF calculator' : '北榮 SaMD HF 計算機'}>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onBack} className="min-h-11 gap-1 px-2">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{en ? 'Back' : '返回'}
      </Button>
      <h2 className="text-sm font-semibold">{en ? 'HF outpatient prognosis' : 'HF 門診預後模型'} · {en ? 'TVGH SaMD' : '北榮 SaMD'}</h2>
    </div>
    <p className="text-xs text-muted-foreground">{en ? 'You can switch views while processing. Return here to see the result.' : '執行中可切換其他畫面，回到此頁查看結果。'}</p>
    <HfMedcloudDetail locale={locale} state={state} />
  </section>
}

export function HfSamdCard({ locale, state, onOpen }: { locale: string; state: HfSamdSessionState['state']; onOpen: () => void }) {
  const en = locale === 'en'
  const title = en ? 'HF outpatient prognosis' : 'HF 門診預後模型'
  const scored = state.prediction?.verdict === 'scored' ? state.prediction : null
  const probability = scored ? (scored.probability > 0 && scored.probability < 0.0001 ? '<0.01%' : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(scored.probability * 100) + '%') : null
  return (
    <Card className="rounded-lg border-border py-0 shadow-none" data-testid="hf-samd-calculator-card">
      <button type="button" onClick={onOpen} className="min-h-11 w-full rounded-lg text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-start gap-2 px-3 py-2.5">
          <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="mb-1 flex flex-wrap gap-1">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{en ? 'TVGH SaMD' : '北榮 SaMD'}</span>
              <span className="text-xs text-muted-foreground">{en ? 'Research pilot' : '研究試辦'}</span>
            </span>
            <span className="block text-sm font-semibold">{title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{en ? 'TVGH in-hospital death within 1 or 3 months of visit. Check inputs before prediction.' : '就診後 1、3 個月內北榮院內死亡；先檢查輸入，再執行預測。'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span aria-live="polite" aria-atomic="true" className="text-right text-xs text-muted-foreground">{scored ? <><span className="block font-semibold tabular-nums text-foreground">{probability}</span>{en ? `${scored.horizonMonths} month(s)` : `${scored.horizonMonths} 個月`}</> : state.busy ? (en ? 'Processing…' : '處理中…') : (en ? 'Not calculated' : '尚未計算')}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </span>
        </span>
      </button>
    </Card>
  )
}
