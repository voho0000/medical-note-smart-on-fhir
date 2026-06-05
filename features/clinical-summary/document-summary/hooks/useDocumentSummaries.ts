// useDocumentSummaries
// Reads parsed Composition + DocumentReference resources from the clinical
// data store and adapts them into a unified DocumentEntry list (newest first)
// for DocumentSummaryCard.
//
// Source coverage:
// - Composition: IPS bundles and any other document-type bundle that ships
//   narrative-bearing sections.
// - DocumentReference: 健保存摺 discharge summaries (bridge v0.17.0+) and
//   other clinical-note attachments with inline HTML / text content. PDF /
//   image attachments are intentionally NOT included — they have dedicated
//   viewers elsewhere.
//
// Bridge data that only carries structured resources still returns `[]` here,
// so DocumentSummaryCard hides itself via FeatureCard's `isEmpty` path.
import { useMemo } from 'react'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import type { DocumentEntry } from '../types'
import { buildDocumentEntries } from '../utils/document-adapter'

export interface UseDocumentSummariesReturn {
  entries: DocumentEntry[]
  isLoading: boolean
  error: Error | null
}

export function useDocumentSummaries(
  docTypeStrings: Record<string, string>,
): UseDocumentSummariesReturn {
  const { compositions, documentReferences, isLoading, error } = useClinicalData()

  const entries = useMemo(
    () => buildDocumentEntries(compositions, documentReferences, docTypeStrings),
    [compositions, documentReferences, docTypeStrings],
  )

  return { entries, isLoading, error }
}
