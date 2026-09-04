// The single, explicit DOCUMENT TEXT POLICY for every AI consumer.
//
//   consumer              | documentMode                                  | mode
//   ----------------------|-----------------------------------------------|------------
//   summary / insights    | latestAdmission · recentAdmissions ·           | keySections
//                         | deduplicatedAdmissions · all                   |
//   chat                  | (same automatic modes)                         | keySections
//   summary/insights/chat | custom (manual selection)                      | full
//   aiExport (AI handoff) | any mode, custom included                      | full
//
// Two guarantees live here, and both are load-bearing:
//
//  - MANUAL SELECTION IS NEVER ABRIDGED. Key-section extraction is an
//    automatic-mode reduction; a physician who ticked specific notes gets
//    exactly those notes, whole. Not even an explicit caller request overrides
//    this.
//  - THE HANDOFF IS NEVER ABRIDGED. `aiExport` is a complete export the
//    physician carries to an external assistant, not a token-budgeted request,
//    so it always sends whole documents — and therefore must never share a
//    cache identity with the reduced key-sections payload.
//
// Kept out of the hook module on purpose: the policy is domain logic that both
// `useClinicalContext` and `useClinicalAiInput` read, and consumers that mock
// the hook module must still get the real policy.

import type { DocumentTextMode } from '@/src/core/utils/clinical-documents.utils'

const FULL_DOCUMENT_TEXT_CONSUMERS: ReadonlySet<string> = new Set(['aiExport'])

/**
 * `consumer` is the application's DataConsumer ('chat' | 'insights' | 'ips' |
 * 'aiExport'), typed structurally here so core does not depend on application.
 */
export function resolveDocumentTextMode(
  consumer: string,
  documentMode: string | undefined,
  requested?: DocumentTextMode,
): DocumentTextMode {
  if (FULL_DOCUMENT_TEXT_CONSUMERS.has(consumer)) return 'full'
  if ((documentMode ?? 'deduplicatedAdmissions') === 'custom') return 'full'
  return requested ?? 'keySections'
}

/**
 * Cache-identity fragment for the resolved policy. A summary written from
 * complete documents and one written from key sections are different inputs
 * and must never be hydrated into each other.
 */
export function documentTextPolicyIdentity(
  mode: DocumentTextMode,
): { documentTextPolicy: string } {
  return { documentTextPolicy: mode === 'keySections' ? 'key-sections-v1' : 'complete-v1' }
}
