import { stripHtmlToText } from '@/src/core/utils/clinical-documents.utils'
import { decodeBase64Utf8 } from '@/src/shared/utils/base64.utils'
import type { DocumentEntry } from '../types'

export function getDocumentPlainText(entry: DocumentEntry): string {
  if (entry.sourceKind === 'composition' && entry.composition) {
    const compositionText = entry.composition.text?.div
      ? stripHtmlToText(entry.composition.text.div)
      : ''
    const sectionText = (entry.composition.section ?? [])
      .map((section) => {
        const text = section.text?.div ? stripHtmlToText(section.text.div) : ''
        if (!text) return ''
        return section.title ? `${section.title}:\n${text}` : text
      })
      .filter(Boolean)
      .join('\n\n')
    return [compositionText, sectionText].filter(Boolean).join('\n\n')
  }

  if (entry.attachment?.data) {
    const decoded = decodeBase64Utf8(entry.attachment.data)
    return decoded ? stripHtmlToText(decoded) : ''
  }

  return ''
}
