import type { HfPredictionResult } from '@/src/core/hf-risk/prediction-result'

export function HfPredictionResultView({ result, locale }: { result: HfPredictionResult; locale: string }) {
  const en = locale === 'en'
  if (result.verdict === 'refused') return <section aria-label={en ? 'HF prediction refused' : 'HF 預測未完成'} className="space-y-2 border-t border-border pt-3">
    <h4 className="text-sm font-semibold">{en ? 'Insufficient or incompatible data; unable to assess' : '資料不足或不相容，無法評估'}</h4>
    <p className="text-xs text-muted-foreground">{en ? 'This is not a low-risk result.' : '這不是低風險結果。'}</p>
    <ul className="space-y-1 text-xs">{result.issues.map((issue, i) => <li key={i}>{issue.severity}：{issue.text}</li>)}</ul>
  </section>
  const percentage = (value: number) => value > 0 && value < 0.0001 ? '<0.01%' : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value * 100) + '%'
  const tier = { low: en ? 'Low' : '低', intermediate: en ? 'Intermediate' : '中', high: en ? 'High' : '高' }[result.tier]
  return <section aria-label={en ? 'HF model prediction' : 'HF 模型預測結果'} className="space-y-2 border-t border-border pt-3">
    <h4 className="text-sm font-semibold">{en ? 'HF model prediction' : 'HF 模型預測結果'}</h4>
    <p className="text-xs text-muted-foreground">{en ? 'Research pilot; no medical device license. NHI cloud applicability remains unvalidated. A physician must interpret the result; do not use it as the sole basis for treatment.' : '研究試辦版本，尚未取得醫療器材許可證；健保雲端來源適用性尚未驗證。須由醫師綜合判讀，不可單獨作為處置依據。'}</p>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      <dt>{en ? 'Outcome' : '預測結局'}</dt><dd>{en ? `TVGH in-hospital death within ${result.horizonMonths} month(s) of visit` : `就診後 ${result.horizonMonths} 個月內北榮院內死亡`}</dd>
      <dt>{en ? 'Model probability' : '模型機率'}</dt><dd className="font-semibold tabular-nums">{percentage(result.probability)}</dd>
      <dt>{en ? 'Model risk tier' : '模型風險層'}</dt><dd>{tier}</dd>
      <dt>{en ? 'Index date' : '門診基準日'}</dt><dd className="tabular-nums">{result.indexDate}</dd>
    </dl>
    <p className="text-xs text-muted-foreground">{en ? 'Deaths outside TVGH are not included. Incomplete history or laboratory data may affect the estimate.' : '不包含院外或他院死亡；病史或檢驗缺漏可能影響估計。'}</p>
    <h5 className="text-xs font-semibold">{en ? 'Model warnings and notes' : '模型警語與資料提示'}</h5>
    {result.notes.length ? <ul className="space-y-1 break-words text-xs">{result.notes.map((note, i) => <li key={i}>{note}</li>)}</ul> : <p className="text-xs text-muted-foreground">{en ? 'No notes returned; this does not establish data completeness.' : '服務未回傳提示，不代表資料完整。'}</p>}
    {result.observedIncidence && <div className="space-y-1 text-xs">
      <p>{en ? 'Recent observed incidence in the same risk tier (group rate, not individual probability)' : '同風險層近期實際發生率（群體發生率，非個人機率）'}：<span className="tabular-nums">{percentage(result.observedIncidence.rate)} · 95% CI {percentage(result.observedIncidence.ciLow)}–{percentage(result.observedIncidence.ciHigh)}</span></p>
      <p className="break-words text-muted-foreground">{result.observedIncidence.basis} · n={result.observedIncidence.patients}</p>
    </div>}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-2">{en ? 'Model version and provenance' : '模型版本與計算紀錄'}</summary>
      <p className="break-words">{result.model.name}</p>
      <p>{en ? 'Computed at' : '計算時間'}：{result.computedAt}</p>
      <dl>{result.model.versions.map(version => <div key={version.type} className="mt-1"><dt className="font-medium">{version.type}</dt><dd className="break-all">{version.value}</dd></div>)}</dl>
      <p>{en ? 'Adapter version' : '串接版本'}：{result.adapterVersion ?? (en ? 'Not provided' : '未提供')}</p>
      {result.requestId && <p className="break-all">Request ID：{result.requestId}</p>}
    </details>
  </section>
}
