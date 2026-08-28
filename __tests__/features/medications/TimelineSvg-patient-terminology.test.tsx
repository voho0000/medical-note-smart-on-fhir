import { fireEvent, render, screen, within } from '@testing-library/react'
import { TimelineSvg } from '@/features/clinical-summary/medications/timeline/components/TimelineSvg'
import type { CategoryGroup } from '@/features/clinical-summary/medications/timeline/hooks/useMedicationTimeline'

beforeAll(() => {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

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
        terminologyAtcLevel4Label: 'ATC 化學／藥理次群組',
        timelineAtcOriginalEnglishLabel: 'WHO 英文原文',
        terminologySnapshotLabel: '藥典版本',
        terminologySource: '健保署藥品主檔補充',
        timelineAfterToday: '今日後',
        frequencyLabel: '頻次',
        dosageInstructionLabel: '用法用量',
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
    clinicalDrugKey: 'AC49322100',
    drugName: '愛克痰發泡錠600毫克',
    drugProductName: 'ACTEIN EFFERVESCENT TABLETS 600MG (ACETYLCYSTEINE)',
    isChronic: true,
    categoryKey: 'atc-level2:R05',
    categoryLabel: '咳嗽與感冒製劑',
    organizationKey: 'organization:test',
    organizationLabel: '測試醫院',
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
      atcLevel4Code: 'R05CB',
      atcLevel4NameZh: '祛痰藥與其他呼吸道分泌物調節劑',
    },
    bars: [{
      refillId: 'mr-1',
      startMs: new Date('2026-07-01').getTime(),
      endMs: new Date('2026-07-15').getTime(),
      supplyDays: 14,
      authoredOnIso: '2026-07-01',
      isChronic: true,
      frequency: 'BIDPC',
      pharmacy: '測試醫學中心附設門診藥局與長名稱調劑機構',
    }],
  }],
}]

describe('TimelineSvg patient terminology hover', () => {
  it('keeps ATC codes in accessible group details instead of visible headers', () => {
    const nestedCategories: CategoryGroup[] = [{
      ...categories[0],
      code: 'R05',
      nameEn: 'COUGH AND COLD PREPARATIONS',
      nameZh: '咳嗽與感冒製劑',
      level: 2,
      depth: 0,
      drugCount: 1,
      drugs: [],
      children: [{
        key: 'atc-level4:R03AL',
        code: 'R03AL',
        label: 'β2 促效劑／抗膽鹼劑複方（含三合一）',
        nameEn: 'Adrenergics in combination with anticholinergics incl. triple combinations with corticosteroids',
        nameZh: 'β2 促效劑／抗膽鹼劑複方（含三合一）',
        level: 4,
        depth: 1,
        drugCount: 1,
        chronicCount: 1,
        nonChronicCount: 0,
        drugs: categories[0].drugs,
      }],
    }]

    const { container } = render(
      <TimelineSvg
        categories={nestedCategories}
        domainStartMs={new Date('2026-06-01').getTime()}
        domainEndMs={new Date('2026-08-01').getTime()}
        width={720}
      />,
    )

    expect(container.querySelector('[data-timeline-group-depth="0"]')?.textContent)
      .toBe('咳嗽與感冒製劑 (1)')
    expect(container.querySelector('[data-timeline-group-depth="1"]')?.textContent)
      .toBe('β2 促效劑／抗膽鹼劑複方（含三合一） (1)')
    const longHeader = container.querySelector<SVGGElement>(
      '[data-timeline-group-depth="1"]',
    )
    expect(Number(longHeader?.querySelector('rect')?.getAttribute('height')))
      .toBe(22)
    expect(Number(longHeader?.querySelector('foreignObject')?.getAttribute('width')))
      .toBeGreaterThan(180)
    expect(longHeader?.querySelector('foreignObject div')).toHaveStyle({
      whiteSpace: 'nowrap',
      overflow: 'visible',
    })
    expect(longHeader?.querySelector('[tabindex="0"]'))
      .toHaveClass('inline-block', 'whitespace-nowrap')
    const translatedHeader = container.querySelector<SVGGElement>(
      '[data-timeline-group-depth="0"]',
    )
    const originalEnglishTrigger = translatedHeader?.querySelector<HTMLElement>(
      '[tabindex="0"]',
    )
    expect(originalEnglishTrigger).toHaveAccessibleName(
      '咳嗽與感冒製劑。ATC 分類：R05。WHO 英文原文：COUGH AND COLD PREPARATIONS',
    )
    expect(container.querySelector('[data-timeline-group-depth="1"] [tabindex="0"]'))
      .toHaveAccessibleName(
        'β2 促效劑／抗膽鹼劑複方（含三合一）。ATC 分類：R03AL。WHO 英文原文：Adrenergics in combination with anticholinergics incl. triple combinations with corticosteroids',
      )

    fireEvent.click(originalEnglishTrigger!)
    const groupDetails = screen.getByTestId('timeline-atc-group-details')
    expect(groupDetails).toHaveClass('cursor-text', 'select-text')
    expect(within(groupDetails).getByText('R05')).toBeInTheDocument()
    expect(within(groupDetails).getByText('COUGH AND COLD PREPARATIONS'))
      .toBeInTheDocument()
  })

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

    const tooltip = screen.getByTestId('timeline-medication-tooltip')
    expect(tooltip).toHaveClass('fixed')
    expect(tooltip).toHaveStyle({ width: '360px' })
    expect(screen.getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()
    expect(screen.getByText('ACTEIN EFFERVESCENT TABLETS 600MG')).toBeInTheDocument()
    expect(screen.getByText('R05CB01 · acetylcysteine')).toBeInTheDocument()
    expect(screen.getByText('R05CB · 祛痰藥與其他呼吸道分泌物調節劑'))
      .toHaveClass('break-words')
    expect(screen.getByText('nhi-drug-terminology-20260728'))
      .not.toHaveClass('truncate')
    expect(within(tooltip).getByText(/測試醫學中心附設門診藥局與長名稱調劑機構/))
      .toHaveClass('break-words')
    expect(within(tooltip).getByText('用法用量:')).toBeInTheDocument()
    expect(within(tooltip).getByText('BIDPC')).toBeInTheDocument()
    expect(tooltip.querySelector('.truncate')).not.toBeInTheDocument()
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
