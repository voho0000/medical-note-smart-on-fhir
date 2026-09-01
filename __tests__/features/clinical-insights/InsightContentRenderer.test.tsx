import { render } from '@testing-library/react'
import { InsightContentRenderer } from '@/features/clinical-insights/components/InsightContentRenderer'
import {
  insightContentToPlainText,
  sanitizeInsightHtml,
} from '@/features/clinical-insights/utils/insight-content'

describe('InsightContentRenderer', () => {
  it('keeps plain-text newlines and literal Markdown characters unchanged', () => {
    const content = 'S:主觀資料\n# Hypothyroidism\n\nA:診斷\nI10 Essential hypertension'
    const { container } = render(
      <InsightContentRenderer content={content} format="plain-text" />,
    )

    const pre = container.querySelector('pre')
    expect(pre).toHaveClass('whitespace-pre-wrap')
    expect(pre?.textContent).toBe(content)
    expect(insightContentToPlainText(content, 'plain-text')).toBe(content)
  })

  it('sanitizes HTML without allowing requests, scripts, styles, or controls', () => {
    const unsafe = [
      '<h2 class="foreign">Assessment</h2>',
      '<p style="color:red" onclick="alert(1)">Stable</p>',
      '<a href="https://example.com/patient">external</a>',
      '<img src="https://example.com/pixel.png" onerror="alert(1)">',
      '<script>alert(1)</script>',
      '<table><tr><th scope="col">Code</th><td colspan="2">I10</td></tr></table>',
    ].join('')
    const sanitized = sanitizeInsightHtml(unsafe)
    const { container } = render(
      <InsightContentRenderer content={unsafe} format="html" />,
    )

    expect(sanitized).toContain('<h2>Assessment</h2>')
    expect(sanitized).toContain('scope="col"')
    expect(sanitized).toContain('colspan="2"')
    expect(sanitized).not.toMatch(/class=|style=|onclick=|href=|src=/)
    expect(container.querySelector('a, img, script, style, button, iframe')).toBeNull()
    expect(container).toHaveTextContent('external')
    expect(insightContentToPlainText(unsafe, 'html')).toContain('Assessment')
  })
})
