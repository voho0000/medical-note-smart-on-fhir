import DOMPurify from 'dompurify'
import type { InsightOutputFormat } from '@/src/shared/constants/clinical-insights.constants'
import { markdownToPlainText } from '@/src/shared/utils/markdown-to-text'

const SAFE_INSIGHT_HTML_TAGS = [
  'p', 'div', 'span', 'br', 'hr',
  'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'b', 'i', 'em', 'strong', 'small', 'sub', 'sup', 'u', 's',
  'blockquote', 'pre', 'code',
]

const SAFE_INSIGHT_HTML_ATTRIBUTES = [
  'colspan', 'rowspan', 'scope', 'lang', 'dir', 'title',
]

/**
 * Sanitize model-produced HTML using a deliberately smaller policy than FHIR
 * Narrative. In particular, generated summaries cannot initiate requests,
 * alter the app's visual system, or add interactive controls.
 */
export function sanitizeInsightHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return ''
  if (typeof window === 'undefined') return ''

  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: SAFE_INSIGHT_HTML_TAGS,
    ALLOWED_ATTR: SAFE_INSIGHT_HTML_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    FORBID_TAGS: [
      'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
      'img', 'a', 'svg', 'math', 'link', 'meta', 'base', 'audio', 'video', 'source',
    ],
    FORBID_ATTR: [
      'style', 'class', 'id', 'href', 'src', 'srcset', 'action', 'formaction',
      'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
    ],
  })
}

function sanitizedHtmlToPlainText(rawHtml: string): string {
  const sanitized = sanitizeInsightHtml(rawHtml)
  if (!sanitized || typeof document === 'undefined') return ''

  const wrapper = document.createElement('div')
  wrapper.innerHTML = sanitized

  wrapper.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  wrapper.querySelectorAll('th, td').forEach((node) => {
    if (node.nextElementSibling) node.append('\t')
  })
  wrapper.querySelectorAll(
    'p, div, hr, h2, h3, h4, h5, h6, tr, caption, li, dt, dd, blockquote, pre',
  ).forEach((node) => node.append('\n'))

  return (wrapper.textContent ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function insightContentToPlainText(
  content: string,
  format: InsightOutputFormat,
): string {
  if (format === 'plain-text') return content
  if (format === 'html') return sanitizedHtmlToPlainText(content)
  return markdownToPlainText(content)
}
