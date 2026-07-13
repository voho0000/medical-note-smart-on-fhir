// IPS Phase 2.2 — multi-source LLM problem-list inference engine.
//
// The pipeline (all pure except the injected `llm`):
//   buildEvidenceDigest(data)  → compact, de-identified evidence bundle
//   buildInferencePrompt(...)  → house-style messages
//   llm(messages)              → JSON (injected; unit tests pass a canned fn)
//   parseInferenceResponse     → validated candidate rows (llm-json.ts)
//   inferredToCondition        → synthetic ConditionEntity for the bundle merge
//
// SAFETY: the problem list is TEXT-ONLY. The app deliberately does NOT generate
// or attach any SNOMED CT coding — an inferred Condition.code carries only the
// diagnosis label as free text (no invented/derived codes). "Aggressive" governs
// only the DIAGNOSIS inference. Nothing here mutates source data, and synthetic
// conditions only ever exist inside an IPS snapshot (never the React Query cache).

import type {
  ClinicalDataCollection,
  ConditionEntity,
  DocumentReferenceEntity,
  EncounterEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { AiMessage } from '@/src/core/entities/ai.entity'
import { decodeBase64Utf8 } from '@/src/shared/utils/base64.utils'
import { checkReferenceRangeAbnormal } from '@/src/shared/utils/interpretation-helpers'
import { isChronicPrescription } from '@/src/shared/utils/fhir-display-helpers'
import { parseInferenceResponse, type InferredProblemRaw } from './llm-json'
import { PROBLEM_INFERENCE_SYNTHESIS_RULE } from '@/src/core/use-cases/problem-inference/problem-inference-principles'
import type {
  InferredProblem,
  ProblemEvidence,
} from './inferred-problems-types'

/**
 * Normalize an ICD-10 code for evidence grouping/display: uppercase, strip
 * whitespace and a trailing dot, and insert the conventional dot after the
 * 3-char category when a dotless extension is present ("e119" → "E11.9").
 * (Kept local — the app no longer maps ICD-10 to SNOMED, but still groups
 * Encounter.reasonCode ICDs by a normalized code in the evidence digest.)
 */
export function normalizeIcd(raw: string | undefined): string {
  if (!raw) return ''
  let s = raw.toUpperCase().replace(/\s+/g, '').replace(/\.+$/, '')
  if (!s) return ''
  if (!s.includes('.') && s.length > 3 && /^[A-Z]\d{2}[A-Z0-9]+$/.test(s)) {
    s = `${s.slice(0, 3)}.${s.slice(3)}`
  }
  return s
}

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
- Following the same rule as the in-app medical summary, ${PROBLEM_INFERENCE_SYNTHESIS_RULE}
- You MAY assert a problem that is strongly implied by a discharge narrative or a chronic-medication pattern even when no ICD code is present (e.g. an ACE-inhibitor + diuretic + recurrent high BP strongly implies hypertension).
- Abnormal labs are CORROBORATION ONLY: never make a lab the sole basis for a problem.
- Prefer durable/chronic problems. Do NOT list transient acute events (a single URI, a resolved injury) unless they are clearly ongoing.
- Merge duplicates: one problem per distinct clinical entity.

Do NOT return any diagnosis codes (no SNOMED CT, no ICD). The problem list is text-only — return the diagnosis NAMES only.

Output: a SINGLE JSON object, no prose, no markdown fences. Do not include patient identifiers.`

/**
 * Build the chat messages for one inference run. Pure. The model returns
 * text-only diagnosis names (no codes are requested or trusted).
 */
export function buildInferencePrompt(digest: EvidenceDigest): AiMessage[] {
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

# Output contract
${contract}`

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
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
  now?: Date
  maxDischargeChars?: number
}

/**
 * End-to-end inference run: digest → prompt → llm → parse → dedup.
 * Returns [] when there is no primary evidence or the model returns nothing
 * usable (never throws on a single bad candidate — llm-json drops those).
 */
export async function runProblemInference(
  args: RunProblemInferenceArgs,
): Promise<InferredProblem[]> {
  const { data, llm, now, maxDischargeChars } = args
  const digest = buildEvidenceDigest(data, now, maxDischargeChars)
  if (!hasPrimaryEvidence(digest)) return []

  const messages = buildInferencePrompt(digest)

  let rawText: string
  try {
    rawText = await llm(messages)
  } catch {
    return []
  }

  const candidates = parseInferenceResponse(rawText)

  const out: InferredProblem[] = []
  const seen = new Set<string>()
  candidates.forEach((raw, i) => {
    // Dedup by normalized label (the problem list carries no codes).
    const dedupKey = `lbl:${(raw.labelEn || raw.labelZh).toLowerCase().trim()}`
    if (seen.has(dedupKey)) return
    seen.add(dedupKey)
    out.push({
      id: `inferred-${i}`,
      labelZh: raw.labelZh.trim(),
      labelEn: raw.labelEn.trim(),
      inferenceConfidence: raw.inferenceConfidence,
      evidence: toProblemEvidence(raw),
      rationale: raw.rationale?.trim() || undefined,
    })
  })
  return out
}

// ── Synthetic Condition ──────────────────────────────────────────────────────

/**
 * Convert a confirmed inferred problem into a synthetic ConditionEntity that
 * flows through the EXISTING IPS pipeline. Pure.
 *
 * LLM / summary candidates are TEXT-ONLY: Condition.code carries just the
 * diagnosis label — the app never generates or attaches SNOMED CT / guessed
 * codes. The one exception is an `encounter-icd` candidate, which carries a REAL
 * ICD-10 `sourceCoding` lifted verbatim from Encounter.reasonCode (a genuine
 * source code, not an invented one); that coding is attached so a confirmed
 * visit-ICD problem exports with its authentic code.
 *   - id is namespaced `urn:ips-inferred:` so it can never collide with a real id.
 *   - `_inferred` is the audit marker; ips-fhir-mappers turns it into a meta.tag.
 */
export function inferredToCondition(p: InferredProblem): ConditionEntity {
  const text = p.labelZh || p.labelEn || undefined
  return {
    id: `urn:ips-inferred:${p.id}`,
    code: p.sourceCoding
      ? {
          text,
          coding: [
            {
              system: p.sourceCoding.system,
              code: p.sourceCoding.code,
              ...(p.sourceCoding.display ? { display: p.sourceCoding.display } : {}),
            },
          ],
        }
      : { text },
    clinicalStatus: 'active',
    verificationStatus: 'provisional',
    _inferred: {
      inferenceConfidence: p.inferenceConfidence,
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
}
