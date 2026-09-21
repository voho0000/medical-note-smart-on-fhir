import { render, screen } from '@testing-library/react'
import type { CdssCoverageSummary } from '@voho0000/personalized-care'
import { TherapyResponseChart } from '@/features/clinical-decision-support/renderers/TherapyResponseChart'

type Therapy = NonNullable<CdssCoverageSummary['therapy']>

describe('TherapyResponseChart', () => {
  it('folds a multi-year interval so recent treatment response remains readable', () => {
    const therapy: Therapy = {
      label: '現行降脂治療',
      value: 'Atorvastatin 40 mg',
      timeline: [{
        classId: 'statin',
        classLabel: 'Statin',
        from: '2025-05-01',
        to: '2025-09-01',
        label: 'Atorvastatin 40 mg',
        dose: '40 mg',
        count: 4,
        changed: false,
      }],
      response: [
        { date: '2018-12-09', value: 135, display: '135 mg/dL' },
        { date: '2025-05-03', value: 70, display: '70 mg/dL' },
        { date: '2025-06-03', value: 68, display: '68 mg/dL' },
        { date: '2025-07-03', value: 66, display: '66 mg/dL' },
        { date: '2025-08-03', value: 60, display: '60 mg/dL' },
        { date: '2025-09-03', value: 53, display: '53 mg/dL' },
      ],
    }

    const { container } = render(<TherapyResponseChart therapy={therapy} goal={55} locale="zh-TW" />)

    expect(screen.getByText('// 表示長期無資料區間已折疊')).toBeVisible()
    expect(container.querySelector('[aria-label*="年無資料"]')).toBeInTheDocument()

    const points = [...container.querySelectorAll<SVGCircleElement>('svg circle[r="5"]')]
    const recentStart = Number(points[1].getAttribute('cx'))
    const recentEnd = Number(points.at(-1)!.getAttribute('cx'))
    expect(recentEnd - recentStart).toBeGreaterThan(250)

    const monthLabels = [...container.querySelectorAll<SVGTextElement>('svg text')]
      .filter((element) => /^\d{2}\/\d{2}$/.test(element.textContent ?? ''))
    const positions = monthLabels.map((element) => Number(element.getAttribute('x')))
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index] - positions[index - 1]).toBeGreaterThanOrEqual(54)
    }
  })
})
