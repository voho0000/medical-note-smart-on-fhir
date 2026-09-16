import { ExternalLink } from 'lucide-react'
import type { CalcValues } from '../types'
import { calculateHpaRisks, HPA_VALIDATED_RANGES, type HpaOutcome, type HpaLevel, type HpaRiskResult } from '../hpa-risk-model'

const NAMES: Record<HpaOutcome, { zh: string; en: string }> = {
  chd: { zh: '冠心病', en: 'Coronary heart disease' },
  diabetes: { zh: '糖尿病', en: 'Diabetes' },
  hypertension: { zh: '高血壓', en: 'Hypertension' },
  stroke: { zh: '腦中風', en: 'Stroke' },
  mace: { zh: '重大心血管事件', en: 'Major cardiovascular event' },
}
const FIELD_NAMES: Record<string, { zh: string; en: string; unit?: string }> = {
  gender: { zh: '性別', en: 'sex' }, age: { zh: '年齡', en: 'age', unit: 'y' },
  height: { zh: '身高', en: 'height', unit: 'cm' }, weight: { zh: '體重', en: 'weight', unit: 'kg' },
  waist: { zh: '腰圍', en: 'waist', unit: 'cm' }, sbp: { zh: '收縮壓', en: 'systolic BP', unit: 'mmHg' },
  glu: { zh: '空腹血糖', en: 'fasting glucose', unit: 'mg/dL' }, chol: { zh: '總膽固醇', en: 'total cholesterol', unit: 'mg/dL' },
  tg: { zh: '三酸甘油酯', en: 'triglycerides', unit: 'mg/dL' }, ldlc: { zh: 'LDL-C', en: 'LDL-C', unit: 'mg/dL' },
  hdlc: { zh: 'HDL-C', en: 'HDL-C', unit: 'mg/dL' }, diabetes: { zh: '糖尿病史', en: 'diabetes history' },
  hbp: { zh: '高血壓史', en: 'hypertension history' }, smoke: { zh: '吸菸', en: 'smoking' },
  prior_cvd: { zh: '冠心病／中風病史', en: 'CVD history' },
}
const LEVEL: Record<HpaLevel, { zh: string; en: string; style: string }> = {
  low: { zh: '低風險', en: 'Low risk', style: 'text-emerald-700 dark:text-emerald-400' },
  moderate: { zh: '中風險', en: 'Moderate risk', style: 'text-amber-700 dark:text-amber-400' },
  high: { zh: '高風險', en: 'High risk', style: 'text-red-700 dark:text-red-400' },
}

function explanation(result: HpaRiskResult, values: CalcValues, zh: boolean): string {
  if (result.status === 'missing') {
    const names = result.missing?.map((key) => FIELD_NAMES[key]?.[zh ? 'zh' : 'en'] ?? key).join(zh ? '、' : ', ')
    return zh ? `請補填：${names}。` : `Please complete: ${names}.`
  }
  if (result.status === 'outside') {
    return result.outside?.map((key) => {
      const field = FIELD_NAMES[key]
      const name = field?.[zh ? 'zh' : 'en'] ?? key
      const unit = zh && key === 'age' ? '歲' : field?.unit ?? ''
      const range = HPA_VALIDATED_RANGES[key]
      const integer = key === 'age' || key === 'sbp'
      return zh
        ? `${name} ${values[key]} ${unit}；本地已驗算 ${range?.join('–')} ${unit}${integer ? '（整數）' : ''}。`
        : `${name}: ${values[key]} ${unit}; locally checked: ${range?.join('–')} ${unit}${integer ? ' (whole numbers)' : ''}.`
    }).join(' ') || (zh ? '此組輸入尚無可用的本地估計，請至官網核對。' : 'No local estimate is available for these inputs; check the official calculator.')
  }
  if (result.reason === 'prior-cvd') return zh
    ? '已填寫有冠心病或中風病史；此處不估算再次發病的風險。'
    : 'Prior coronary disease or stroke was selected. This tool does not estimate recurrent events.'
  if (result.reason === 'known') return zh
    ? `已填寫有${NAMES[result.outcome].zh}病史；此處估計首次發病風險，不適用已確診者。`
    : `Known ${NAMES[result.outcome].en.toLowerCase()} was selected. This estimate concerns first onset, not established disease.`
  return result.outcome === 'diabetes'
    ? (zh
      ? `目前空腹血糖 ${values.glu} mg/dL。國健署試算在 ≥126 時不提供新發糖尿病風險；單次數值不等於確診，請核對空腹狀態及病史。`
      : `Fasting glucose is ${values.glu} mg/dL. HPA withholds new-onset diabetes risk at ≥126. One reading is not a diagnosis; check fasting status and history.`)
    : (zh
      ? `目前收縮壓 ${values.sbp} mmHg。國健署試算在 ≥140 時不提供新發高血壓風險；單次讀值不等於確診，請核對量測及病史。`
      : `Systolic BP is ${values.sbp} mmHg. HPA withholds new-onset hypertension risk at ≥140. One reading is not a diagnosis; check the measurement and history.`)
}

function reviewField(item: HpaRiskResult): string | undefined {
  if (item.status === 'missing') return item.missing?.[0]
  if (item.status === 'outside') return item.outside?.[0]
  if (item.status === 'review') return item.outcome === 'hypertension' ? 'sbp' : 'glu'
  if (item.status === 'existing') return item.reason === 'prior-cvd' ? 'prior_cvd' : item.outcome === 'hypertension' ? 'hbp' : 'diabetes'
}

function statusLabel(item: HpaRiskResult, zh: boolean): string {
  if (item.status === 'missing') return zh ? '待補資料' : 'Needs inputs'
  if (item.status === 'outside') return zh ? '超出驗算範圍' : 'Outside checked range'
  if (item.status === 'existing') return zh ? '已有病史' : 'Known history'
  return item.outcome === 'hypertension' ? (zh ? '需核對血壓' : 'Check BP') : (zh ? '需核對血糖' : 'Check glucose')
}

function compactStatus(item: HpaRiskResult, values: CalcValues, zh: boolean): string {
  if (item.status === 'missing') {
    const first = item.missing?.[0]
    const name = first ? FIELD_NAMES[first]?.[zh ? 'zh' : 'en'] ?? first : ''
    const rest = (item.missing?.length ?? 1) - 1
    return zh ? `待填：${name}${rest ? `等 ${rest + 1} 項` : ''}` : `Needs ${name}${rest ? ` +${rest}` : ''}`
  }
  if (item.status === 'outside') {
    const first = item.outside?.[0]
    if (!first) return statusLabel(item, zh)
    const name = FIELD_NAMES[first]?.[zh ? 'zh' : 'en'] ?? first
    const rest = (item.outside?.length ?? 1) - 1
    return zh ? `${name} ${values[first]} 超出驗算範圍${rest ? `等 ${rest + 1} 項` : ''}` : `${name} ${values[first]} outside checked range${rest ? ` +${rest}` : ''}`
  }
  if (item.status === 'existing') return zh ? '已有病史，不估新發' : 'Known history; no first-onset risk'
  return statusLabel(item, zh)
}

function conciseReview(item: HpaRiskResult, values: CalcValues, zh: boolean): string {
  return item.outcome === 'hypertension'
    ? (zh ? `${values.sbp} mmHg ≥140；官網不估新發風險，單次讀值非確診。` : `${values.sbp} mmHg ≥140; HPA withholds first-onset risk. One reading is not a diagnosis.`)
    : (zh ? `${values.glu} mg/dL ≥126；官網不估新發風險，單次數值非確診。` : `${values.glu} mg/dL ≥126; HPA withholds first-onset risk. One reading is not a diagnosis.`)
}

export function HpaRiskResults({ values, locale, onReviewField }: {
  values: CalcValues
  locale: string
  onReviewField?: (key: string) => void
}) {
  const zh = locale === 'zh-TW'
  const results = calculateHpaRisks(values)
  return (
    <section aria-label={zh ? '五項慢性病風險' : 'Five chronic disease risks'} className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b bg-muted/40 px-3 py-2">
        <h3 className="text-sm font-semibold">{zh ? '未來 10 年風險' : '10-year risks'}</h3>
        <span className="text-xs text-muted-foreground">{zh ? '本地重建 · 非官方' : 'Local reconstruction · not official'}</span>
      </div>
      {/* Source dates are advisory in CalculatorDetail, never an eligibility gate. */}
      <div className="divide-y divide-border">
        {results.map((item) => {
          const field = reviewField(item)
          return (
            <div key={item.outcome} role="group" aria-label={NAMES[item.outcome][zh ? 'zh' : 'en']}>
              {item.status === 'estimated' ? (
                <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-3 py-2">
                  <h4 className="text-sm font-medium">{NAMES[item.outcome][zh ? 'zh' : 'en']}</h4>
                  <div className="flex items-baseline gap-2 text-right">
                    <span className="text-base font-semibold tabular-nums">{zh ? '約' : '~'}{Math.trunc(item.risk!)}%</span>
                    <span className={`text-xs font-medium ${LEVEL[item.level!].style}`}>{LEVEL[item.level!][zh ? 'zh' : 'en']}</span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!field || !onReviewField}
                  onClick={() => field && onReviewField?.(field)}
                  aria-label={`${NAMES[item.outcome][zh ? 'zh' : 'en']}：${explanation(item, values, zh)} ${zh ? '核對欄位' : 'Review input'}`}
                  className="block min-h-11 w-full px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-medium">{NAMES[item.outcome][zh ? 'zh' : 'en']}</span>
                    <span className="text-right text-xs text-muted-foreground">{compactStatus(item, values, zh)}{field && onReviewField ? ' ›' : ''}</span>
                  </span>
                  {item.status === 'review' && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{conciseReview(item, values, zh)}</span>}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div className="border-t px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {zh ? '估計新發風險，非診斷；未顯示百分比不代表低風險。高血壓依同性別同年齡比較，其餘依百分比分級。' : 'First-onset risk, not a diagnosis; no percentage does not mean low risk. Hypertension compares age/sex peers; other grades use percentages.'}
      </div>
      <a className="flex min-h-11 items-center gap-1.5 border-t px-3 py-2 text-xs font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" href="https://cdrc.hpa.gov.tw/hra-openservice-menupage.jsp?all" target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {zh ? '開啟國健署官方試算（需重新輸入）' : 'Open the HPA calculator (re-enter inputs)'}
      </a>
    </section>
  )
}
