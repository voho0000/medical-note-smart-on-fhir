/** @jest-environment jsdom */
// The allergy row is the one 開藥前必看 row the model never writes. "The cloud
// holds no allergy record" is a statement about the BUNDLE — it has no key to
// cite — so it is rendered from AllergyIntolerance by the app and marked as
// such, and the schema keeps its "every model row cites a source" rule.
import { render, screen } from '@testing-library/react'
import { OverviewHeroCard } from '@/features/medical-summary/components/OverviewHeroCard'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'

const ALLERGY_ROW = {
  label: '過敏',
  noRecordText: '雲端無過敏資料，非確認無過敏',
  badgeLabel: '非 AI',
  badgeHint: '直接取自病人紀錄，未經 AI 產生',
  separator: '、',
}

const baseResult = (
  overrides: Partial<MedicalSummaryResult> = {},
): MedicalSummaryResult => ({
  headline: '94 歲男性，跨院慢性病照護',
  mustKnow: [],
  focus: [],
  problems: [],
  recent: [],
  medicationEducation: [],
  sourceIndex: [],
  droppedRecentCount: 0,
  droppedProblemCount: 0,
  ...overrides,
} as MedicalSummaryResult)

const renderCard = (result: MedicalSummaryResult, showMustKnow = true) => render(
  <OverviewHeroCard
    result={result}
    title="初診快覽"
    dataRange={null}
    mustKnowTitle="開藥前必看"
    showMustKnow={showMustKnow}
    highAlerts={[]}
    copyLabel="複製"
    copiedLabel="已複製"
    copyFailedLabel="複製失敗"
    typeLabel={(resourceType) => resourceType ?? ''}
    unverifiedLabel="來源可能有問題"
    allergyRow={ALLERGY_ROW}
  />,
)

describe('OverviewHeroCard allergy row', () => {
  it('states that an empty record is not a confirmed absence, marked as app-derived', () => {
    renderCard(baseResult({ allergyRecords: [] }))
    expect(screen.getByText('過敏')).toBeInTheDocument()
    expect(screen.getByText(/雲端無過敏資料，非確認無過敏/)).toBeInTheDocument()
    expect(screen.getByText('非 AI')).toBeInTheDocument()
  })

  it('lists the recorded allergens with their navigable source pills', () => {
    renderCard(baseResult({
      allergyRecords: [
        { sourceKey: 'A1', label: 'Penicillin', date: '2020-02-02' },
        { sourceKey: 'A2', label: 'Aspirin' },
      ],
      sourceIndex: [
        { key: 'A1', num: 1, verified: true, resourceType: 'AllergyIntolerance', resourceId: 'a1', display: 'Penicillin' },
        { key: 'A2', num: 2, verified: true, resourceType: 'AllergyIntolerance', resourceId: 'a2', display: 'Aspirin' },
      ],
    }))
    expect(screen.getByText('Penicillin')).toBeInTheDocument()
    expect(screen.getByText(/Aspirin/)).toBeInTheDocument()
    expect(screen.queryByText(/雲端無過敏資料/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 · AllergyIntolerance/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2 · AllergyIntolerance/ })).toBeInTheDocument()
  })

  it('renders nothing for a cached result from before the row existed', () => {
    // `undefined` is unknown, not empty: claiming "no allergy data" from a
    // legacy cache would be an assertion the app never actually checked.
    renderCard(baseResult())
    expect(screen.queryByText('過敏')).not.toBeInTheDocument()
    expect(screen.queryByText(/雲端無過敏資料/)).not.toBeInTheDocument()
  })

  it('stays clinician-only, like the rest of 開藥前必看', () => {
    renderCard(baseResult({ allergyRecords: [] }), false)
    expect(screen.queryByText('過敏')).not.toBeInTheDocument()
  })
})
