/**
 * Extract the institution segment from bridge-generated document titles:
 * "出院病摘 — 長庚嘉義 2025-05-18~2025-05-22" → "長庚嘉義".
 *
 * Prefer structured FHIR organization fields whenever they exist. This is the
 * final fallback for NHI DocumentReferences whose author/custodian is absent.
 */
export function extractInstitutionFromDocumentTitle(title?: string): string | undefined {
  if (!title) return undefined
  const separator = title.match(/\s[—-]\s(.+)$/)
  if (!separator) return undefined

  const afterSeparator = separator[1].trim()
  const institution = afterSeparator
    .replace(/\s+\d{4}-\d{2}-\d{2}(?:~\d{4}-\d{2}-\d{2})?\s*$/, '')
    .trim()

  return institution || undefined
}
