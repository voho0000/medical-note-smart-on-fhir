import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HYPERLIPIDEMIA_GUIDELINE_PACK, type CdssPatientProfile } from '@voho0000/personalized-care'
import { NhiTable1Panel } from '@/features/clinical-decision-support/renderers/NhiTable1Panel'
import { useNhiLipidAiAssist } from '@/features/clinical-decision-support/hooks/use-nhi-lipid-ai-assist.hook'

jest.mock('@/features/clinical-decision-support/hooks/use-nhi-lipid-ai-assist.hook', () => ({
  useNhiLipidAiAssist: jest.fn(),
}))

const mockedUseAiAssist = jest.mocked(useNhiLipidAiAssist)

function coverageSummary() {
  const profile: CdssPatientProfile = {
    id: 'synthetic-ai-panel',
    evaluatedAt: '2026-09-18T10:00:00+08:00',
    demographics: { sex: 'male' },
    facts: {
      age: { zh: '60 歲', en: '60 years', numericValue: 60 },
    },
  }
  const result = HYPERLIPIDEMIA_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
  const card = result.recommendations.find((item) => item.id === 'dyslipidemia-risk-and-target')
  if (!card?.coverageSummary) throw new Error('Expected the NHI lipid coverage summary')
  return card.coverageSummary
}

describe('NhiTable1Panel AI review', () => {
  const run = jest.fn(async () => undefined)
  const decide = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAiAssist.mockReturnValue({
      suggestions: {},
      decisions: {},
      isRunning: false,
      isDataReady: true,
      error: null,
      modelId: 'gpt-test',
      modelName: 'GPT Test',
      run,
      decide,
    })
  })

  it('starts the AI review directly from the visible action', () => {
    render(
      <NhiTable1Panel
        summary={coverageSummary()}
        locale="zh-TW"
        patientId="patient-1"
        onAnswer={jest.fn()}
      />,
    )

    expect(run).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('nhi-lipid-ai-run'))
    expect(run).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('送出去識別化病歷摘要？')).not.toBeInTheDocument()
  })

  it('automatically includes a traceable AI assessment in the tier with provenance', async () => {
    const onAnswer = jest.fn()
    mockedUseAiAssist.mockReturnValue({
      suggestions: {
        smoking: {
          criterionId: 'smoking',
          state: 'yes',
          confidence: 'high',
          rationale: '病歷明確記載目前抽菸。',
          missing: [],
          evidence: [{
            sourceKey: 'D1',
            sourceResourceType: 'DocumentReference',
            sourceResourceId: 'doc-smoking',
            sourceLabel: '出院病歷摘要',
            date: '2026-09-16',
            excerpt: '目前每日抽菸一包。',
          }],
          modelId: 'gpt-test',
          modelName: 'GPT Test',
          generatedAt: '2026-09-18T10:00:00+08:00',
        },
      },
      decisions: {},
      isRunning: false,
      isDataReady: true,
      error: null,
      modelId: 'gpt-test',
      modelName: 'GPT Test',
      run,
      decide,
    })

    render(
      <NhiTable1Panel
        summary={coverageSummary()}
        locale="zh-TW"
        patientId="patient-1"
        onAnswer={onAnswer}
      />,
    )

    expect(screen.getByText('AI 判讀符合 · 已納入分級')).toBeInTheDocument()
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('smoking', 'yes', expect.objectContaining({
      source: 'ai',
      modelId: 'gpt-test',
      confidence: 'high',
    })))
    expect(decide).toHaveBeenCalledWith('smoking', 'applied')
    expect(screen.queryByText('採用並重算')).not.toBeInTheDocument()
  })

  it('does not write an answer when AI remains uncertain', () => {
    const onAnswer = jest.fn()
    mockedUseAiAssist.mockReturnValue({
      suggestions: {
        smoking: {
          criterionId: 'smoking',
          state: 'unknown',
          confidence: 'low',
          rationale: '病歷沒有足夠資料。',
          missing: ['目前吸菸狀態'],
          evidence: [],
          modelId: 'gpt-test',
          modelName: 'GPT Test',
          generatedAt: '2026-09-18T10:00:00+08:00',
        },
      },
      decisions: {},
      isRunning: false,
      isDataReady: true,
      error: null,
      modelId: 'gpt-test',
      modelName: 'GPT Test',
      run,
      decide,
    })

    render(
      <NhiTable1Panel
        summary={coverageSummary()}
        locale="zh-TW"
        patientId="patient-1"
        onAnswer={onAnswer}
      />,
    )

    expect(onAnswer).not.toHaveBeenCalled()
    expect(decide).not.toHaveBeenCalled()
    expect(screen.getByText('查看 1 項仍待補資料原因')).toBeInTheDocument()
  })

  it('distinguishes an AI-filled row from a clinician correction', () => {
    const summary = coverageSummary()
    const answered = {
      ...summary,
      factors: summary.factors.map((check) => check.id === 'smoking'
        ? { ...check, state: 'yes' as const, origin: 'physician' as const, value: '符合' }
        : check),
    }
    const { rerender } = render(
      <NhiTable1Panel
        summary={answered}
        locale="zh-TW"
        patientId="patient-1"
        answerProvenance={{ smoking: { source: 'ai', modelName: 'GPT Test' } }}
        onAnswer={jest.fn()}
      />,
    )
    expect(screen.getByTestId('nhi-criterion-provenance-smoking')).toHaveTextContent('AI 判讀')

    rerender(
      <NhiTable1Panel
        summary={answered}
        locale="zh-TW"
        patientId="patient-1"
        answerProvenance={{ smoking: { source: 'manual' } }}
        onAnswer={jest.fn()}
      />,
    )
    expect(screen.getByTestId('nhi-criterion-provenance-smoking')).toHaveTextContent('醫師修正')
  })
})
