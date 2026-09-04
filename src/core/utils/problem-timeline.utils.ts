// Claims-derived PROBLEM TIMELINE for the AI clinical context.
//
// Why this section exists:
// Taiwan NHI claims describe a problem the way an accountant does — the same
// ICD-10 code repeats once per reimbursed visit, across years, departments and
// institutions. The encounter-centric section renders that faithfully, but a
// first-visit reader cannot answer "how long has this been going on, where is
// it being followed, and did it ever put the patient in a bed?" without
// scanning hundreds of visit rows. This section answers exactly those
// questions in ONE line per problem, at a fixed cost that does not grow with
// visit count.
//
// Determinism: every field is computed from the records; nothing is inferred.
// Codes are grouped by their ICD-10 3-character category (E11.9 and E11.65 are
// one diabetes line) and labelled with the MOST SPECIFIC code seen, because a
// clinician reads the specific code and the family grouping is only there to
// stop one disease occupying four lines.
//
// Citability: the label is the *catalog* display of the latest Condition
// carrying that code, and the line always prints that Condition's catalog date,
// so a claim about the line resolves against `SummarySourceCatalogEntry`
// (resourceType + date + display) exactly the way the lab series does — see
// lab-series-context.utils.ts and generate-medical-summary.use-case.ts.
//
// Domain scope: this builder is fed the ALREADY AI-domain-filtered collection
// (dental / TCM / rehabilitation encounters removed by
// filterAiExcludedClinicalDomains), so those visits never reach a line here.

import type { ClinicalContextSection } from '@/src/core/entities/clinical-context.entity'
import { extractEncounterIcds, lookupIcd } from '@/src/shared/utils/icd-lookup'
import { formatOrganizationDisplay } from '@/src/shared/utils/organization-display'
import { getEncounterKindCode, getEncounterKindText } from '@/src/shared/utils/encounter-type.utils'

/** Default line cap. Beyond this a first-visit reader stops reading anyway. */
export const PROBLEM_TIMELINE_LINE_CAP = 40

export const PROBLEM_TIMELINE_SECTION_TITLE =
  'Problem Timeline (claims-derived; one line per ICD-10 category, labelled with the most specific code seen)'

interface ProblemTimelineOccurrence {
  /** Normalized full ICD code, e.g. "E1165". */
  codeKey: string
  /** Code as written, e.g. "E11.65". */
  code: string
  /** Best available human label for this code. */
  display?: string
  /** ISO day (YYYY-MM-DD) or '' when the record carried no date. */
  day: string
  /** Encounter id when this occurrence came from / links to a visit. */
  encounterId?: string
  /** Deduplication identity so one visit + one code counts once. */
  occurrenceKey: string
  inpatient: boolean
  department?: string
  institution?: string
  /** True when a Condition resource asserts this code is currently active. */
  active: boolean
  /** Set only for occurrences that came from a Condition resource. */
  condition?: { date: string; display: string }
}

export interface ProblemTimelineLine {
  /** 3-character ICD category, e.g. "E11". */
  family: string
  /** Most specific code in the family, e.g. "E11.65". */
  code: string
  /** Rendered label, e.g. "E11.65 - Type 2 diabetes with hyperlipidemia". */
  label: string
  active: boolean
  firstSeen: string
  lastSeen: string
  encounters: number
  inpatientEncounters: number
  departments: string[]
  institutions: string[]
  /** Catalog anchor of the latest Condition for this family, when one exists. */
  conditionAnchor?: { date: string; display: string }
  text: string
}

const day = (value: unknown): string =>
  typeof value === 'string' && value.length >= 4 ? value.slice(0, 10) : ''

const normalizeCode = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * ICD-10 category: the first three characters of a real ICD code. Free-text
 * "codes" (an old bridge format could push raw reason text through) have no
 * category and stay on their own line under their own identity.
 */
function icdFamily(code: string): string {
  const normalized = normalizeCode(code)
  return /^[A-Z]\d{2}/.test(normalized) ? normalized.slice(0, 3) : normalized
}

/**
 * Only genuinely coded diagnoses become lines. An old-format Encounter whose
 * `reasonCode` is free-text ("追蹤/複診") parses into a pseudo-code that would
 * otherwise occupy a line and mislead the reader into treating it as a
 * diagnosis. A non-ICD coding system is accepted only when its code is still
 * ICD-shaped.
 */
function isIcdLikeCode(code: string, system?: string): boolean {
  if (String(system ?? '').toLowerCase().includes('icd')) return true
  return /^[A-Z]\d{2}/.test(normalizeCode(code))
}

/**
 * Whether a Condition would appear in the AI source catalog. The outbound
 * scope keeps only problem-list candidates (`scopeClinicalDataForAi`), so an
 * encounter-diagnosis Condition still contributes evidence to a line but must
 * never be printed as its citation anchor — that key would not resolve.
 */
function isCatalogEligibleCondition(condition: any): boolean {
  const categories = condition?.category
  if (!Array.isArray(categories) || categories.length === 0) return !condition?.encounter?.reference
  return categories.some((category: any) =>
    (category?.coding ?? []).some((coding: any) => coding?.code === 'problem-list-item'),
  )
}

function isRefutedCondition(condition: any): boolean {
  const verification = typeof condition?.verificationStatus === 'string'
    ? condition.verificationStatus
    : (condition?.verificationStatus?.coding?.[0]?.code
      || condition?.verificationStatus?.text
      || '')
  const status = String(verification).toLowerCase()
  return status === 'refuted' || status === 'entered-in-error'
}

function isActiveCondition(condition: any): boolean {
  if (isRefutedCondition(condition)) return false
  const clinicalStatus = condition?.clinicalStatus
  if (!clinicalStatus) return true
  const status = String(
    typeof clinicalStatus === 'string'
      ? clinicalStatus
      : clinicalStatus?.coding?.[0]?.code || clinicalStatus?.text || '',
  ).toLowerCase()
  return status === 'active' || status === 'recurrence' || status === 'relapse'
}

function referenceId(reference: unknown): string | undefined {
  if (typeof reference !== 'string' || !reference) return undefined
  return reference.split('/').filter(Boolean).at(-1)
}

function encounterIsInpatient(encounter: any): boolean {
  const kind = String(getEncounterKindCode(encounter) ?? '').toLowerCase()
  const classCode = String(encounter?.class?.code ?? encounter?.class?.coding?.[0]?.code ?? '').toLowerCase()
  const inpatientCodes = ['inpatient', 'imp', 'acute', 'ss', 'obsenc', 'prenc', 'nonac']
  return inpatientCodes.includes(kind) || inpatientCodes.includes(classCode)
}

/**
 * Department / specialty as the source exposes it. NHI bundles put it in
 * `serviceType`; the bridge's own `Encounter.type` kind entry ("門診"/"住院") is
 * a care setting, not a specialty, so it is deliberately NOT used here — an
 * absent department is omitted rather than faked.
 */
function encounterDepartment(encounter: any): string | undefined {
  const entries = Array.isArray(encounter?.serviceType)
    ? encounter.serviceType
    : [encounter?.serviceType]
  for (const entry of entries) {
    const concept = entry?.concept ?? entry
    const text = String(concept?.text ?? '').trim()
    if (text) return text
    const display = (concept?.coding ?? [])
      .map((coding: any) => String(coding?.display ?? '').trim())
      .find(Boolean)
    if (display) return display
  }
  const kindText = getEncounterKindText(encounter)
  for (const type of encounter?.type ?? []) {
    const text = String(type?.text ?? type?.coding?.[0]?.display ?? '').trim()
    if (text && text !== kindText) return text
  }
  return undefined
}

function encounterInstitution(encounter: any, locale: string): string | undefined {
  const raw = String(encounter?.serviceProvider?.display ?? '').trim()
  if (!raw) return undefined
  return formatOrganizationDisplay(raw, locale) || undefined
}

/** Catalog display for a Condition — mirrors `diagnosisCodeText` in the source catalog. */
function conditionCatalogDisplay(condition: any, locale: string): string | undefined {
  const code = condition?.code
  const text = String(code?.text ?? '').trim()
  const display = (code?.coding ?? [])
    .map((coding: any) => String(coding?.display ?? '').trim())
    .find(Boolean)
  const picked = locale === 'en' ? (display || text) : (text || display)
  return picked || undefined
}

function conditionIcdCoding(condition: any): { code?: string; display?: string; system?: string } {
  const codings: any[] = condition?.code?.coding ?? []
  const icd = codings.find((coding) => String(coding?.system ?? '').toLowerCase().includes('icd'))
    ?? codings.find((coding) => coding?.code)
  return {
    code: icd?.code ? String(icd.code) : undefined,
    display: icd?.display,
    system: icd?.system ? String(icd.system) : undefined,
  }
}

/** Top `limit` values by occurrence count, ties broken alphabetically. */
function topValues(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value)
}

export interface ProblemTimelineInput {
  conditions?: any[]
  encounters?: any[]
}

export interface ProblemTimelineOptions {
  locale?: string
  /** Maximum rendered lines before the "+N more" footer. */
  lineCap?: number
  /** Top departments / institutions named per line. */
  facilityLimit?: number
}

/**
 * Build the deterministic per-problem timeline lines. Exported separately from
 * the section so the ordering / capping rules can be unit tested without
 * parsing rendered text.
 */
export function buildProblemTimelineLines(
  input: ProblemTimelineInput,
  options: ProblemTimelineOptions = {},
): { lines: ProblemTimelineLine[]; omitted: number } {
  const locale = options.locale ?? 'zh-TW'
  const lineCap = options.lineCap ?? PROBLEM_TIMELINE_LINE_CAP
  const facilityLimit = options.facilityLimit ?? 2
  const conditions: any[] = input.conditions ?? []
  const encounters: any[] = input.encounters ?? []

  const encountersById = new Map<string, any>()
  for (const encounter of encounters) {
    if (encounter?.id) encountersById.set(String(encounter.id), encounter)
  }

  // Codes named by an Encounter.diagnosis link are attributed to that visit
  // even when the Condition itself carries no `encounter` back-reference.
  const conditionEncounterIds = new Map<string, string>()
  for (const encounter of encounters) {
    for (const diagnosis of encounter?.diagnosis ?? []) {
      const conditionId = referenceId(diagnosis?.condition?.reference)
      if (conditionId && encounter?.id && !conditionEncounterIds.has(conditionId)) {
        conditionEncounterIds.set(conditionId, String(encounter.id))
      }
    }
  }

  const occurrences: ProblemTimelineOccurrence[] = []

  const describeEncounter = (encounterId?: string) => {
    const encounter = encounterId ? encountersById.get(encounterId) : undefined
    return {
      inpatient: encounter ? encounterIsInpatient(encounter) : false,
      department: encounter ? encounterDepartment(encounter) : undefined,
      institution: encounter ? encounterInstitution(encounter, locale) : undefined,
      encounterDay: encounter ? day(encounter?.period?.start) : '',
    }
  }

  for (const condition of conditions) {
    if (isRefutedCondition(condition)) continue
    const { code, display, system } = conditionIcdCoding(condition)
    if (!code || !isIcdLikeCode(code, system)) continue
    const codeKey = normalizeCode(code)
    if (!codeKey) continue
    const encounterId = referenceId(condition?.encounter?.reference)
      ?? (condition?.id ? conditionEncounterIds.get(String(condition.id)) : undefined)
    const context = describeEncounter(encounterId)
    const catalogDate = day(condition?.recordedDate ?? condition?.onsetDateTime)
    const catalogDisplay = conditionCatalogDisplay(condition, locale)
    occurrences.push({
      codeKey,
      code,
      display: catalogDisplay ?? display ?? lookupIcd(code),
      day: catalogDate || context.encounterDay,
      encounterId,
      // A Condition without a visit is still one distinct assertion.
      occurrenceKey: `${encounterId ?? `condition:${condition?.id ?? occurrences.length}`}|${codeKey}`,
      inpatient: context.inpatient,
      department: context.department,
      institution: context.institution,
      active: isActiveCondition(condition),
      ...(catalogDate && catalogDisplay && isCatalogEligibleCondition(condition)
        ? { condition: { date: catalogDate, display: catalogDisplay } }
        : {}),
    })
  }

  for (const encounter of encounters) {
    const encounterId = encounter?.id ? String(encounter.id) : undefined
    const context = describeEncounter(encounterId)
    for (const icd of extractEncounterIcds(encounter, undefined, locale)) {
      if (!isIcdLikeCode(icd.code)) continue
      const codeKey = normalizeCode(icd.code)
      if (!codeKey) continue
      occurrences.push({
        codeKey,
        code: icd.code,
        display: icd.description ?? lookupIcd(icd.code),
        day: context.encounterDay,
        encounterId,
        occurrenceKey: `${encounterId ?? `encounter:${occurrences.length}`}|${codeKey}`,
        inpatient: context.inpatient,
        department: context.department,
        institution: context.institution,
        active: false,
      })
    }
  }

  if (occurrences.length === 0) return { lines: [], omitted: 0 }

  interface Group {
    family: string
    codes: Map<string, { code: string; display?: string }>
    seenOccurrences: Set<string>
    seenEncounters: Set<string>
    inpatientEncounters: Set<string>
    days: string[]
    departments: Map<string, number>
    institutions: Map<string, number>
    active: boolean
    /** Latest Condition anchor, by catalog date. */
    conditionAnchor?: { date: string; display: string; code: string }
  }

  const groups = new Map<string, Group>()
  for (const occurrence of occurrences) {
    const family = icdFamily(occurrence.code)
    let group = groups.get(family)
    if (!group) {
      group = {
        family,
        codes: new Map(),
        seenOccurrences: new Set(),
        seenEncounters: new Set(),
        inpatientEncounters: new Set(),
        days: [],
        departments: new Map(),
        institutions: new Map(),
        active: false,
      }
      groups.set(family, group)
    }
    const existingCode = group.codes.get(occurrence.codeKey)
    if (!existingCode) {
      group.codes.set(occurrence.codeKey, { code: occurrence.code, display: occurrence.display })
    } else if (!existingCode.display && occurrence.display) {
      existingCode.display = occurrence.display
    }
    if (occurrence.active) group.active = true
    if (occurrence.condition) {
      const anchor = group.conditionAnchor
      if (!anchor || occurrence.condition.date > anchor.date) {
        group.conditionAnchor = { ...occurrence.condition, code: occurrence.code }
      }
    }
    if (group.seenOccurrences.has(occurrence.occurrenceKey)) continue
    group.seenOccurrences.add(occurrence.occurrenceKey)
    if (occurrence.day) group.days.push(occurrence.day)
    if (occurrence.encounterId) {
      group.seenEncounters.add(occurrence.encounterId)
      if (occurrence.inpatient) group.inpatientEncounters.add(occurrence.encounterId)
    }
    if (occurrence.department) {
      group.departments.set(occurrence.department, (group.departments.get(occurrence.department) ?? 0) + 1)
    }
    if (occurrence.institution) {
      group.institutions.set(occurrence.institution, (group.institutions.get(occurrence.institution) ?? 0) + 1)
    }
  }

  const allLines: ProblemTimelineLine[] = [...groups.values()].map((group) => {
    // Most specific = longest normalized code; ties resolved deterministically.
    const [mostSpecific] = [...group.codes.values()].sort((a, b) => {
      const lengthDelta = normalizeCode(b.code).length - normalizeCode(a.code).length
      return lengthDelta !== 0 ? lengthDelta : a.code.localeCompare(b.code)
    })
    const sortedDays = [...group.days].sort()
    const firstSeen = sortedDays[0] ?? ''
    const lastSeen = sortedDays.at(-1) ?? ''
    // Prefer the citable Condition display so the line resolves against the
    // source catalog; fall back to the code's own description.
    const description = group.conditionAnchor?.display ?? mostSpecific.display
    const label = description && description !== mostSpecific.code
      ? `${mostSpecific.code} - ${description}`
      : mostSpecific.code
    const departments = topValues(group.departments, facilityLimit)
    const institutions = topValues(group.institutions, facilityLimit)
    const encounterCount = group.seenEncounters.size || group.seenOccurrences.size
    const inpatientEncounters = group.inpatientEncounters.size

    const parts: string[] = [label]
    if (group.active) parts.push('active')
    if (firstSeen) parts.push(lastSeen && lastSeen !== firstSeen ? `${firstSeen} → ${lastSeen}` : firstSeen)
    parts.push(inpatientEncounters > 0
      ? `${encounterCount} visits (${inpatientEncounters} inpatient)`
      : `${encounterCount} visits`)
    if (departments.length > 0) parts.push(departments.join(', '))
    if (institutions.length > 0) parts.push(institutions.join(', '))
    // Citation anchor: resourceType + date + display, matching the catalog row
    // for the latest Condition carrying this problem.
    if (group.conditionAnchor) parts.push(`Condition ${group.conditionAnchor.date}`)

    return {
      family: group.family,
      code: mostSpecific.code,
      label,
      active: group.active,
      firstSeen,
      lastSeen,
      encounters: encounterCount,
      inpatientEncounters,
      departments,
      institutions,
      ...(group.conditionAnchor
        ? { conditionAnchor: { date: group.conditionAnchor.date, display: group.conditionAnchor.display } }
        : {}),
      text: parts.join(' | '),
    }
  })

  // Active problems first, then most recently seen, then busiest.
  const sorted = [...allLines].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    if (a.lastSeen !== b.lastSeen) return a.lastSeen < b.lastSeen ? 1 : -1
    if (a.encounters !== b.encounters) return b.encounters - a.encounters
    return a.code.localeCompare(b.code)
  })

  // A line is protected when dropping it could hide something clinically
  // load-bearing: an active problem, or one that ever caused an admission.
  const protectedLines = sorted.filter((line) => line.active || line.inpatientEncounters > 0)
  const optionalLines = sorted.filter((line) => !line.active && line.inpatientEncounters === 0)
  const room = Math.max(0, lineCap - protectedLines.length)
  const kept = new Set([...protectedLines, ...optionalLines.slice(0, room)])
  const lines = sorted.filter((line) => kept.has(line))

  return { lines, omitted: sorted.length - lines.length }
}

/**
 * The rendered section. Returns null when the records carry no coded problem,
 * so an empty heading never occupies context.
 */
export function buildProblemTimelineSection(
  input: ProblemTimelineInput,
  options: ProblemTimelineOptions = {},
): ClinicalContextSection | null {
  const { lines, omitted } = buildProblemTimelineLines(input, options)
  if (lines.length === 0) return null
  const items = lines.map((line) => line.text)
  if (omitted > 0) {
    items.push(
      `+${omitted} more (older/less frequent; every active problem and every problem with an inpatient stay is listed above)`,
    )
  }
  return { title: PROBLEM_TIMELINE_SECTION_TITLE, items }
}
