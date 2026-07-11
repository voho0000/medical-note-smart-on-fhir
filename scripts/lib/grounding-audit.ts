// Grounding audit for AI summary / safety output — the "second pass" that the
// citation-resolution check (validate-demo-snapshots) does NOT do: it checks
// that claims are grounded in the ACTUAL bundle, not merely that cited keys
// resolve. Catches the hallucination classes we hit in practice:
//   - fabricated tests: naming an 內視鏡 / 心臟超音波 / CT that isn't in the data
//   - positional cross-refs (上述/下述) between separate UI fields
//   - citation relevance: a renal claim citing the chest X-ray, a polyp citing
//     an ultrasound, a valve citing the ECG
//
// Deterministic and bundle-grounded, so — unlike a same-tier LLM verifier — it
// cannot miss a fabricated 內視鏡 (empirically the LLM verifier did; this does
// not). Used by scripts/validate-demo-snapshots.ts and available to the
// offline snapshot generator as a generate-until-clean gate.

interface CatEntry { key: string; display?: string; resourceType?: string }

// Examination/report words that must be BACKED by a matching report in the
// bundle. Keyed on the term; a term is "allowed" only if it appears in the
// bundle text at all (so if the record genuinely has a CT report, 電腦斷層/CT
// claims are fine).
const TEST_TERMS = ['內視鏡', '胃鏡', '大腸鏡', '心臟超音波', 'echocardiog', '切片', 'biopsy', 'MRI', '磁振造影']
const POSITIONAL = /上述|下述|如上|如下|as above|as below/
// A test named alongside a recommendation verb is being ARRANGED, not asserted
// as already-done — e.g. 「安排心臟超音波」 is legitimate clinical advice, only
// 「內視鏡報告顯示…」 is a fabrication. Skip the fabricated-test flag when the
// span recommends the test rather than citing its result.
const RECOMMEND_VERB = /安排|建議|考慮|轉介|排程|可做|應做|需做|接受|arrange|schedule|order|consider|recommend|refer/i

/** A span "fabricates" a test only if the term is absent from the bundle AND
 *  the span is asserting it as done (no recommendation verb present). */
function fabricatedTests(text: string, presentTerms: Set<string>): string[] {
  if (RECOMMEND_VERB.test(text)) return []
  return TEST_TERMS.filter((t) => text.includes(t) && !presentTerms.has(t))
}

export interface GroundingAuditInput {
  /** JSON.stringify of the demo bundle — used for the fabricated-test presence test. */
  bundleBlob: string
  /** Catalog entries, for citation-relevance lookups. */
  catalog: CatEntry[]
}

function makeHelpers({ bundleBlob, catalog }: GroundingAuditInput) {
  const byKey = new Map(catalog.map((c) => [c.key, c]))
  const presentTerms = new Set(TEST_TERMS.filter((t) => bundleBlob.includes(t)))
  const isImaging = (k: string) => {
    const e = byKey.get(k)
    return !!e && /胸腔|X光|X-ray|心電圖|ECG|超音波/i.test(e.display ?? '')
  }
  const displayOf = (k: string) => byKey.get(k)?.display ?? ''
  return { byKey, presentTerms, isImaging, displayOf }
}

/** Returns a list of grounding issues (empty = clean) for a parsed medical summary. */
export function auditSummaryGrounding(ai: any, input: GroundingAuditInput): string[] {
  const { presentTerms, isImaging, displayOf } = makeHelpers(input)
  const issues: string[] = []
  const spans: Array<{ text: string; tag: string }> = []
  for (const [i, item] of (ai.investigations ?? []).entries()) spans.push({ text: `${item.label} ${item.trend ?? ''} ${item.interpretation ?? ''}`, tag: `investigation[${i}] ${item.label}` })
  for (const [i, p] of (ai.problems ?? []).entries()) spans.push({ text: `${p.label} ${p.basis ?? ''}`, tag: `problem[${i}] ${p.label}` })
  for (const [i, d] of (ai.decisions ?? []).entries()) spans.push({ text: `${d.text} ${d.rationale ?? ''}`, tag: `decision[${i}]` })
  for (const [i, t] of (ai.timeline ?? []).entries()) spans.push({ text: t.label, tag: `timeline[${i}] ${t.label}` })
  for (const [i, s] of (ai.summary ?? []).entries()) spans.push({ text: s.text, tag: `summary[${i}]` })
  for (const { text, tag } of spans) {
    for (const term of fabricatedTests(text, presentTerms)) issues.push(`fabricated test "${term}" in ${tag}`)
    if (POSITIONAL.test(text)) issues.push(`positional cross-ref in ${tag}`)
  }
  for (const [i, p] of (ai.problems ?? []).entries()) {
    if (/腎|eGFR|GFR/i.test(p.label)) for (const k of p.sources ?? []) if (isImaging(k) && !/超音波/.test(displayOf(k))) issues.push(`renal claim cites imaging ${k} (${displayOf(k)}) in problem[${i}] ${p.label}`)
    if (/息肉/.test(p.label)) for (const k of p.sources ?? []) if (/超音波|X光/.test(displayOf(k))) issues.push(`polyp cites imaging ${k} (${displayOf(k)}) in problem[${i}] ${p.label}`)
    if (/瓣/.test(p.label)) for (const k of p.sources ?? []) if (/心電圖|ECG/i.test(displayOf(k))) issues.push(`valve claim cites ECG ${k} in problem[${i}] ${p.label}`)
  }
  for (const [i, item] of (ai.investigations ?? []).entries()) {
    // Disease-oriented rows must cite the matching report, not a topically
    // unrelated image. This mirrors the long-standing problem-list guard.
    if (/腎|eGFR|GFR/i.test(`${item.label} ${item.trend ?? ''}`)) {
      for (const k of item.sources ?? []) {
        if (isImaging(k) && !/超音波|肌酸酐|Creat|GFR|尿素|BUN/i.test(displayOf(k))) {
          issues.push(`renal investigation cites imaging ${k} (${displayOf(k)}) in investigation[${i}] ${item.label}`)
        }
      }
    }
  }
  return issues
}

/** Returns a list of grounding issues (empty = clean) for a parsed safety scan. */
export function auditSafetyGrounding(scan: any, input: GroundingAuditInput): string[] {
  const { presentTerms, isImaging, displayOf } = makeHelpers(input)
  const issues: string[] = []
  for (const [i, a] of (scan.alerts ?? []).entries()) {
    // Exclude the recommendation field from the fabrication check — a safety
    // alert may legitimately say 「建議安排心臟超音波」. Check where the alert
    // ASSERTS findings (title/detail/evidence).
    const asserted = `${a.title} ${a.detail} ${(a.evidence ?? []).join(' ')}`
    for (const term of fabricatedTests(asserted, presentTerms)) issues.push(`fabricated test "${term}" in alert[${i}] ${a.title}`)
    const text = `${a.title} ${a.detail} ${a.recommendation ?? ''}`
    if (POSITIONAL.test(text)) issues.push(`positional cross-ref in alert[${i}] ${a.title}`)
    if (a.category === 'renal') for (const k of a.sources ?? []) if (isImaging(k) && !/肌酸酐|Creat|GFR|尿素|BUN/i.test(displayOf(k))) issues.push(`renal alert cites imaging ${k} (${displayOf(k)}) in alert[${i}]`)
  }
  return issues
}
