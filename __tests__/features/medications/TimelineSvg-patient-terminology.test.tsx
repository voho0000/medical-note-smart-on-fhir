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
        timelineAfterToday: '今日後',
      },
    },
  }),
}))

const categories: CategoryGroup[] = [{
  key: 'atc-level2:R05',
  label: '咳嗽與感冒製劑',
  chronicCount: 1,
  nonChronicCount: 0,
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

    const bar = container.querySelector('rect[rx="1"]')
    expect(bar).not.toBeNull()
    fireEvent.mouseEnter(bar!)

    expect(screen.getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()
    expect(screen.getByText('ACTEIN EFFERVESCENT TABLETS 600MG')).toBeInTheDocument()
    expect(screen.getByText('R05CB01 · acetylcysteine')).toBeInTheDocument()
    expect(screen.getByText('健保署藥品主檔補充')).toBeInTheDocument()
  })

  it('splits a medication period at today and marks the future portion with a dashed lighter segment', () => {
    const todayMs = new Date('2026-07-08T12:00:00+08:00').getTime()
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(todayMs)
    const domainStartMs = new Date('2026-06-01').getTime()
    const domainEndMs = new Date('2026-08-01').getTime()

    const { container } = render(
      <TimelineSvg
        categories={categories}
        domainStartMs={domainStartMs}
        domainEndMs={domainEndMs}
        width={720}
      />,
    )

    const elapsed = container.querySelector('[data-timeline-segment="elapsed"]')
    const future = container.querySelector('[data-timeline-segment="future"]')
    expect(elapsed).not.toBeNull()
    expect(future).not.toBeNull()
    expect(elapsed).toHaveClass('fill-teal-200', 'stroke-teal-700')
    expect(future).toHaveClass('fill-teal-100', 'stroke-teal-500')
    expect(future).toHaveAttribute('stroke-dasharray', '2 1.5')

    const chartWidth = 720 - 180
    const expectedFutureX = 180
      + ((todayMs - domainStartMs) / (domainEndMs - domainStartMs)) * chartWidth
    expect(Number(future?.getAttribute('x'))).toBeCloseTo(expectedFutureX, 5)
    expect(container.querySelector('[data-timeline-today]')).toHaveAttribute(
      'pointer-events',
      'none',
    )
    const currentRow = container.querySelector('[data-timeline-current-row]')
    expect(currentRow).not.toBeNull()
    expect(currentRow).toHaveClass('fill-primary/[0.06]', 'dark:fill-primary/10')
    expect(currentRow?.parentElement).toHaveAttribute('data-timeline-drug-current', 'true')

    fireEvent.mouseEnter(future!)
    expect(screen.getByText('今日後')).toBeInTheDocument()

    nowSpy.mockRestore()
  })
})
