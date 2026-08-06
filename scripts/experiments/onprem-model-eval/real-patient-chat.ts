import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { AiProviderFactory } from '@/src/infrastructure/ai/factories/ai-provider.factory'
import { runDeepModeAgent } from '@/src/infrastructure/ai/agent/run-deep-mode-agent'
import { createFhirTools } from '@/src/infrastructure/ai/tools/fhir-tools'
import {
  forcedInitialAgentToolName,
  selectAgentToolsForQuestion,
} from '@/src/infrastructure/ai/tools/agent-tool-router'
import { buildAgentSystemPromptUseCase } from '@/src/core/use-cases/agent/build-agent-system-prompt.use-case'
import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'
import { convertLocalImportBytes } from '@/features/import-bundle/services/sdk-import-converter'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'scripts/experiments/onprem-model-eval/results')
const QUESTION = '請用我匯入的健康資料，整理最近身體狀況、慢性疾病、目前用藥，以及超出正常範圍的檢驗數值；醫療術語請補充白話說明，最後提醒我若有疑慮應與醫師討論。'
const REQUIRED_TOOL_GROUPS = [
  ['queryConditions'],
  ['getActiveMedicationList', 'queryMedications'],
  ['queryLabResultsByCategory', 'queryObservations', 'queryDiagnosticReports'],
] as const

interface RunRecord {
  patientIndex: number
  repetition: number
  ok: boolean
  latencyMs: number
  resourceCounts: Record<string, number>
  tools: string[]
  toolCallCount: number
  toolResultChars: number
  compactSnapshotUsed: boolean
  snapshotCounts?: Record<string, number>
  snapshotTruncated?: Record<string, boolean>
  requiredToolsOk: boolean
  answerOk: boolean
  answerCoverageOk: boolean
  physicianReminderOk: boolean
  noReimportPromptOk: boolean
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  answerSha256: string
  error?: string
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} in the process environment.`)
  return value
}

function parseRepeat(argv: string[]): number {
  const index = argv.indexOf('--repeat')
  const value = Number.parseInt(index >= 0 ? argv[index + 1] : '10', 10)
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error('--repeat must be an integer from 1 to 100')
  }
  return value
}

function safeError(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return secret ? message.replaceAll(secret, '[REDACTED]') : message
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

function counts(collection: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(collection)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, (value as unknown[]).length]),
  )
}

async function runOne(
  endpoint: string,
  apiKey: string,
  modelName: string,
  patientIndex: number,
  repetition: number,
  data: NonNullable<ReturnType<typeof LocalBundleService.parse>>,
): Promise<RunRecord> {
  const startedAt = Date.now()
  let answer = ''
  try {
    const logicalModelId = customOpenAiModelIdForProfile(`real-patient-${patientIndex}`)
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
    const tools = selectAgentToolsForQuestion(
      createFhirTools(() => data),
      QUESTION,
    )
    const selectedToolNames = Object.keys(tools ?? {})
    const initialToolName = forcedInitialAgentToolName(QUESTION, selectedToolNames)
    const system = buildAgentSystemPromptUseCase.execute({
      baseSystemPrompt: zhTW.chat.systemPrompt.medical,
      clinicalContext: '',
      hasPatient: true,
      mode: 'local',
      hasPerplexityKey: false,
      availableToolNames: selectedToolNames,
      translations: zhTW.agent.systemPrompt,
    })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 180_000)
    try {
      const result = await runDeepModeAgent({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: QUESTION },
        ],
        tools,
        initialToolName,
        preExecuteInitialTool: initialToolName === 'getHealthSummarySnapshot',
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
        idleMs: 90_000,
        abortController: controller,
      })
      answer = result.answer.trim()
      const actualTools = [...new Set(
        result.trajectory
          .filter((step) => step.kind === 'tool-call' && step.toolName)
          .map((step) => step.toolName as string),
      )]
      const toolCallCount = result.trajectory.filter((step) => step.kind === 'tool-call').length
      const toolResultChars = result.trajectory
        .filter((step) => step.kind === 'tool-result')
        .reduce((sum, step) => sum + JSON.stringify(step.result ?? null).length, 0)
      const compactSnapshotUsed = actualTools.includes('getHealthSummarySnapshot')
      const compactResult = result.trajectory.find(
        (step) => step.kind === 'tool-result' && step.toolName === 'getHealthSummarySnapshot',
      )?.result as Record<string, unknown> | undefined
      const snapshotCounts = compactResult?.counts as Record<string, number> | undefined
      const snapshotTruncated = compactResult?.truncated as Record<string, boolean> | undefined
      const requiredToolsOk = compactSnapshotUsed || REQUIRED_TOOL_GROUPS.every((group) =>
        group.some((tool) => actualTools.includes(tool)),
      )
      const answerCoverageOk = [
        /(?:身體狀況|疾病|診斷|health|condition|diagnosis)/i,
        /(?:用藥|藥物|medication|medicine)/i,
        /(?:檢驗|數值|正常範圍|異常|lab|test result|abnormal)/i,
      ].every((pattern) => pattern.test(answer))
      const physicianReminderOk = /醫師/.test(answer)
      const noReimportPromptOk = !/(?:重新匯入|需要(?:先)?匯入|請[^。！？\n]{0,20}(?:先)?匯入|(?:點擊|點選|選擇|按下)[\s\S]{0,60}(?:匯入|健康存摺))/i.test(answer)
      const answerOk = answer.length > 0 && answerCoverageOk &&
        physicianReminderOk && noReimportPromptOk
      return {
        patientIndex,
        repetition,
        ok: requiredToolsOk && answerOk,
        latencyMs: Date.now() - startedAt,
        resourceCounts: counts(data.collection as unknown as Record<string, unknown>),
        tools: actualTools,
        toolCallCount,
        toolResultChars,
        compactSnapshotUsed,
        snapshotCounts,
        snapshotTruncated,
        requiredToolsOk,
        answerOk,
        answerCoverageOk,
        physicianReminderOk,
        noReimportPromptOk,
        usage: result.usage,
        answerSha256: sha256(answer),
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    return {
      patientIndex,
      repetition,
      ok: false,
      latencyMs: Date.now() - startedAt,
      resourceCounts: counts(data.collection as unknown as Record<string, unknown>),
      tools: [],
      toolCallCount: 0,
      toolResultChars: 0,
      compactSnapshotUsed: false,
      requiredToolsOk: false,
      answerOk: false,
      answerCoverageOk: false,
      physicianReminderOk: false,
      noReimportPromptOk: false,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      answerSha256: sha256(answer),
      error: safeError(error, apiKey),
    }
  }
}

export async function main(): Promise<void> {
  const endpoint = requiredEnvironmentValue('ONPREM_LLM_ENDPOINT')
  const apiKey = requiredEnvironmentValue('ONPREM_LLM_API_KEY')
  const modelName = process.env.ONPREM_LLM_MODEL?.trim() || 'tvghbrain3.5'
  const patientFiles = requiredEnvironmentValue('ONPREM_PATIENT_FILES')
    .split(path.delimiter)
    .map((file) => file.trim())
    .filter(Boolean)
  const repeat = parseRepeat(process.argv.slice(2))
  if (patientFiles.length === 0) throw new Error('ONPREM_PATIENT_FILES is empty')

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const jsonlPath = path.join(OUT_DIR, `real-patient-chat-${stamp}.jsonl`)
  const records: RunRecord[] = []

  for (const [index, file] of patientFiles.entries()) {
    const prepared = convertLocalImportBytes(toArrayBuffer(fs.readFileSync(file)))
    const data = LocalBundleService.parse(prepared.bundle, prepared.sourceMetadata)
    if (!data) throw new Error(`Patient file ${index + 1} did not produce a FHIR patient`)
    for (let repetition = 1; repetition <= repeat; repetition += 1) {
      const record = await runOne(
        endpoint,
        apiKey,
        modelName,
        index + 1,
        repetition,
        data,
      )
      records.push(record)
      fs.appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`, 'utf8')
      console.log(JSON.stringify({
        patientIndex: record.patientIndex,
        repetition: record.repetition,
        ok: record.ok,
        latencyMs: record.latencyMs,
        tools: record.tools,
        toolCallCount: record.toolCallCount,
        toolResultChars: record.toolResultChars,
        compactSnapshotUsed: record.compactSnapshotUsed,
        snapshotCounts: record.snapshotCounts,
        snapshotTruncated: record.snapshotTruncated,
        requiredToolsOk: record.requiredToolsOk,
        answerOk: record.answerOk,
        answerCoverageOk: record.answerCoverageOk,
        physicianReminderOk: record.physicianReminderOk,
        noReimportPromptOk: record.noReimportPromptOk,
        totalTokens: record.usage.totalTokens,
        ...(record.error ? { error: record.error } : {}),
      }))
    }
  }

  const passed = records.filter((record) => record.ok).length
  const totalTokens = records.reduce((sum, record) => sum + record.usage.totalTokens, 0)
  const averageLatencyMs = Math.round(
    records.reduce((sum, record) => sum + record.latencyMs, 0) / records.length,
  )
  console.log(JSON.stringify({
    runs: records.length,
    passed,
    successRate: records.length > 0 ? passed / records.length : 0,
    totalTokens,
    averageLatencyMs,
    jsonlPath,
  }))
}

if (require.main === module) {
  void main().catch((error) => {
    const secret = process.env.ONPREM_LLM_API_KEY ?? ''
    console.error(safeError(error, secret))
    process.exitCode = 1
  })
}
