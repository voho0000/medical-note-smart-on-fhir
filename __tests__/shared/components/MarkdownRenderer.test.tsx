import { render, screen } from '@testing-library/react'
import { MarkdownRenderer } from '@/src/shared/components/MarkdownRenderer'

const TABLE = [
  '| 項目 | 數值 | 參考值 | 說明 |',
  '| --- | --- | --- | --- |',
  '| 血紅素 | 10.2 | 13-17 | 偏低，可能與貧血有關，建議追蹤 |',
].join('\n')

describe('MarkdownRenderer tables', () => {
  it('wraps tables in a horizontal scroll container so wide tables never crush the bubble', () => {
    const { container } = render(<MarkdownRenderer content={TABLE} />)

    const table = container.querySelector('table')
    expect(table).not.toBeNull()

    const wrapper = table!.parentElement!
    expect(wrapper.tagName).toBe('DIV')
    expect(wrapper.className).toContain('overflow-x-auto')
    expect(wrapper.className).toContain('overscroll-x-contain')
    expect(wrapper.className).toContain('touch-pan-x')

    // A per-cell min-width floor keeps columns readable (text still wraps)
    // instead of max-content, which would force a long horizontal scroll.
    expect(table!.className).toContain('[&_td]:min-w-[6rem]')
    expect(table!.className).toContain('[&_th]:whitespace-nowrap')
    expect(table!.className).not.toContain('w-max')
    // Still full width when the table fits.
    expect(table!.className).toContain('min-w-full')
    expect(table!.className).toContain('table-auto')
  })

  it('keeps table content intact', () => {
    render(<MarkdownRenderer content={TABLE} />)
    expect(screen.getByText('血紅素')).toBeInTheDocument()
    expect(screen.getByText('偏低，可能與貧血有關，建議追蹤')).toBeInTheDocument()
  })
})
