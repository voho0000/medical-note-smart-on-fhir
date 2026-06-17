// HighlightText wraps query matches in <mark> for search-result highlighting.
// It must be a no-op when there's no query/match, case-insensitive, and treat
// the query as a literal substring (never a regex) so user input is safe.
import { render } from '@testing-library/react'
import { HighlightText } from '@/src/shared/components/HighlightText'

describe('HighlightText', () => {
  it('renders plain text and no <mark> when there is no query', () => {
    const { container } = render(<HighlightText text="Blood Pressure" />)
    expect(container.textContent).toBe('Blood Pressure')
    expect(container.querySelector('mark')).toBeNull()
  })

  it('wraps a case-insensitive match while preserving the original text', () => {
    const { container } = render(<HighlightText text="Blood Pressure" query="pres" />)
    expect(container.textContent).toBe('Blood Pressure')
    expect(container.querySelector('mark')?.textContent).toBe('Pres')
  })

  it('renders plain text when the query does not match', () => {
    const { container } = render(<HighlightText text="Blood Pressure" query="xyz" />)
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('Blood Pressure')
  })

  it('highlights every occurrence', () => {
    const { container } = render(<HighlightText text="aXaXa" query="x" />)
    expect(container.querySelectorAll('mark').length).toBe(2)
  })

  it('treats the query as a literal substring, not a regex', () => {
    const { container } = render(<HighlightText text="a.b.c" query="." />)
    // A regex "." would match every char; literal "." matches only the dots.
    expect(container.querySelectorAll('mark').length).toBe(2)
    expect(container.textContent).toBe('a.b.c')
  })
})
