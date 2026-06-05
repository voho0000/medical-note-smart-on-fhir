// sanitize-narrative.ts
// Wraps DOMPurify with a FHIR Narrative-aware whitelist. The FHIR spec
// (R4 §2.42) restricts Narrative.div to a subset of XHTML; we further
// constrain it to elements that render meaningfully inside our card layout
// and strip anything script/style/event-handler related.
//
// The output is intended for `dangerouslySetInnerHTML` — never feed it
// raw text from any other source through this helper.
import DOMPurify from 'dompurify'

// Allowed tags per the FHIR Narrative XHTML subset, minus form/script/style
// elements that have no place in a clinical narrative.
const ALLOWED_TAGS = [
  'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'b', 'i', 'em', 'strong', 'small', 'sub', 'sup', 'u', 's',
  'a', 'img', 'blockquote', 'pre', 'code',
]

// Safe presentational attributes only. `href` / `src` are kept for anchors
// and images but DOMPurify's URL filter strips javascript:/data: schemes.
const ALLOWED_ATTR = [
  'class', 'id', 'lang', 'dir', 'title',
  'href', 'target', 'rel',
  'src', 'alt', 'width', 'height',
  'colspan', 'rowspan', 'scope',
  // `style` intentionally omitted — FHIR Narrative shouldn't ship colours/
  // sizes that override the host app's design system.
]

/**
 * Sanitize a FHIR Narrative XHTML string to a safe HTML fragment.
 * Returns an empty string for falsy input.
 *
 * Also injects a `<colgroup>` into every multi-column table so the renderer
 * can use `table-layout: fixed` to honour the panel width. NHI 出院病摘 HTML
 * is authored without explicit column widths; combined with table-auto layout
 * the rows of label/value pairs let cells balloon past the sidebar panel.
 * Injecting `<col width="80">` for the label column makes table-fixed give
 * labels a sane footprint and content the remainder, eliminating the
 * horizontal scroll users hit on the discharge-summary view.
 */
export function sanitizeNarrative(rawXhtml?: string): string {
  if (!rawXhtml || typeof rawXhtml !== 'string') return ''
  // Guard against SSR — DOMPurify needs a DOM. The card is client-only
  // (`"use client"`) so this branch should never fire in practice, but
  // returning empty rather than crashing keeps the renderer defensive.
  if (typeof window === 'undefined') return ''
  const cleaned = DOMPurify.sanitize(rawXhtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Force anchors to open in a new tab when present (helps for any
    // narrative that links out to source attachments).
    ADD_ATTR: ['target'],
    // Reject any URL with a script-y scheme.
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  })
  return injectTableColgroups(cleaned)
}

/**
 * Post-process the sanitised HTML to insert a `<colgroup>` into every
 * multi-column table. Runs AFTER DOMPurify so the injected DOM can't
 * carry attacker-controlled content (only the `width` attribute on
 * `<col>` elements, both of which are already in the ALLOWED list).
 *
 * Algorithm: count the widest row (summing colspans), then prepend a
 * `<colgroup>` with the first `<col>` at 80px (≈ 5 CJK chars in 12pt) and
 * the rest auto. Tables with a single column are left alone — no benefit.
 */
function injectTableColgroups(html: string): string {
  if (!html || !html.includes('<table')) return html
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  for (const table of Array.from(wrapper.querySelectorAll('table'))) {
    if (table.querySelector(':scope > colgroup')) continue // already has one
    // Pass 1: find max column count across all rows (sum colspans per row).
    const rows = Array.from(table.querySelectorAll('tr'))
    let maxCols = 0
    const rowSpans: number[] = []
    rows.forEach((tr) => {
      let count = 0
      for (const cell of Array.from(tr.children)) {
        const cs = parseInt(cell.getAttribute('colspan') || '1', 10)
        count += Number.isFinite(cs) && cs > 0 ? cs : 1
      }
      rowSpans.push(count)
      if (count > maxCols) maxCols = count
    })
    if (maxCols < 2) continue

    // Pass 2: extend each row's last cell so it covers up to maxCols. Without
    // this, a 2-cell row in a 3-col table-fixed leaves col 3 unowned —
    // browsers then collapse the row's last cell to width 0 (the bug that
    // sent the content cell off-screen). Padding via colspan keeps every
    // row's last cell taking the remainder of the table width.
    rows.forEach((tr, i) => {
      const missing = maxCols - rowSpans[i]
      if (missing <= 0) return
      const lastCell = tr.lastElementChild
      if (!lastCell) return
      const current = parseInt(lastCell.getAttribute('colspan') || '1', 10)
      const safe = Number.isFinite(current) && current > 0 ? current : 1
      lastCell.setAttribute('colspan', String(safe + missing))
    })

    // Pass 3: prepend a colgroup that pins col 1 at 80px (label) and leaves
    // the rest to share the remaining width via table-layout: fixed.
    const cg = document.createElement('colgroup')
    const firstCol = document.createElement('col')
    firstCol.setAttribute('width', '80')
    cg.appendChild(firstCol)
    for (let i = 1; i < maxCols; i++) {
      cg.appendChild(document.createElement('col'))
    }
    table.insertBefore(cg, table.firstChild)
  }
  return wrapper.innerHTML
}

/**
 * Returns true if a narrative XHTML string has any rendered content once
 * sanitized and stripped of whitespace. Used to suppress empty / placeholder
 * narratives (FHIR allows `<div xmlns="..."/>` as a valid empty narrative).
 */
export function hasNarrativeContent(rawXhtml?: string): boolean {
  const cleaned = sanitizeNarrative(rawXhtml)
  if (!cleaned) return false
  // Strip tags + whitespace to check there's actual visible text. We accept
  // narratives that are pure tables (no text outside cells) by also checking
  // the raw cleaned length.
  const textOnly = cleaned.replace(/<[^>]*>/g, '').trim()
  return textOnly.length > 0 || cleaned.includes('<table') || cleaned.includes('<img')
}
