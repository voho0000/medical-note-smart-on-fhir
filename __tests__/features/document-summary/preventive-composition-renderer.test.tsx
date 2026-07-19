import { fireEvent, render, screen, within } from '@testing-library/react'
import { CompositionRenderer } from '@/features/clinical-summary/document-summary/components/CompositionRenderer'

const LABELS = {
  documentDate: '日期',
  author: '作者',
  custodian: '保管單位',
  noSections: '無內容',
  fullDocument: '完整文件',
  expandFullDocument: '展開全文',
  collapseFullDocument: '收合全文',
  sectionCount: '{count} 個章節',
}

describe('preventive-care Composition continuous document mode', () => {
  it('renders Composition.text followed by every section narrative in source order', () => {
    const { container } = render(
      <CompositionRenderer
        composition={{
          id: 'preventive-1',
          status: 'final',
          type: {
            coding: [
              { system: 'https://bridge.example/document-type', code: 'adult-checkup' },
              { system: 'http://loinc.org', code: '75484-6' },
            ],
          },
          text: {
            status: 'generated',
            div: '<div><p>成人預防保健總覽</p></div>',
          },
          section: [
            {
              title: '一般檢查',
              text: { div: '<div><table><tr><td>身高</td><td>168 cm</td></tr></table></div>' },
            },
            {
              title: '血壓',
              code: { coding: [{ code: '8716-3' }] },
              text: { div: '<div><p>收縮壓 120 mmHg</p></div>' },
            },
            {
              title: '血脂肪',
              text: { div: '<div><p>總膽固醇 180 mg/dL</p></div>' },
            },
          ],
        }}
        // Even when a known section LOINC has a localized label, the Bridge
        // chapter title is authoritative in continuous-document mode.
        resolveSectionLabel={() => '生命徵象'}
        labels={LABELS}
      />,
    )

    const article = container.querySelector('[data-continuous-composition="true"]')
    const sectionGrid = container.querySelector('[data-preventive-section-grid="true"]')
    expect(article).toHaveAttribute('data-composition-layout', 'preventive-care')
    expect(article).toHaveClass('@container')
    expect(sectionGrid).toHaveClass('grid', 'grid-cols-1', '@min-[52rem]:grid-cols-2')
    expect(screen.getByRole('button', { name: '收合全文' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(article as HTMLElement).getByText('3 個章節')).toBeInTheDocument()
    expect(within(article as HTMLElement).getByText('成人預防保健總覽')).toBeInTheDocument()
    expect(article!.querySelector('[data-composition-narrative="true"]')).toHaveClass(
      'text-xs',
      'leading-normal',
      '[&_p]:!leading-normal',
    )
    expect(within(article as HTMLElement).getByRole('heading', { name: '一般檢查' })).toBeInTheDocument()
    expect(within(article as HTMLElement).getByRole('heading', { name: '血壓' })).toBeInTheDocument()
    expect(within(article as HTMLElement).getByRole('heading', { name: '血脂肪' })).toBeInTheDocument()
    expect(within(article as HTMLElement).getByText('身高')).toBeInTheDocument()
    expect(within(article as HTMLElement).getByText('收縮壓 120 mmHg')).toBeInTheDocument()
    expect(within(article as HTMLElement).getByText('總膽固醇 180 mg/dL')).toBeInTheDocument()

    const visibleText = article!.textContent ?? ''
    expect(visibleText.indexOf('成人預防保健總覽')).toBeLessThan(visibleText.indexOf('一般檢查'))
    expect(visibleText.indexOf('一般檢查')).toBeLessThan(visibleText.indexOf('血壓'))
    expect(visibleText.indexOf('血壓')).toBeLessThan(visibleText.indexOf('血脂肪'))
    expect(sectionGrid!.children).toHaveLength(3)
    expect(article!.querySelectorAll('[data-composition-section]')).toHaveLength(3)
    const tableSection = within(sectionGrid as HTMLElement)
      .getByRole('table')
      .closest('[data-composition-section]')
    const tableNarrative = tableSection?.children.item(1)
    expect(tableNarrative?.className).toContain('[&_table]:w-full')
    expect(tableNarrative?.className).toContain('[&_table]:table-fixed')
    expect(tableNarrative?.className).toContain('[&_col:first-child]:w-[36%]')
    expect(screen.queryByRole('button', { name: /一般檢查|血壓|血脂肪/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '收合全文' }))
    expect(screen.getByRole('button', { name: '展開全文' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('成人預防保健總覽')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '一般檢查' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展開全文' }))
    expect(screen.getByRole('button', { name: '收合全文' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { name: '一般檢查' })).toBeInTheDocument()
  })

  it('keeps other Composition types in the existing collapsible layout', () => {
    render(
      <CompositionRenderer
        composition={{
          id: 'ips-1',
          type: { coding: [{ code: '60591-5' }] },
          section: [{ title: '問題清單', text: { div: '<div>高血壓</div>' } }],
        }}
        resolveSectionLabel={() => null}
        labels={LABELS}
      />,
    )

    expect(screen.getByRole('button', { name: '問題清單' })).toHaveAttribute('data-state', 'closed')
    expect(screen.queryByText('高血壓')).not.toBeInTheDocument()
    expect(document.querySelector('[data-preventive-section-grid="true"]')).toBeNull()
  })
})
