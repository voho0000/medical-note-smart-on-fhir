// IPS Phase 2.2 — multi-source LLM problem-list inference engine.
//
// The pipeline (all pure except the injected `llm`):
//   buildEvidenceDigest(data)  → compact, de-identified evidence bundle
//   buildInferencePrompt(...)  → house-style messages + embedded allowlist
//   llm(messages)              → JSON (injected; unit tests pass a canned fn)
//   parseInferenceResponse     → validated candidate rows (llm-json.ts)
//   resolveCoding(B/C/A/none)  → verified-allowlist SNOMED ladder
//   inferredToCondition        → synthetic ConditionEntity for the bundle merge
//
// SAFETY (memory/feedback_snomed_ct_verification.md): "aggressive" governs only
// the DIAGNOSIS inference. SNOMED CODING is never trusted from the LLM blind —
// resolveCoding always runs the verified-allowlist ladder, and a code outside the
// allowlist can never become high/medium-high confidence (Strategy A → low +
// needsManualCoding, amber UI). Nothing here mutates source data, and synthetic
// conditions only ever exist inside an IPS snapshot (never the React Query cache).

import type {
  ClinicalDataCollection,
  ConditionEntity,
  DocumentReferenceEntity,
  EncounterEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { AiMessage } from '@/src/core/entities/ai.entity'
import {
  normalizeIcd,
  lookupSctForIcd,
  verifiedSctByCode,
  VERIFIED_SCT_LIST,
  VERIFIED_SCT_CODES,
  SCT_SYSTEM,
  type VerifiedSct,
  type ConditionSctAnnotation,
} from './snomed-mapping'
import { SYSTEM } from './ips-constants'
import { decodeBase64Utf8 } from '@/features/clinical-summary/document-summary/utils/base64'
import { checkReferenceRangeAbnormal } from '@/features/clinical-summary/reports/utils/interpretation-helpers'
import { isChronicPrescription } from '@/features/clinical-summary/medications/utils/fhir-helpers'
import { parseInferenceResponse, type InferredProblemRaw } from './llm-json'
import type {
  InferredProblem,
  ProblemEvidence,
  CodingStrategy,
} from './inferred-problems-types'

/** LOINC for a hospital discharge summary (出院病摘) DocumentReference. */
const DISCHARGE_SUMMARY_LOINC = '18842-5'

/** Interpretation codes that mark an Observation abnormal (corroboration only). */
const ABNORMAL_INTERP = new Set(['H', 'HH', 'HI', 'L', 'LL', 'LO', 'A', 'AA', 'ABN', 'CRIT-HI', 'CRIT-LO'])

/** Injected LLM call — takes chat messages, resolves to the raw model text. */
export type InferenceLlm = (messages: AiMessage[]) => Promise<string>

// ── Evidence digest ──────────────────────────────────────────────────────────

/** One outpatient/inpatient ICD grouped across visits (frequency + recency). */
export interface DigestEncounterIcd {
  icd10: string
  /** Best human-readable label seen for this ICD (e.g. "E11.9 第二型糖尿病"). */
  textZh?: string
  /** How many encounters carried this ICD. */
  count: number
  /** Most recent encounter date carrying it (ISO). */
  lastDate?: string
  /** Source Encounter ids (capped, for audit). */
  encounterIds: string[]
}

/** One chronic (慢箋) medication, de-duplicated by display name. */
export interface DigestChronicMed {
  name: string
  classZh?: string
  classEn?: string
  medId: string
}

/** One discharge-summary / composition narrative excerpt (truncated). */
export interface DigestDischargeExcerpt {
  docId: string
  date?: string
  text: string
  kind: 'discharge-excerpt' | 'composition'
  truncated?: boolean
}

/** One abnormal lab value (corroboration only — never a sole basis). */
export interface DigestAbnormalLab {
  name: string
  value: string
  date?: string
  obsId: string
}

/** The compact, de-identified evidence bundle handed to the prompt builder. */
export interface EvidenceDigest {
  encounterIcds: DigestEncounterIcd[]
  chronicMeds: DigestChronicMed[]
  dischargeExcerpts: DigestDischargeExcerpt[]
  abnormalLabs: DigestAbnormalLab[]
}

/** Strip HTML tags + collapse whitespace from a decoded narrative. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Keep a narrative within `max` chars by keeping the head (diagnoses/HPI) and the
 * tail (discharge diagnosis/plan), which is where the load-bearing problem list
 * usually lives. Returns {text, truncated}.
 */
function headTailTruncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  const headLen = Math.floor(max * 0.7)
  const tailLen = max - headLen
  const head = text.slice(0, headLen)
  const tail = text.slice(text.length - tailLen)
  return { text: `${head}\n…\n${tail}`, truncated: true }
}

/** Best ISO date for an encounter (period.start preferred). */
function encounterDate(enc: EncounterEntity): string | undefined {
  return enc.period?.start || enc.period?.end || undefined
}

/** Render an observation value compactly for the abnormal-lab list. */
function formatObsValue(obs: ObservationEntity): string {
  if (obs.valueQuantity?.value !== undefined && obs.valueQuantity?.value !== null) {
    const unit = obs.valueQuantity.unit ? ` ${obs.valueQuantity.unit}` : ''
    return `${obs.valueQuantity.value}${unit}`
  }
  if (obs.valueString) return obs.valueString
  if (obs.valueCodeableConcept?.text) return obs.valueCodeableConcept.text
  return ''
}

/** True when an Observation carries an abnormal interpretation code. */
function hasAbnormalInterpretation(obs: ObservationEntity): boolean {
  const code = (obs.interpretation?.coding?.[0]?.code || obs.interpretation?.text || '')
    .toString()
    .toUpperCase()
    .trim()
  return code ? ABNORMAL_INTERP.has(code) : false
}

function obsName(obs: ObservationEntity): string {
  return obs.code?.text || obs.code?.coding?.[0]?.display || obs.code?.coding?.[0]?.code || ''
}

/**
 * Build the compact evidence digest from the full clinical collection. Pure.
 *  - `now` lets tests pin recency sorting (defaults to wall-clock).
 *  - `maxDischargeChars` caps each narrative (token-budget guard).
 */
export function buildEvidenceDigest(
  data: ClinicalDataCollection,
  now: Date = new Date(),
  maxDischargeChars = 6000,
): EvidenceDigest {
  // 1. Group Encounter.reasonCode ICDs by normalized code.
  const icdMap = new Map<string, DigestEncounterIcd>()
  for (const enc of data.encounters ?? []) {
    const date = encounterDate(enc)
    for (const rc of enc.reasonCode ?? []) {
      const rawCode = rc.coding?.[0]?.code
      const normalized = normalizeIcd(rawCode)
      if (!normalized) continue
      const label = rc.text || rc.coding?.[0]?.display || normalized
      const existing = icdMap.get(normalized)
      if (existing) {
        existing.count += 1
        if (date && (!existing.lastDate || date > existing.lastDate)) existing.lastDate = date
        if (existing.encounterIds.length < 10 && enc.id) existing.encounterIds.push(enc.id)
        // Prefer a richer (longer) human label if we find one.
        if (label && label.length > (existing.textZh?.length ?? 0)) existing.textZh = label
      } else {
        icdMap.set(normalized, {
          icd10: normalized,
          textZh: label,
          count: 1,
          lastDate: date,
          encounterIds: enc.id ? [enc.id] : [],
        })
      }
    }
  }
  const encounterIcds = [...icdMap.values()].sort(
    (a, b) => b.count - a.count || (b.lastDate ?? '').localeCompare(a.lastDate ?? ''),
  )

  // 2. Chronic (慢箋) meds, de-duplicated by display name.
  const medMap = new Map<string, DigestChronicMed>()
  for (const med of data.medications ?? []) {
    if (!isChronicPrescription(med)) continue
    const name =
      med.medicationCodeableConcept?.text ||
      med.medicationCodeableConcept?.coding?.[0]?.display ||
      med.medicationCodeableConcept?.coding?.[0]?.code ||
      ''
    if (!name) continue
    const key = name.toLowerCase()
    if (medMap.has(key)) continue
    medMap.set(key, {
      name,
      classZh: med.category?.[0]?.text || undefined,
      classEn: med.category?.[0]?.coding?.[0]?.display || undefined,
      medId: med.id,
    })
  }
  const chronicMeds = [...medMap.values()]

  // 3. Discharge-summary narratives + composition sections.
  const dischargeExcerpts: DigestDischargeExcerpt[] = []
  for (const doc of data.documentReferences ?? []) {
    if (!isDischargeSummary(doc)) continue
    const base64 = doc.content?.find((c) => c.attachment?.data)?.attachment?.data
    const decoded = decodeBase64Utf8(base64)
    const text = stripHtml(decoded)
    if (!text) continue
    const { text: clipped, truncated } = headTailTruncate(text, maxDischargeChars)
    dischargeExcerpts.push({
      docId: doc.id,
      date: doc.date || doc.context?.period?.start,
      text: clipped,
      kind: 'discharge-excerpt',
      truncated,
    })
  }
  for (const comp of data.compositions ?? []) {
    const sectionText = (comp.section ?? [])
      .map((s) => stripHtml(s.text?.div ?? ''))
      .filter(Boolean)
      .join('\n')
    if (!sectionText) continue
    const { text: clipped, truncated } = headTailTruncate(sectionText, maxDischargeChars)
    dischargeExcerpts.push({
      docId: comp.id,
      date: comp.date,
      text: clipped,
      kind: 'composition',
      truncated,
    })
  }

  // 4. Abnormal labs (corroboration only). Scan standalone observations + report
  //    members; dedup by id; cap to the most recent N.
  const abnormalMap = new Map<string, DigestAbnormalLab>()
  const considerObs = (obs: ObservationEntity) => {
    const id = obs.id
    if (!id || abnormalMap.has(id)) return
    if (!hasAbnormalInterpretation(obs) && !checkReferenceRangeAbnormal(obs)) return
    const value = formatObsValue(obs)
    const name = obsName(obs)
    if (!name || !value) return
    abnormalMap.set(id, { name, value, date: obs.effectiveDateTime, obsId: id })
  }
  for (const obs of data.observations ?? []) considerObs(obs)
  for (const report of data.diagnosticReports ?? []) {
    for (const obs of report._observations ?? []) considerObs(obs)
  }
  const abnormalLabs = [...abnormalMap.values()]
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, 30)

  void now // reserved for future recency weighting; keeps signature stable
  return { encounterIcds, chronicMeds, dischargeExcerpts, abnormalLabs }
}

/** True when a DocumentReference is a discharge summary (出院病摘, LOINC 18842-5). */
function isDischargeSummary(doc: DocumentReferenceEntity): boolean {
  return (doc.type?.coding ?? []).some((c) => c.code === DISCHARGE_SUMMARY_LOINC)
}

/** True when the digest carries at least one PRIMARY-source signal. */
export function hasPrimaryEvidence(digest: EvidenceDigest): boolean {
  return (
    digest.encounterIcds.length > 0 ||
    digest.chronicMeds.length > 0 ||
    digest.dischargeExcerpts.length > 0
  )
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a board-certified physician building a patient's ACTIVE problem list for an International Patient Summary (IPS).

You will receive de-identified evidence from one patient: outpatient/inpatient ICD-10 diagnoses grouped by frequency, chronic (refillable) medications, discharge-summary excerpts, and a few abnormal lab values.

Your task — clinical synthesis (be thorough/aggressive):
- Infer the patient's genuinely ACTIVE problems. You MAY assert a problem that is strongly implied by a discharge narrative or a chronic-medication pattern even when no ICD code is present (e.g. an ACE-inhibitor + diuretic + recurrent high BP strongly implies hypertension).
- Abnormal labs are CORROBORATION ONLY: never make a lab the sole basis for a problem.
- Prefer durable/chronic problems. Do NOT list transient acute events (a single URI, a resolved injury) unless they are clearly ongoing.
- Merge duplicates: one problem per distinct clinical entity.

SNOMED coding rules (two-tier — the system RE-VALIDATES every code you return, so you are never trusted blindly):
- When the problem is anchored to an ICD-10 you can see in the evidence, return that code in "evidenceIcd10".
- PREFER THE ALLOWLIST: if a concept in the ALLOWLIST provided in the user message matches the problem, return it verbatim in "suggestedSnomed". Allowlist codes are pre-verified.
- If NO allowlist concept fits, you MAY return your single best-guess SNOMED CT concept id in "suggestedSnomed". Any non-allowlist code is treated as PROVISIONAL: the system flags it for MANDATORY human web-search verification on browser.ihtsdotools.org before it is trusted, and it can never be marked high-confidence. Offer a best-guess ONLY when you genuinely believe the concept id is correct and would expect to confirm it by web search; if you are unsure, return null instead of fabricating an id.

Output: a SINGLE JSON object, no prose, no markdown fences. Do not include patient identifiers.`

/**
 * Build the chat messages for one inference run. Pure. The verified allowlist is
 * embedded so the model can execute Strategy C (pick-from-allowlist) — but
 * resolveCoding re-validates every pick, so a hallucinated code is still caught.
 */
export function buildInferencePrompt(
  digest: EvidenceDigest,
  allowlist: ReadonlyArray<VerifiedSct> = VERIFIED_SCT_LIST,
): AiMessage[] {
  const allowlistText = allowlist.map((v) => `${v.code}\t${v.display}`).join('\n')

  const icdLines = digest.encounterIcds.length
    ? digest.encounterIcds
        .map(
          (e) =>
            `- ${e.icd10}${e.textZh && e.textZh !== e.icd10 ? ` ${e.textZh}` : ''} (visits: ${e.count}${
              e.lastDate ? `, last: ${e.lastDate.slice(0, 10)}` : ''
            })`,
        )
        .join('\n')
    : '(none)'

  const medLines = digest.chronicMeds.length
    ? digest.chronicMeds
        .map((m) => `- ${m.name}${m.classZh || m.classEn ? ` [${m.classEn || m.classZh}]` : ''}`)
        .join('\n')
    : '(none)'

  const dischargeLines = digest.dischargeExcerpts.length
    ? digest.dischargeExcerpts
        .map(
          (d, i) =>
            `[${d.kind} #${i + 1}${d.date ? ` ${d.date.slice(0, 10)}` : ''}${
              d.truncated ? ' (truncated)' : ''
            }]\n${d.text}`,
        )
        .join('\n\n')
    : '(none)'

  const labLines = digest.abnormalLabs.length
    ? digest.abnormalLabs
        .map((l) => `- ${l.name}: ${l.value}${l.date ? ` (${l.date.slice(0, 10)})` : ''}`)
        .join('\n')
    : '(none)'

  const contract = `Return JSON shaped EXACTLY:
{
  "problems": [
    {
      "labelZh": "中文診斷名稱",
      "labelEn": "English diagnosis name",
      "inferenceConfidence": "high" | "medium" | "low",
      "evidenceIcd10": "E11.9",            // OPTIONAL: the ICD-10 from the evidence this is anchored to
      "suggestedSnomed": { "code": "44054006", "display": "Diabetes mellitus type II" } | null,  // PREFER the ALLOWLIST; a non-allowlist best-guess is allowed but flagged for human web-search verification
      "supportingEvidence": [
        { "kind": "encounter-icd" | "medication" | "discharge-excerpt" | "lab" | "composition", "label": "human-readable", "icd10": "E11.9", "date": "2025-01-01", "count": 4 }
      ],
      "rationale": "one short clinical sentence"
    }
  ]
}`

  const userContent = `# Evidence

## Outpatient / inpatient ICD-10 (by frequency)
${icdLines}

## Chronic (refillable) medications
${medLines}

## Discharge summaries / clinical narratives
${dischargeLines}

## Abnormal labs (corroboration only)
${labLines}

# SNOMED CT allowlist (PREFER these pre-verified concepts; a non-allowlist best-guess is allowed but will be flagged for verification)
code\tdisplay
${allowlistText}

# Output contract
${contract}`

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
}

// ── Coding ladder ────────────────────────────────────────────────────────────

export interface ResolvedCoding {
  coding: ConditionSctAnnotation | null
  strategy: CodingStrategy
  needsManualCoding: boolean
}

/**
 * The B→C→A→none SNOMED ladder. NON-NEGOTIABLE: a code that is not in the
 * verified allowlist can NEVER be high or medium-high confidence.
 *   B (high):        evidenceIcd10 deterministically maps to a verified concept.
 *   C (medium-high): the model's suggestedSnomed.code is in the allowlist.
 *   A (low):         the model returned a code NOT in the allowlist → flag it.
 *   none:            no SNOMED at all (text/ICD-only problem).
 */
export function resolveCoding(
  raw: InferredProblemRaw,
  allowlistSet: ReadonlySet<string> = VERIFIED_SCT_CODES,
): ResolvedCoding {
  // Strategy B — anchor to an evidence ICD-10 that hits the verified table.
  const icd = normalizeIcd(raw.evidenceIcd10)
  if (icd) {
    const hit = lookupSctForIcd(icd)
    if (hit) {
      return {
        coding: {
          system: SCT_SYSTEM,
          code: hit.code,
          display: hit.display,
          confidence: 'high',
          icd10: icd,
        },
        strategy: 'B',
        needsManualCoding: false,
      }
    }
  }

  const suggestedCode = raw.suggestedSnomed?.code?.trim()
  if (suggestedCode) {
    // Strategy C — the model picked from the verified allowlist. Canonicalize the
    // display from our table (never trust the model's display string).
    if (allowlistSet.has(suggestedCode)) {
      const verified = verifiedSctByCode(suggestedCode)
      if (verified) {
        return {
          coding: {
            system: SCT_SYSTEM,
            code: verified.code,
            display: verified.display,
            confidence: 'medium-high',
            ...(icd ? { icd10: icd } : {}),
          },
          strategy: 'C',
          needsManualCoding: false,
        }
      }
    }
    // Strategy A — free-generated code, NOT in the allowlist. Low + must review.
    return {
      coding: {
        system: SCT_SYSTEM,
        code: suggestedCode,
        display: raw.suggestedSnomed?.display?.trim() || '',
        confidence: 'low',
        ...(icd ? { icd10: icd } : {}),
        needsManualCoding: true,
      },
      strategy: 'A',
      needsManualCoding: true,
    }
  }

  // none — no SNOMED assigned (text / ICD-only problem).
  return { coding: null, strategy: 'none', needsManualCoding: false }
}

// ── Orchestration ────────────────────────────────────────────────────────────

/** Map a validated raw candidate's supporting evidence to typed ProblemEvidence. */
function toProblemEvidence(raw: InferredProblemRaw): ProblemEvidence[] {
  return (raw.supportingEvidence ?? [])
    .map((e): ProblemEvidence | null => {
      const label = e.label?.trim() || e.icd10?.trim() || ''
      if (!label) return null
      return {
        kind: e.kind ?? 'discharge-excerpt',
        label,
        sourceId: e.sourceId,
        icd10: e.icd10 ? normalizeIcd(e.icd10) : undefined,
        date: e.date,
        count: e.count,
      }
    })
    .filter((e): e is ProblemEvidence => e !== null)
}

export interface RunProblemInferenceArgs {
  data: ClinicalDataCollection
  llm: InferenceLlm
  allowlist?: ReadonlyArray<VerifiedSct>
  now?: Date
  maxDischargeChars?: number
}

/**
 * End-to-end inference run: digest → prompt → llm → parse → code → dedup.
 * Returns [] when there is no primary evidence or the model returns nothing
 * usable (never throws on a single bad candidate — llm-json drops those).
 */
export async function runProblemInference(
  args: RunProblemInferenceArgs,
): Promise<InferredProblem[]> {
  const { data, llm, allowlist = VERIFIED_SCT_LIST, now, maxDischargeChars } = args
  const digest = buildEvidenceDigest(data, now, maxDischargeChars)
  if (!hasPrimaryEvidence(digest)) return []

  const messages = buildInferencePrompt(digest, allowlist)

  let rawText: string
  try {
    rawText = await llm(messages)
  } catch {
    return []
  }

  const candidates = parseInferenceResponse(rawText)
  const allowlistSet = new Set(allowlist.map((v) => v.code))

  const out: InferredProblem[] = []
  const seen = new Set<string>()
  candidates.forEach((raw, i) => {
    const { coding, strategy, needsManualCoding } = resolveCoding(raw, allowlistSet)
    // Dedup by SNOMED code when coded, else by normalized label.
    const dedupKey = coding?.code
      ? `sct:${coding.code}`
      : `lbl:${(raw.labelEn || raw.labelZh).toLowerCase().trim()}`
    if (seen.has(dedupKey)) return
    seen.add(dedupKey)
    out.push({
      id: `inferred-${i}`,
      labelZh: raw.labelZh.trim(),
      labelEn: raw.labelEn.trim(),
      inferenceConfidence: raw.inferenceConfidence,
      coding,
      strategy,
      needsManualCoding,
      evidence: toProblemEvidence(raw),
      rationale: raw.rationale?.trim() || undefined,
    })
  })
  return out
}

// ── Synthetic Condition ──────────────────────────────────────────────────────

/**
 * Convert a confirmed inferred problem into a synthetic ConditionEntity that
 * flows through the EXISTING IPS pipeline (problemCode dual-coding picks up
 * `_sct` exactly like a deterministic Strategy-B condition). Pure.
 *   - id is namespaced `urn:ips-inferred:` so it can never collide with a real id.
 *   - ICD-10 coding is carried when the problem was anchored to one (Strategy B,
 *     or any candidate that returned evidenceIcd10).
 *   - `_inferred` is the audit marker; ips-fhir-mappers turns it into a meta.tag.
 */
export function inferredToCondition(p: InferredProblem): ConditionEntity {
  const icd10 = p.coding?.icd10 || p.evidence.find((e) => e.icd10)?.icd10
  const coding = icd10
    ? [{ system: SYSTEM.icd10, code: icd10, display: p.labelEn || p.labelZh || undefined }]
    : undefined

  const condition: ConditionEntity = {
    id: `urn:ips-inferred:${p.id}`,
    code: {
      text: p.labelZh || p.labelEn || undefined,
      ...(coding ? { coding } : {}),
    },
    clinicalStatus: 'active',
    verificationStatus: 'provisional',
    _inferred: {
      strategy: p.strategy,
      inferenceConfidence: p.inferenceConfidence,
      ...(p.needsManualCoding ? { needsManualCoding: true } : {}),
      evidence: p.evidence.map((e) => ({
        kind: e.kind,
        label: e.label,
        sourceId: e.sourceId,
        icd10: e.icd10,
        date: e.date,
        count: e.count,
      })),
      ...(p.rationale ? { rationale: p.rationale } : {}),
    },
  }
  if (p.coding) condition._sct = p.coding
  return condition
}
