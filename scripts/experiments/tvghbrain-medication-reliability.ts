import {
  generateMedicalSummaryUseCase,
} from '../../src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type { SummarySourceCatalogEntry } from '../../src/core/entities/medical-summary.entity'

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} in the process environment.`)
  return value
}

const endpoint = requiredEnvironmentValue('TVGHBRAIN_ENDPOINT')
const apiKey = requiredEnvironmentValue('TVGHBRAIN_API_KEY')
const model = process.env.TVGHBRAIN_MODEL?.trim() || 'tvghbrain3.5'
const iterations = Number.parseInt(process.env.ITERATIONS || '10', 10)
const requestTimeoutMs = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10)
const outputMode = process.env.TVGHBRAIN_OUTPUT_MODE === 'module' ? 'module' : 'batch'

if (!Number.isInteger(iterations) || iterations < 1 || iterations > 50) {
  throw new Error('ITERATIONS must be an integer from 1 to 50.')
}
if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1_000 || requestTimeoutMs > 120_000) {
  throw new Error('REQUEST_TIMEOUT_MS must be an integer from 1000 to 120000.')
}

// Synthetic cross-facility fixture: no patient data is persisted or sent by
// this reliability harness. It is deliberately rich enough to require a real
// medication-reconciliation response instead of a valid-but-empty object.
const catalog: SummarySourceCatalogEntry[] = [
  { key: 'E1', resourceType: 'Encounter', resourceId: 'enc-1', date: '2026-06-18', organization: '甲醫院', display: '糖尿病門診追蹤' },
  { key: 'E2', resourceType: 'Encounter', resourceId: 'enc-2', date: '2026-06-25', organization: '乙診所', display: '高血壓門診追蹤' },
  { key: 'L1', resourceType: 'DiagnosticReport', resourceId: 'lab-1', date: '2026-06-18', organization: '甲醫院', display: 'HbA1c 8.2%' },
  { key: 'M1', resourceType: 'MedicationRequest', resourceId: 'med-1', date: '2026-06-18', organization: '甲醫院', display: 'Metformin 500 mg BID，供藥至 2026-09-15' },
  { key: 'M2', resourceType: 'MedicationRequest', resourceId: 'med-2', date: '2026-06-18', organization: '甲醫院', display: 'Empagliflozin 10 mg QD，供藥至 2026-09-15' },
  { key: 'M3', resourceType: 'MedicationRequest', resourceId: 'med-3', date: '2026-06-25', organization: '乙診所', display: 'Amlodipine 5 mg QD，供藥至 2026-09-22' },
  { key: 'M4', resourceType: 'MedicationRequest', resourceId: 'med-4', date: '2026-06-25', organization: '乙診所', display: 'Losartan 50 mg QD，供藥至 2026-09-22' },
  { key: 'M5', resourceType: 'MedicationDispense', resourceId: 'med-5', date: '2026-06-26', organization: '乙藥局', display: 'Losartan 50 mg，乙診所處方之調劑紀錄' },
  { key: 'M6', resourceType: 'MedicationRequest', resourceId: 'med-6', date: '2026-05-08', organization: '丙醫院', display: 'Atorvastatin 20 mg QHS，供藥至 2026-08-05' },
]

const clinicalContext = `## Patient Information
- Age: 68
- Gender: Male

## Encounters
- [E1] 2026-06-18 甲醫院：糖尿病門診追蹤
- [E2] 2026-06-25 乙診所：高血壓門診追蹤

## Laboratory Reports
- [L1] 2026-06-18 HbA1c 8.2%

## Patient's Medications (authoritative regimen list)
- [M1] Metformin 500 mg BID；甲醫院；慢性連續處方；供藥至 2026-09-15
- [M2] Empagliflozin 10 mg QD；甲醫院；慢性連續處方；供藥至 2026-09-15
- [M3] Amlodipine 5 mg QD；乙診所；慢性連續處方；供藥至 2026-09-22
- [M4] Losartan 50 mg QD；乙診所；慢性連續處方；供藥至 2026-09-22
- [M5] Losartan 50 mg；乙藥局；M4 同一處方的調劑紀錄，不是另一家處方院所
- [M6] Atorvastatin 20 mg QHS；丙醫院；慢性連續處方；供藥至 2026-08-05

Newest record date: 2026-06-26.`

const promptInput = {
  clinicalContext,
  catalog,
  locale: 'zh-TW',
  audience: 'medical',
} as const
const messages = outputMode === 'module'
  ? generateMedicalSummaryUseCase.buildModuleMessages(promptInput, 'medications')
  : generateMedicalSummaryUseCase.buildBatchModuleMessages(promptInput)

const medicationStart = '<<<MEDIPRISMA_MODULE:medications>>>'
const medicationEnd = '<<<END_MEDIPRISMA_MODULE:medications>>>'

interface RunResult {
  ok: boolean
  latencyMs: number
  chars: number
  startMarker: boolean
  endMarker: boolean
  regimenCount: number
  finishReason?: string
  error?: string
}

async function runOnce(): Promise<RunResult> {
  const startedAt = Date.now()
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        connection: 'close',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        chars: 0,
        startMarker: false,
        endMarker: false,
        regimenCount: 0,
        error: `HTTP ${response.status}`,
      }
    }

    const body = await response.json() as {
      message?: string
      choices?: Array<{ finish_reason?: string; message?: { content?: string } }>
    }
    const text = body.choices?.[0]?.message?.content ?? body.message ?? ''
    const parsed = outputMode === 'module'
      ? generateMedicalSummaryUseCase.parseModuleResult('medications', text)
      : generateMedicalSummaryUseCase.parseBatchModuleResult('medications', text)
    const review = parsed?.medicationReview
    const startMarker = text.includes(medicationStart)
    const endMarker = text.includes(medicationEnd)
    const regimenCount = review?.regimen.length ?? 0
    const sourcesGrounded = (review?.regimen ?? []).every((item) =>
      item.sources.some((source) => /^M\d+$/.test(source)),
    )
    const contractComplete = outputMode === 'module' || (startMarker && endMarker)
    const ok = contractComplete && Boolean(review?.overview?.trim()) &&
      regimenCount > 0 && sourcesGrounded

    return {
      ok,
      latencyMs: Date.now() - startedAt,
      chars: text.length,
      startMarker,
      endMarker,
      regimenCount,
      finishReason: body.choices?.[0]?.finish_reason,
      ...(!ok ? { error: parsed ? 'medication payload failed completeness checks' : 'parse failed' } : {}),
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      chars: 0,
      startMarker: false,
      endMarker: false,
      regimenCount: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main(): Promise<void> {
  let passed = 0
  for (let index = 1; index <= iterations; index += 1) {
    const result = await runOnce()
    if (result.ok) passed += 1
    console.log(JSON.stringify({ run: index, ...result }))
  }
  console.log(`RESULT mode=${outputMode} ${passed}/${iterations}`)
  if (passed !== iterations) process.exitCode = 1
}

void main()
