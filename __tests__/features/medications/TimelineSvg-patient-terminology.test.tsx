import { fireEvent, render, screen } from '@testing-library/react'
import { TimelineSvg } from '@/features/clinical-summary/medications/timeline/components/TimelineSvg'
import type { CategoryGroup } from '@/features/clinical-summary/medications/timeline/hooks/useMedicationTimeline'

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'patient' }),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: {
      medications: {
        terminologyIngredientLabel: '成分／含量',
        terminologyOfficialNameZhLabel: '中文品名',
        terminologyOfficialNameEnLabel: '英文品名',
        terminologyDoseFormLabel: '劑型',
        terminologyAtcLabel: 'ATC 分類',
        terminologyAtcLevel2Label: 'ATC 第二層分類',
        terminologySnapshotLabel: '藥典版本',
        terminologySource: '健保署藥品主檔補充',
      },
    },
  }),
}))

const categories: CategoryGroup[] = [{
  key: 'atc-level2:R05',
  label: '咳嗽與感冒製劑',
  chronicCount: 1,
  acuteCount: 0,
  drugs: [{
    drugKey: 'AC49322100',
    drugName: '愛克痰發泡錠600毫克',
    isChronic: true,
    categoryKey: 'atc-level2:R05',
    categoryLabel: '咳嗽與感冒製劑',
    firstStartMs: new Date('2026-07-01').getTime(),
    lastStartMs: new Date('2026-07-01').getTime(),
    refillCount: 1,
    drugTerminology: {
      source: 'nhi-official-drug-master',
      snapshotId: 'nhi-drug-terminology-20260728',
      officialNameZh: '愛克痰發泡錠600毫克',
      officialNameEn: 'ACTEIN EFFERVESCENT TABLETS 600MG',
      ingredientText: 'ACETYLCYSTEINE 600 MG',
      doseForm: '發泡錠',
      atcCode: 'R05CB01',
      atcNameEn: 'acetylcysteine',
      atcLevel2Code: 'R05',
      atcLevel2NameZh: '咳嗽與感冒製劑',
    },
    bars: [{
      refillId: 'mr-1',
      startMs: new Date('2026-07-01').getTime(),
      endMs: new Date('2026-07-15').getTime(),
      supplyDays: 14,
      authoredOnIso: '2026-07-01',
      isChronic: true,
    }],
  }],
}]

describe('TimelineSvg patient terminology hover', () => {
  it('shows the complete drug-master card to patient users', () => {
    const { container } = render(
      <TimelineSvg
        categories={categories}
        domainStartMs={new Date('2026-06-01').getTime()}
        domainEndMs={new Date('2026-08-01').getTime()}
        width={720}
      />,
    )

    const bar = container.querySelector('rect[rx="2"]')
    expect(bar).not.toBeNull()
    fireEvent.mouseEnter(bar!)

    expect(screen.getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()
    expect(screen.getByText('ACTEIN EFFERVESCENT TABLETS 600MG')).toBeInTheDocument()
    expect(screen.getByText('R05CB01 · acetylcysteine')).toBeInTheDocument()
    expect(screen.getByText('健保署藥品主檔補充')).toBeInTheDocument()
  })
})
