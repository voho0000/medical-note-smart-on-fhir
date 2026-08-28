// Security-relevant tests for sanitizeNarrative — the helper feeds the result
// into dangerouslySetInnerHTML inside CompositionRenderer, so any regression
// that lets <script> / event handlers / javascript: URLs through would expose
// the app to XSS via a crafted IPS bundle.
//
// These tests also exercise hasNarrativeContent, which gates whether
// DocumentSummaryCard shows a Composition at all.

/**
 * @jest-environment jsdom
 */

import {
  sanitizeNarrative,
  hasNarrativeContent,
} from '@/features/clinical-summary/document-summary/utils/sanitize-narrative'

describe('sanitizeNarrative', () => {
  it('returns empty string for missing / non-string input', () => {
    expect(sanitizeNarrative(undefined)).toBe('')
    expect(sanitizeNarrative('')).toBe('')
    expect(sanitizeNarrative(null as any)).toBe('')
  })

  it('preserves safe FHIR Narrative XHTML (paragraphs, tables, lists)', () => {
    const xhtml = `
      <div xmlns="http://www.w3.org/1999/xhtml">
        <h3>Problem List</h3>
        <p>Patient has the following conditions:</p>
        <ul>
          <li>Type 2 diabetes</li>
          <li>Hypertension</li>
        </ul>
        <table>
          <thead><tr><th>Drug</th><th>Dose</th></tr></thead>
          <tbody><tr><td>Metformin</td><td>500 mg BID</td></tr></tbody>
        </table>
      </div>
    `
    const out = sanitizeNarrative(xhtml)
    expect(out).toContain('<h3>Problem List</h3>')
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>Type 2 diabetes</li>')
    expect(out).toContain('<table>')
    expect(out).toContain('<th>Drug</th>')
    expect(out).toContain('Metformin')
  })

  it('strips <script> tags', () => {
    const out = sanitizeNarrative(
      '<div><p>safe</p><script>alert(1)</script></div>',
    )
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('safe')
  })

  it('strips inline event handlers', () => {
    const out = sanitizeNarrative(
      '<div><p onclick="alert(1)">click me</p></div>',
    )
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('click me')
  })

  it('strips javascript: URLs from anchors', () => {
    const out = sanitizeNarrative(
      '<div><a href="javascript:alert(1)">x</a></div>',
    )
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('alert(1)')
  })

  it('strips <iframe>, <object>, <embed>, <form>', () => {
    const out = sanitizeNarrative(`
      <div>
        <iframe src="https://evil.example"></iframe>
        <object data="x.swf"></object>
        <embed src="x.swf" />
        <form action="x"><input name="y" /></form>
        <p>safe</p>
      </div>
    `)
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<object')
    expect(out).not.toContain('<embed')
    expect(out).not.toContain('<form')
    expect(out).not.toContain('<input')
    expect(out).toContain('safe')
  })

  it('strips style elements (host design system should win)', () => {
    const out = sanitizeNarrative('<div><style>body{display:none}</style><p>safe</p></div>')
    expect(out).not.toContain('<style')
    expect(out).not.toContain('display:none')
    expect(out).toContain('safe')
  })
})

describe('hasNarrativeContent', () => {
  it('returns false for falsy input', () => {
    expect(hasNarrativeContent(undefined)).toBe(false)
    expect(hasNarrativeContent('')).toBe(false)
  })

  it('returns false for an empty FHIR Narrative div', () => {
    expect(hasNarrativeContent('<div xmlns="http://www.w3.org/1999/xhtml"/>')).toBe(false)
    expect(hasNarrativeContent('<div xmlns="http://www.w3.org/1999/xhtml"></div>')).toBe(false)
    expect(hasNarrativeContent('<div xmlns="http://www.w3.org/1999/xhtml">   </div>')).toBe(false)
  })

  it('returns true for narratives with visible text', () => {
    expect(hasNarrativeContent('<div><p>Hello</p></div>')).toBe(true)
  })

  it('returns true for table-only narratives (no text outside cells)', () => {
    expect(
      hasNarrativeContent('<div><table><tr><td>x</td></tr></table></div>'),
    ).toBe(true)
  })
})
