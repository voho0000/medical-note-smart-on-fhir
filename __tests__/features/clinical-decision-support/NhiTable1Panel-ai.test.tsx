import { fireEvent, render, screen } from '@testing-library/react'
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
  const runConfirmed = jest.fn(async () => undefined)
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
      runConfirmed,
      decide,
    })
  })

  it('opens a disclosure before the AI request and sends only after confirmation', () => {
    render(
      <NhiTable1Panel
        summary={coverageSummary()}
        locale="zh-TW"
        patientId="patient-1"
        onAnswer={jest.fn()}
      />,
    )

    expect(runConfirmed).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('nhi-lipid-ai-run'))
    expect(screen.getByText('送出去識別化病歷摘要？')).toBeInTheDocument()
    expect(screen.getByText(/GPT Test/)).toBeInTheDocument()
    expect(runConfirmed).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('nhi-lipid-ai-confirm'))
    expect(runConfirmed).toHaveBeenCalledWith(expect.objectContaining({
      patientId: 'patient-1',
      modelId: 'gpt-test',
      confirmedAt: expect.any(Number),
    }))
  })

  it('changes the physician answer only when a suggestion is accepted', () => {
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
      runConfirmed,
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

    expect(screen.getByText('AI 建議符合 · 尚未採用')).toBeInTheDocument()
    expect(onAnswer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('nhi-lipid-ai-accept-smoking'))
    expect(onAnswer).toHaveBeenCalledWith('smoking', 'yes')
    expect(decide).toHaveBeenCalledWith('smoking', 'accepted')
  })

  it('rejects a suggestion without writing the opposite answer', () => {
    const onAnswer = jest.fn()
    mockedUseAiAssist.mockReturnValue({
      suggestions: {
        smoking: {
          criterionId: 'smoking',
          state: 'yes',
          confidence: 'medium',
          rationale: '需人工核對。',
          missing: [],
          evidence: [{
            sourceKey: 'D1',
            sourceResourceType: 'DocumentReference',
            sourceResourceId: 'doc-smoking',
            sourceLabel: '門診紀錄',
            excerpt: '目前仍有吸菸。',
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
      runConfirmed,
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

    fireEvent.click(screen.getByTestId('nhi-lipid-ai-reject-smoking'))
    expect(decide).toHaveBeenCalledWith('smoking', 'rejected')
    expect(onAnswer).not.toHaveBeenCalled()
  })
})
