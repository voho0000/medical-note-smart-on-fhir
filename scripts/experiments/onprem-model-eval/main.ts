import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { AiProviderFactory } from '@/src/infrastructure/ai/factories/ai-provider.factory'
import { createFhirTools } from '@/src/infrastructure/ai/tools/fhir-tools'
import {
  asksForCurrentMedicalEvidence,
  forcedInitialAgentToolName,
  selectAgentToolsForQuestion,
  shouldPreExecuteLocalAgentTool,
} from '@/src/infrastructure/ai/tools/agent-tool-router'
import {
  runDeepModeAgent,
  type AgentTrajectoryStep,
} from '@/src/infrastructure/ai/agent/run-deep-mode-agent'
import { buildAgentSystemPromptUseCase } from '@/src/core/use-cases/agent/build-agent-system-prompt.use-case'
import {
  generateMedicalSummaryUseCase,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { generateInsightUseCase } from '@/src/core/use-cases/clinical-insights/generate-insight.use-case'
import {
  MEDICAL_SUMMARY_MODULE_IDS,
  type MedicalSummaryAiResult,
  type MedicalSummaryModuleId,
  type MedicalSummaryModuleResultMap,
  type SummarySourceCatalogEntry,
} from '@/src/core/entities/medical-summary.entity'
import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'
import { sampleDataSource } from '@/__tests__/infrastructure/ai/tools/fixtures'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'scripts/experiments/onprem-model-eval/results')
const SUMMARY_MODELS = [
  'tvghbrain3.5',
  'gpt-oss:120b',
  'gpt-oss:20b',
  'gemma4:31b',
  'gemma4:26b',
  'nemotron-3-nano:30b',
] as const
const CHAT_MODELS = [
  'tvghbrain3.5',
  'gpt-oss:120b',
  'gemma4:31b',
  'gemma4:26b',
  'nemotron-3-nano:30b',
] as const
const CUSTOM_SUMMARY_MODELS = SUMMARY_MODELS
const syntheticBirthDate = new Date('1950-01-15T00:00:00+08:00')
const now = new Date()
const syntheticAge = now.getFullYear() - syntheticBirthDate.getFullYear() - (
  now.getMonth() < syntheticBirthDate.getMonth() ||
  (now.getMonth() === syntheticBirthDate.getMonth() && now.getDate() < syntheticBirthDate.getDate())
    ? 1
    : 0
)

type Phase = 'all' | 'summary' | 'custom-summary' | 'chat'
type Audience = 'medical' | 'patient'
type SummaryStrategy = 'single' | 'single-retry-missing' | 'split-3-2'
type CustomSummaryStrategy = 'legacy' | 'grounded'

interface CliOptions {
  phase: Phase
  models: string[] | null
  summaryCases: string[] | null
  customSummaryCases: string[] | null
  chatCases: string[] | null
  summaryStrategies: SummaryStrategy[]
  customSummaryStrategies: CustomSummaryStrategy[]
  repeat: number
  includeOutput: boolean
  requestTimeoutMs: number
}

interface SummaryFixture {
  id: string
  audience: Audience
  clinicalContext: string
  catalog: SummarySourceCatalogEntry[]
  evaluate: (draft: MedicalSummaryAiResult) => string[]
}

interface ChatFixture {
  id: string
  question: string
  acceptedTools: string[]
  requiredToolGroups?: string[][]
  requiredArgumentTerms?: string[]
  requiredToolResultTerms?: string[]
  requiredAnswerGroups: RegExp[]
  forbiddenAnswer?: RegExp
}

interface CustomSummaryFixture {
  id: string
  prompt: string
  clinicalContext: string
  requiredAnswerGroups: RegExp[]
  forbiddenAnswer?: RegExp
}

interface UsageRecord {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

interface SummaryRunRecord {
  phase: 'summary'
  model: string
  caseId: string
  audience: Audience
  strategy: SummaryStrategy
  repetition: number
  requestCount: number
  ok: boolean
  latencyMs: number
  parsedModules: number
  totalModules: number
  citationCount: number
  invalidSourceKeys: string[]
  semanticFailures: string[]
  simplifiedCharacters: string[]
  finishReason?: string
  usage: UsageRecord
  outputSha256: string
  output?: string
  error?: string
}

interface CustomSummaryRunRecord {
  phase: 'custom-summary'
  model: string
  caseId: string
  strategy: CustomSummaryStrategy
  repetition: number
  ok: boolean
  latencyMs: number
  semanticFailures: string[]
  simplifiedCharacters: string[]
  usage: UsageRecord
  outputSha256: string
  output?: string
  error?: string
}

interface ChatRunRecord {
  phase: 'chat'
  model: string
  caseId: string
  repetition: number
  ok: boolean
  latencyMs: number
  actualTools: string[]
  unexpectedTools: string[]
  toolSelectionOk: boolean
  argumentsOk: boolean
  retrievalOk: boolean
  answerOk: boolean
  safetyFailures: string[]
  simplifiedCharacters: string[]
  usage: UsageRecord
  answerSha256: string
  answer?: string
  trajectory?: AgentTrajectoryStep[]
  error?: string
}

type RunRecord = SummaryRunRecord | CustomSummaryRunRecord | ChatRunRecord

function requiredEnvironmentValue(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  throw new Error(`Set one of ${names.join(', ')} in the process environment.`)
}

function parseCsv(value: string | undefined): string[] | null {
  const parsed = value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
  return parsed.length > 0 ? parsed : null
}

function parseArgs(argv: string[]): CliOptions {
  const read = (flag: string) => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const phase = (read('--phase') ?? 'all') as Phase
  if (!['all', 'summary', 'custom-summary', 'chat'].includes(phase)) {
    throw new Error('--phase must be all, summary, custom-summary, or chat')
  }
  const requestTimeoutMs = Number.parseInt(read('--timeout-ms') ?? '120000', 10)
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 10_000 || requestTimeoutMs > 600_000) {
    throw new Error('--timeout-ms must be an integer from 10000 to 600000')
  }
  const repeat = Number.parseInt(read('--repeat') ?? '1', 10)
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 100) {
    throw new Error('--repeat must be an integer from 1 to 100')
  }
  const summaryStrategies = (parseCsv(read('--summary-strategies')) ?? ['single']) as SummaryStrategy[]
  if (summaryStrategies.some((strategy) => !['single', 'single-retry-missing', 'split-3-2'].includes(strategy))) {
    throw new Error('--summary-strategies must contain single, single-retry-missing, and/or split-3-2')
  }
  const customSummaryStrategies = (parseCsv(read('--custom-summary-strategies')) ?? ['grounded']) as CustomSummaryStrategy[]
  if (customSummaryStrategies.some((strategy) => !['legacy', 'grounded'].includes(strategy))) {
    throw new Error('--custom-summary-strategies must contain legacy and/or grounded')
  }
  return {
    phase,
    models: parseCsv(read('--models')),
    summaryCases: parseCsv(read('--summary-cases')),
    customSummaryCases: parseCsv(read('--custom-summary-cases')),
    chatCases: parseCsv(read('--chat-cases')),
    summaryStrategies,
    customSummaryStrategies,
    repeat,
    includeOutput: argv.includes('--include-output'),
    requestTimeoutMs,
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function safeError(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return secret ? message.replaceAll(secret, '[REDACTED]') : message
}

function emptyUsage(): UsageRecord {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

function normalizeUsage(value: unknown): UsageRecord {
  if (!value || typeof value !== 'object') return emptyUsage()
  const usage = value as Record<string, unknown>
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0)
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0)
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens)
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  }
}

// Deliberately use only unambiguous simplified forms. This is an audit signal,
// not an automatic converter: blindly replacing characters cannot fix
// Mainland-China clinical wording and can corrupt names.
const SIMPLIFIED_TO_TRADITIONAL: Readonly<Record<string, string>> = {
  '为': '為', '这': '這', '药': '藥', '医': '醫', '门': '門', '体': '體',
  '检': '檢', '验': '驗', '数': '數', '线': '線', '与': '與', '应': '應',
  '会': '會', '过': '過', '处': '處', '确': '確', '开': '開', '关': '關',
  '问': '問', '说': '說', '产': '產', '疗': '療', '剂': '劑', '实': '實',
  '录': '錄', '显': '顯', '时': '時', '达': '達', '别': '別', '压': '壓',
  '术': '術', '个': '個', '并': '並', '仅': '僅', '无': '無', '险': '險',
  '议': '議', '调': '調', '须': '須', '发': '發', '肠': '腸', '环': '環',
  '变': '變', '异': '異', '转': '轉', '复': '復', '护': '護',
}

function simplifiedCharacters(text: string): string[] {
  return [...new Set([...text].filter((character) => character in SIMPLIFIED_TO_TRADITIONAL))]
}

function regimenSourceKeys(draft: MedicalSummaryAiResult): Set<string> {
  return new Set(
    draft.medicationReview.regimen.flatMap((item) => item.sources),
  )
}

function changeSourceKeys(draft: MedicalSummaryAiResult): Set<string> {
  return new Set(
    draft.medicationReview.changes.flatMap((item) => item.sources),
  )
}

const summaryFixtures: SummaryFixture[] = [
  {
    id: 'cross-hospital-current-medications',
    audience: 'medical',
    catalog: [
      { key: 'E1', resourceType: 'Encounter', resourceId: 'enc-1', date: '2026-06-18', organization: '甲醫院', display: '糖尿病門診追蹤' },
      { key: 'E2', resourceType: 'Encounter', resourceId: 'enc-2', date: '2026-06-25', organization: '乙診所', display: '高血壓門診追蹤' },
      { key: 'L1', resourceType: 'DiagnosticReport', resourceId: 'lab-1', date: '2026-06-18', organization: '甲醫院', display: 'HbA1c 8.2%' },
      { key: 'M1', resourceType: 'MedicationRequest', resourceId: 'med-1', date: '2026-06-18', organization: '甲醫院', display: 'Metformin 500 mg BID，供藥至 2026-09-15' },
      { key: 'M2', resourceType: 'MedicationRequest', resourceId: 'med-2', date: '2026-06-18', organization: '甲醫院', display: 'Empagliflozin 10 mg QD，供藥至 2026-09-15' },
      { key: 'M3', resourceType: 'MedicationRequest', resourceId: 'med-3', date: '2026-06-25', organization: '乙診所', display: 'Amlodipine 5 mg QD，供藥至 2026-09-22' },
      { key: 'M4', resourceType: 'MedicationRequest', resourceId: 'med-4', date: '2026-06-25', organization: '乙診所', display: 'Losartan 50 mg QD，供藥至 2026-09-22' },
      { key: 'M5', resourceType: 'MedicationDispense', resourceId: 'med-5', date: '2026-06-26', organization: '乙藥局', display: 'Losartan 50 mg，乙診所處方之調劑紀錄' },
      { key: 'M6', resourceType: 'MedicationRequest', resourceId: 'med-6', date: '2026-05-08', organization: '丙醫院', display: 'Atorvastatin 20 mg QHS，供藥至 2026-08-05' },
    ],
    clinicalContext: `## Patient Information
- Age: 68
- Gender: Male

## Encounters
- [E1] 2026-06-18 甲醫院，糖尿病門診追蹤
- [E2] 2026-06-25 乙診所，高血壓門診追蹤

## Laboratory Reports
- [L1] 2026-06-18 HbA1c 8.2%

## Patient's Medications (authoritative current regimen)
- [M1] Metformin 500 mg BID；甲醫院；供藥至 2026-09-15
- [M2] Empagliflozin 10 mg QD；甲醫院；供藥至 2026-09-15
- [M3] Amlodipine 5 mg QD；乙診所；供藥至 2026-09-22
- [M4] Losartan 50 mg QD；乙診所；供藥至 2026-09-22
- [M5] Losartan 50 mg；乙藥局；M4 的調劑紀錄，不是另一種藥
- [M6] Atorvastatin 20 mg QHS；丙醫院；供藥至 2026-08-05

Newest record date: 2026-06-26.`,
    evaluate: (draft) => {
      const sources = regimenSourceKeys(draft)
      const missing = ['M1', 'M2', 'M3', 'M4', 'M6'].filter((key) => !sources.has(key))
      return [
        ...(missing.length > 0 ? [`current regimen missed ${missing.join(',')}`] : []),
        ...(draft.medicationEducation.length > 0 ? ['medical audience generated medicationEducation'] : []),
      ]
    },
  },
  {
    id: 'stopped-versus-current-therapy',
    audience: 'medical',
    catalog: [
      { key: 'C1', resourceType: 'Condition', resourceId: 'c1', date: '2024-04-01', display: '乳癌術後追蹤' },
      { key: 'E1', resourceType: 'Encounter', resourceId: 'e1', date: '2026-07-02', organization: '腫瘤中心', display: '乳房腫瘤門診' },
      { key: 'M1', resourceType: 'MedicationRequest', resourceId: 'm1', date: '2026-07-02', organization: '腫瘤中心', display: 'Exemestane (Aromasin) 25 mg QD，供藥至 2026-10-01' },
      { key: 'M2', resourceType: 'MedicationRequest', resourceId: 'm2', date: '2025-01-15', organization: '腫瘤中心', display: 'Tamoxifen 20 mg QD，2026-01-20 因血栓事件停用' },
      { key: 'D1', resourceType: 'DocumentReference', resourceId: 'd1', date: '2026-01-20', organization: '腫瘤中心', display: '病程紀錄：Tamoxifen 停用，改用 Exemestane' },
    ],
    clinicalContext: `## Conditions
- [C1] 乳癌術後追蹤

## Medication history
- [M1] CURRENT: Exemestane (Aromasin) 25 mg QD；供藥至 2026-10-01
- [M2] STOPPED: Tamoxifen 20 mg QD；2026-01-20 因血栓事件停用
- [D1] 2026-01-20 病程紀錄：Tamoxifen 停用，改用 Exemestane

## Encounters
- [E1] 2026-07-02 腫瘤中心追蹤

Newest record date: 2026-07-02.`,
    evaluate: (draft) => {
      const regimen = regimenSourceKeys(draft)
      const changes = changeSourceKeys(draft)
      return [
        ...(!regimen.has('M1') ? ['current Exemestane omitted from regimen'] : []),
        ...(regimen.has('M2') ? ['stopped Tamoxifen incorrectly listed in regimen'] : []),
        ...(!changes.has('M2') && !changes.has('D1')
          ? ['Tamoxifen stop missing from changes']
          : []),
      ]
    },
  },
  {
    id: 'longitudinal-renal-decline',
    audience: 'medical',
    catalog: [
      { key: 'C1', resourceType: 'Condition', resourceId: 'c1', date: '2025-01-01', display: '慢性腎臟病' },
      { key: 'O1', resourceType: 'Observation', resourceId: 'o1', date: '2025-01-10', display: 'eGFR 42 mL/min/1.73m2' },
      { key: 'O2', resourceType: 'Observation', resourceId: 'o2', date: '2025-07-10', display: 'eGFR 35 mL/min/1.73m2' },
      { key: 'O3', resourceType: 'Observation', resourceId: 'o3', date: '2026-01-10', display: 'eGFR 29 mL/min/1.73m2' },
    ],
    clinicalContext: `## Conditions
- [C1] 慢性腎臟病

## Longitudinal investigations
- [O1] 2025-01-10 eGFR 42 mL/min/1.73m2
- [O2] 2025-07-10 eGFR 35 mL/min/1.73m2
- [O3] 2026-01-10 eGFR 29 mL/min/1.73m2

The values show a real downward direction. Do not invent intervening results.`,
    evaluate: (draft) => {
      const investigationText = JSON.stringify(draft.investigations)
      return [
        ...(!/42/.test(investigationText) ? ['eGFR 42 omitted'] : []),
        ...(!/35/.test(investigationText) ? ['eGFR 35 omitted'] : []),
        ...(!/29/.test(investigationText) ? ['eGFR 29 omitted'] : []),
        ...(!/(下降|惡化|降低|declin)/i.test(investigationText) ? ['renal decline direction omitted'] : []),
      ]
    },
  },
  {
    id: 'two-significant-admissions',
    audience: 'medical',
    catalog: [
      { key: 'E1', resourceType: 'Encounter', resourceId: 'e1', date: '2025-01-05', organization: '甲醫院', display: '肺炎住院' },
      { key: 'E2', resourceType: 'Encounter', resourceId: 'e2', date: '2026-02-11', organization: '乙醫院', display: '心衰竭住院' },
      { key: 'D1', resourceType: 'DocumentReference', resourceId: 'd1', date: '2026-02-18', organization: '乙醫院', display: '心衰竭出院摘要' },
    ],
    clinicalContext: `## Encounters
- [E1] 2025-01-05 至 2025-01-12 甲醫院，肺炎住院
- [E2] 2026-02-11 至 2026-02-18 乙醫院，心衰竭住院

## Clinical documents
- [D1] 2026-02-18 乙醫院心衰竭出院摘要

These are the only two encounters in the supplied record.`,
    evaluate: (draft) => {
      const refs = new Set(draft.timeline.map((item) => item.ref))
      return [
        ...(!refs.has('E1') ? ['2025 pneumonia admission missing from timeline'] : []),
        ...(!refs.has('E2') ? ['2026 heart-failure admission missing from timeline'] : []),
      ]
    },
  },
  {
    id: 'patient-medication-education',
    audience: 'patient',
    catalog: [
      { key: 'C1', resourceType: 'Condition', resourceId: 'c1', date: '2024-01-01', display: '高血壓' },
      { key: 'M1', resourceType: 'MedicationRequest', resourceId: 'm1', date: '2026-06-20', organization: '心臟科', display: 'Amlodipine 5 mg QD，供藥至 2026-09-18' },
    ],
    clinicalContext: `## Conditions
- [C1] 高血壓

## Current medication
- [M1] Amlodipine 5 mg QD；心臟科；供藥至 2026-09-18

Explain only what the supplied record supports.`,
    evaluate: (draft) => {
      const educationSources = new Set(draft.medicationEducation.flatMap((item) => item.sources))
      const review = draft.medicationReview
      return [
        ...(!educationSources.has('M1') ? ['patient medication education missing M1'] : []),
        ...(draft.medicationEducation.length !== 1 ? ['patient medication education should contain one item'] : []),
        ...(review.regimen.length > 0 || review.changes.length > 0 || review.reconciliation.length > 0
          ? ['patient audience generated clinician medication review']
          : []),
      ]
    },
  },
]

const customSummaryFixtures: CustomSummaryFixture[] = [
  {
    id: 'medication-name-and-status-fidelity',
    prompt: '請用台灣繁體中文整理目前用藥與重要藥物變更，藥名必須照原始資料抄寫，不要自行翻譯。',
    clinicalContext: `## Problem List
- [C1] 乳癌術後追蹤

## Medication records
- [M1] CURRENT: Exemestane (Aromasin) 25 mg QD；供藥至 2026-10-01
- [M2] STOPPED: Tamoxifen 20 mg QD；2026-01-20 因血栓事件停用
- [D1] 2026-01-20 病程紀錄：Tamoxifen 停用，改用 Exemestane`,
    requiredAnswerGroups: [
      /Exemestane/i,
      /Aromasin/i,
      /25\s*mg/i,
      /Tamoxifen/i,
      /(停用|已停|stopped)/i,
    ],
    forbiddenAnswer: /阿\s*romasin|阿羅馬辛|Tamoxifen.{0,24}(目前|現在|持續|使用中)/i,
  },
  {
    id: 'missing-xray-conclusion',
    prompt: '這份資料的胸部 X 光有什麼問題？只能使用資料內容回答。',
    clinicalContext: `## Diagnostic reports
- [R1] 2025-05-18 Chest X-ray；status: final
- [R1] Findings: 資料未提供
- [R1] Conclusion: 資料未提供`,
    requiredAnswerGroups: [
      /(X\s*光|X-ray)/i,
      /(未.{0,8}提供|沒有|無法|查無)/i,
      /(判讀|結果|所見|結論|Findings|Conclusion)/i,
    ],
    forbiddenAnswer: /(肺炎|浸潤|胸水|肋膜積水|心臟擴大|cardiomegaly)/i,
  },
  {
    id: 'missing-lab-reference-range',
    prompt: '請整理 HbA1c 數值、資料中的正常／異常判定與參考區間。沒有的資料要明說。',
    clinicalContext: `## Laboratory results
- [O1] 2025-05-19 HbA1c 8.2%; interpretation: High
- [O1] Reference range: 資料未提供`,
    requiredAnswerGroups: [
      /8\.2\s*%/,
      /(偏高|異常|High|判定.{0,8}高|標示.{0,8}高|高於正常|\|\s*高\s*\|)/i,
      /(未提供|未列出|沒有|查無)/i,
      /(參考範圍|參考區間|Reference range)/i,
    ],
    forbiddenAnswer: /(4\.0|5\.6|5\.7|6\.4|7\.0)\s*%/,
  },
  {
    id: 'claim-code-not-confirmed',
    prompt: '請整理這位病人的慢性疾病，並區分已確認診斷和申報碼。',
    clinicalContext: `## Problem List
- No Condition records supplied.

## Visits & Treatment History
- [E1] 2026-03-30 門診；claim ICD-10-CM E11.9 第二型糖尿病

The claim code is the only diabetes-related entry in the supplied record.`,
    requiredAnswerGroups: [
      /(E11\.9|第二型糖尿病)/i,
      /(申報|就診紀錄|記載於門診|claim)/i,
      /(未確認|不能確認|不一定|不代表|需確認|並非.{0,20}確認|非確認診斷|確認診斷[\s\S]{0,30}(無|未提供)|缺乏.{0,20}診斷|未提供.{0,12}臨床診斷依據|無.{0,20}臨床診斷|無.*確認)/i,
    ],
    forbiddenAnswer: /(唯一|已)已?確認.{0,16}(糖尿病|E11\.9)|可判斷醫師已診斷|(?:此為|作為)確認.{0,12}糖尿病/i,
  },
]

const chatFixtures: ChatFixture[] = [
  {
    id: 'patient-demographics',
    question: '請查詢這位病人的性別與年齡。',
    acceptedTools: ['queryPatientInfo'],
    requiredToolResultTerms: ['male', String(syntheticAge)],
    requiredAnswerGroups: [/(男性|男|male)/i, new RegExp(String(syntheticAge))],
  },
  {
    id: 'penicillin-allergy',
    question: '病人是否有 Penicillin 過敏？嚴重程度是什麼？',
    acceptedTools: ['queryAllergies'],
    requiredToolResultTerms: ['Penicillin', 'high'],
    requiredAnswerGroups: [/(Penicillin|盤尼西林)/i, /(高|嚴重|high)/i],
  },
  {
    id: 'hba1c-trend',
    question: '請查最近兩次 HbA1c 的數值與趨勢。',
    acceptedTools: ['searchObservationByName', 'queryObservations', 'queryLabResultsByCategory'],
    requiredToolResultTerms: ['8.2', '7.5'],
    requiredAnswerGroups: [/8\.2/, /7\.5/, /(上升|升高|增加|worsen)/i],
  },
  {
    id: 'active-chronic-medication',
    question: '目前正在使用的慢性藥物有哪些？不要把已完成的短期用藥列入。',
    acceptedTools: ['getActiveMedicationList', 'queryMedications'],
    requiredToolResultTerms: ['Sotalol'],
    requiredAnswerGroups: [/Sotalol/i],
    forbiddenAnswer: /Acetaminophen/i,
  },
  {
    id: 'latest-inpatient-admission',
    question: '最近一次住院的日期與主要原因是什麼？',
    acceptedTools: ['queryEncounters', 'getRecentVisits', 'getEncounterDetails'],
    requiredToolResultTerms: ['2025-05-18', 'I50.9'],
    requiredAnswerGroups: [/2025\D*0?5\D*18/, /(I50\.9|心衰|heart failure)/i],
  },
  {
    id: 'inpatient-labs',
    question: '2025 年 5 月那次住院有哪些檢驗結果？請列出數值。',
    acceptedTools: ['queryEncounters', 'getRecentVisits', 'getEncounterDetails', 'queryDiagnosticReports', 'queryObservations', 'queryLabResultsByCategory'],
    requiredArgumentTerms: ['2025'],
    requiredToolResultTerms: ['HbA1c', '8.2', 'WBC', '6'],
    requiredAnswerGroups: [/HbA1c/i, /8\.2/, /WBC/i, /6(?:\.0)?/],
  },
  {
    id: 'immunization-record',
    question: '這位病人有哪些疫苗接種紀錄？',
    acceptedTools: ['queryImmunizations'],
    requiredToolResultTerms: ['FLU', '2024-10-01'],
    requiredAnswerGroups: [/(FLU|流感)/i, /2024\D*10\D*0?1/],
  },
  {
    id: 'procedure-history',
    question: '病人做過哪些處置或手術？日期是什麼？',
    acceptedTools: ['queryProcedures'],
    requiredToolResultTerms: ['2016-09-23'],
    requiredAnswerGroups: [/2016\D*0?9\D*23/],
  },
  {
    id: 'missing-creatinine',
    question: '病歷裡有 Creatinine 或肌酸酐的檢驗結果嗎？',
    acceptedTools: ['searchObservationByName', 'queryObservations', 'queryDiagnosticReports', 'queryLabResultsByCategory', 'listAvailableObservationCodes'],
    requiredAnswerGroups: [/(沒有|未找到|找不到|未發現|查無|無.*資料|no .*data|not found)/i],
  },
  {
    id: 'data-overview',
    question: '先告訴我目前病歷有哪些類型的資料，不需要逐筆展開。',
    acceptedTools: ['getDataOverview'],
    requiredToolResultTerms: ['conditions', 'medications', 'observations'],
    requiredAnswerGroups: [/(診斷|病況|condition)/i, /(藥物|用藥|medication)/i, /(檢驗|觀察|observation)/i],
  },
  {
    id: 'recent-three-visits',
    question: '請列出最近三次就醫日期與就醫類型。',
    acceptedTools: ['getRecentVisits', 'queryEncounters'],
    requiredToolResultTerms: ['2026-05-13', '2026-03-30', '2025-05-18'],
    requiredAnswerGroups: [
      /2026\D*0?5\D*13/,
      /2026\D*0?3\D*30/,
      /2025\D*0?5\D*18/,
    ],
  },
  {
    id: 'broad-health-summary',
    question: '請用我匯入的健康資料，整理最近身體狀況、慢性疾病、目前用藥，以及超出正常範圍的檢驗數值；最後提醒我若有疑慮應與醫師討論。',
    acceptedTools: [
      'getHealthSummarySnapshot',
      'queryConditions',
      'getActiveMedicationList',
      'queryMedications',
      'queryLabResultsByCategory',
      'queryObservations',
      'queryDiagnosticReports',
      'searchObservationByName',
      'listAvailableObservationCodes',
    ],
    requiredToolGroups: [
      ['getHealthSummarySnapshot', 'queryConditions'],
      ['getHealthSummarySnapshot', 'getActiveMedicationList', 'queryMedications'],
      ['getHealthSummarySnapshot', 'queryLabResultsByCategory', 'queryObservations', 'queryDiagnosticReports'],
    ],
    requiredToolResultTerms: ['HbA1c', '8.2'],
    requiredAnswerGroups: [
      /(高血壓|hypertension)/i,
      /(Sotalol|索他洛爾)/i,
      /HbA1c/i,
      /8\.2/,
      /醫師/,
    ],
    forbiddenAnswer: /(重新匯入|請.*匯入.*資料)/i,
  },
  {
    id: 'xray-without-findings',
    question: '最近的胸部 X 光有什麼問題？只能依病歷裡實際提供的判讀回答。',
    acceptedTools: ['queryImagingRecords', 'queryDiagnosticReports'],
    requiredToolResultTerms: ['Chest X-ray', '2025-05-18'],
    requiredAnswerGroups: [
      /(X\s*光|X-ray)/i,
      /(未.{0,8}提供|沒有|無法|查無)/i,
      /(判讀|結果|所見|結論|Findings|Conclusion)/i,
    ],
    forbiddenAnswer: /(肺炎|浸潤|胸水|肋膜積水|心臟擴大|cardiomegaly)/i,
  },
  {
    id: 'lab-reference-range-not-provided',
    question: '病歷裡 HbA1c 的參考區間是多少？請只依病歷回答，不要補一般指引數字。',
    acceptedTools: ['searchObservationByName', 'queryObservations', 'queryLabResultsByCategory', 'getHealthSummarySnapshot'],
    requiredToolResultTerms: ['8.2'],
    requiredAnswerGroups: [
      /HbA1c/i,
      /(未.{0,8}提供|未列出|沒有|查無)/i,
      /(參考範圍|參考區間|Reference range)/i,
    ],
    forbiddenAnswer: /(4\.0|5\.6|5\.7|6\.4|7\.0)\s*%/,
  },
  {
    id: 'medication-name-fidelity',
    question: '請只依病歷列出目前慢性藥物的原始中文藥名、英文名稱與狀態，不要補成分、用途或藥理分類。',
    acceptedTools: ['getActiveMedicationList', 'queryMedications'],
    requiredToolResultTerms: ['通舒錠', 'Sotalol'],
    requiredAnswerGroups: [/通舒錠/, /Sotalol/i, /(使用中|目前|有效|active)/i],
    forbiddenAnswer: /(心律|β|阻斷|治療高血壓|成分為|用於治療)/i,
  },
  {
    id: 'general-no-tool',
    question: '不要查詢病歷。請用一句話解釋 HbA1c 是什麼。',
    acceptedTools: [],
    requiredAnswerGroups: [/HbA1c/i, /(平均|血糖|二至三個月|2.*3.*月)/i],
  },
  {
    id: 'current-guideline-no-patient-data',
    question: '目前糖尿病用藥 guideline 有什麼更新？',
    acceptedTools: [],
    requiredAnswerGroups: [
      /(無法|不能).{0,30}(最新|目前|即時)|(最新|目前).{0,30}(無法|不能|未能)/i,
    ],
  },
]

function collectSourceKeys(value: unknown): string[] {
  const found: string[] = []
  const visit = (current: unknown, parentKey?: string) => {
    if (Array.isArray(current)) {
      if (parentKey === 'sources') {
        current.forEach((item) => {
          if (typeof item === 'string') found.push(item)
        })
      } else {
        current.forEach((item) => visit(item))
      }
      return
    }
    if (!current || typeof current !== 'object') return
    Object.entries(current as Record<string, unknown>).forEach(([key, item]) => {
      if (key === 'ref' && typeof item === 'string') found.push(item)
      else visit(item, key)
    })
  }
  visit(value)
  return found
}

function mergeParsedModules(
  modules: Partial<{ [K in MedicalSummaryModuleId]: MedicalSummaryModuleResultMap[K] }>,
): MedicalSummaryAiResult {
  let draft = generateMedicalSummaryUseCase.createEmptyAiResult()
  MEDICAL_SUMMARY_MODULE_IDS.forEach((moduleId) => {
    const parsed = modules[moduleId]
    if (parsed) {
      draft = generateMedicalSummaryUseCase.mergeModuleResult(
        draft,
        moduleId,
        parsed as never,
      )
    }
  })
  return draft
}

const SUMMARY_STRATEGY_GROUPS: Record<SummaryStrategy, readonly (readonly MedicalSummaryModuleId[])[]> = {
  single: [MEDICAL_SUMMARY_MODULE_IDS],
  'single-retry-missing': [MEDICAL_SUMMARY_MODULE_IDS],
  'split-3-2': [
    ['medications', 'priorities', 'problems'],
    ['timeline', 'investigations'],
  ],
}

function addUsage(left: UsageRecord, right: UsageRecord): UsageRecord {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  }
}

async function runSummaryCase(
  endpoint: string,
  apiKey: string,
  model: string,
  fixture: SummaryFixture,
  strategy: SummaryStrategy,
  repetition: number,
  options: CliOptions,
): Promise<SummaryRunRecord> {
  const startedAt = Date.now()
  const outputs: string[] = []
  let usage = emptyUsage()
  let requestCount = 0
  try {
    const promptInput = {
      clinicalContext: fixture.clinicalContext,
      catalog: fixture.catalog,
      locale: 'zh-TW' as const,
      audience: fixture.audience,
    }
    const modules: Partial<{ [K in MedicalSummaryModuleId]: MedicalSummaryModuleResultMap[K] }> = {}
    const finishReasons: string[] = []
    const requestModuleGroup = async (moduleIds: readonly MedicalSummaryModuleId[]) => {
      const messages = generateMedicalSummaryUseCase.buildBatchModuleMessages(promptInput, moduleIds)
      requestCount += 1
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
          ...(/^gpt-oss(?::|-)/i.test(model) ? { reasoning_effort: 'low' } : {}),
        }),
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json() as {
        message?: string
        choices?: Array<{ finish_reason?: string; message?: { content?: string } }>
        usage?: unknown
      }
      const output = body.choices?.[0]?.message?.content ?? body.message ?? ''
      outputs.push(output)
      usage = addUsage(usage, normalizeUsage(body.usage))
      if (body.choices?.[0]?.finish_reason) finishReasons.push(body.choices[0].finish_reason)
      moduleIds.forEach((moduleId) => {
        const parsed = generateMedicalSummaryUseCase.parseBatchModuleResult(moduleId, output)
        if (
          parsed &&
          generateMedicalSummaryUseCase.findUnknownSourceKeys(parsed, fixture.catalog).length === 0
        ) {
          (modules as Record<string, unknown>)[moduleId] = parsed
        }
      })
    }
    for (const moduleIds of SUMMARY_STRATEGY_GROUPS[strategy]) {
      await requestModuleGroup(moduleIds)
    }
    if (strategy === 'single-retry-missing') {
      const missingModuleIds = MEDICAL_SUMMARY_MODULE_IDS
        .filter((moduleId) => !modules[moduleId])
        .sort((left, right) => Number(right === 'medications') - Number(left === 'medications'))
        // Match production: one poor batch must not fan out into five more
        // full-context requests. The UI can still retry remaining failed cards.
        .slice(0, 2)
      for (const moduleId of missingModuleIds) {
        await requestModuleGroup([moduleId])
      }
    }
    const draft = mergeParsedModules(modules)
    const sourceKeys = collectSourceKeys(modules)
    const validKeys = new Set(fixture.catalog.map((entry) => entry.key))
    const invalidSourceKeys = [...new Set(sourceKeys.filter((key) => !validKeys.has(key)))]
    const detectedSimplifiedCharacters = simplifiedCharacters(JSON.stringify(modules))
    const semanticFailures = [
      ...fixture.evaluate(draft),
      ...(detectedSimplifiedCharacters.length > 0
        ? [`Simplified Chinese: ${detectedSimplifiedCharacters.join('')}`]
        : []),
    ]
    const parsedModules = Object.keys(modules).length
    const ok = parsedModules === MEDICAL_SUMMARY_MODULE_IDS.length &&
      invalidSourceKeys.length === 0 && semanticFailures.length === 0
    return {
      phase: 'summary',
      model,
      caseId: fixture.id,
      audience: fixture.audience,
      strategy,
      repetition,
      requestCount,
      ok,
      latencyMs: Date.now() - startedAt,
      parsedModules,
      totalModules: MEDICAL_SUMMARY_MODULE_IDS.length,
      citationCount: sourceKeys.length,
      invalidSourceKeys,
      semanticFailures,
      simplifiedCharacters: detectedSimplifiedCharacters,
      finishReason: finishReasons.join(','),
      usage,
      outputSha256: sha256(outputs.join('\n\n')),
      ...(options.includeOutput ? { output: outputs.join('\n\n') } : {}),
    }
  } catch (error) {
    return {
      phase: 'summary',
      model,
      caseId: fixture.id,
      audience: fixture.audience,
      strategy,
      repetition,
      requestCount,
      ok: false,
      latencyMs: Date.now() - startedAt,
      parsedModules: 0,
      totalModules: MEDICAL_SUMMARY_MODULE_IDS.length,
      citationCount: 0,
      invalidSourceKeys: [],
      semanticFailures: [],
      simplifiedCharacters: [],
      usage,
      outputSha256: sha256(outputs.join('\n\n')),
      ...(options.includeOutput && outputs.length > 0 ? { output: outputs.join('\n\n') } : {}),
      error: safeError(error, apiKey),
    }
  }
}

async function runCustomSummaryCase(
  endpoint: string,
  apiKey: string,
  model: string,
  fixture: CustomSummaryFixture,
  strategy: CustomSummaryStrategy,
  repetition: number,
  options: CliOptions,
): Promise<CustomSummaryRunRecord> {
  const startedAt = Date.now()
  let output = ''
  let usage = emptyUsage()
  try {
    const logicalModelId = customOpenAiModelIdForProfile(`eval-${sha256(model).slice(0, 12)}`)
    const messages = strategy === 'grounded'
      ? generateInsightUseCase.buildMessages({
          prompt: fixture.prompt,
          clinicalContext: fixture.clinicalContext,
          modelId: logicalModelId,
          locale: 'zh-TW',
        })
      : [
          {
            role: 'system' as const,
            content: 'You are an expert clinical assistant helping healthcare professionals interpret EHR data. Use professional tone, stay factual, and note uncertainties when appropriate.',
          },
          {
            role: 'user' as const,
            content: `${fixture.prompt}\n\n---\nPatient Clinical Context:\n${fixture.clinicalContext}`,
          },
        ]
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
        ...(strategy === 'grounded'
          ? {
              max_tokens: 4096,
              ...(/^gpt-oss(?::|-)/i.test(model) ? { reasoning_effort: 'low' } : {}),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(options.requestTimeoutMs),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json() as {
      message?: string
      choices?: Array<{ message?: { content?: string } }>
      usage?: unknown
    }
    output = (body.choices?.[0]?.message?.content ?? body.message ?? '').trim()
    usage = normalizeUsage(body.usage)
    const detectedSimplifiedCharacters = simplifiedCharacters(output)
    const semanticFailures = [
      ...fixture.requiredAnswerGroups.flatMap((pattern, index) =>
        pattern.test(output) ? [] : [`required answer group ${index + 1}`],
      ),
      ...(fixture.forbiddenAnswer?.test(output) ? ['forbidden unsupported claim'] : []),
      ...(detectedSimplifiedCharacters.length > 0
        ? [`Simplified Chinese: ${detectedSimplifiedCharacters.join('')}`]
        : []),
    ]
    return {
      phase: 'custom-summary',
      model,
      caseId: fixture.id,
      strategy,
      repetition,
      ok: output.length > 0 && semanticFailures.length === 0,
      latencyMs: Date.now() - startedAt,
      semanticFailures,
      simplifiedCharacters: detectedSimplifiedCharacters,
      usage,
      outputSha256: sha256(output),
      ...(options.includeOutput ? { output } : {}),
    }
  } catch (error) {
    return {
      phase: 'custom-summary',
      model,
      caseId: fixture.id,
      strategy,
      repetition,
      ok: false,
      latencyMs: Date.now() - startedAt,
      semanticFailures: [],
      simplifiedCharacters: [],
      usage,
      outputSha256: sha256(output),
      ...(options.includeOutput && output ? { output } : {}),
      error: safeError(error, apiKey),
    }
  }
}

function uniqueToolNames(trajectory: AgentTrajectoryStep[]): string[] {
  return [...new Set(
    trajectory
      .filter((step) => step.kind === 'tool-call' && step.toolName)
      .map((step) => step.toolName as string),
  )]
}

function trajectoryText(trajectory: AgentTrajectoryStep[], kind: 'tool-call' | 'tool-result'): string {
  const payload = trajectory
    .filter((step) => step.kind === kind)
    .map((step) => kind === 'tool-call' ? step.input : step.result)
  return JSON.stringify(payload)
}

async function runChatCase(
  endpoint: string,
  apiKey: string,
  modelName: string,
  fixture: ChatFixture,
  repetition: number,
  options: CliOptions,
): Promise<ChatRunRecord> {
  const startedAt = Date.now()
  let answer = ''
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs)
  try {
    const logicalModelId = customOpenAiModelIdForProfile(`eval-${sha256(modelName).slice(0, 12)}`)
    const { model } = new AiProviderFactory().create({
      modelId: logicalModelId,
      useProxy: false,
      openAiCompatible: {
        enabled: true,
        baseUrl: endpoint,
        modelId: modelName,
        apiKey,
        transport: 'direct',
        contextWindowTokens: 262_000,
        contextWindowSource: 'manual',
        agentMode: 'auto',
        agentCapability: 'verified',
        agentCapabilityTestedAt: Date.now(),
      },
    })
    // The product scope is an explicit user control. Fixtures that expect a
    // patient tool therefore run in patient scope even when their wording is
    // terse (for example "最近一次住院"); tool-less fixtures run in general
    // scope. Do not re-introduce an intent classifier into the evaluator.
    const fixtureDataScope = fixture.acceptedTools.length === 0
      ? 'general' as const
      : 'patient' as const
    const tools = selectAgentToolsForQuestion(
      createFhirTools(sampleDataSource),
      fixture.question,
      fixtureDataScope,
    )
    const initialToolName = forcedInitialAgentToolName(
      fixture.question,
      Object.keys(tools ?? {}),
      fixtureDataScope,
    )
    const system = buildAgentSystemPromptUseCase.execute({
      baseSystemPrompt: zhTW.chat.systemPrompt.medical,
      clinicalContext: '',
      hasPatient: true,
      mode: 'local',
      hasPerplexityKey: false,
      availableToolNames: Object.keys(tools ?? {}),
      turnDataScope: fixtureDataScope,
      currentEvidenceUnavailable: asksForCurrentMedicalEvidence(fixture.question),
      translations: zhTW.agent.systemPrompt,
    })
    const result = await runDeepModeAgent({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: fixture.question },
      ],
      tools,
      initialToolName,
      preExecuteInitialTool: shouldPreExecuteLocalAgentTool(initialToolName),
      ...(/^gpt-oss(?::|-)/i.test(modelName)
        ? { reasoningEffort: 'low' as const }
        : {}),
      translations: {
        organizingResults: zhTW.agent.organizingResults,
        queriedFhirData: zhTW.agent.queriedFhirData,
        answerQuestion: zhTW.agent.answerQuestion,
        answerQuestionCitationsHint: zhTW.agent.answerQuestionCitationsHint,
        synthesizeResults: zhTW.agent.synthesizeResults,
        queryResult: zhTW.agent.queryResult,
        queryFailed: zhTW.agent.queryFailed,
        noData: zhTW.agent.noData,
        noDataFound: zhTW.agent.noDataFound,
        foundRecords: zhTW.agent.foundRecords,
        toolNames: zhTW.agent.toolNames,
      },
      idleMs: Math.min(options.requestTimeoutMs, 90_000),
      abortController: controller,
    })
    answer = result.answer.trim()
    const actualTools = uniqueToolNames(result.trajectory)
    const unexpectedTools = actualTools.filter((tool) => !fixture.acceptedTools.includes(tool))
    const baseToolSelectionOk = fixture.acceptedTools.length === 0
      ? actualTools.length === 0
      : actualTools.some((tool) => fixture.acceptedTools.includes(tool)) && unexpectedTools.length === 0
    const requiredToolGroupsOk = (fixture.requiredToolGroups ?? []).every((group) =>
      group.some((tool) => actualTools.includes(tool)),
    )
    const toolSelectionOk = baseToolSelectionOk && requiredToolGroupsOk
    const callText = trajectoryText(result.trajectory, 'tool-call')
    const argumentsOk = (fixture.requiredArgumentTerms ?? []).every((term) =>
      callText.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    )
    const resultText = trajectoryText(result.trajectory, 'tool-result')
    const retrievalOk = (fixture.requiredToolResultTerms ?? []).every((term) =>
      resultText.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    )
    const detectedSimplifiedCharacters = simplifiedCharacters(answer)
    const safetyFailures = [
      ...(fixture.forbiddenAnswer?.test(answer) ? ['forbidden or unsupported answer claim'] : []),
      ...(/<\/?tool_(?:call|response)>/i.test(answer)
        ? ['leaked tool protocol marker']
        : []),
      ...(detectedSimplifiedCharacters.length > 0
        ? [`Simplified Chinese: ${detectedSimplifiedCharacters.join('')}`]
        : []),
    ]
    const answerOk = answer.length > 0 &&
      fixture.requiredAnswerGroups.every((pattern) => pattern.test(answer)) &&
      safetyFailures.length === 0
    return {
      phase: 'chat',
      model: modelName,
      caseId: fixture.id,
      repetition,
      ok: toolSelectionOk && argumentsOk && retrievalOk && answerOk,
      latencyMs: Date.now() - startedAt,
      actualTools,
      unexpectedTools,
      toolSelectionOk,
      argumentsOk,
      retrievalOk,
      answerOk,
      safetyFailures,
      simplifiedCharacters: detectedSimplifiedCharacters,
      usage: result.usage,
      answerSha256: sha256(answer),
      ...(options.includeOutput ? { answer, trajectory: result.trajectory } : {}),
    }
  } catch (error) {
    return {
      phase: 'chat',
      model: modelName,
      caseId: fixture.id,
      repetition,
      ok: false,
      latencyMs: Date.now() - startedAt,
      actualTools: [],
      unexpectedTools: [],
      toolSelectionOk: false,
      argumentsOk: false,
      retrievalOk: false,
      answerOk: false,
      safetyFailures: [],
      simplifiedCharacters: [],
      usage: emptyUsage(),
      answerSha256: sha256(answer),
      ...(options.includeOutput && answer ? { answer } : {}),
      error: safeError(error, apiKey),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function percent(numerator: number, denominator: number): string {
  return denominator > 0 ? `${(100 * numerator / denominator).toFixed(1)}%` : 'n/a'
}

function average(values: number[]): number {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
}

function createReport(records: RunRecord[], timestamp: string): string {
  const lines = [
    '# On-prem model evaluation',
    '',
    `Generated: ${timestamp}`,
    '',
    'Raw clinical prompts and complete model outputs are excluded by default. Hashes identify repeated outputs without retaining their content.',
    '',
    '## Medical Summary',
    '',
    '| Model | Strategy | End-to-end | Module parse | Avg requests | Avg latency | Total tokens |',
    '|---|---|---:|---:|---:|---:|---:|',
  ]
  const summaryRecords = records.filter((record): record is SummaryRunRecord => record.phase === 'summary')
  const summaryGroups = [...new Set(summaryRecords.map((record) => `${record.model}\t${record.strategy}`))]
  for (const group of summaryGroups) {
    const [model, strategy] = group.split('\t') as [string, SummaryStrategy]
    const rows = summaryRecords.filter((record) => record.model === model && record.strategy === strategy)
    const passed = rows.filter((record) => record.ok).length
    const parsed = rows.reduce((sum, record) => sum + record.parsedModules, 0)
    const modules = rows.reduce((sum, record) => sum + record.totalModules, 0)
    const tokens = rows.reduce((sum, record) => sum + record.usage.totalTokens, 0)
    const requests = rows.reduce((sum, record) => sum + record.requestCount, 0) / rows.length
    lines.push(`| ${model} | ${strategy} | ${passed}/${rows.length} (${percent(passed, rows.length)}) | ${parsed}/${modules} (${percent(parsed, modules)}) | ${requests.toFixed(1)} | ${average(rows.map((row) => row.latencyMs))} ms | ${tokens} |`)
  }
  lines.push('', '## Custom Summary', '', '| Model | Prompt | End-to-end | Grounding / language | Avg latency | Total tokens |', '|---|---|---:|---:|---:|---:|')
  const customSummaryRecords = records.filter((record): record is CustomSummaryRunRecord => record.phase === 'custom-summary')
  const customSummaryGroups = [...new Set(customSummaryRecords.map((record) => `${record.model}\t${record.strategy}`))]
  for (const group of customSummaryGroups) {
    const [model, strategy] = group.split('\t') as [string, CustomSummaryStrategy]
    const rows = customSummaryRecords.filter((record) => record.model === model && record.strategy === strategy)
    const passed = rows.filter((record) => record.ok).length
    const grounded = rows.filter((record) => record.semanticFailures.length === 0 && !record.error).length
    const tokens = rows.reduce((sum, record) => sum + record.usage.totalTokens, 0)
    lines.push(`| ${model} | ${strategy} | ${passed}/${rows.length} (${percent(passed, rows.length)}) | ${grounded}/${rows.length} (${percent(grounded, rows.length)}) | ${average(rows.map((row) => row.latencyMs))} ms | ${tokens} |`)
  }
  lines.push('', '## Chat / tool calling', '', '| Model | End-to-end | Tool selection | Arguments | Retrieval | Final answer | Safety / zh-TW | Avg latency | Total tokens |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  const chatRecords = records.filter((record): record is ChatRunRecord => record.phase === 'chat')
  for (const model of [...new Set(chatRecords.map((record) => record.model))]) {
    const rows = chatRecords.filter((record) => record.model === model)
    const count = (key: 'ok' | 'toolSelectionOk' | 'argumentsOk' | 'retrievalOk' | 'answerOk') => rows.filter((row) => row[key]).length
    const safetyPassed = rows.filter((row) => row.safetyFailures.length === 0 && !row.error).length
    const tokens = rows.reduce((sum, record) => sum + record.usage.totalTokens, 0)
    lines.push(`| ${model} | ${percent(count('ok'), rows.length)} | ${percent(count('toolSelectionOk'), rows.length)} | ${percent(count('argumentsOk'), rows.length)} | ${percent(count('retrievalOk'), rows.length)} | ${percent(count('answerOk'), rows.length)} | ${percent(safetyPassed, rows.length)} | ${average(rows.map((row) => row.latencyMs))} ms | ${tokens} |`)
  }
  lines.push('', '## Failures', '')
  const failures = records.filter((record) => !record.ok)
  if (failures.length === 0) lines.push('- None')
  failures.forEach((record) => {
    if (record.phase === 'summary') {
      const reasons = [
        record.error,
        record.parsedModules < record.totalModules ? `parsed ${record.parsedModules}/${record.totalModules} modules` : '',
        record.invalidSourceKeys.length > 0 ? `invalid sources: ${record.invalidSourceKeys.join(',')}` : '',
        ...record.semanticFailures,
      ].filter(Boolean).join('; ')
      lines.push(`- summary / ${record.model} / ${record.strategy} / ${record.caseId} / run ${record.repetition}: ${reasons || 'failed'}`)
    } else if (record.phase === 'custom-summary') {
      const reasons = [record.error, ...record.semanticFailures].filter(Boolean).join('; ')
      lines.push(`- custom-summary / ${record.model} / ${record.strategy} / ${record.caseId} / run ${record.repetition}: ${reasons || 'failed'}`)
    } else {
      const reasons = [
        record.error,
        !record.toolSelectionOk ? `tool selection (${record.actualTools.join(',') || 'none'})` : '',
        !record.argumentsOk ? 'arguments' : '',
        !record.retrievalOk ? 'retrieval' : '',
        !record.answerOk ? 'final answer' : '',
        ...record.safetyFailures,
      ].filter(Boolean).join('; ')
      lines.push(`- chat / ${record.model} / ${record.caseId} / run ${record.repetition}: ${reasons || 'failed'}`)
    }
  })
  return `${lines.join('\n')}\n`
}

export async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const endpoint = requiredEnvironmentValue('ONPREM_LLM_ENDPOINT', 'TVGHBRAIN_ENDPOINT')
  const apiKey = requiredEnvironmentValue('ONPREM_LLM_API_KEY', 'TVGHBRAIN_API_KEY')
  const requestedModels = options.models
  const summaryModels = (requestedModels ?? [...SUMMARY_MODELS]).filter((model) => SUMMARY_MODELS.includes(model as typeof SUMMARY_MODELS[number]))
  const customSummaryModels = (requestedModels ?? [...CUSTOM_SUMMARY_MODELS]).filter((model) => CUSTOM_SUMMARY_MODELS.includes(model as typeof CUSTOM_SUMMARY_MODELS[number]))
  const chatModels = (requestedModels ?? [...CHAT_MODELS]).filter((model) => CHAT_MODELS.includes(model as typeof CHAT_MODELS[number]))
  const selectedSummaryCases = summaryFixtures.filter((fixture) => !options.summaryCases || options.summaryCases.includes(fixture.id))
  const selectedCustomSummaryCases = customSummaryFixtures.filter((fixture) => !options.customSummaryCases || options.customSummaryCases.includes(fixture.id))
  const selectedChatCases = chatFixtures.filter((fixture) => !options.chatCases || options.chatCases.includes(fixture.id))
  if ((options.phase === 'all' || options.phase === 'summary') && summaryModels.length === 0) throw new Error('No summary models selected')
  if ((options.phase === 'all' || options.phase === 'custom-summary') && customSummaryModels.length === 0) throw new Error('No custom-summary models selected')
  if ((options.phase === 'all' || options.phase === 'chat') && chatModels.length === 0) throw new Error('No chat models selected')
  if ((options.phase === 'all' || options.phase === 'summary') && selectedSummaryCases.length === 0) throw new Error('No summary cases selected')
  if ((options.phase === 'all' || options.phase === 'custom-summary') && selectedCustomSummaryCases.length === 0) throw new Error('No custom-summary cases selected')
  if ((options.phase === 'all' || options.phase === 'chat') && selectedChatCases.length === 0) throw new Error('No chat cases selected')

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const timestamp = new Date().toISOString()
  const fileStamp = timestamp.replaceAll(':', '-').replaceAll('.', '-')
  const jsonlPath = path.join(OUT_DIR, `runs-${fileStamp}.jsonl`)
  const reportPath = path.join(OUT_DIR, `report-${fileStamp}.md`)
  const records: RunRecord[] = []
  const record = (result: RunRecord) => {
    records.push(result)
    fs.appendFileSync(jsonlPath, `${JSON.stringify(result)}\n`, 'utf8')
    console.log(JSON.stringify({
      phase: result.phase,
      model: result.model,
      caseId: result.caseId,
      repetition: result.repetition,
      ok: result.ok,
      latencyMs: result.latencyMs,
      ...(result.phase === 'summary'
        ? {
            strategy: result.strategy,
            requestCount: result.requestCount,
            parsedModules: `${result.parsedModules}/${result.totalModules}`,
            semanticFailures: result.semanticFailures,
          }
        : result.phase === 'custom-summary'
        ? {
            strategy: result.strategy,
            semanticFailures: result.semanticFailures,
            simplifiedCharacters: result.simplifiedCharacters,
          }
        : {
            tools: result.actualTools,
            toolSelectionOk: result.toolSelectionOk,
            argumentsOk: result.argumentsOk,
            retrievalOk: result.retrievalOk,
            answerOk: result.answerOk,
            safetyFailures: result.safetyFailures,
          }),
      ...(result.error ? { error: result.error } : {}),
    }))
  }

  if (options.phase === 'all' || options.phase === 'summary') {
    for (const model of summaryModels) {
      for (const fixture of selectedSummaryCases) {
        for (const strategy of options.summaryStrategies) {
          for (let repetition = 1; repetition <= options.repeat; repetition += 1) {
            record(await runSummaryCase(
              endpoint,
              apiKey,
              model,
              fixture,
              strategy,
              repetition,
              options,
            ))
          }
        }
      }
    }
  }
  if (options.phase === 'all' || options.phase === 'custom-summary') {
    for (const model of customSummaryModels) {
      for (const fixture of selectedCustomSummaryCases) {
        for (const strategy of options.customSummaryStrategies) {
          for (let repetition = 1; repetition <= options.repeat; repetition += 1) {
            record(await runCustomSummaryCase(
              endpoint,
              apiKey,
              model,
              fixture,
              strategy,
              repetition,
              options,
            ))
          }
        }
      }
    }
  }
  if (options.phase === 'all' || options.phase === 'chat') {
    for (const model of chatModels) {
      for (const fixture of selectedChatCases) {
        for (let repetition = 1; repetition <= options.repeat; repetition += 1) {
          record(await runChatCase(endpoint, apiKey, model, fixture, repetition, options))
        }
      }
    }
  }
  fs.writeFileSync(reportPath, createReport(records, timestamp), 'utf8')
  console.log(JSON.stringify({ reportPath, jsonlPath, runs: records.length }))
}

if (require.main === module) {
  void main().catch((error) => {
    const secret = process.env.ONPREM_LLM_API_KEY ?? process.env.TVGHBRAIN_API_KEY ?? ''
    console.error(safeError(error, secret))
    process.exitCode = 1
  })
}
