import { stripLegacySafetyPanels } from '@/src/application/providers/clinical-insights-legacy'
import {
  coerceShowInSummary,
  MAX_AUTO_INSIGHT_MODULES,
  MAX_SUMMARY_INSIGHT_MODULES,
} from '@/src/shared/constants/clinical-insights.constants'
import { selectAutoGeneratePanelIds } from '@/features/clinical-insights/hooks/useAutoGenerate'

const EN_SAFETY_PROMPT =
  'Review the clinical context and flag any immediate patient safety risks, including drug interactions, abnormal results, or urgent follow-up needs. Respond with concise bullet points ordered by severity.'
const ZH_SAFETY_PROMPT =
  '檢視臨床資料並標記任何立即的病人安全風險，包括藥物交互作用、異常結果或緊急追蹤需求。以簡潔的條列式回應，依嚴重程度排序。'

const mk = (over: Partial<{ id: string; title: string; prompt: string }>) => ({
  id: 'x',
  title: 't',
  prompt: 'p',
  autoGenerate: false,
  order: 0,
  audience: 'medical' as const,
  ...over,
})

describe('stripLegacySafetyPanels (strict legacy migration)', () => {
  it('removes the PRISTINE legacy safety panel (EN and ZH)', () => {
    const en = [mk({ id: 'safety', title: 'Safety Flag', prompt: EN_SAFETY_PROMPT }), mk({ id: 'changes' })]
    expect(stripLegacySafetyPanels(en).map((p) => p.id)).toEqual(['changes'])

    const zh = [mk({ id: 'safety', title: '安全警示', prompt: ZH_SAFETY_PROMPT })]
    expect(stripLegacySafetyPanels(zh)).toHaveLength(0)
  })

  it('KEEPS an EDITED legacy safety panel (id "safety" but prompt changed)', () => {
    const panels = [mk({ id: 'safety', title: '安全警示', prompt: '我自己改寫的 prompt 內容' })]
    expect(stripLegacySafetyPanels(panels)).toHaveLength(1)
  })

  it('KEEPS a user-created panel even if titled 安全警示 / copies the prompt (its id is a UUID, not "safety")', () => {
    const panels = [mk({ id: 'a1b2c3d4-uuid', title: '安全警示', prompt: ZH_SAFETY_PROMPT })]
    expect(stripLegacySafetyPanels(panels)).toHaveLength(1)
  })

  it('leaves all other panels untouched', () => {
    const panels = [mk({ id: 'changes' }), mk({ id: 'snapshot' })]
    expect(stripLegacySafetyPanels(panels)).toHaveLength(2)
  })
})

describe('custom summary module defaults', () => {
  it('activates Changes but keeps other legacy templates in the template library', () => {
    expect(coerceShowInSummary(undefined, 'changes')).toBe(true)
    expect(coerceShowInSummary(undefined, 'snapshot')).toBe(false)
    expect(coerceShowInSummary(true, 'custom')).toBe(true)
    expect(coerceShowInSummary(false, 'changes')).toBe(false)
    expect(MAX_SUMMARY_INSIGHT_MODULES).toBe(5)
    expect(MAX_AUTO_INSIGHT_MODULES).toBe(2)
  })

  it('auto-runs only visible modules, respects cache, cost gate and the two-card cap', () => {
    const panels = ['a', 'b', 'c', 'hidden'].map((id) => ({
      id,
      showInSummary: id !== 'hidden',
      autoGenerate: true,
    }))
    expect(selectAutoGeneratePanelIds({
      panels,
      modelId: 'gpt-5.4-nano',
      autoRunPanels: new Set(),
    })).toEqual(['a', 'b'])

    expect(selectAutoGeneratePanelIds({
      panels,
      modelId: 'gpt-5.4-nano',
      autoRunPanels: new Set(['a']),
      responses: { b: { text: 'cached' } },
    })).toEqual(['c'])

    expect(selectAutoGeneratePanelIds({
      panels,
      modelId: 'gemini-3-flash-preview',
      autoRunPanels: new Set(),
    })).toEqual([])

    expect(selectAutoGeneratePanelIds({
      panels,
      modelId: 'gpt-5.4-nano',
      autoRunPanels: new Set(),
      responses: { a: { text: 'partial response before quota error' } },
      failedPanelIds: new Set(['a']),
      limit: 1,
    })).toEqual(['a'])
  })
})
