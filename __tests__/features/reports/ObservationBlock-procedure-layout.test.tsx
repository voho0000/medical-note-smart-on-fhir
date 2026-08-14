import { render, screen } from '@testing-library/react'
import { ObservationBlock } from '@/features/clinical-summary/reports/components/ObservationBlock'
import type { Observation } from '@/features/clinical-summary/reports/types'

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))

describe('ObservationBlock procedure detail layout', () => {
  it('wraps a complete ICD-10-PCS display instead of truncating it as a lab value', () => {
    const fullDisplay = '0BBC4ZZ · 經皮內視鏡右上肺葉部分切除術'
    const observation = {
      resourceType: 'Observation',
      id: 'procedure-main',
      code: { text: '主手術' },
      component: [{
        code: { text: 'ICD-10-PCS' },
        valueString: fullDisplay,
      }],
      _detailsOnly: true,
    } as Observation & { _detailsOnly: true }

    render(<ObservationBlock observation={observation} />)

    const value = screen.getByText(fullDisplay)
    expect(value).toHaveClass('whitespace-normal', 'break-words')
    expect(value).not.toHaveClass('truncate')
    const detailLine = value.parentElement
    const row = value.parentElement
    expect(row).toHaveClass('flex', 'items-baseline', 'leading-snug')
    expect(row?.parentElement).toHaveClass('flex', 'flex-wrap', 'gap-x-5')
    expect(value).toHaveClass('font-semibold')
    expect(detailLine).toHaveTextContent(`ICD-10-PCS${fullDisplay}`)
  })

  it('lays out each related procedure as two information lines beside its name', () => {
    const observation = {
      resourceType: 'Observation',
      id: 'procedure-main',
      code: { text: '主手術' },
      component: [{
        code: { text: '經皮內視鏡腹膜鬆解術' },
        valueString: '0DNW4ZZ · 經皮內視鏡腹膜鬆解術',
        _isProcedureChild: true,
        _procedureCodeLabel: 'ICD-10-PCS',
        _procedureSourceLabel: '來源',
        _procedureSource: '住院次處置',
        _procedureDateLabel: '明載日期',
        _procedureDate: '未明載',
      }],
      _detailsOnly: true,
    } as unknown as Observation

    render(<ObservationBlock observation={observation} />)

    const title = screen.getByText('經皮內視鏡腹膜鬆解術')
    const block = title.parentElement
    expect(block).not.toBeNull()
    expect(block).toHaveClass(
      'grid',
      'basis-full',
      'sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.5fr)]',
      'gap-y-0.5',
      'pt-2',
    )
    expect(title).toHaveClass('sm:row-span-2')
    expect(block).toHaveTextContent('ICD-10-PCS')
    expect(block).toHaveTextContent('0DNW4ZZ · 經皮內視鏡腹膜鬆解術')
    expect(block).toHaveTextContent('來源住院次處置')
    expect(block).toHaveTextContent('明載日期未明載')

    const codeLine = screen.getByText('0DNW4ZZ · 經皮內視鏡腹膜鬆解術').parentElement
    expect(codeLine?.parentElement).toHaveClass('leading-snug')
    expect(codeLine?.parentElement?.nextElementSibling).toHaveTextContent('來源住院次處置')
    expect(codeLine?.parentElement?.nextElementSibling).toHaveTextContent('明載日期未明載')
  })
})
