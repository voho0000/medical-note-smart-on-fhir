// Use Case: Generate the Medical Summary (醫療摘要) — pure AI narrative +
// decisions + timeline curation, constrained to a fixed schema and to citing
// ONLY app-issued source-catalog keys. No state, no framework — unit-testable.
//
// Anti-hallucination contract:
//  - The app builds a numbered SOURCE LIST from the bundle (buildSourceCatalog)
//    and appends it to the prompt. The model cites those keys.
//  - finalizeResult() resolves every citation against the catalog: unknown keys
//    are flagged unverified (shown, never silently dropped — 不遮蔽 principle);
//    timeline picks with unknown refs ARE dropped (their date can't be trusted)
//    but the drop is counted and surfaced.
//  - Dates / organizations / resource types always come from the bundle.
import type { AiMessage } from '@/src/core/entities/ai.entity'
import type {
  EncounterEntity,
  MedicationEntity,
  ProcedureEntity,
  DiagnosticReportEntity,
  ConditionEntity,
  CarePlanEntity,
} from '@/src/core/entities/clinical-data.entity'
import {
  MedicalSummaryAiResultSchema,
  normaliseTimelineCategory,
  normaliseProblemKind,
  type MedicalSummaryAiResult,
  type MedicalSummaryResult,
  type ResolvedSourceRef,
  type SummaryCoverageStats,
  type SummarySourceCatalogEntry,
} from '@/src/core/entities/medical-summary.entity'

// Same pinned fast model as the safety scan: clean JSON, big context window
// for multi-year cross-hospital bundles, and it never rides the user's
// possibly-slow chat model (GPT-Nano on a large context ≈ 77s).
export const MEDICAL_SUMMARY_MODEL_ID = 'gemini-3.1-flash-lite'

// Caps keep the catalog prompt bounded on multi-year bundles. Items are taken
// most-recent-first; coverage stats always count EVERYTHING (uncapped).
const CATALOG_CAPS = {
  encounters: 40,
  medications: 40,
  labs: 30,
  procedures: 20,
  conditions: 20,
  carePlans: 15,
} as const

// Highlight guardrail bounds (see finalizeResult). 24 chars fits a zh
// diagnosis name or a value trend like "HbA1c 7.2→8.4"; a whole sentence
// never does.
export const EMPHASIS_MAX_CHARS = 24
export const EMPHASIS_MAX_COUNT = 5

type SummarySegment = { text: string; emphasis: boolean; sourceKeys: string[] }

/**
 * Citation coalescing: with the summary split into many small segments, each
 * fragment carrying its own superscript scatters numbers mid-sentence
 * ("包含¹ 慢性腎臟病¹ …"). A citation supports a CLAIM, so defer fragment
 * citations forward and render them only at natural boundaries — right after
 * a highlighted phrase, or at sentence end — deduped within each group.
 */
const SENTENCE_END = /[。．！？!?；;]\s*$/
export function coalesceCitations(segments: SummarySegment[]): SummarySegment[] {
  let pending: string[] = []
  return segments.map((seg, i) => {
    pending.push(...seg.sourceKeys)
    const isBoundary =
      seg.emphasis || SENTENCE_END.test(seg.text.trim()) || i === segments.length - 1
    if (!isBoundary) return { ...seg, sourceKeys: [] }
    const keys = [...new Set(pending)]
    pending = []
    return { ...seg, sourceKeys: keys }
  })
}

/**
 * Rescue pass for a zero-highlight summary: Flash-Lite sometimes ignores the
 * split-into-segments instruction and instead wraps key phrases in 「」 inside
 * one long segment (which the length guardrail then rightly demotes). Those
 * quotes ARE the model signalling importance — harvest them deterministically:
 * split each segment on short 「…」 spans and promote the quoted text to a
 * highlight (quotes stripped; the highlight replaces them). Runs ONLY when no
 * emphasis survived the guardrail, so compliant outputs are never rewritten.
 */
export function rescueEmphasisFromQuotes(segments: SummarySegment[]): SummarySegment[] {
  let budget = EMPHASIS_MAX_COUNT
  const out: SummarySegment[] = []
  for (const seg of segments) {
    // Odd indices of the split are the captured quoted spans.
    const parts = seg.text.split(new RegExp(`「([^「」]{1,${EMPHASIS_MAX_CHARS}})」`))
    if (parts.length === 1 || budget === 0) {
      out.push(seg)
      continue
    }
    const pieces: SummarySegment[] = []
    parts.forEach((part, i) => {
      const isQuoted = i % 2 === 1
      if (!part) return
      if (isQuoted && budget > 0) {
        budget -= 1
        pieces.push({ text: part, emphasis: true, sourceKeys: [] })
      } else {
        // Budget exhausted → keep the original quoting so no signal is lost.
        pieces.push({ text: isQuoted ? `「${part}」` : part, emphasis: false, sourceKeys: [] })
      }
    })
    if (pieces.length === 0) {
      out.push(seg)
      continue
    }
    // The citation superscript renders after a segment's last piece — keep
    // the original segment's sources there so numbering stays identical.
    pieces[pieces.length - 1].sourceKeys = seg.sourceKeys
    out.push(...pieces)
  }
  return out
}

export interface SummaryCatalogInput {
  encounters?: EncounterEntity[]
  medications?: MedicationEntity[]
  procedures?: ProcedureEntity[]
  diagnosticReports?: DiagnosticReportEntity[]
  conditions?: ConditionEntity[]
  carePlans?: CarePlanEntity[]
}

const day = (iso?: string): string | undefined =>
  iso && iso.length >= 10 ? iso.slice(0, 10) : iso || undefined

const codeText = (c?: { text?: string; coding?: Array<{ display?: string }> }) =>
  c?.text ?? c?.coding?.[0]?.display

function sortByDateDesc<T>(items: T[], getDate: (item: T) => string | undefined): T[] {
  return [...items].sort((a, b) => (getDate(b) ?? '').localeCompare(getDate(a) ?? ''))
}

/**
 * Derive 住院/急診/門診 from FHIR `Encounter.class` — deterministic, never the
 * AI's guess. R4 says class is a Coding, but the bridge may send a
 * CodeableConcept-ish shape, so both are handled (FHIR-generic rule). Falls
 * back to display/text keywords when the v3-ActCode code is absent.
 */
export function classifyEncounterClass(
  cls?: { code?: string; display?: string; text?: string; coding?: Array<{ code?: string; display?: string }> },
): 'inpatient' | 'emergency' | 'outpatient' | undefined {
  if (!cls) return undefined
  const code = (cls.code ?? cls.coding?.[0]?.code ?? '').toUpperCase()
  // v3-ActCode: IMP=inpatient, ACUTE/NONAC=inpatient subtypes, EMER=emergency,
  // AMB=ambulatory, SS=short stay (counts as inpatient for display purposes)
  if (['IMP', 'ACUTE', 'NONAC', 'SS'].includes(code)) return 'inpatient'
  if (code === 'EMER') return 'emergency'
  if (code === 'AMB') return 'outpatient'
  const text = `${cls.display ?? ''} ${cls.text ?? ''} ${cls.coding?.[0]?.display ?? ''}`.toLowerCase()
  if (/住院|inpatient/.test(text)) return 'inpatient'
  if (/急診|emergency/.test(text)) return 'emergency'
  if (/門診|ambulatory|outpatient/.test(text)) return 'outpatient'
  return undefined
}

/**
 * Build the citable source catalog deterministically from the bundle.
 * Key prefixes: E=Encounter, M=MedicationRequest, P=Procedure,
 * L=DiagnosticReport, C=Condition.
 */
export function buildSourceCatalog(input: SummaryCatalogInput): SummarySourceCatalogEntry[] {
  const entries: SummarySourceCatalogEntry[] = []

  sortByDateDesc(input.encounters ?? [], (e) => e.period?.start)
    .slice(0, CATALOG_CAPS.encounters)
    .forEach((e, i) => {
      const type = codeText(e.type?.[0]) ?? e.class?.display ?? 'Encounter'
      const reason = codeText(e.reasonCode?.[0])
      entries.push({
        key: `E${i + 1}`,
        resourceType: 'Encounter',
        resourceId: e.id,
        display: reason ? `${type}（${reason}）` : type,
        date: day(e.period?.start),
        organization: e.serviceProvider?.display,
        encounterClass: classifyEncounterClass(e.class),
      })
    })

  sortByDateDesc(input.medications ?? [], (m) => m.authoredOn)
    .slice(0, CATALOG_CAPS.medications)
    .forEach((m, i) => {
      entries.push({
        key: `M${i + 1}`,
        resourceType: m._sourceResourceType ?? 'MedicationRequest',
        resourceId: m.id,
        display: codeText(m.medicationCodeableConcept) ?? 'Medication',
        date: day(m.authoredOn),
        organization: m.requester?.display,
      })
    })

  sortByDateDesc(input.procedures ?? [], (p) => p.performedDateTime ?? p.performedPeriod?.start)
    .slice(0, CATALOG_CAPS.procedures)
    .forEach((p, i) => {
      entries.push({
        key: `P${i + 1}`,
        resourceType: 'Procedure',
        resourceId: p.id,
        display: codeText(p.code) ?? 'Procedure',
        date: day(p.performedDateTime ?? p.performedPeriod?.start),
        organization: p.performer?.[0]?.actor?.display ?? p.performer?.[0]?.display,
      })
    })

  sortByDateDesc(input.diagnosticReports ?? [], (r) => r.effectiveDateTime ?? r.issued)
    .slice(0, CATALOG_CAPS.labs)
    .forEach((r, i) => {
      entries.push({
        key: `L${i + 1}`,
        resourceType: 'DiagnosticReport',
        resourceId: r.id,
        display: codeText(r.code) ?? 'Report',
        date: day(r.effectiveDateTime ?? r.issued),
        organization: r.performer?.[0]?.display,
      })
    })

  sortByDateDesc(input.conditions ?? [], (c) => c.recordedDate ?? c.onsetDateTime)
    .slice(0, CATALOG_CAPS.conditions)
    .forEach((c, i) => {
      entries.push({
        key: `C${i + 1}`,
        resourceType: 'Condition',
        resourceId: c.id,
        display: codeText(c.code) ?? 'Condition',
        date: day(c.recordedDate ?? c.onsetDateTime),
      })
    })

  // Care plans (照護計畫) — a distinct, more authoritative evidence source for
  // the problem list. Key prefix 'K' (single-letter, distinct from C/P) so the
  // model can't confuse a care plan with a Condition/Procedure.
  sortByDateDesc(input.carePlans ?? [], (cp) => cp.period?.start ?? cp.created)
    .slice(0, CATALOG_CAPS.carePlans)
    .forEach((cp, i) => {
      entries.push({
        key: `K${i + 1}`,
        resourceType: 'CarePlan',
        resourceId: cp.id,
        display: cp.title?.trim() || codeText(cp.category?.[0]) || cp.description?.trim() || 'CarePlan',
        date: day(cp.period?.start ?? cp.created),
        organization: cp.author?.display?.trim() || undefined,
      })
    })

  return entries
}

// Both the summary hook AND the safety hook need the catalog for the same
// bundle; memoise by input reference (react-query hands both the same object)
// so the 160+-entry build runs once per bundle, not once per hook.
const catalogCache = new WeakMap<object, SummarySourceCatalogEntry[]>()
export function getSourceCatalog(input: SummaryCatalogInput): SummarySourceCatalogEntry[] {
  const cached = catalogCache.get(input)
  if (cached) return cached
  const built = buildSourceCatalog(input)
  catalogCache.set(input, built)
  return built
}

/** Coverage card numbers — deterministic, uncapped, zero AI. */
export function buildCoverageStats(input: SummaryCatalogInput): SummaryCoverageStats {
  const dates: string[] = []
  const orgs = new Set<string>()

  for (const e of input.encounters ?? []) {
    const d = day(e.period?.start)
    if (d) dates.push(d)
    if (e.serviceProvider?.display) orgs.add(e.serviceProvider.display)
  }
  for (const m of input.medications ?? []) {
    const d = day(m.authoredOn)
    if (d) dates.push(d)
    if (m.requester?.display) orgs.add(m.requester.display)
  }
  for (const p of input.procedures ?? []) {
    const d = day(p.performedDateTime ?? p.performedPeriod?.start)
    if (d) dates.push(d)
    const org = p.performer?.[0]?.actor?.display ?? p.performer?.[0]?.display
    if (org) orgs.add(org)
  }
  for (const r of input.diagnosticReports ?? []) {
    const d = day(r.effectiveDateTime ?? r.issued)
    if (d) dates.push(d)
  }
  for (const cp of input.carePlans ?? []) {
    const d = day(cp.period?.start ?? cp.created)
    if (d) dates.push(d)
    if (cp.author?.display) orgs.add(cp.author.display)
  }

  dates.sort()
  return {
    start: dates[0],
    end: dates[dates.length - 1],
    organizations: orgs.size,
    encounters: input.encounters?.length ?? 0,
    medications: input.medications?.length ?? 0,
    labs: input.diagnosticReports?.length ?? 0,
    procedures: input.procedures?.length ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SCHEMA_HINT =
  '{"headline": "<one-line patient positioning>", ' +
  '"summary": [{"text": "<narrative segment>", "emphasis": <true for pivotal segments>, "sources": ["<catalog key like E1>"]}], ' +
  '"problems": [{"label": "<condition name, e.g. 第二型糖尿病>", "basis": "<short basis e.g. 5 次檢驗異常 / 藥局調劑>", "kind": "diagnosis|lab|medication|careplan|discharge|other", "sources": ["<catalog key>"]}], ' +
  '"decisions": [{"text": "<action item>", "urgency": "high|medium|low", "rationale": "<basis, cite values>", "sources": ["<catalog key>"]}], ' +
  '"timeline": [{"ref": "<catalog key>", "label": "<one-line event label>", "category": "diagnosis|procedure|medication|encounter|lab|followup"}]}'

const SHARED_RULES =
  '\n\nData-integrity rules (CRITICAL): ' +
  'The data is from Taiwan NHI 健康存摺 — cross-hospital insurance records, NOT a complete hospital chart. ' +
  'Self-paid items and some hospitals\' lab values are absent; records from the last 2–4 weeks may not be uploaded yet. ' +
  'NEVER treat absence of data as absence of care (e.g. never claim "no recent visits" or "not taking medication"). ' +
  'Do NOT speculate about in-hospital findings that are not in the data (e.g. ER workup conclusions). ' +
  'Cite sources ONLY with reference keys that appear in the SOURCE LIST (e.g. "E1", "M3"); never invent keys. ' +
  'Every key in a claim\'s "sources" must DIRECTLY support that specific claim — do not attach loosely-related keys. ' +
  'Do NOT fabricate values — use only values present in the data. ' +
  'Diagnosis-code caution (CRITICAL): the ICD / diagnosis codes on claims and on a visit\'s reason-for-encounter are BILLING codes, ' +
  'NOT confirmed diagnoses — they are routinely provisional, "rule-out", suspected, or carried forward across visits for reimbursement. ' +
  'Do NOT assert a coded condition as an established diagnosis on a claim code alone, and NEVER recommend workup, referral, or staging for it on that basis ' +
  '(e.g. do not advise "refer to hemato-oncology to assess the myeloma" merely because a myeloma claim code appears on a visit). ' +
  'When a condition rests ONLY on a claim/reason code, either hedge it ("健保申報碼曾登錄…" / "claim records list…") or corroborate it with labs, ' +
  'dispensed medications, or care plans before presenting it as an active problem or acting on it. ' +
  'Corroboration MUST be CONDITION-SPECIFIC — the lab/imaging/med must directly evidence THAT condition (an echocardiogram for valvular disease; an ECG or an unrelated cardiac test does NOT confirm a valve diagnosis; a HbA1c for diabetes, not any blood test). ' +
  'Before citing a DiagnosticReport for a condition, CHECK ITS CONTENT: read the report\'s actual result values / conclusion text in the data and cite it ONLY if that content itself mentions or measures the condition. ' +
  'A plausible title or same-day timing is NOT a link — e.g. an abdominal ultrasound whose conclusion says "fatty liver, gallbladder sludge, renal stones" says NOTHING about 胃息肉 and must not be cited as its evidence ' +
  '(while it IS direct evidence for 脂肪肝/膽囊沉積物/腎結石 — report those findings instead of leaving them out). ' +
  'The same applies to documents: write 出院病摘 as a "basis" ONLY if the discharge summary text actually mentions that condition — do not attribute a condition to a document that never names it. ' +
  'A test that does not measure or name the condition is NOT corroboration, and must not be cited in that claim\'s "sources". ' +
  'When a condition rests only on claim codes (with or without related medications), the "basis" must say what the evidence actually is ' +
  '(e.g. "3次門診申報及用藥") — NOT a phrase like "門診追蹤" that implies clinical confirmation, and not a test that never assessed it. ' +
  'Do NOT recommend routine follow-up of a code-only condition as if it were established; if anything, suggest the confirmatory test. ' +
  'NEVER name an examination or report type as evidence when no such report exists in the data — do not write 內視鏡/胃鏡/切片/心臟超音波 (or any test) in a "basis" unless that report is actually present ' +
  '(a 息肉/polyp claim code does NOT mean an endoscopy report exists; a cardiac claim code does NOT mean an echo exists — check the actual reports). ' +
  'Temporal honesty: call an event 近期/recent ONLY if it is within ~3 months of the newest record; otherwise state the actual date or timeframe. ' +
  'Trend honesty (ALL audiences, including the patient version): when serial values show a direction (e.g. eGFR 35→33→32), describe it faithfully — ' +
  'NEVER call a worsening value 穩定/stable; in patient language prefer calm-but-true phrasing (e.g. 數值逐漸下降，醫師正在追蹤) over false reassurance. ' +
  'Completeness sweep: before finalizing "problems", re-scan the labs and the long-term medication list for clearly-supported conditions you have not yet listed ' +
  '(e.g. abnormal TSH → 甲狀腺問題, chronic urate-lowering therapy → 高尿酸血症, repeated past-year events such as 譫妄就診) — ' +
  'a complex multi-morbid patient typically yields 8–12 problems, not 5–6. ' +
  'The summary is a flowing narrative split into segments: consecutive segments are concatenated into ONE paragraph, so include the connecting punctuation yourself. ' +
  'Highlighting ("emphasis": true) renders as a marker-pen highlight — it only works when RARE and SHORT. ' +
  'Split each sentence so the key phrase is its OWN tiny segment: mark at most 5 segments in the whole summary, ' +
  'each under ~15 characters (a diagnosis name, a value trend like "HbA1c 7.2→8.4", a status word) — ' +
  'NEVER a whole sentence. Everything else stays "emphasis": false. ' +
  'Do NOT wrap key phrases in 「」 quotes as a substitute for highlighting — split them out instead. ' +
  'Example: instead of ONE segment {"text": "近期診斷為「肺炎」伴隨咳嗽。"}, output THREE: ' +
  '[{"text": "近期診斷為", "emphasis": false, "sources": []}, {"text": "肺炎", "emphasis": true, "sources": ["E3"]}, {"text": "伴隨咳嗽。", "emphasis": false, "sources": []}]. ' +
  'For the timeline, surface only the clinically SIGNIFICANT events — milestones and turning points ' +
  '(a hospital admission, an ER visit, a first/major new diagnosis, starting a care plan, a key imaging study or procedure) — ' +
  'NOT every routine follow-up visit or repeat-prescription pickup. Aim for ~5–8 such events for a case like this (only a very complex multi-year, multi-hospital course justifies more). ' +
  'The timeline is the OBJECTIVE care journey, so choose the SAME significant events REGARDLESS of audience: the patient version changes only the WORDING of each label into plain language — it must NOT show more events, fewer events, or different events than the clinician version would. ' +
  'Curate — the full record list is already visible elsewhere; the app supplies date and hospital, you supply only the label. ' +
  'For "problems", infer the patient\'s ACTIVE problem list by SYNTHESISING across ALL data — not just claim diagnosis codes: ' +
  'coded diagnoses, ABNORMAL LAB patterns (e.g. repeatedly low Hb → 貧血), DISPENSED MEDICATIONS that imply a condition ' +
  '(e.g. glaucoma eye drops → 青光眼, BPH drugs like Harnalidge/Detrusitol → 良性攝護腺增生), care plans, and discharge summaries. ' +
  'Each problem is a plain condition NAME (e.g. 第二型糖尿病) — do NOT include ICD or any other codes. ' +
  'Give each a SHORT "basis" phrase naming the evidence type and count (e.g. "5 次檢驗異常", "藥局調劑", "照護計畫", "6 次就診申報"), ' +
  'the matching "kind", and the catalog key(s) in "sources". Merge duplicates; order by clinical importance; at most ~12 problems. ' +
  'Cross-hospital lens: surface care fragmented across providers and follow-up gaps. ' +
  'For duplicate medications, be strict: these are NHI cross-facility records where ONE prescription appears twice (the prescribing clinic AND the 藥局 / pharmacy that dispenses the 慢箋), ' +
  'and same-clinic refills are one ongoing therapy — NEITHER is duplication. Only call out duplication when the SAME drug (or same-class additive drugs) is prescribed by TWO DIFFERENT CLINICS in a short window. ' +
  'Output ONLY a JSON object matching this schema, with NO markdown fences and NO other text:\n' +
  SCHEMA_HINT

const SYSTEM_MEDICAL =
  'You are preparing a structured cross-hospital patient summary for a physician who is seeing this patient ' +
  'without knowing their history at other facilities. Precise clinical language; cite actual values and trends. ' +
  '"decisions" are concrete actions for the treating physician, ordered by urgency; each rationale must cite the ' +
  'triggering values, or state explicitly that it is an inference without direct data support.' +
  SHARED_RULES

const SYSTEM_PATIENT =
  'You are helping a patient (a layperson, NOT a clinician) understand their own NHI 健康存摺 records. ' +
  'Plain, everyday language at a junior-high reading level; explain any necessary medical term; ' +
  'no ICD/ATC codes, no prognosis speculation, no probability statements — when uncertain, point them to their doctor. ' +
  'Positive facts (e.g. stable results) may be emphasised to reassure. ' +
  'Choose wording that does NOT make the patient anxious, fearful, or panicked (用詞避免引起病患恐慌或焦慮): ' +
  'stay calm, matter-of-fact and reassuring; avoid frightening or worst-case phrasing, and do NOT tie a past scary event ' +
  '(confusion, a fall, a hospital visit) to a current medicine as cause-and-effect — frame anything to review as a routine ' +
  'check with the doctor, not a danger. ' +
  '"decisions" become questions the patient can ask their doctor at the next visit — NEVER instructions to start, ' +
  'stop, or change any medicine on their own.' +
  SHARED_RULES

export interface GenerateMedicalSummaryInput {
  clinicalContext: string
  catalog: SummarySourceCatalogEntry[]
  locale: 'en' | 'zh-TW'
  audience?: 'medical' | 'patient'
}

export class GenerateMedicalSummaryUseCase {
  buildMessages(input: GenerateMedicalSummaryInput): AiMessage[] {
    const system = input.audience === 'patient' ? SYSTEM_PATIENT : SYSTEM_MEDICAL
    const lang =
      input.locale === 'zh-TW'
        ? '\n\nWrite every "headline", "text", "rationale" and "label" value in Traditional Chinese (繁體中文).'
        : '\n\nWrite all values in English.'
    const catalogBlock = input.catalog
      .map((c) => {
        const parts = [c.resourceType, c.date ?? '?', c.organization ?? '', c.display]
        return `[${c.key}] ${parts.filter(Boolean).join(' | ')}`
      })
      .join('\n')
    return [
      { role: 'system', content: system + lang },
      {
        role: 'user',
        content:
          `Patient clinical data:\n${input.clinicalContext}\n\n` +
          `SOURCE LIST (cite these keys in "sources" / "timeline.ref"):\n${catalogBlock}`,
      },
    ]
  }

  /**
   * Parse the model's reply, or null if it isn't valid JSON for the schema.
   * Failures log a truncated head of the raw reply — Flash-Lite occasionally
   * returns malformed/truncated JSON on large contexts, and a silent null
   * makes those one-off failures undiagnosable from the browser console.
   */
  parseResult(text: string): MedicalSummaryAiResult | null {
    const fail = (reason: string): null => {
      // Dev-only: the reply head contains PHI-derived text; keep it out of
      // production consoles (the reason alone is enough signal there).
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[medical-summary] parseResult failed (${reason}); reply head:`,
          (text ?? '').slice(0, 300),
        )
      } else {
        console.warn(`[medical-summary] parseResult failed (${reason})`)
      }
      return null
    }
    const json = extractJsonObject(text)
    if (!json) return fail('no JSON object found')
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch {
      return fail('invalid JSON')
    }
    const parsed = MedicalSummaryAiResultSchema.safeParse(raw)
    if (parsed.success) return parsed.data
    // Zod paths/codes carry no PHI — safe to log in prod, and without them a
    // "schema mismatch" is undiagnosable (2026-07: Haiku's verbose outputs
    // failed here for weeks before anyone could say WHICH rule broke).
    const issues = parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    return fail(`schema mismatch — ${issues}`)
  }

  /**
   * Resolve every AI citation against the app-built catalog.
   * - narrative/decision sources: unknown keys stay visible but unverified.
   * - timeline picks: unknown refs are dropped (no trustworthy date) and counted.
   */
  finalizeResult(
    ai: MedicalSummaryAiResult,
    catalog: SummarySourceCatalogEntry[],
  ): MedicalSummaryResult {
    const byKey = new Map(catalog.map((c) => [c.key, c]))

    // Number sources by first appearance: summary segments first, then decisions.
    const sourceIndex: ResolvedSourceRef[] = []
    const numByKey = new Map<string, number>()
    const registerKey = (rawKey: string): string => {
      const key = rawKey.trim()
      if (!numByKey.has(key)) {
        const entry = byKey.get(key)
        const num = sourceIndex.length + 1
        numByKey.set(key, num)
        sourceIndex.push({
          key,
          num,
          verified: !!entry,
          resourceType: entry?.resourceType,
          resourceId: entry?.resourceId,
          display: entry?.display,
          date: entry?.date,
          organization: entry?.organization,
        })
      }
      return key
    }

    // Highlight guardrail: Flash-Lite tends to mark whole sentences (or every
    // segment) as pivotal, turning the marker-pen highlight into wallpaper.
    // The prompt asks for ≤5 short phrases; enforce it deterministically —
    // over-long segments are demoted, and only the first
    // EMPHASIS_MAX_COUNT survivors keep the highlight.
    let emphasisBudget = EMPHASIS_MAX_COUNT
    let summary = ai.summary.map((seg) => {
      let emphasis = seg.emphasis ?? false
      if (emphasis && (seg.text.trim().length > EMPHASIS_MAX_CHARS || emphasisBudget === 0)) {
        emphasis = false
      }
      if (emphasis) emphasisBudget -= 1
      return {
        text: seg.text,
        emphasis,
        sourceKeys: (seg.sources ?? []).map(registerKey),
      }
    })
    // Zero highlights after the guardrail = the model quoted its key phrases
    // instead of splitting them — harvest those (see rescueEmphasisFromQuotes).
    if (!summary.some((s) => s.emphasis)) {
      summary = rescueEmphasisFromQuotes(summary)
    }
    // Citations belong to claims — move fragment citations to the highlight /
    // sentence boundary they support instead of scattering them mid-sentence.
    summary = coalesceCitations(summary)
    // Problems register BEFORE decisions: registerKey numbers sources by first
    // appearance, and the page renders narrative → problems → decisions, so
    // this keeps superscript numbers increasing top-to-bottom.
    const problems = (ai.problems ?? []).map((p) => ({
      label: p.label,
      basis: p.basis?.trim() || undefined,
      kind: normaliseProblemKind(p.kind),
      sourceKeys: (p.sources ?? []).map(registerKey),
    }))

    const decisions = ai.decisions.map((d) => ({
      text: d.text,
      urgency: d.urgency,
      rationale: d.rationale,
      sourceKeys: (d.sources ?? []).map(registerKey),
    }))

    let droppedTimelineCount = 0
    const timeline = ai.timeline
      .flatMap((pick) => {
        const entry = byKey.get(pick.ref.trim())
        if (!entry || !entry.date) {
          droppedTimelineCount += 1
          return []
        }
        return [
          {
            key: entry.key,
            date: entry.date,
            label: pick.label,
            category: normaliseTimelineCategory(pick.category),
            organization: entry.organization,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            // 住院/急診/門診 from the bundle's Encounter.class — the AI's
            // category can only say "encounter", which used to render 門診
            // even for admissions.
            encounterClass: entry.encounterClass,
          },
        ]
      })
      // Newest first — the most recent events carry the clinical weight and
      // sit at the top; scroll down for history.
      .sort((a, b) => b.date.localeCompare(a.date))

    return {
      headline: ai.headline,
      summary,
      problems,
      decisions,
      timeline,
      sourceIndex,
      droppedTimelineCount,
    }
  }
}

/** Pull the outermost {...} out of a reply that may have fences/prose around it. */
function extractJsonObject(text: string): string | null {
  if (!text) return null
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return stripped.slice(start, end + 1)
}

export const generateMedicalSummaryUseCase = new GenerateMedicalSummaryUseCase()
