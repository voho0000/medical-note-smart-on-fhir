import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import React from 'react'
import { renderToString } from 'react-dom/server'

import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { useEncountersContext } from '@/src/application/hooks/clinical-context/useEncountersContext'
import { useMedicationsContext } from '@/src/application/hooks/clinical-context/useMedicationsContext'
import { useAllergiesContext } from '@/src/application/hooks/clinical-context/useAllergiesContext'
import { useProceduresContext } from '@/src/application/hooks/clinical-context/useProceduresContext'
import { useVitalSignsContext } from '@/src/application/hooks/clinical-context/useVitalSignsContext'
import { useImmunizationsContext } from '@/src/application/hooks/clinical-context/useImmunizationsContext'
import { useProblemListContext } from '@/src/application/hooks/clinical-context/useProblemListContext'
import { formatClinicalContext } from '@/src/application/hooks/clinical-context/formatters'
import type { ClinicalData } from '@/src/application/hooks/clinical-context/types'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import type {
  ClinicalContextSection,
  DataFilters,
  DataSelection,
} from '@/src/core/entities/clinical-context.entity'
import type { MedicalSummaryCardId } from '@/src/core/entities/medical-summary.entity'
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import {
  registeredMedicalSummaryCards,
  type MedicalSummaryCardDefinition,
} from '@/src/core/use-cases/medical-summary/medical-summary-card-registry'
import {
  buildLongitudinalInvestigationContext,
  generateMedicalSummaryUseCase,
  getSourceCatalog,
  type GenerateMedicalSummaryInput,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { buildClinicalContextCoverageSection } from '@/src/core/utils/clinical-context-coverage.utils'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import {
  formatDocumentsSection,
  listClinicalDocuments,
  resolveSelectedDocuments,
  type DocumentMode,
} from '@/src/core/utils/clinical-documents.utils'
import { AiProviderFactory } from '@/src/infrastructure/ai/factories/ai-provider.factory'
import { AiSdkStreamAdapter } from '@/src/infrastructure/ai/streaming/ai-sdk-stream.adapter'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
  DEFAULT_DATA_FILTERS,
  DEFAULT_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import { buildPatientTextLiterals, scrubFreeText } from '@/src/shared/utils/pii-text-scrub'
import { convertLocalImportBytes } from '@/features/import-bundle/services/sdk-import-converter'

ensureCategoriesInitialized()

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'scripts/experiments/onprem-model-eval/results')
const MAX_ATTEMPTS = 3
const CONTEXT_WINDOW_TOKENS = 262_144

type ParsedPatientData = NonNullable<ReturnType<typeof LocalBundleService.parse>>

interface InputProfile {
  name: 'default' | 'full-history' | 'all-data'
  selection: DataSelection
  filters: DataFilters
  documentMode: DocumentMode
}

interface PatientPrompt {
  patientIndex: number
  promptInput: GenerateMedicalSummaryInput
  messages: Array<{ role: string; content: string }>
  cards: MedicalSummaryCardDefinition[]
  catalog: ReturnType<typeof getSourceCatalog>
  stats: {
    profileName: InputProfile['name']
    contextChars: number
    contextTokens: number
    promptChars: number
    promptTokens: number
    catalogEntries: number
    selectedResourceCounts: Record<string, number>
  }
}

interface AttemptRecord {
  attempt: number
  requestedCards: MedicalSummaryCardId[]
  completedCards: MedicalSummaryCardId[]
  failedCards: MedicalSummaryCardId[]
  latencyMs: number
  transportError?: string
}

interface RunRecord {
  patientIndex: number
  repetition: number
  ok: boolean
  requestCount: number
  completedAttempt: number | null
  thirdAttemptRequired: boolean
  completedCards: MedicalSummaryCardId[]
  failedCards: MedicalSummaryCardId[]
  firstCardMs: number | null
  cardReadyMs: Partial<Record<MedicalSummaryCardId, number>>
  latencyMs: number
  attempts: AttemptRecord[]
  unknownSourceKeys: Partial<Record<MedicalSummaryCardId, number>>
  outputChars: number
  outputSha256: string
  profileName: InputProfile['name']
  contextChars: number
  contextTokens: number
  promptChars: number
  promptTokens: number
  catalogEntries: number
  selectedResourceCounts: Record<string, number>
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} in the process environment.`)
  return value
}

function parseRepeat(argv: string[]): number {
  const index = argv.indexOf('--repeat')
  const repeat = Number.parseInt(index >= 0 ? argv[index + 1] : '1', 10)
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 50) {
    throw new Error('--repeat must be an integer from 1 to 50')
  }
  return repeat
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function safeError(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return (secret ? message.replaceAll(secret, '[REDACTED]') : message).slice(0, 300)
}

function resourceCounts(collection: Partial<ClinicalDataCollection>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(collection)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, (value as unknown[]).length]),
  )
}

function pushSection(
  sections: ClinicalContextSection[],
  section: ClinicalContextSection | ClinicalContextSection[] | null | undefined,
): void {
  if (!section) return
  if (Array.isArray(section)) sections.push(...section)
  else sections.push(section)
}

function buildProductionSections(
  data: ParsedPatientData,
  includedDocumentIds: string[],
  profile: InputProfile,
): ClinicalContextSection[] {
  const collection = data.collection
  const hookCollection = collection as unknown as ClinicalData
  const { selection, filters } = profile
  const captured: Record<string, ClinicalContextSection | ClinicalContextSection[] | null> = {}

  function Collector(): null {
    captured.encounters = useEncountersContext(
      selection.encounters ?? false,
      hookCollection,
      filters.encounterTimeRange,
      {
        includeMedications: selection.medications ?? false,
        includeProcedures: selection.procedures ?? false,
        filters,
      },
    )
    captured.medications = useMedicationsContext(
      selection.medications ?? false,
      hookCollection,
      filters,
      selection.encounters ?? false,
    )
    captured.allergies = useAllergiesContext(selection.allergies ?? false, hookCollection)
    captured.procedures = useProceduresContext(
      selection.procedures ?? false,
      hookCollection,
      filters,
      selection.encounters ?? false,
    )
    captured.vitals = useVitalSignsContext(selection.vitalSigns ?? false, hookCollection, filters)
    captured.immunizations = useImmunizationsContext(
      selection.immunizations ?? false,
      hookCollection,
      filters,
    )
    captured.problemList = useProblemListContext(
      selection.problemList ?? false,
      hookCollection,
      filters,
    )
    return null
  }

  renderToString(
    <AudienceProvider>
      <LanguageProvider>
        <Collector />
      </LanguageProvider>
    </AudienceProvider>,
  )

  const patientItems: string[] = []
  if (selection.patientInfo && data.patient.gender) {
    patientItems.push(`Gender: ${data.patient.gender.charAt(0).toUpperCase()}${data.patient.gender.slice(1)}`)
  }
  if (selection.patientInfo && data.patient.birthDate) {
    const age = Math.floor(
      (Date.now() - new Date(data.patient.birthDate).getTime()) / (365.25 * 86_400_000),
    )
    if (Number.isFinite(age)) patientItems.push(`Age: ${age}`)
  }

  const selectedDocuments = resolveSelectedDocuments(
    listClinicalDocuments(collection),
    profile.documentMode,
    [],
  ).filter((document) => includedDocumentIds.includes(document.id))
  const sections: ClinicalContextSection[] = []
  if (patientItems.length > 0) {
    sections.push({ title: 'Patient Information', items: patientItems })
  }
  pushSection(sections, captured.vitals)
  pushSection(sections, captured.problemList)
  if (selection.advanceDirectives) pushSection(sections, dataCategoryRegistry.getCategoryContext(
    'advanceDirectives', collection, filters,
  ))
  if (selection.medicalDevices) pushSection(sections, dataCategoryRegistry.getCategoryContext(
    'medicalDevices', collection, filters,
  ))
  if (selection.carePlans) pushSection(sections, dataCategoryRegistry.getCategoryContext(
    'carePlans', collection, filters,
  ))
  pushSection(sections, captured.encounters)
  if (selection.labReports) pushSection(sections, dataCategoryRegistry.getCategoryContext(
    'labReports', collection, filters,
  ))
  if (selection.imagingReports) pushSection(sections, dataCategoryRegistry.getCategoryContext(
    'imagingReports', collection, filters,
  ))
  if (selection.observations) pushSection(sections, dataCategoryRegistry.getCategoryContext(
    'observations', collection, filters,
  ))
  pushSection(sections, captured.procedures)
  pushSection(sections, captured.medications)
  pushSection(sections, captured.allergies)
  pushSection(sections, captured.immunizations)
  if (selection.documents) pushSection(sections, formatDocumentsSection(selectedDocuments))
  pushSection(sections, buildClinicalContextCoverageSection(
    selection,
    filters,
    collection,
    includedDocumentIds,
  ))
  return sections
}

function preparePatientPrompt(
  patientIndex: number,
  data: ParsedPatientData,
  profile: InputProfile,
): PatientPrompt {
  const includedDocumentIds = resolveSelectedDocuments(
    listClinicalDocuments(data.collection),
    profile.documentMode,
    [],
  ).map((document) => document.id)
  const scopedClinicalData = scopeClinicalDataForAi(
    data.collection,
    profile.selection,
    profile.filters,
    includedDocumentIds,
  )
  const catalog = getSourceCatalog(scopedClinicalData, 'zh-TW')
  const formattedContext = formatClinicalContext(
    buildProductionSections(data, includedDocumentIds, profile),
  )
  const scrubbedContext = scrubFreeText(
    formattedContext,
    buildPatientTextLiterals(data.patient),
  )
  const clinicalContext = [
    scrubbedContext,
    buildLongitudinalInvestigationContext(scopedClinicalData, catalog),
  ].filter(Boolean).join('\n\n')
  const promptInput = {
    clinicalContext,
    catalog,
    locale: 'zh-TW' as const,
    audience: 'medical' as const,
    harnessProfile: 'local-small' as const,
  }
  const cards = registeredMedicalSummaryCards(promptInput)
  const messages = generateMedicalSummaryUseCase.buildRegisteredCardBatchMessages(
    promptInput,
    cards.map((card) => card.buildBatchInstruction(promptInput)),
  )
  const promptText = messages.map((message) => message.content).join('\n\n')
  return {
    patientIndex,
    promptInput,
    messages,
    cards,
    catalog,
    stats: {
      profileName: profile.name,
      contextChars: clinicalContext.length,
      contextTokens: estimateTokens(clinicalContext),
      promptChars: promptText.length,
      promptTokens: estimateTokens(promptText),
      catalogEntries: catalog.length,
      selectedResourceCounts: resourceCounts(scopedClinicalData),
    },
  }
}

function parseWithoutRawLogging<T>(parse: () => T): T {
  const warn = console.warn
  console.warn = () => undefined
  try {
    return parse()
  } finally {
    console.warn = warn
  }
}

async function runOne(
  endpoint: string,
  apiKey: string,
  modelName: string,
  prompt: PatientPrompt,
  repetition: number,
  progress: boolean,
): Promise<RunRecord> {
  const runStartedAt = Date.now()
  const logicalModelId = customOpenAiModelIdForProfile(`real-summary-${prompt.patientIndex}`)
  const runtimeConfig: OpenAiCompatibleConfig = {
    enabled: true,
    baseUrl: endpoint,
    modelId: modelName,
    apiKey,
    transport: 'direct',
    contextWindowTokens: CONTEXT_WINDOW_TOKENS,
    contextWindowSource: 'manual',
    agentMode: 'auto',
    agentCapability: 'unknown',
    agentCapabilityTestedAt: null,
  }
  const adapter = new AiSdkStreamAdapter(new AiProviderFactory())
  const accepted = new Map<MedicalSummaryCardId, unknown>()
  const unknownSourceKeys: Partial<Record<MedicalSummaryCardId, number>> = {}
  const cardReadyMs: Partial<Record<MedicalSummaryCardId, number>> = {}
  const attempts: AttemptRecord[] = []
  const outputs: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const cardsToRequest = prompt.cards
      .filter((card) => !accepted.has(card.id))
      .sort((left, right) => (
        attempt === 1 ? 0 : Number(right.id === 'medications') - Number(left.id === 'medications')
      ))
    if (cardsToRequest.length === 0) break
    const attemptStartedAt = Date.now()
    const attemptParsed = new Map<MedicalSummaryCardId, unknown | null>()
    let fullText = ''
    let transportError: string | undefined
    const messages = attempt === 1
      ? prompt.messages
      : generateMedicalSummaryUseCase.buildRegisteredCardBatchMessages(
          prompt.promptInput,
          cardsToRequest.map((card) => card.buildBatchInstruction(prompt.promptInput)),
        )
    if (progress) console.log(JSON.stringify({
      event: 'attempt-start',
      patientIndex: prompt.patientIndex,
      repetition,
      attempt,
      cards: cardsToRequest.map((card) => card.id),
      elapsedMs: Date.now() - runStartedAt,
    }))

    const acceptCard = (card: MedicalSummaryCardDefinition, parsed: unknown): void => {
      accepted.set(card.id, parsed)
      if (cardReadyMs[card.id] === undefined) cardReadyMs[card.id] = Date.now() - runStartedAt
      if (progress) console.log(JSON.stringify({
        event: 'card-ready',
        patientIndex: prompt.patientIndex,
        repetition,
        attempt,
        card: card.id,
        elapsedMs: cardReadyMs[card.id],
      }))
      const unknownKeys = card.findUnknownSourceKeys
        ? card.findUnknownSourceKeys(parsed, prompt.catalog)
        : []
      if (unknownKeys.length > 0) unknownSourceKeys[card.id] = unknownKeys.length
    }
    const parseCompletedBlocks = (text: string): void => {
      cardsToRequest.forEach((card) => {
        if (
          accepted.has(card.id) ||
          attemptParsed.has(card.id) ||
          !card.hasCompleteBatchBlock(text)
        ) return
        const parsed = parseWithoutRawLogging(() => card.parseBatch(text, prompt.catalog))
        attemptParsed.set(card.id, parsed)
        if (parsed) acceptCard(card, parsed)
      })
    }

    const controller = new AbortController()
    let firstChunkSeen = false
    try {
      await adapter.stream({
        messages,
        model: logicalModelId,
        apiKey: null,
        openAiCompatible: runtimeConfig,
        signal: controller.signal,
        temperature: 0,
        onChunk: (streamedText) => {
          if (!firstChunkSeen && streamedText.length > 0) {
            firstChunkSeen = true
            if (progress) console.log(JSON.stringify({
              event: 'first-chunk',
              patientIndex: prompt.patientIndex,
              repetition,
              attempt,
              elapsedMs: Date.now() - runStartedAt,
            }))
          }
          fullText = streamedText
          parseCompletedBlocks(streamedText)
        },
      })
      cardsToRequest.forEach((card) => {
        if (accepted.has(card.id) || attemptParsed.has(card.id)) return
        const parsed = parseWithoutRawLogging(() => card.parseBatch(fullText, prompt.catalog))
        attemptParsed.set(card.id, parsed)
        if (parsed) acceptCard(card, parsed)
      })
    } catch (error) {
      transportError = safeError(error, apiKey)
    }
    outputs.push(fullText)
    attempts.push({
      attempt,
      requestedCards: cardsToRequest.map((card) => card.id),
      completedCards: cardsToRequest.filter((card) => accepted.has(card.id)).map((card) => card.id),
      failedCards: cardsToRequest.filter((card) => !accepted.has(card.id)).map((card) => card.id),
      latencyMs: Date.now() - attemptStartedAt,
      ...(transportError ? { transportError } : {}),
    })
  }

  const completedCards = prompt.cards.filter((card) => accepted.has(card.id)).map((card) => card.id)
  const failedCards = prompt.cards.filter((card) => !accepted.has(card.id)).map((card) => card.id)
  const completedAttempt = failedCards.length === 0 ? attempts.length : null
  const allOutput = outputs.join('\n\n')
  const firstCardValues = Object.values(cardReadyMs).filter((value): value is number => value !== undefined)
  return {
    patientIndex: prompt.patientIndex,
    repetition,
    ok: failedCards.length === 0,
    requestCount: attempts.length,
    completedAttempt,
    thirdAttemptRequired: attempts.length >= 3,
    completedCards,
    failedCards,
    firstCardMs: firstCardValues.length > 0 ? Math.min(...firstCardValues) : null,
    cardReadyMs,
    latencyMs: Date.now() - runStartedAt,
    attempts,
    unknownSourceKeys,
    outputChars: allOutput.length,
    outputSha256: sha256(allOutput),
    ...prompt.stats,
  }
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const quiet = argv.includes('--quiet')
  const repeat = parseRepeat(argv)
  const profile: InputProfile = argv.includes('--all-data')
    ? {
        name: 'all-data',
        selection: ALL_DATA_SELECTION,
        filters: ALL_DATA_FILTERS,
        documentMode: 'all',
      }
    : argv.includes('--full-history')
      ? {
          name: 'full-history',
          selection: DEFAULT_DATA_SELECTION,
          filters: ALL_DATA_FILTERS,
          documentMode: 'all',
        }
      : {
          name: 'default',
          selection: DEFAULT_DATA_SELECTION,
          filters: DEFAULT_DATA_FILTERS,
          documentMode: 'latestAdmission',
        }
  const modelName = process.env.ONPREM_LLM_MODEL?.trim() || 'tvghbrain3.5'
  const patientFiles = requiredEnvironmentValue('ONPREM_PATIENT_FILES')
    .split(path.delimiter)
    .map((file) => file.trim())
    .filter(Boolean)
  if (patientFiles.length === 0) throw new Error('ONPREM_PATIENT_FILES is empty')
  const endpoint = dryRun ? '' : requiredEnvironmentValue('ONPREM_LLM_ENDPOINT')
  const apiKey = dryRun ? '' : requiredEnvironmentValue('ONPREM_LLM_API_KEY')

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const jsonlPath = path.join(OUT_DIR, `real-patient-summary-${stamp}.jsonl`)
  const prompts: PatientPrompt[] = []
  for (const [index, file] of patientFiles.entries()) {
    const prepared = convertLocalImportBytes(toArrayBuffer(fs.readFileSync(file)))
    const data = LocalBundleService.parse(prepared.bundle, prepared.sourceMetadata)
    if (!data) throw new Error(`Patient file ${index + 1} did not produce a FHIR patient`)
    const prompt = preparePatientPrompt(index + 1, data, profile)
    prompts.push(prompt)
    if (!quiet) console.log(JSON.stringify({ patientIndex: index + 1, ...prompt.stats }))
  }
  if (dryRun) return

  const records: RunRecord[] = []
  for (const prompt of prompts) {
    for (let repetition = 1; repetition <= repeat; repetition += 1) {
      const record = await runOne(endpoint, apiKey, modelName, prompt, repetition, !quiet)
      records.push(record)
      fs.appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`, 'utf8')
      if (!quiet) console.log(JSON.stringify(record))
    }
  }
  const passed = records.filter((record) => record.ok).length
  const firstAttempt = records.filter((record) => record.completedAttempt === 1).length
  const bySecondAttempt = records.filter((record) => (
    record.completedAttempt !== null && record.completedAttempt <= 2
  )).length
  const thirdAttempt = records.filter((record) => record.thirdAttemptRequired).length
  console.log(JSON.stringify({
    runs: records.length,
    passed,
    successRate: records.length > 0 ? passed / records.length : 0,
    firstAttempt,
    firstAttemptRate: records.length > 0 ? firstAttempt / records.length : 0,
    bySecondAttempt,
    bySecondAttemptRate: records.length > 0 ? bySecondAttempt / records.length : 0,
    thirdAttempt,
    thirdAttemptRate: records.length > 0 ? thirdAttempt / records.length : 0,
    averageLatencyMs: records.length > 0
      ? Math.round(records.reduce((sum, record) => sum + record.latencyMs, 0) / records.length)
      : 0,
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
