// Medication-history scope A/B for the clinician Medical Summary.
//
// Research question:
//   When the user includes all medication history, does replacing the raw
//   refill-row dump + 1-source-per-row catalog with a deterministic product /
//   episode index reduce prompt tokens without degrading medicationReview?
//
// Arms:
//   production_all_history
//     Current production hooks with medicationStatus=all and
//     medicationTimeRange=all. Every scoped MedicationRequest enters the
//     source catalog.
//
//   episode_index
//     The rest of the clinical context is byte-identical. The standalone
//     medication section becomes a deterministic product/episode index keyed
//     by NHI drug code. Every current record remains citable; historical
//     products retain earliest/latest representative sources. Raw FHIR stays
//     in memory and is passed to the deterministic finalizer, but omitted raw
//     refill rows do not enter the model prompt.
//
// The visit chronology remains identical in both arms. Removing visit-linked
// medication rows would be a second variable and is deliberately excluded.
//
// Usage:
//   RUN_MED_SCOPE_EVAL=1 MED_SCOPE_EVAL_ARGS='--dry-run' \
//     ./node_modules/.bin/jest --runInBand \
//     __tests__/experiments/medication-history-scope-eval.test.tsx
//
//   RUN_MED_SCOPE_EVAL=1 \
//     MED_SCOPE_EVAL_ARGS='--repetitions 3 --allow-external-clinical-data' \
//     ./node_modules/.bin/jest --runInBand \
//     __tests__/experiments/medication-history-scope-eval.test.tsx

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
import { dataCategoryRegistry } from '@/src/core/registry/data-category.registry'
import { ensureCategoriesInitialized } from '@/src/core/categories/init'
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
  formatDocumentsSection,
} from '@/src/core/utils/clinical-documents.utils'
import { buildClinicalContextCoverageSection } from '@/src/core/utils/clinical-context-coverage.utils'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import {
  medicationExpectedEnd,
  isMedicationCurrentlyInUse,
  isChronicMedicationRecord,
} from '@/src/core/utils/clinical-context-selection.utils'
import { pickAiMedicationName } from '@/src/shared/utils/fhir-display-helpers'
import {
  DEFAULT_DATA_FILTERS,
  DEFAULT_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'
import type {
  ClinicalContextSection,
  DataFilters,
} from '@/src/core/entities/clinical-context.entity'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import {
  generateMedicalSummaryUseCase,
  buildSourceCatalog,
  buildLongitudinalInvestigationContext,
  MEDICAL_SUMMARY_MODEL_ID,
} from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { estimateMessagesTokens, estimateTokens } from '@/src/shared/utils/token-estimator'

ensureCategoriesInitialized()

const ROOT = process.cwd()
const DEFAULT_BUNDLE = path.join(ROOT, 'public/demo/demo-bundle.json')
const OUT_DIR = path.join(ROOT, 'scripts/experiments/medication-history-scope-eval/results')
const DEFAULT_AS_OF = '2026-07-15'
const RECENT_DAYS = 90
const EPISODE_GRACE_DAYS = 7
const DAY_MS = 86_400_000

type ArmName = 'production_all_history' | 'episode_index'
type Medication = any

interface MedicationGroup {
  identity: string
  code?: string
  name: string
  records: Medication[]
  currentRecords: Medication[]
  first: Medication
  latest: Medication
  firstDate?: string
  latestDate?: string
  latestSupplyEnd?: string
  chronicRecordCount: number
  episodeCount: number
  longestGapDays?: number
  organizations: string[]
  representativeRecords: Medication[]
}

interface BuiltArm {
  name: ArmName
  clinicalContext: string
  catalog: SummarySourceCatalogEntry[]
  messages: Array<{ role: string; content: string }>
  catalogMedicationCount: number
  standaloneMedicationTokens: number
  contextTokens: number
  catalogTokens: number
  userPromptTokens: number
  fullPromptTokens: number
  contextHash: string
}

function arg(flag: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function loadEnvLocal(): void {
  const filename = path.join(ROOT, '.env.local')
  if (!fs.existsSync(filename)) return
  for (const line of fs.readFileSync(filename, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim()
  }
}

function sha(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

function dateOnly(value?: string): string | undefined {
  return value ? value.slice(0, 10) : undefined
}

function medicationIdentity(medication: Medication): string {
  const coding = medication.medicationCodeableConcept?.coding?.find((item: any) => item?.code?.trim())
  if (coding?.code) {
    return `code:${String(coding.system ?? '').trim().toLowerCase()}|${coding.code.trim().toLowerCase()}`
  }
  const name = pickAiMedicationName(
    medication.medicationCodeableConcept,
    medication.medicationReference?.display,
  ) || medication.id
  return `name:${name.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, '')}`
}

function medicationCode(medication: Medication): string | undefined {
  return medication.medicationCodeableConcept?.coding?.find((item: any) => item?.code?.trim())?.code
}

function startMs(medication: Medication): number | undefined {
  const parsed = Date.parse(medication.authoredOn || medication.effectiveDateTime || '')
  return Number.isFinite(parsed) ? parsed : undefined
}

function endMs(medication: Medication): number | undefined {
  const expected = medicationExpectedEnd(medication)
  const parsed = Date.parse(expected || medication.authoredOn || medication.effectiveDateTime || '')
  return Number.isFinite(parsed) ? parsed : undefined
}

function uniqueRecords(records: Medication[]): Medication[] {
  const seen = new Set<string>()
  return records.filter((record) => {
    const key = record.id || JSON.stringify(record)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildMedicationGroups(
  medications: Medication[],
  asOfMs: number,
): MedicationGroup[] {
  const grouped = new Map<string, Medication[]>()
  for (const medication of medications) {
    const identity = medicationIdentity(medication)
    const records = grouped.get(identity) ?? []
    records.push(medication)
    grouped.set(identity, records)
  }

  return [...grouped.entries()].map(([identity, unsorted]) => {
    const records = [...unsorted].sort((a, b) =>
      String(a.authoredOn || '').localeCompare(String(b.authoredOn || '')) ||
      String(a.id || '').localeCompare(String(b.id || '')),
    )
    const first = records[0]
    const latest = records[records.length - 1]
    const currentRecords = records.filter((record) => isMedicationCurrentlyInUse(record, asOfMs))

    let episodeCount = 0
    let coverageEnd = Number.NEGATIVE_INFINITY
    let previousCoverageEnd: number | undefined
    let longestGapDays: number | undefined
    for (const record of records) {
      const start = startMs(record)
      const end = endMs(record)
      if (start === undefined) continue
      if (episodeCount === 0 || start > coverageEnd + EPISODE_GRACE_DAYS * DAY_MS) {
        episodeCount += 1
        if (previousCoverageEnd !== undefined) {
          const gap = Math.max(0, Math.round((start - previousCoverageEnd) / DAY_MS))
          longestGapDays = Math.max(longestGapDays ?? 0, gap)
        }
      }
      coverageEnd = Math.max(coverageEnd, end ?? start)
      previousCoverageEnd = coverageEnd
    }

    const organizations = [...new Set(
      records.map((record) => record.requester?.display?.trim()).filter(Boolean),
    )] as string[]
    const representativeRecords = uniqueRecords([
      first,
      latest,
      ...currentRecords,
    ])

    return {
      identity,
      code: medicationCode(latest),
      name: pickAiMedicationName(
        latest.medicationCodeableConcept,
        latest.medicationReference?.display,
      ) || 'Unknown medication',
      records,
      currentRecords,
      first,
      latest,
      firstDate: dateOnly(first.authoredOn || first.effectiveDateTime),
      latestDate: dateOnly(latest.authoredOn || latest.effectiveDateTime),
      latestSupplyEnd: medicationExpectedEnd(latest),
      chronicRecordCount: records.filter(isChronicMedicationRecord).length,
      episodeCount,
      longestGapDays,
      organizations,
      representativeRecords,
    }
  })
}

function isPharmacy(name: string): boolean {
  return /藥局|藥房/.test(name)
}

function organizationSummary(organizations: string[]): string {
  if (organizations.length === 0) return 'not-recorded'
  return organizations
    .map((organization) => isPharmacy(organization)
      ? `${organization}(dispensing pharmacy; not prescriber)`
      : `${organization}(recorded requester)`)
    .join('; ')
}

function catalogMedicationMap(
  catalog: SummarySourceCatalogEntry[],
  medications: Medication[],
): Map<string, Medication> {
  const byId = new Map(medications.map((medication) => [medication.id, medication]))
  return new Map(
    catalog
      .filter((entry) => entry.resourceType.startsWith('Medication'))
      .flatMap((entry) => {
        const medication = byId.get(entry.resourceId)
        return medication ? [[entry.key, medication] as const] : []
      }),
  )
}

function buildEpisodeMedicationSection(
  groups: MedicationGroup[],
  catalog: SummarySourceCatalogEntry[],
  allMedications: Medication[],
  asOf: string,
): ClinicalContextSection {
  const keyById = new Map(
    catalog
      .filter((entry) => entry.resourceType.startsWith('Medication'))
      .map((entry) => [entry.resourceId, entry.key]),
  )
  const threshold = Date.parse(`${asOf}T00:00:00+08:00`) - RECENT_DAYS * DAY_MS
  const current = groups.filter((group) => group.currentRecords.length > 0)
  const recentlyEnded = groups.filter((group) =>
    group.currentRecords.length === 0 &&
    Number.isFinite(Date.parse(group.latestSupplyEnd || '')) &&
    Date.parse(group.latestSupplyEnd!) >= threshold,
  )
  const older = groups.filter((group) =>
    !current.includes(group) && !recentlyEnded.includes(group),
  )

  const sortCurrent = (a: MedicationGroup, b: MedicationGroup) =>
    String(a.latestSupplyEnd || '').localeCompare(String(b.latestSupplyEnd || '')) || a.name.localeCompare(b.name)
  const sortPast = (a: MedicationGroup, b: MedicationGroup) =>
    String(b.latestSupplyEnd || b.latestDate || '').localeCompare(String(a.latestSupplyEnd || a.latestDate || '')) || a.name.localeCompare(b.name)

  const format = (group: MedicationGroup, state: 'current' | 'recent' | 'historical') => {
    const sources = group.representativeRecords
      .map((record) => keyById.get(record.id))
      .filter((key): key is string => !!key)
    const fields = [
      group.name,
      group.code ? `nhi_code=${group.code}` : undefined,
      `state=${state === 'current' ? 'current-supply-evidence' : state === 'recent' ? 'recently-ended-supply' : 'historical-exposure'}`,
      `records=${group.records.length}`,
      `current_records=${group.currentRecords.length}`,
      `first_recorded=${group.firstDate || 'unknown'}`,
      `latest_recorded=${group.latestDate || 'unknown'}`,
      `latest_supply_end=${group.latestSupplyEnd || 'unknown'}`,
      `continuous_records=${group.chronicRecordCount}`,
      `episodes=${group.episodeCount}`,
      group.longestGapDays !== undefined ? `longest_historical_gap_days=${group.longestGapDays}` : undefined,
      `organizations=${organizationSummary(group.organizations)}`,
      `representative_sources=${sources.map((key) => `[${key}]`).join(',') || 'none'}`,
    ].filter(Boolean)
    return `  • ${fields.join(' | ')}`
  }

  const items: string[] = [
    `Medication-history scope: as_of=${asOf}; raw_records_preserved_locally=${allMedications.length}; unique_products=${groups.length}.`,
    'Identity rule: exact NHI drug code when present; otherwise normalized recorded name. Different codes are not assumed to be equivalent ingredients.',
    `Episode rule: intervals separated by more than ${EPISODE_GRACE_DAYS} days form separate historical episodes. Episode/gap counts are deterministic record summaries, not proof of adherence.`,
    'Status semantics: completed/expired supply means that record ended; it does not prove the patient stopped the therapy. Only current-supply-evidence belongs to the current regimen.',
    'Source semantics: current records remain individually citable; historical rows retain earliest/latest representative records. Omitted refill rows remain available in local FHIR but are outside this summary prompt.',
    '',
    `Current medication products (${current.length} products from ${current.reduce((sum, group) => sum + group.currentRecords.length, 0)} current records):`,
    ...current.sort(sortCurrent).map((group) => format(group, 'current')),
    '',
    `Recently ended products (last ${RECENT_DAYS} days, ${recentlyEnded.length}):`,
    ...recentlyEnded.sort(sortPast).map((group) => format(group, 'recent')),
    '',
    `Older historical exposure index (${older.length}):`,
    ...older.sort(sortPast).map((group) => format(group, 'historical')),
  ]

  return { title: "Patient's Medications — episode index", items }
}

function pushSection(
  sections: ClinicalContextSection[],
  value: ClinicalContextSection | ClinicalContextSection[] | null | undefined,
): void {
  if (!value) return
  if (Array.isArray(value)) sections.push(...value)
  else sections.push(value)
}

function collectSharedSections(
  collection: any,
  filters: DataFilters,
  documents: ReturnType<typeof resolveSelectedDocuments>,
): {
  beforeMedication: ClinicalContextSection[]
  afterMedication: ClinicalContextSection[]
  baselineMedication: ClinicalContextSection | null
} {
  const captured: Record<string, ClinicalContextSection | ClinicalContextSection[] | null> = {}

  function Collector(): null {
    captured.encounters = useEncountersContext(
      true,
      collection,
      filters.encounterTimeRange,
      { includeMedications: true, includeProcedures: true, filters },
    )
    captured.medications = useMedicationsContext(true, collection, filters, true)
    captured.allergies = useAllergiesContext(true, collection)
    captured.procedures = useProceduresContext(true, collection, filters, true)
    captured.vitals = useVitalSignsContext(true, collection, filters)
    captured.immunizations = useImmunizationsContext(true, collection, filters)
    captured.problemList = useProblemListContext(true, collection, filters)
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
  if (collection.patient?.gender) {
    const gender = collection.patient.gender
    patientItems.push(`Gender: ${gender.charAt(0).toUpperCase()}${gender.slice(1)}`)
  }
  if (collection.patient?.birthDate) {
    const age = Math.floor((Date.now() - Date.parse(collection.patient.birthDate)) / (365.25 * DAY_MS))
    if (Number.isFinite(age)) patientItems.push(`Age: ${age}`)
  }

  const beforeMedication: ClinicalContextSection[] = []
  if (patientItems.length > 0) beforeMedication.push({ title: 'Patient Information', items: patientItems })
  pushSection(beforeMedication, captured.vitals)
  pushSection(beforeMedication, captured.problemList)
  pushSection(beforeMedication, dataCategoryRegistry.getCategoryContext('advanceDirectives', collection, filters))
  pushSection(beforeMedication, dataCategoryRegistry.getCategoryContext('medicalDevices', collection, filters))
  pushSection(beforeMedication, dataCategoryRegistry.getCategoryContext('carePlans', collection, filters))
  pushSection(beforeMedication, captured.encounters)
  pushSection(beforeMedication, dataCategoryRegistry.getCategoryContext('labReports', collection, filters))
  pushSection(beforeMedication, dataCategoryRegistry.getCategoryContext('imagingReports', collection, filters))
  pushSection(beforeMedication, dataCategoryRegistry.getCategoryContext('observations', collection, filters))
  pushSection(beforeMedication, captured.procedures)

  const afterMedication: ClinicalContextSection[] = []
  pushSection(afterMedication, captured.allergies)
  pushSection(afterMedication, captured.immunizations)
  pushSection(afterMedication, formatDocumentsSection(documents))
  pushSection(
    afterMedication,
    buildClinicalContextCoverageSection(
      DEFAULT_DATA_SELECTION,
      filters,
      collection,
      documents.map((document) => document.id),
    ),
  )

  return {
    beforeMedication,
    afterMedication,
    baselineMedication: captured.medications as ClinicalContextSection | null,
  }
}

function catalogText(catalog: SummarySourceCatalogEntry[]): string {
  return catalog.map((entry) =>
    `[${entry.key}] ${[
      entry.resourceType,
      entry.date ?? '?',
      entry.organization ?? '',
      entry.display,
    ].filter(Boolean).join(' | ')}`,
  ).join('\n')
}

function buildArm(
  name: ArmName,
  sections: ClinicalContextSection[],
  scopedData: any,
  catalog: SummarySourceCatalogEntry[],
  standaloneMedicationSection: ClinicalContextSection,
): BuiltArm {
  const clinicalContext = [
    formatClinicalContext(sections),
    buildLongitudinalInvestigationContext(scopedData, catalog),
  ].filter(Boolean).join('\n\n')
  const messages = generateMedicalSummaryUseCase.buildMessages({
    clinicalContext,
    catalog,
    locale: 'zh-TW',
    audience: 'medical',
  })
  const userPrompt = messages[1]?.content ?? ''
  const catalogBlock = catalogText(catalog)
  return {
    name,
    clinicalContext,
    catalog,
    messages,
    catalogMedicationCount: catalog.filter((entry) => entry.resourceType.startsWith('Medication')).length,
    standaloneMedicationTokens: estimateTokens(formatClinicalContext([standaloneMedicationSection])),
    contextTokens: estimateTokens(clinicalContext),
    catalogTokens: estimateTokens(catalogBlock),
    userPromptTokens: estimateTokens(userPrompt),
    fullPromptTokens: estimateMessagesTokens(messages),
    contextHash: sha(clinicalContext),
  }
}

let authToken: string | undefined
async function getAnonToken(): Promise<string> {
  if (authToken) return authToken
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) throw new Error('缺 NEXT_PUBLIC_FIREBASE_API_KEY (.env.local)')
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  })
  if (!response.ok) throw new Error(`anonymous sign-up ${response.status}: ${(await response.text()).slice(0, 200)}`)
  authToken = (await response.json()).idToken
  return authToken!
}

async function callModel(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  const isGemini = model.startsWith('gemini')
  const url = isGemini
    ? process.env.NEXT_PUBLIC_GEMINI_URL
    : process.env.NEXT_PUBLIC_CHAT_URL
  if (!url) throw new Error(isGemini ? '缺 NEXT_PUBLIC_GEMINI_URL' : '缺 NEXT_PUBLIC_CHAT_URL')
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${await getAnonToken()}`,
  }
  if (process.env.NEXT_PUBLIC_PROXY_KEY) headers['x-proxy-key'] = process.env.NEXT_PUBLIC_PROXY_KEY
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, stream: false, messages }),
  })
  if (!response.ok) {
    throw new Error(`${isGemini ? 'gemini' : 'openai'} proxy ${response.status}: ${(await response.text()).slice(0, 500)}`)
  }
  const json = await response.json()
  return json.message ??
    json.choices?.[0]?.message?.content ??
    (json.candidates?.[0]?.content?.parts ?? []).map((part: any) => part.text ?? '').join('')
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)))
    }
  }
  throw lastError
}

function keySources(item: any): string[] {
  return Array.isArray(item?.sources)
    ? item.sources
    : Array.isArray(item?.sourceKeys)
      ? item.sourceKeys
      : []
}

function evaluateMedicationReview(
  parsed: any,
  finalized: any,
  catalog: SummarySourceCatalogEntry[],
  allMedications: Medication[],
  asOfMs: number,
) {
  const medicationByKey = catalogMedicationMap(catalog, allMedications)
  const currentIdentities = new Set(
    allMedications.filter((medication) => isMedicationCurrentlyInUse(medication, asOfMs)).map(medicationIdentity),
  )
  const rawReview = parsed.medicationReview ?? { regimen: [], changes: [], reconciliation: [] }
  const finalReview = finalized.medicationReview ?? { regimen: [], changes: [], reconciliation: [] }

  const citedCurrentIdentities = new Set<string>()
  let regimenMedicationCitations = 0
  let directCurrentCitations = 0
  let regimenItemsWithNoMedicationSource = 0
  let expiredOnlyRegimenItems = 0
  const identityRows = new Map<string, Set<number>>()

  for (const [index, item] of (rawReview.regimen ?? []).entries()) {
    const citedMedications = keySources(item)
      .map((key) => medicationByKey.get(String(key).trim()))
      .filter(Boolean) as Medication[]
    if (citedMedications.length === 0) regimenItemsWithNoMedicationSource += 1
    const itemIdentities = new Set(citedMedications.map(medicationIdentity))
    const itemHasCurrentIdentity = [...itemIdentities].some((identity) => currentIdentities.has(identity))
    if (citedMedications.length > 0 && !itemHasCurrentIdentity) expiredOnlyRegimenItems += 1
    for (const medication of citedMedications) {
      regimenMedicationCitations += 1
      if (isMedicationCurrentlyInUse(medication, asOfMs)) directCurrentCitations += 1
      const identity = medicationIdentity(medication)
      if (currentIdentities.has(identity)) citedCurrentIdentities.add(identity)
      const rows = identityRows.get(identity) ?? new Set<number>()
      rows.add(index)
      identityRows.set(identity, rows)
    }
  }

  const duplicateIdentityRows = [...identityRows.values()].filter((rows) => rows.size > 1).length
  const rawText = JSON.stringify(rawReview)
  const arithmeticSigItems = (rawReview.regimen ?? []).filter((item: any) =>
    /給藥總量|給藥日數|平均每日/.test(item.sig ?? ''),
  ).length
  const pharmacyAsPrescriberClaims = (
    rawText.match(/藥局[^。；\n]{0,30}(?:開立|處方來源|醫師|管理)|(?:開立|處方來源|管理)[^。；\n]{0,30}藥局/g) ?? []
  ).length
  const historicalNames = ['URETROPIC', 'SIGMART', 'CRESTOR', 'Pradaxa']
  const revivedHistoricalNames = historicalNames.filter((name) =>
    (rawReview.regimen ?? []).some((item: any) => new RegExp(name, 'i').test(item.name ?? '')),
  )
  const invalidSourceKeys = [
    ...(rawReview.regimen ?? []),
    ...(rawReview.changes ?? []),
    ...(rawReview.reconciliation ?? []),
  ].flatMap(keySources).filter((key: string) => !catalog.some((entry) => entry.key === String(key).trim())).length

  return {
    raw: {
      overviewPresent: Boolean(rawReview.overview?.trim()),
      regimenItems: rawReview.regimen?.length ?? 0,
      changeItems: rawReview.changes?.length ?? 0,
      reconciliationItems: rawReview.reconciliation?.length ?? 0,
    },
    finalized: {
      regimenItems: finalReview.regimen?.length ?? 0,
      changeItems: finalReview.changes?.length ?? 0,
      reconciliationItems: finalReview.reconciliation?.length ?? 0,
    },
    currentIdentityTotal: currentIdentities.size,
    currentIdentityCited: citedCurrentIdentities.size,
    currentCitationRecall: currentIdentities.size === 0 ? 1 : citedCurrentIdentities.size / currentIdentities.size,
    regimenMedicationCitations,
    directCurrentCitations,
    directCurrentCitationPrecision: regimenMedicationCitations === 0 ? 0 : directCurrentCitations / regimenMedicationCitations,
    regimenItemsWithNoMedicationSource,
    expiredOnlyRegimenItems,
    duplicateIdentityRows,
    invalidSourceKeys,
    arithmeticSigItems,
    pharmacyAsPrescriberClaims,
    revivedHistoricalNames,
  }
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function reportMarkdown(rows: any[], arms: Record<ArmName, BuiltArm>, metadata: any): string {
  const lines = [
    '# Medication history scope A/B results',
    '',
    `- model: ${metadata.model}`,
    `- bundle_sha256: ${metadata.bundleHash}`,
    `- as_of: ${metadata.asOf}`,
    `- repetitions: ${metadata.repetitions}`,
    `- generated_at: ${metadata.generatedAt}`,
    '',
    '## Prompt size',
    '',
    '| arm | standalone medication | catalog medication entries | clinical context | catalog | user prompt | full prompt |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ]
  for (const arm of Object.values(arms)) {
    lines.push(`| ${arm.name} | ${arm.standaloneMedicationTokens} | ${arm.catalogMedicationCount} | ${arm.contextTokens} | ${arm.catalogTokens} | ${arm.userPromptTokens} | ${arm.fullPromptTokens} |`)
  }

  lines.push(
    '',
    '## Medication-review performance',
    '',
    '| arm | successful | current cited | direct-current citation precision | expired-only regimen | duplicate identity rows | invalid keys | arithmetic SIG | pharmacy-as-prescriber | revived historical names |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  )
  for (const armName of Object.keys(arms) as ArmName[]) {
    const selected = rows.filter((row) => row.arm === armName && row.metrics)
    const current = selected.map((row) => row.metrics.currentCitationRecall)
    const precision = selected.map((row) => row.metrics.directCurrentCitationPrecision)
    const sum = (key: string) => selected.reduce((total, row) => total + Number(row.metrics[key] ?? 0), 0)
    const revived = selected.reduce((total, row) => total + row.metrics.revivedHistoricalNames.length, 0)
    lines.push(
      `| ${armName} | ${selected.length}/${metadata.repetitions} | ${(100 * average(current)).toFixed(1)}% | ${(100 * average(precision)).toFixed(1)}% | ${sum('expiredOnlyRegimenItems')} | ${sum('duplicateIdentityRows')} | ${sum('invalidSourceKeys')} | ${sum('arithmeticSigItems')} | ${sum('pharmacyAsPrescriberClaims')} | ${revived} |`,
    )
  }

  lines.push('', '## Per run', '', '| rep | arm | latency ms | regimen | changes | reconciliation | current cited | precision | expired-only | raw headline |', '|---:|---|---:|---:|---:|---:|---:|---:|---:|---|')
  for (const row of rows) {
    if (!row.metrics) {
      lines.push(`| ${row.repetition} | ${row.arm} | ${row.latencyMs ?? ''} | ERROR |  |  |  |  |  | ${String(row.error ?? '').replaceAll('|', '\\|').slice(0, 100)} |`)
      continue
    }
    lines.push(
      `| ${row.repetition} | ${row.arm} | ${row.latencyMs} | ${row.metrics.raw.regimenItems} | ${row.metrics.raw.changeItems} | ${row.metrics.raw.reconciliationItems} | ${row.metrics.currentIdentityCited}/${row.metrics.currentIdentityTotal} | ${(100 * row.metrics.directCurrentCitationPrecision).toFixed(1)}% | ${row.metrics.expiredOnlyRegimenItems} | ${String(row.headline ?? '').replaceAll('|', '\\|')} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

export async function main(): Promise<void> {
  const bundleFile = arg('--bundle', DEFAULT_BUNDLE)!
  const asOf = arg('--as-of', DEFAULT_AS_OF)!
  const repetitions = Number(arg('--repetitions', '3'))
  const model = arg('--model', MEDICAL_SUMMARY_MODEL_ID)!
  const dryRun = process.argv.includes('--dry-run')
  const allowExternal = process.argv.includes('--allow-external-clinical-data')
  const asOfMs = Date.parse(`${asOf}T00:00:00+08:00`)
  if (!Number.isFinite(asOfMs)) throw new Error(`invalid --as-of ${asOf}`)

  const bundleText = fs.readFileSync(bundleFile, 'utf8')
  const bundle = JSON.parse(bundleText)
  const { LocalBundleService } = await import('@/src/infrastructure/fhir/services/local-bundle.service')
  const parsedBundle = await LocalBundleService.parse(bundle)
  if (!parsedBundle) throw new Error('bundle parse failed')
  const collection: any = parsedBundle.collection
  const allMedications: Medication[] = collection.medications ?? []
  const filters: DataFilters = {
    ...DEFAULT_DATA_FILTERS,
    medicationStatus: 'all',
    medicationTimeRange: 'all',
  }

  const documents = resolveSelectedDocuments(listClinicalDocuments(collection), 'latestAdmission', [])
  const shared = collectSharedSections(collection, filters, documents)
  if (!shared.baselineMedication) throw new Error('production medication section is empty')
  const scopedData: any = scopeClinicalDataForAi(
    collection,
    DEFAULT_DATA_SELECTION,
    filters,
    documents.map((document) => document.id),
    asOfMs,
  )

  const groups = buildMedicationGroups(scopedData.medications ?? [], asOfMs)
  const representatives = uniqueRecords(groups.flatMap((group) => group.representativeRecords))
  const productionCatalog = buildSourceCatalog(scopedData)
  const episodeCatalog = buildSourceCatalog({ ...scopedData, medications: representatives })
  const episodeMedication = buildEpisodeMedicationSection(
    groups,
    episodeCatalog,
    scopedData.medications ?? [],
    asOf,
  )

  const productionSections = [
    ...shared.beforeMedication,
    shared.baselineMedication,
    ...shared.afterMedication,
  ]
  const episodeSections = [
    ...shared.beforeMedication,
    episodeMedication,
    ...shared.afterMedication,
  ]
  const arms: Record<ArmName, BuiltArm> = {
    production_all_history: buildArm(
      'production_all_history',
      productionSections,
      scopedData,
      productionCatalog,
      shared.baselineMedication,
    ),
    episode_index: buildArm(
      'episode_index',
      episodeSections,
      scopedData,
      episodeCatalog,
      episodeMedication,
    ),
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const metadata = {
    model,
    bundle: path.relative(ROOT, bundleFile),
    bundleHash: crypto.createHash('sha256').update(bundleText).digest('hex'),
    asOf,
    repetitions,
    generatedAt: new Date().toISOString(),
    rawMedicationRecords: allMedications.length,
    uniqueMedicationProducts: groups.length,
    currentMedicationProducts: groups.filter((group) => group.currentRecords.length > 0).length,
    currentMedicationRecords: groups.reduce((sum, group) => sum + group.currentRecords.length, 0),
    representativeMedicationRecords: representatives.length,
    episodeGraceDays: EPISODE_GRACE_DAYS,
  }
  fs.writeFileSync(path.join(OUT_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2))
  for (const arm of Object.values(arms)) {
    fs.writeFileSync(path.join(OUT_DIR, `${arm.name}.clinical-context.txt`), arm.clinicalContext)
    fs.writeFileSync(path.join(OUT_DIR, `${arm.name}.messages.json`), JSON.stringify(arm.messages, null, 2))
    console.log(
      `${arm.name}: standaloneMed≈${arm.standaloneMedicationTokens} ` +
      `catalogMeds=${arm.catalogMedicationCount} context≈${arm.contextTokens} ` +
      `catalog≈${arm.catalogTokens} user≈${arm.userPromptTokens} full≈${arm.fullPromptTokens} ` +
      `hash=${arm.contextHash}`,
    )
  }
  console.log(
    `records=${metadata.rawMedicationRecords}; products=${metadata.uniqueMedicationProducts}; ` +
    `current=${metadata.currentMedicationProducts} products/${metadata.currentMedicationRecords} records; ` +
    `representatives=${metadata.representativeMedicationRecords}`,
  )

  if (dryRun) {
    console.log('[dry-run] contexts/messages written; no external model call')
    return
  }
  if (!allowExternal) throw new Error('拒絕外傳：live run 需加 --allow-external-clinical-data')
  loadEnvLocal()

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const output = path.join(OUT_DIR, `runs-${timestamp}.jsonl`)
  const rows: any[] = []
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const order: ArmName[] = repetition % 2 === 1
      ? ['production_all_history', 'episode_index']
      : ['episode_index', 'production_all_history']
    for (const armName of order) {
      const arm = arms[armName]
      const started = Date.now()
      try {
        const raw = await withRetry(() => callModel(model, arm.messages))
        const parsed = generateMedicalSummaryUseCase.parseResult(raw)
        if (!parsed) throw new Error('parseResult failed')
        const finalized = generateMedicalSummaryUseCase.finalizeResult(parsed, arm.catalog, {
          clinicalData: scopedData,
          audience: 'medical',
          locale: 'zh-TW',
        })
        const metrics = evaluateMedicationReview(parsed, finalized, arm.catalog, allMedications, asOfMs)
        const row = {
          repetition,
          arm: armName,
          model,
          latencyMs: Date.now() - started,
          headline: parsed.headline,
          metrics,
          medicationReviewRaw: parsed.medicationReview,
          medicationReviewFinalized: finalized.medicationReview,
          rawOutput: raw,
        }
        rows.push(row)
        fs.appendFileSync(output, `${JSON.stringify(row)}\n`)
        console.log(
          `rep=${repetition} ${armName}: regimen=${metrics.raw.regimenItems} ` +
          `changes=${metrics.raw.changeItems} recon=${metrics.raw.reconciliationItems} ` +
          `current=${metrics.currentIdentityCited}/${metrics.currentIdentityTotal} ` +
          `precision=${(100 * metrics.directCurrentCitationPrecision).toFixed(0)}% ` +
          `expired=${metrics.expiredOnlyRegimenItems} latency=${row.latencyMs}ms`,
        )
      } catch (error) {
        const row = {
          repetition,
          arm: armName,
          model,
          latencyMs: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        }
        rows.push(row)
        fs.appendFileSync(output, `${JSON.stringify(row)}\n`)
        console.error(`rep=${repetition} ${armName}: ERROR ${row.error}`)
      }
    }
  }

  const report = output.replace(/\.jsonl$/, '.md')
  const markdown = reportMarkdown(rows, arms, metadata)
  fs.writeFileSync(report, markdown)
  console.log(`\n${markdown}\nresults=${output}`)
}

if (!process.env.JEST_WORKER_ID) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error)
    process.exitCode = 1
  })
}
