// IPS Path A — 帶入醫療摘要: reuse the Medical Summary's already-generated
// problem list as IPS problem-list candidates instead of re-running a full
// LLM inference.
//
// One pure stage:
//   mapSummaryProblemsToIpsCandidates(problems, sources)
//     — deterministic: reverse-resolves each SummaryProblem's catalog keys
//       (via the summary's own source index / catalog) into IPS ProblemEvidence,
//       with a conservative confidence heuristic. No AI, no codes — the problem
//       list is text-only (the app never generates SNOMED CT / ICD codes).
//
// Candidates flow into the SAME review UI as inferred problems: default
// UNCHECKED, per-item human confirmation before inferredToCondition/merge.

import type { SummaryProblem } from '@/src/core/entities/medical-summary.entity'
import type { InferredProblem, ProblemEvidence, EvidenceKind } from './inferred-problems-types'

// ── Stage 1: deterministic mapping ──────────────────────────────────────────

/**
 * Minimal source-resolution shape — satisfied both by the app-built
 * SummarySourceCatalogEntry and by a verified ResolvedSourceRef (the cached
 * summary's own `sourceIndex`, which snapshots key→resource at generation
 * time and therefore survives later data-selection changes).
 */
export interface SummarySourceLookupEntry {
  key: string
  resourceType?: string
  resourceId?: string
  display?: string
  date?: string
}

/** Summary catalog resourceType → IPS evidence kind. Unmapped types (and
 * unresolvable keys) drop that piece of evidence, never the whole problem. */
function evidenceKindForResourceType(resourceType?: string): EvidenceKind | null {
  if (!resourceType) return null
  if (resourceType.startsWith('Medication')) return 'medication'
  switch (resourceType) {
    case 'Encounter':
      return 'encounter-icd'
    case 'DiagnosticReport':
    case 'Observation':
      return 'lab'
    case 'DocumentReference':
      return 'discharge-excerpt'
    case 'Composition':
    case 'CarePlan':
      return 'composition'
    default:
      return null
  }
}

const CJK_RE = /[\u3400-\u9FFF]/

/**
 * Map the medical summary's problems into IPS candidate rows.
 *  - evidence: each cited catalog key is reverse-resolved via `sources`;
 *    unknown keys and unmapped resource types are tolerated (skipped).
 *  - confidence heuristic: a problem citing coded Encounter/Condition evidence
 *    is 'medium'; anything else (labs/meds/documents only) is 'low'. Never
 *    'high' — the summary carries no ICD anchor for Strategy B.
 *  - labels: the summary label is kept verbatim on its own language side
 *    (CJK → labelZh, otherwise labelEn); the other side is left blank.
 */
export function mapSummaryProblemsToIpsCandidates(
  problems: ReadonlyArray<SummaryProblem>,
  sources: ReadonlyArray<SummarySourceLookupEntry>,
): InferredProblem[] {
  const byKey = new Map(sources.map((s) => [s.key, s]))

  return problems
    .filter((p) => p.label?.trim())
    .map((p, i) => {
      const entries = (p.sourceKeys ?? [])
        .map((key) => byKey.get(key.trim()))
        .filter((entry): entry is SummarySourceLookupEntry => Boolean(entry))

      const evidence: ProblemEvidence[] = entries.flatMap((entry) => {
        const kind = evidenceKindForResourceType(entry.resourceType)
        if (!kind) return []
        return [
          {
            kind,
            label: entry.display?.trim() || entry.key,
            sourceId: entry.resourceId,
            date: entry.date,
          },
        ]
      })

      const hasCodedAnchor = entries.some(
        (entry) => entry.resourceType === 'Encounter' || entry.resourceType === 'Condition',
      )

      const label = p.label.trim()
      const isCjk = CJK_RE.test(label)

      return {
        id: `summary-${i}`,
        labelZh: isCjk ? label : '',
        labelEn: isCjk ? '' : label,
        inferenceConfidence: hasCodedAnchor ? 'medium' : 'low',
        evidence,
        rationale: p.basis?.trim() || undefined,
        origin: 'summary',
      } satisfies InferredProblem
    })
}
