'use client'

import { tr } from '../types'
import { evidenceForModel, type PrognosisEvidence, type PrognosisModel } from './models'

/** Shared by the calculator catalog and the CDSS dialog; no parallel formula. */
export function PrognosisModelDetail({ model, evidence = {}, locale }: {
  model: PrognosisModel; evidence?: PrognosisEvidence; locale: string
}) {
  const en = locale === 'en'
  const values = evidenceForModel(model, evidence)
  return <div className="space-y-4" data-testid={`prognosis-calculator-${model.id}`}>
    <p className="text-sm font-medium">{tr(locale, model.outcome)}</p>
    <p className="text-sm text-muted-foreground">{tr(locale, model.population)}</p>
    <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
      {en ? 'Formula integration and verification pending. No risk estimate has been calculated.' : '公式待串接與驗證，目前尚未計算風險。'}
    </p>
    <section aria-label={en ? 'Calculator data checklist' : '計算資料核對'}>
      <h4 className="mb-2 text-sm font-semibold">{en ? 'Calculator data checklist' : '計算資料核對'}</h4>
      <p className="mb-2 text-xs text-muted-foreground">{en ? 'Chart values are for review, not confirmed model inputs. Missing data remain unknown.' : '病歷數值供核對，尚非已確認的模型輸入；缺漏資料保留未知。'}</p>
      <dl className="divide-y divide-border">
        {model.fields.map(field => {
          const input = values[field.key]
          return <div key={field.key} className="grid min-w-0 gap-1 py-2 @min-[30rem]:grid-cols-2">
            <dt className="text-sm font-medium">{tr(locale, field.label)}</dt>
            <dd className="min-w-0 break-words text-sm">
              {input?.value || (en ? 'Needs entry / verification' : '待補／核對')}
              {input ? <span className="mt-1 block text-xs text-muted-foreground">{input.date?.slice(0, 10) || (en ? 'Date unavailable' : '日期未記錄')}{input.source ? ` · ${input.source}` : ''}</span> : null}
            </dd>
          </div>
        })}
      </dl>
    </section>
    <section className="space-y-1 border-t border-border pt-3">
      <h4 className="text-sm font-semibold">Reference · {model.version}</h4>
      {model.references.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="block min-h-11 break-words py-3 text-xs text-primary underline">{reference.label}</a>)}
      <a href={model.calculatorUrl} target="_blank" rel="noreferrer" className="inline-block min-h-11 py-3 text-sm font-medium text-primary underline">{en ? 'Open external calculator' : '開啟外部計算機'}</a>
      <p className="text-xs text-muted-foreground">{en ? 'Opens the calculator website without sending patient values.' : '只開啟計算機網站，不傳送病人數值。'}</p>
    </section>
  </div>
}
