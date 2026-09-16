import { AlertTriangle, ExternalLink } from 'lucide-react'
import type { CalcValues } from '../types'
import { calculateHpaRisks, type HpaOutcome, type HpaLevel, type HpaRiskResult } from '../hpa-risk-model'

const NAMES: Record<HpaOutcome, { zh: string; en: string }> = {
  chd: { zh: '冠心病', en: 'Coronary heart disease' },
  diabetes: { zh: '糖尿病', en: 'Diabetes' },
  hypertension: { zh: '高血壓', en: 'Hypertension' },
  stroke: { zh: '腦中風', en: 'Stroke' },
  mace: { zh: '重大心血管事件', en: 'Major cardiovascular event' },
}
const FIELD_NAMES: Record<string, { zh: string; en: string }> = {
  gender: { zh: '性別', en: 'sex' }, age: { zh: '年齡', en: 'age' },
  height: { zh: '身高', en: 'height' }, weight: { zh: '體重', en: 'weight' },
  waist: { zh: '腰圍', en: 'waist' }, sbp: { zh: '收縮壓', en: 'systolic BP' },
  glu: { zh: '空腹血糖', en: 'fasting glucose' }, chol: { zh: '總膽固醇', en: 'total cholesterol' },
  tg: { zh: '三酸甘油酯', en: 'triglycerides' }, ldlc: { zh: 'LDL-C', en: 'LDL-C' },
  hdlc: { zh: 'HDL-C', en: 'HDL-C' }, diabetes: { zh: '糖尿病史', en: 'diabetes history' },
  hbp: { zh: '高血壓史', en: 'hypertension history' }, smoke: { zh: '吸菸', en: 'smoking' },
  prior_cvd: { zh: '冠心病／中風病史', en: 'CVD history' },
}
const LEVEL: Record<HpaLevel, { zh: string; en: string; style: string }> = {
  low: { zh: '低', en: 'Low', style: 'text-emerald-700 dark:text-emerald-400' },
  moderate: { zh: '中', en: 'Moderate', style: 'text-amber-700 dark:text-amber-400' },
  high: { zh: '高', en: 'High', style: 'text-red-700 dark:text-red-400' },
}

function explanation(result: HpaRiskResult, zh: boolean): string {
  if (result.status === 'missing') {
    const names = result.missing?.map((key) => FIELD_NAMES[key]?.[zh ? 'zh' : 'en'] ?? key).join('、')
    return zh ? `待填：${names}` : `Needs: ${result.missing?.map((key) => FIELD_NAMES[key]?.en ?? key).join(', ')}`
  }
  if (result.status === 'outside') {
    const names = result.outside?.map((key) => FIELD_NAMES[key]?.[zh ? 'zh' : 'en'] ?? key).join('、')
    return zh ? `超出本地驗算範圍：${names || '輸入值'}` : `Outside local validation: ${result.outside?.map((key) => FIELD_NAMES[key]?.en ?? key).join(', ') || 'input'}`
  }
  if (result.reason === 'prior-cvd') return zh ? '已有冠心病或中風病史，不適用新發風險估計。' : 'Prior coronary disease or stroke: incident-risk estimate not applicable.'
  if (result.reason === 'known') return zh ? '已有此病，不適用新發風險估計。' : 'Known disease: incident-risk estimate not applicable.'
  return result.outcome === 'diabetes'
    ? (zh ? '空腹血糖 ≥126 mg/dL；請由醫療人員確認，不能以試算診斷。' : 'Fasting glucose ≥126 mg/dL: seek clinical confirmation, not a calculator diagnosis.')
    : (zh ? '收縮壓 ≥140 mmHg；請由醫療人員確認，不能以試算診斷。' : 'Systolic BP ≥140 mmHg: seek clinical confirmation, not a calculator diagnosis.')
}

export function HpaRiskResults({ values, locale, mixedDates }: { values: CalcValues; locale: string; mixedDates: boolean }) {
  const zh = locale === 'zh-TW'
  const results = calculateHpaRisks(values)
  return (
    <section aria-label={zh ? '五項慢性病風險' : 'Five chronic disease risks'} className="overflow-hidden rounded-lg border border-border">
      <div className="border-b bg-muted/40 px-3 py-2.5">
        <div className="text-xs font-semibold">{zh ? '未來 10 年風險 · 本地重建估計' : '10-year risks · local reconstruction'}</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {zh ? '非國健署官方數值；合成案例驗算有誤差，請勿直接用於診療決策。' : 'Not an official HPA result. Synthetic-case validation has error; do not use alone for clinical decisions.'}
        </p>
      </div>
      {mixedDates ? (
        <div role="alert" className="px-3 py-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          {zh
            ? '已暫停顯示風險：自動帶入的檢驗日期相差超過 7 天。請先核對並改填同一次／相近日期的數值，或使用官方網站重新計算。'
            : 'Risk estimates paused: autofilled labs are more than 7 days apart. Verify and replace them with contemporaneous results, or recalculate on the official website.'}
          {results.filter((item) => item.status === 'existing').map((item) => (
            <p key={item.outcome} className="mt-2 font-medium">
              {NAMES[item.outcome][zh ? 'zh' : 'en']}：{explanation(item, zh)}
            </p>
          ))}
        </div>
      ) : <div className="divide-y divide-border">
        {results.map((item) => (
          <div key={item.outcome} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">{NAMES[item.outcome][zh ? 'zh' : 'en']}</div>
              {item.status !== 'estimated' && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{explanation(item, zh)}</p>}
              {item.nearBoundary && <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{zh ? '接近分級界線，官方等級可能不同' : 'Near a cutoff; the official category may differ'}</p>}
            </div>
            {item.status === 'estimated' ? (
              <div className="flex shrink-0 items-baseline gap-2 text-right">
                <span className="text-sm font-semibold tabular-nums">{zh ? '約' : '~'}{Math.trunc(item.risk!)}%</span>
                <span className={`text-[11px] font-semibold ${LEVEL[item.level!].style}`}>{LEVEL[item.level!][zh ? 'zh' : 'en']}</span>
              </div>
            ) : (
              <span className="shrink-0 text-[11px] text-muted-foreground">{item.status === 'existing' ? (zh ? '不適用' : 'N/A') : '—'}</span>
            )}
          </div>
        ))}
      </div>}
      <div className="flex items-start gap-1.5 border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>{zh ? '已知疾病、疑似診斷門檻或超出驗算範圍時不顯示百分比。人工確認病史、檢驗空腹狀態與日期。' : 'No percentage is shown for known disease, possible diagnostic threshold, or unvalidated inputs. Confirm history, fasting status and dates.'}</span>
      </div>
      <a className="flex items-center gap-1.5 border-t px-3 py-2 text-xs font-medium text-sky-700 hover:underline dark:text-sky-400" href="https://cdrc.hpa.gov.tw/hra-openservice-menupage.jsp?all" target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
        {zh ? '前往國健署官網核對' : 'Compare on the HPA website'}
      </a>
    </section>
  )
}
