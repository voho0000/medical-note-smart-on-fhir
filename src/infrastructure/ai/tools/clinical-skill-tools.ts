// Candidate clinical "skill" tools for the deep-mode eval A/B loop.
//
// These are stateless, self-contained tools the eval harness can opt the agent
// into (gated by EVAL_SKILLS in the private medical-agent-harness runner). They
// live here, alongside the shipped FHIR tools, so a winning skill can be wired
// into createFhirTools() with no move. They are NOT registered in the app agent
// until a measured Δ justifies it.
import { tool } from 'ai'
import { z } from 'zod'

// ── #10 CKD-EPI 2021 eGFR (race-free) — deterministic, replaces LLM mental math ──
const egfrInputSchema = z.object({
  creatinine: z.number().describe('Serum creatinine in mg/dL'),
  age: z.number().describe('Age in years'),
  sex: z.enum(['male', 'female']).describe('Biological sex'),
})

function ckdStage(egfr: number): string {
  if (egfr >= 90) return 'G1 (≥90)'
  if (egfr >= 60) return 'G2 (60–89)'
  if (egfr >= 45) return 'G3a (45–59)'
  if (egfr >= 30) return 'G3b (30–44)'
  if (egfr >= 15) return 'G4 (15–29)'
  return 'G5 (<15)'
}

export function createEgfrTool() {
  return tool({
    description:
      'Compute eGFR with the CKD-EPI 2021 (race-free) creatinine equation and the corresponding KDIGO CKD G-stage. Use this instead of doing the arithmetic yourself whenever you need an eGFR from a serum creatinine value (e.g. for renal staging or renal dose adjustment). If an eGFR Observation is already reported in the record, prefer the reported value and use this only to cross-check.',
    inputSchema: egfrInputSchema,
    execute: async ({ creatinine, age, sex }) => {
      if (!(creatinine > 0) || !(age > 0)) {
        return { success: false, summary: 'creatinine and age must be positive numbers', data: null }
      }
      const female = sex === 'female'
      const kappa = female ? 0.7 : 0.9
      const alpha = female ? -0.241 : -0.302
      const scrK = creatinine / kappa
      const egfrRaw =
        142 *
        Math.pow(Math.min(scrK, 1), alpha) *
        Math.pow(Math.max(scrK, 1), -1.2) *
        Math.pow(0.9938, age) *
        (female ? 1.012 : 1)
      const egfr = Math.round(egfrRaw * 10) / 10
      return {
        success: true,
        summary: `CKD-EPI 2021 eGFR = ${egfr} mL/min/1.73m² (${ckdStage(egfr)}) for Scr ${creatinine} mg/dL, age ${age}, ${sex}`,
        data: { egfr, stage: ckdStage(egfr), equation: 'CKD-EPI 2021 (race-free)' },
      }
    },
  })
}

// ── #5 NLM Clinical Tables terminology resolver (free, no key) ──
const TABLES: Record<string, string> = {
  icd10cm: 'icd10cm',
  conditions: 'conditions',
  rxterms: 'rxterms',
  loinc: 'loinc_items',
}
const terminologyInputSchema = z.object({
  query: z.string().describe('Free-text term to resolve, e.g. "hemoglobin a1c", "metformin", "chronic kidney disease"'),
  table: z
    .enum(['icd10cm', 'conditions', 'rxterms', 'loinc'])
    .describe('Which terminology to search: icd10cm (ICD-10-CM dx codes), conditions (problem names + ICD9/10 + synonyms), rxterms (drug names), loinc (lab test codes)'),
})

export function createTerminologyTool() {
  return tool({
    description:
      'Resolve a free-text clinical term to standard codes + synonyms via the NLM Clinical Tables Search Service (ICD-10-CM, conditions, RxTerms, LOINC). Use BEFORE searching the record when a lab/drug/diagnosis may be stored under a different name or code, so you query the right thing instead of concluding it is absent.',
    inputSchema: terminologyInputSchema,
    execute: async ({ query, table }) => {
      const tbl = TABLES[table] ?? 'conditions'
      const url = `https://clinicaltables.nlm.nih.gov/api/${tbl}/v3/search?terms=${encodeURIComponent(query)}&maxList=7`
      try {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), 8000)
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(t)
        if (!res.ok) {
          return { success: false, summary: `NLM lookup failed (HTTP ${res.status}) for "${query}"`, data: null }
        }
        // NLM format: [total, codes[], extraHash, displayArrays[]]
        const json = (await res.json()) as [number, string[], unknown, string[][]]
        const total = json[0] ?? 0
        const codes = json[1] ?? []
        const displays = json[3] ?? []
        const matches = codes.map((code, i) => ({ code, name: displays[i]?.[displays[i].length - 1] ?? displays[i]?.[0] ?? '' }))
        if (matches.length === 0) {
          return { success: true, summary: `No ${table} match for "${query}"`, data: { total: 0, matches: [] } }
        }
        return {
          success: true,
          summary: `${matches.length} ${table} match(es) for "${query}": ${matches.map((m) => `${m.code} ${m.name}`).join('; ')}`,
          data: { total, matches },
        }
      } catch (err) {
        return {
          success: false,
          summary: `NLM lookup error for "${query}": ${err instanceof Error ? err.message : String(err)}`,
          data: null,
        }
      }
    },
  })
}
