'use client'

import { useMemo, useState } from 'react'
import { HYPERLIPIDEMIA_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { NhiTable1Panel } from '@/features/clinical-decision-support/renderers/NhiTable1Panel'
import { NHI_LIPID_AI_PROMPT_VERSION } from '@/features/clinical-decision-support/ai/nhi-lipid-ai-assist'
import {
  useNhiLipidReview,
  useNhiLipidReviewProvenance,
  useNhiLipidAiReview,
  useNhiLipidReviewStore,
} from '@/features/clinical-decision-support/stores/nhi-lipid-review.store'
import type { NhiLipidAiAssist } from '@/features/clinical-decision-support/hooks/use-nhi-lipid-ai-assist.hook'
import { buildFixtureProfile, fixtureCatalog, fixtureChecks, replayFixtureReply, type LipidPipelineCase } from './replay'
import data from './patients.json'

const cases = data.cases as unknown as LipidPipelineCase[]
const labels: Record<string, string> = {
  'cad-recent-mi': '冠心病＋一年內心肌梗塞',
  'cad-carotid': '冠心病＋頸動脈狹窄',
  'pad-carotid': '周邊動脈疾病＋頸動脈狹窄',
  'isolated-cad': '單純穩定冠心病',
  'single-low-egfr': '單次腎功能下降',
  'persistent-predialysis-ckd': '持續腎功能下降＋明確未透析',
  'dialysis-excluded': '已接受透析',
  'zero-factors-ruled-out': '六項風險因子均已排除',
}
const buttonClass = 'min-h-11 rounded-md border border-border px-3 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function PipelineReview() {
  const [caseId, setCaseId] = useState(cases[0].id)
  const [showTable, setShowTable] = useState(true)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const scenario = cases.find(item => item.id === caseId)!
  const record = useMemo(() => buildFixtureProfile(scenario, data.fixedNow), [scenario])
  const answers = useNhiLipidReview(record.id)
  const provenance = useNhiLipidReviewProvenance(record.id)
  const review = useNhiLipidAiReview(record.id)
  const profile = useMemo(() => ({ ...record, nhiLipidReview: answers, nhiLipidReviewProvenance: provenance }), [record, answers, provenance])
  const result = HYPERLIPIDEMIA_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
  const summary = result.recommendations.find(item => item.id === 'dyslipidemia-risk-and-target')!.coverageSummary!
  const therapy = result.recommendations.find(item => item.id === 'dyslipidemia-lipid-lowering-therapy')
    ?.sourceAssessments?.find(item => item.sourceId === 'taiwan-nhi-lipid-2026')
  const sources = fixtureCatalog(scenario)
  const openedSource = sources.find(source => source.resourceId === sourceId)
  const openedNarrative = scenario.profileInput.diagnosticReports?.find(report => report.id === sourceId)?.conclusion

  async function run(unknownOnly = false) {
    const store = useNhiLipidReviewStore.getState()
    const criteria = fixtureChecks(profile)
    const runId = `fixture-${caseId}-${Date.now()}`
    store.beginAiRun(record.id, {
      runId,
      inputSignature: `synthetic-${data.sourceSha256}-${caseId}`,
      sourceScopeSignature: `synthetic-${caseId}`,
      promptVersion: NHI_LIPID_AI_PROMPT_VERSION,
      startedAt: data.fixedNow,
    })
    try {
      const parsed = replayFixtureReply(scenario, criteria, data.fixedNow, unknownOnly)
      store.completeAiRun(record.id, runId, parsed, Object.fromEntries(criteria.map(item => [item.id, item.state])), data.fixedNow)
    } catch (error) {
      store.failAiRun(record.id, runId, error instanceof Error ? error.message : '合成回覆驗證失敗')
    }
  }

  const assist: NhiLipidAiAssist = {
    ...review,
    modelId: 'synthetic-pipeline-replay',
    modelName: '合成回覆重播（無外部 AI 呼叫）',
    isDataReady: true,
    run: () => run(),
    decide: () => {}, // The production store applies the entire reply atomically.
  }

  return <main className="mx-auto max-w-[90rem] space-y-4 p-3">
    <header className="space-y-2 border-b border-border pb-3">
      <h1 className="text-lg font-semibold">高血脂完整流程 · 合成病人驗證</h1>
      <p className="text-sm text-muted-foreground">八位完全虛構病人，使用 medcloud bridge 產出的 FHIR。AI 回覆為固定測試資料，經正式證據解析與預填流程；不代表真實模型的臨床準確率。</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="pipeline-patient" className="text-sm font-medium">測試病人</label>
        <select id="pipeline-patient" value={caseId} className={`${buttonClass} min-w-0 max-w-full bg-background`} onChange={event => { setCaseId(event.target.value); setSourceId(null) }}>
          {cases.map(item => <option key={item.id} value={item.id}>{labels[item.id]}</option>)}
        </select>
        <button className={buttonClass} onClick={() => useNhiLipidReviewStore.getState().clear(record.id)}>重設此病人</button>
        <button className={buttonClass} onClick={() => setShowTable(!showTable)}>{showTable ? '切換到治療摘要' : '返回健保表一'}</button>
        <button className={buttonClass} onClick={() => { void run(true) }}>重播：本次證據不足</button>
      </div>
    </header>
    <section aria-label="合成病人結果" className="space-y-2 text-sm">
      <p>目前分級：<strong data-testid="pipeline-tier">{summary.tiers.find(item => item.selected)?.label ?? '未定'}</strong> · LDL-C：{profile.facts.LDL?.zh ?? '未提供'} · 評估日：2026-09-20</p>
      <p>{scenario.profileInput.observations.length} 筆檢驗、{scenario.profileInput.encounters.length} 筆就醫、{scenario.profileInput.medications.length} 筆用藥、{scenario.profileInput.diagnosticReports?.length ?? 0} 份報告。</p>
      {scenario.profilePatch ? <p className="text-muted-foreground">本例另外帶入明確的透析確認狀態；此狀態不是由 bridge 自動判定。</p> : null}
      <p data-testid="pipeline-therapy">治療卡建議步驟的給付判讀：{therapy?.status ?? '未定'}（各藥物條件見治療摘要）</p>
    </section>
    {openedSource ? <section aria-label="原始合成報告" className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{openedSource.display} · {openedSource.date}</h2><button className={buttonClass} onClick={() => setSourceId(null)}>關閉原文</button></div>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{openedNarrative ?? openedSource.getContentText?.()}</pre>
    </section> : null}
    {showTable ? <div className="@container rounded-md border border-border bg-card py-3"><NhiTable1Panel
      summary={summary} locale="zh-TW" patientId={record.id}
      aiAssist={assist} answerProvenance={provenance}
      onAnswer={(id, state, origin) => useNhiLipidReviewStore.getState().answer(record.id, id, state, origin)}
      onNavigate={target => setSourceId(target.resourceId)}
    /></div> : <section aria-label="治療摘要" className="space-y-3 text-sm">
      <h2 className="font-semibold">治療摘要</h2><p>{therapy?.summary}</p>
      <pre className="whitespace-pre-wrap font-sans">{summary.documentationNote}</pre>
    </section>}
  </main>
}
