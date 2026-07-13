// Unified FHIR Tools for AI Agent
//
// Single implementation backing BOTH SMART-live mode and local-bundle mode.
// Both modes populate the React Query / LocalBundleService cache with a
// `ClinicalDataCollection`; the tool layer reads from that snapshot.
//
// Every tool response goes through `scrubPii()` so cloud LLMs never see
// patient ID, DOB, or provider names.
import { tool } from 'ai'
import type { z } from 'zod'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import {
  conditionsSchema,
  medicationsSchema,
  allergiesSchema,
  observationsSchema,
  proceduresSchema,
  encountersSchema,
  diagnosticReportsSchema,
  immunizationsSchema,
  patientInfoSchema,
  encounterDetailsSchema,
  activeMedicationsSchema,
  observationSearchSchema,
  recentVisitsSchema,
  overviewSchema,
  listDepartmentsSchema,
  listObservationCodesSchema,
} from './fhir-tool-schemas'
import {
  isWithinDateRange,
  matchCategoryCoding,
  matchClinicalStatus,
  matchStatus,
  isChronicByCourseOfTherapy,
  matchChronic,
  matchEncounterClass,
  matchDiagnosticReportCategory,
  matchAllergyType,
  matchAllergySeverity,
  matchSubstring,
  isAbnormalObservation,
  applyLimit,
} from './_filter-helpers'
import { scrubPii } from './_scrub-pii'
import { buildPatientTextLiterals } from '@/src/shared/utils/pii-text-scrub'

export interface AgentDataSource {
  patient: PatientEntity | null
  collection: ClinicalDataCollection | null
}

// ── helpers ────────────────────────────────────────────────────────────────

function pickName(concept: any): string | undefined {
  return concept?.text || concept?.coding?.[0]?.display
}

function loincOf(concept: any): string | undefined {
  return (concept?.coding ?? []).find((c: any) => /loinc/i.test(c.system || ''))?.code
}

function notFoundMessage(noun: string, dateFrom?: string, dateTo?: string): string {
  if (dateFrom || dateTo) {
    return `在指定時間範圍內（${dateFrom || '開始'} 至 ${dateTo || '現在'}）沒有找到${noun}`
  }
  return `沒有找到${noun}`
}

function calculateAge(birthDate?: string): number | null {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function refToId(ref: string | undefined): string | undefined {
  if (!ref) return undefined
  return ref.includes('/') ? ref.split('/').pop() : ref
}

function encounterDeptText(enc: any): string {
  // Bridge v0.9.2 splits Encounter.type into kind + channel entries (see
  // bridge integration doc 2026-05-27). For AI tool filtering we want a
  // single searchable string that includes BOTH dimensions, so the LLM
  // can match "IC卡資料" or "藥局" or "門診" against the same field.
  // Joining all type[].text/.display covers both v0.9.2 (multi-entry) and
  // v0.9.1 (single-entry) bundles without any version branching.
  if (Array.isArray(enc.type) && enc.type.length > 0) {
    const joined = enc.type
      .map((entry: any) => entry?.text || entry?.coding?.[0]?.display)
      .filter(Boolean)
      .join(' ')
    if (joined) return joined
  }
  return pickName(enc.serviceType) || ''
}

function encounterInstitution(enc: any): string {
  return enc.serviceProvider?.display || enc.location?.[0]?.location?.display || ''
}

function encounterDate(enc: any): string | undefined {
  return enc.period?.start
}

function classifyEncounterType(enc: any):
  'outpatient' | 'inpatient' | 'emergency' | 'pharmacy' | 'home' | 'virtual' | 'other' {
  const cls = String(enc.class?.code || enc.class?.display || '').toLowerCase()
  const dept = encounterDeptText(enc).toLowerCase()
  if (['emer', 'emergency', 'ed'].includes(cls) || dept.includes('急診')) return 'emergency'
  if (['imp', 'inpatient', 'acute'].includes(cls) || dept.includes('住院')) return 'inpatient'
  if (dept.includes('藥局') || cls === 'pharm' || cls === 'pharmacy') return 'pharmacy'
  if (['amb', 'ambulatory', 'outpatient', 'op'].includes(cls) || dept.includes('門診')) return 'outpatient'
  if (['hh', 'home'].includes(cls)) return 'home'
  if (['vr', 'virtual', 'tele'].includes(cls)) return 'virtual'
  return 'other'
}

// Compact deduper for repeated refill cycles (mirrors useMedicationsContext).
function dedupMedsByName(meds: any[]): Array<any & { refillCount: number }> {
  const byName = new Map<string, any & { refillCount: number }>()
  for (const m of meds) {
    const name = pickName(m.medicationCodeableConcept) || 'Unknown'
    const existing = byName.get(name)
    if (!existing) {
      byName.set(name, { ...m, refillCount: 1 })
    } else {
      existing.refillCount += 1
      if (m.authoredOn && (!existing.authoredOn || m.authoredOn > existing.authoredOn)) {
        existing.authoredOn = m.authoredOn
      }
    }
  }
  return Array.from(byName.values())
}

// ── factory ────────────────────────────────────────────────────────────────

export function createFhirTools(getData: () => AgentDataSource) {
  // Structured scrub (ids / birthDate / provider display) + free-text scrub:
  // discharge summaries and report conclusions carry the patient's name /
  // chart number / 身分證字號 INSIDE the text, so every string is also masked
  // against those patterns and the loaded patient's own name/id literals.
  const scrub = <T,>(payload: T): T =>
    scrubPii(payload, buildPatientTextLiterals(getData().patient))

  return {
    // ── Patient ────────────────────────────────────────────────────────────

    queryPatientInfo: tool({
      description: 'Get anonymized patient demographics (gender + age only). Patient name, ID, and date of birth are intentionally not surfaced.',
      inputSchema: patientInfoSchema,
      execute: async () => {
        const { patient } = getData()
        if (!patient) {
          return scrub({ success: false, summary: 'Patient not loaded yet', data: null })
        }
        return scrub({
          success: true,
          summary: 'Patient demographics retrieved (anonymized)',
          data: {
            gender: patient.gender,
            age: calculateAge(patient.birthDate),
          },
        })
      },
    }),

    getDataOverview: tool({
      description: 'Start here when you need an overview of what data is available. Returns counts and date ranges for every resource type. Useful to plan which subsequent tool calls will be informative.',
      inputSchema: overviewSchema,
      execute: async () => {
        const { collection } = getData()
        if (!collection) return scrub({ success: false, summary: 'No data loaded', data: null })

        const range = (items: any[], getDate: (x: any) => string | undefined) => {
          const dates = items.map(getDate).filter(Boolean).sort() as string[]
          if (dates.length === 0) return null
          return { earliest: dates[0]?.slice(0, 10), latest: dates[dates.length - 1]?.slice(0, 10) }
        }

        return scrub({
          success: true,
          summary: 'Data inventory across all resource types',
          data: {
            conditions: { count: collection.conditions.length },
            medications: {
              count: collection.medications.length,
              range: range(collection.medications, (m) => m.authoredOn),
            },
            allergies: { count: collection.allergies.length },
            encounters: {
              count: collection.encounters.length,
              range: range(collection.encounters, (e) => e.period?.start),
            },
            diagnosticReports: {
              count: collection.diagnosticReports.length,
              range: range(collection.diagnosticReports, (r) => r.effectiveDateTime),
            },
            imagingStudies: {
              count: collection.imagingStudies?.length ?? 0,
              range: range(collection.imagingStudies ?? [], (study) => study.started),
            },
            observations: {
              // Dedup by id — many bridges include vital-signs entries in
              // both `observations` and `vitalSigns` arrays.
              count: new Set([
                ...collection.observations.map((o: any) => o.id).filter(Boolean),
                ...collection.vitalSigns.map((o: any) => o.id).filter(Boolean),
              ]).size,
            },
            procedures: {
              count: collection.procedures.length,
              range: range(collection.procedures, (p) => p.performedDateTime || p.performedPeriod?.start),
            },
            immunizations: {
              count: collection.immunizations.length,
              range: range(collection.immunizations, (i) => i.occurrenceDateTime),
            },
          },
        })
      },
    }),

    // ── Visits ─────────────────────────────────────────────────────────────

    queryEncounters: tool({
      description: 'Query patient encounters (visits, admissions). Supports filtering by class, department text, institution, and date range.',
      inputSchema: encountersSchema,
      execute: async ({ class: encounterClass, department, institution, dateFrom, dateTo, limit, summarize }:
        z.infer<typeof encountersSchema>) => {
        const list = getData().collection?.encounters ?? []
        let filtered = list.filter((e: any) =>
          matchEncounterClass(e.class, encounterClass) &&
          matchSubstring(encounterDeptText(e), department) &&
          matchSubstring(encounterInstitution(e), institution)
        )
        if (dateFrom || dateTo) {
          filtered = filtered.filter((e: any) => isWithinDateRange(encounterDate(e), dateFrom, dateTo))
        }
        filtered = [...filtered].sort((a, b) =>
          (b.period?.start || '').localeCompare(a.period?.start || '')
        )
        const capped = applyLimit(filtered, limit)

        if (summarize) {
          return scrub({
            success: true,
            summary: `Found ${filtered.length} Encounter record(s)`,
            count: filtered.length,
            data: capped.map((e: any) => ({
              encounterId: e.id,
              date: encounterDate(e)?.slice(0, 10),
              type: classifyEncounterType(e),
            })),
          })
        }

        return scrub({
          success: true,
          summary: `Found ${filtered.length} Encounter record(s)`,
          count: filtered.length,
          data: capped.map((e: any) => ({
            encounterId: e.id,
            class: e.class?.code || e.class?.coding?.[0]?.code,
            type: pickName(e.type?.[0]),
            department: encounterDeptText(e),
            institution: encounterInstitution(e),
            period: e.period,
            status: e.status,
          })),
        })
      },
    }),

    getRecentVisits: tool({
      description: 'Concise summary of the most recent N visits: date, department, primary ICD, and counts of meds/labs/procedures. Use this before drilling into a specific visit with getEncounterDetails.',
      inputSchema: recentVisitsSchema,
      execute: async ({ limit, type }: z.infer<typeof recentVisitsSchema>) => {
        const { collection } = getData()
        if (!collection) return scrub({ success: false, summary: 'No data', data: [] })

        const encounters = [...collection.encounters].sort((a, b) =>
          (b.period?.start || '').localeCompare(a.period?.start || '')
        )
        const filtered = encounters.filter((e: any) =>
          !type || classifyEncounterType(e) === type
        )
        const top = filtered.slice(0, limit && limit > 0 ? limit : 10)

        const medsByEnc = new Map<string, number>()
        for (const m of collection.medications) {
          const id = refToId(m.encounter?.reference)
          if (id) medsByEnc.set(id, (medsByEnc.get(id) ?? 0) + 1)
        }
        const labsByEnc = new Map<string, number>()
        for (const o of collection.observations) {
          const id = refToId(o.encounter?.reference)
          if (id) labsByEnc.set(id, (labsByEnc.get(id) ?? 0) + 1)
        }
        const procsByEnc = new Map<string, number>()
        for (const p of collection.procedures) {
          const id = refToId(p.encounter?.reference)
          if (id) procsByEnc.set(id, (procsByEnc.get(id) ?? 0) + 1)
        }

        return scrub({
          success: true,
          summary: `Top ${top.length} of ${filtered.length} recent visits`,
          count: top.length,
          data: top.map((e: any) => ({
            encounterId: e.id,
            date: encounterDate(e)?.slice(0, 10),
            type: classifyEncounterType(e),
            department: encounterDeptText(e),
            primaryIcd: e.reasonCode?.[0]?.coding?.[0]?.code,
            primaryIcdLabel: pickName(e.reasonCode?.[0]) || e.reasonCode?.[0]?.text,
            medCount: medsByEnc.get(e.id) ?? 0,
            labCount: labsByEnc.get(e.id) ?? 0,
            procedureCount: procsByEnc.get(e.id) ?? 0,
          })),
        })
      },
    }),

    getEncounterDetails: tool({
      description: 'Drill into one specific visit. Returns all diagnoses (incl. secondary), medications, lab observations, procedures linked to that encounter. Use this when the user asks about a specific visit identified via queryEncounters or getRecentVisits.',
      inputSchema: encounterDetailsSchema,
      execute: async ({ encounterId }: z.infer<typeof encounterDetailsSchema>) => {
        const { collection } = getData()
        if (!collection) return scrub({ success: false, summary: 'No data', data: null })

        const enc = collection.encounters.find((e: any) => e.id === encounterId)
        if (!enc) {
          return scrub({
            success: false,
            summary: `Encounter ${encounterId} not found`,
            data: null,
          })
        }

        const matches = (ref: any) => refToId(ref?.reference) === encounterId

        const diagnoses = (enc.reasonCode ?? []).map((rc: any) => ({
          code: rc.coding?.[0]?.code,
          label: pickName(rc) || rc.text,
        }))

        const meds = collection.medications.filter((m: any) => matches(m.encounter)).map((m: any) => ({
          medication: pickName(m.medicationCodeableConcept),
          dosage: m.dosageInstruction?.[0]?.text,
          status: m.status,
          chronic: isChronicByCourseOfTherapy(m.courseOfTherapyType),
        }))

        const obs = collection.observations.filter((o: any) => matches(o.encounter)).map((o: any) => ({
          name: pickName(o.code),
          value: o.valueQuantity?.value ?? o.valueString,
          unit: o.valueQuantity?.unit,
          abnormal: isAbnormalObservation(o),
        }))

        const procs = collection.procedures.filter((p: any) => matches(p.encounter)).map((p: any) => ({
          procedure: pickName(p.code),
          status: p.status,
          performedDateTime: p.performedDateTime || p.performedPeriod?.start,
        }))

        const reports = collection.diagnosticReports.filter((r: any) => matches(r.encounter)).map((r: any) => ({
          reportName: pickName(r.code),
          conclusion: r.conclusion,
          effectiveDateTime: r.effectiveDateTime,
        }))

        const imagingStudies = (collection.imagingStudies ?? []).filter((study: any) => matches(study.encounter)).map((study: any) => ({
          description: study.description,
          status: study.status,
          started: study.started,
          modality: (study.modality ?? []).map((coding: any) => coding.display || coding.code).filter(Boolean),
          notes: (study.note ?? []).map((note: any) => note.text).filter(Boolean),
          series: (study.series ?? []).map((series: any) => ({
            description: series.description,
            modality: series.modality?.display || series.modality?.code,
            bodySite: series.bodySite?.display || series.bodySite?.code,
            laterality: series.laterality?.display || series.laterality?.code,
            numberOfInstances: series.numberOfInstances,
            instanceTitles: (series.instance ?? []).map((instance: any) => instance.title).filter(Boolean),
          })),
        }))

        return scrub({
          success: true,
          summary: `Encounter ${encounterId} details`,
          data: {
            encounterId,
            date: encounterDate(enc)?.slice(0, 10),
            type: classifyEncounterType(enc),
            department: encounterDeptText(enc),
            institution: encounterInstitution(enc),
            diagnoses,
            medications: meds,
            observations: obs,
            procedures: procs,
            reports,
            imagingStudies,
          },
        })
      },
    }),

    listEncounterDepartments: tool({
      description: 'List unique departments / service types the patient has visited. Useful to discover what specialties are represented before filtering queryEncounters by department.',
      inputSchema: listDepartmentsSchema,
      execute: async () => {
        const { collection } = getData()
        const list = collection?.encounters ?? []
        const counts = new Map<string, number>()
        for (const e of list) {
          const dept = encounterDeptText(e)
          if (dept) counts.set(dept, (counts.get(dept) ?? 0) + 1)
        }
        const data = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([department, visitCount]) => ({ department, visitCount }))

        return scrub({
          success: true,
          summary: `${data.length} distinct departments`,
          count: data.length,
          data,
        })
      },
    }),

    // ── Diagnoses & Problems ───────────────────────────────────────────────

    queryConditions: tool({
      description: 'Query patient conditions/diagnoses (cross-visit). Use this for confirmed clinical conditions, not visit-level billing ICDs.',
      inputSchema: conditionsSchema,
      execute: async ({ category, clinicalStatus, limit }: z.infer<typeof conditionsSchema>) => {
        const list = getData().collection?.conditions ?? []
        const filtered = list.filter((c: any) =>
          matchCategoryCoding(c.category, category) &&
          matchClinicalStatus(c.clinicalStatus, clinicalStatus)
        )
        const capped = applyLimit(filtered, limit, 100)
        return scrub({
          success: true,
          summary: `Found ${filtered.length} Condition record(s)`,
          count: filtered.length,
          data: capped.map((c: any) => ({
            code: pickName(c.code),
            clinicalStatus: typeof c.clinicalStatus === 'string'
              ? c.clinicalStatus
              : c.clinicalStatus?.coding?.[0]?.code,
            recordedDate: c.recordedDate,
          })),
        })
      },
    }),

    // ── Reports ────────────────────────────────────────────────────────────

    queryObservations: tool({
      description: 'Query patient observations (lab results, vital signs). Supports date range, exact code, fuzzy `codeQuery`, and `abnormalOnly`. For lab panels prefer queryDiagnosticReports; for trend of a specific lab prefer searchObservationByName.',
      inputSchema: observationsSchema,
      execute: async ({ category, code, codeQuery, abnormalOnly, dateFrom, dateTo, limit, summarize }:
        z.infer<typeof observationsSchema>) => {
        const collection = getData().collection
        const observations = collection?.observations ?? []
        const vitals = collection?.vitalSigns ?? []
        const seen = new Set<string>()
        const list = [...observations, ...vitals].filter((o: any) => {
          const id = o.id
          if (id && seen.has(id)) return false
          if (id) seen.add(id)
          return true
        })

        let filtered = list.filter((o: any) => {
          if (!matchCategoryCoding(o.category, category)) return false
          if (code) {
            // Case-insensitive — LLMs commonly mis-case ("body height" vs "Body Height")
            const targetLc = code.toLowerCase()
            const codes: string[] = (o.code?.coding ?? [])
              .map((c: any) => String(c?.code || '').toLowerCase())
              .filter(Boolean)
            const nameLc = pickName(o.code)?.toLowerCase() ?? ''
            if (!codes.includes(targetLc) && nameLc !== targetLc) return false
          }
          if (codeQuery && !matchSubstring(pickName(o.code), codeQuery)) return false
          if (abnormalOnly && !isAbnormalObservation(o)) return false
          return true
        })

        if (dateFrom || dateTo) {
          filtered = filtered.filter((o: any) => isWithinDateRange(o.effectiveDateTime, dateFrom, dateTo))
        }

        filtered = [...filtered].sort((a, b) =>
          (b.effectiveDateTime || '').localeCompare(a.effectiveDateTime || '')
        )
        const capped = applyLimit(filtered, limit)

        const summary = filtered.length > 0
          ? `Found ${filtered.length} Observation record(s)`
          : notFoundMessage('檢驗數據', dateFrom, dateTo)

        if (summarize) {
          return scrub({
            success: true,
            summary,
            count: filtered.length,
            dateRange: { from: dateFrom, to: dateTo },
            data: capped.map((o: any) => ({
              code: pickName(o.code),
              effectiveDateTime: o.effectiveDateTime,
              abnormal: isAbnormalObservation(o),
            })),
          })
        }

        return scrub({
          success: true,
          summary,
          count: filtered.length,
          dateRange: { from: dateFrom, to: dateTo },
          data: capped.map((o: any) => ({
            code: pickName(o.code),
            value: o.valueQuantity?.value ?? o.valueString,
            unit: o.valueQuantity?.unit,
            effectiveDateTime: o.effectiveDateTime,
            abnormal: isAbnormalObservation(o),
            status: o.status,
          })),
        })
      },
    }),

    queryDiagnosticReports: tool({
      description: 'PRIMARY tool for lab panel results (CBC, Basic Metabolic Panel, Lipid Panel, etc.). Returns the panel + its component observations. Supports date range and abnormalOnly.',
      inputSchema: diagnosticReportsSchema,
      execute: async ({ category, abnormalOnly, dateFrom, dateTo, limit, summarize }:
        z.infer<typeof diagnosticReportsSchema>) => {
        const list = getData().collection?.diagnosticReports ?? []
        let filtered = list.filter((r: any) => matchDiagnosticReportCategory(r.category, category))
        if (dateFrom || dateTo) {
          filtered = filtered.filter((r: any) => isWithinDateRange(r.effectiveDateTime, dateFrom, dateTo))
        }
        if (abnormalOnly) {
          filtered = filtered.filter((r: any) =>
            Array.isArray(r._observations) && r._observations.some(isAbnormalObservation)
          )
        }
        filtered = [...filtered].sort((a, b) =>
          (b.effectiveDateTime || '').localeCompare(a.effectiveDateTime || '')
        )
        const capped = applyLimit(filtered, limit, 10)

        const summary = filtered.length > 0
          ? `Found ${filtered.length} DiagnosticReport record(s)`
          : notFoundMessage('檢驗報告', dateFrom, dateTo)

        if (summarize) {
          return scrub({
            success: true,
            summary,
            count: filtered.length,
            dateRange: { from: dateFrom, to: dateTo },
            data: capped.map((r: any) => ({
              reportName: pickName(r.code),
              effectiveDateTime: r.effectiveDateTime,
              abnormalCount: (r._observations ?? []).filter(isAbnormalObservation).length,
            })),
          })
        }

        return scrub({
          success: true,
          summary,
          count: filtered.length,
          dateRange: { from: dateFrom, to: dateTo },
          data: capped.map((r: any) => ({
            reportName: pickName(r.code),
            effectiveDateTime: r.effectiveDateTime,
            status: r.status,
            conclusion: r.conclusion,
            results: (r._observations ?? []).map((obs: any) => ({
              name: pickName(obs.code) || 'Unknown',
              value: obs.valueQuantity?.value ?? obs.valueString ?? obs.valueCodeableConcept?.text,
              unit: obs.valueQuantity?.unit || '',
              abnormal: isAbnormalObservation(obs),
            })),
          })),
        })
      },
    }),

    searchObservationByName: tool({
      description: 'Fuzzy-search observations by name when you don\'t know the LOINC. e.g. query="HbA1c" returns latest values. Set withTrend=true to get up to 10 most recent values for trending.',
      inputSchema: observationSearchSchema,
      execute: async ({ query, withTrend, limit }: z.infer<typeof observationSearchSchema>) => {
        const { collection } = getData()
        if (!collection) return scrub({ success: false, summary: 'No data', data: [] })

        const all = [...collection.observations, ...collection.vitalSigns]
        const seen = new Set<string>()
        const unique = all.filter((o: any) => {
          if (o.id && seen.has(o.id)) return false
          if (o.id) seen.add(o.id)
          return true
        })

        // Grouping key = LOINC code so one analyte stored under different display
        // names (e.g. "eGFR" vs "Estimated GFR", both LOINC 33914-3) collapses
        // into a single dated series instead of splitting — which would let a
        // stale value be returned as "latest". Real data also mixes coded and
        // uncoded entries of the same analyte (e.g. PT: one with LOINC, one
        // without), so an uncoded entry inherits the LOINC of a same-text sibling.
        const textToLoinc = new Map<string, string>()
        for (const o of unique) {
          const loinc = loincOf(o.code)
          const text = o.code?.text
          if (loinc && text && !textToLoinc.has(text)) textToLoinc.set(text, loinc)
        }
        const codeKey = (concept: any): string =>
          loincOf(concept) ||
          (concept?.text && textToLoinc.get(concept.text)) ||
          concept?.coding?.[0]?.code ||
          pickName(concept) ||
          'Unknown'

        // Seed match: the query may hit any display name OR coding display, not
        // just the canonical text.
        const nameMatches = (o: any): boolean => {
          const c = o.code || {}
          const names = [c.text, ...((c.coding || []).map((x: any) => x.display))]
          return names.some((n: string | undefined) => matchSubstring(n, query))
        }
        const seedKeys = new Set(unique.filter(nameMatches).map((o: any) => codeKey(o.code)))
        // Expand to every observation sharing a matched LOINC, so display aliases
        // (e.g. "eGFR" vs "Estimated GFR") come along as one series.
        let matches = unique.filter((o: any) => seedKeys.has(codeKey(o.code)))
        matches = matches.sort((a, b) => (b.effectiveDateTime || '').localeCompare(a.effectiveDateTime || ''))

        // Group by LOINC code → keep N most recent per analyte
        const perCodeLimit = withTrend ? 10 : 1
        const byCode = new Map<string, any[]>()
        for (const o of matches) {
          const k = codeKey(o.code)
          const arr = byCode.get(k) ?? []
          if (arr.length < perCodeLimit) {
            arr.push(o)
            byCode.set(k, arr)
          }
        }

        const flat: any[] = []
        for (const [, items] of byCode) {
          // Canonical display = the most-recent entry's name (matches found at top).
          const name = pickName(items[0].code) || 'Unknown'
          for (const o of items) flat.push({ name, obs: o })
        }
        const capped = applyLimit(flat, limit, 50)

        return scrub({
          success: true,
          summary: `Matched ${matches.length} observation(s) across ${byCode.size} code(s) for "${query}"`,
          count: capped.length,
          data: capped.map(({ name, obs }) => ({
            code: name,
            value: obs.valueQuantity?.value ?? obs.valueString,
            unit: obs.valueQuantity?.unit,
            effectiveDateTime: obs.effectiveDateTime,
            abnormal: isAbnormalObservation(obs),
          })),
        })
      },
    }),

    queryProcedures: tool({
      description: 'Query patient procedures (surgeries, interventions).',
      inputSchema: proceduresSchema,
      execute: async ({ status, dateFrom, dateTo, limit }: z.infer<typeof proceduresSchema>) => {
        const list = getData().collection?.procedures ?? []
        let filtered = list.filter((p: any) => matchStatus(p.status, status))
        if (dateFrom || dateTo) {
          filtered = filtered.filter((p: any) =>
            isWithinDateRange(p.performedDateTime || p.performedPeriod?.start, dateFrom, dateTo)
          )
        }
        const capped = applyLimit(filtered, limit)
        return scrub({
          success: true,
          summary: `Found ${filtered.length} Procedure record(s)`,
          count: filtered.length,
          data: capped.map((p: any) => ({
            procedure: pickName(p.code),
            status: p.status,
            performedDateTime: p.performedDateTime || p.performedPeriod?.start,
          })),
        })
      },
    }),

    listAvailableObservationCodes: tool({
      description: 'List distinct observation / lab names the patient has on record, with how many entries exist for each. Useful before using searchObservationByName when you\'re unsure what to search for.',
      inputSchema: listObservationCodesSchema,
      execute: async () => {
        const { collection } = getData()
        if (!collection) return scrub({ success: false, summary: 'No data', data: [] })

        const all = [...collection.observations, ...collection.vitalSigns]
        const counts = new Map<string, number>()
        for (const o of all) {
          const name = pickName(o.code)
          if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
        }
        const data = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([code, count]) => ({ code, count }))

        return scrub({
          success: true,
          summary: `${data.length} distinct observation codes`,
          count: data.length,
          data,
        })
      },
    }),

    // ── Medications & Allergies ────────────────────────────────────────────

    queryMedications: tool({
      description: 'Query medication prescriptions. Supports status / chronic / date range. For "what is the patient on right now" prefer getActiveMedicationList — it dedups refill cycles automatically.',
      inputSchema: medicationsSchema,
      execute: async ({ status, chronic, dateFrom, dateTo, limit }:
        z.infer<typeof medicationsSchema>) => {
        const list = getData().collection?.medications ?? []
        let filtered = list.filter((m: any) =>
          matchStatus(m.status, status) &&
          matchChronic(m.courseOfTherapyType, chronic)
        )
        if (dateFrom || dateTo) {
          filtered = filtered.filter((m: any) => isWithinDateRange(m.authoredOn, dateFrom, dateTo))
        }
        filtered = [...filtered].sort((a, b) => (b.authoredOn || '').localeCompare(a.authoredOn || ''))
        const capped = applyLimit(filtered, limit)
        return scrub({
          success: true,
          summary: `Found ${filtered.length} MedicationRequest record(s)`,
          count: filtered.length,
          data: capped.map((m: any) => ({
            medication: pickName(m.medicationCodeableConcept),
            status: m.status,
            authoredOn: m.authoredOn,
            dosageInstruction: m.dosageInstruction?.[0]?.text,
            chronic: isChronicByCourseOfTherapy(m.courseOfTherapyType),
          })),
        })
      },
    }),

    getActiveMedicationList: tool({
      description: 'Shortcut for "what is the patient currently on?" — returns the deduplicated list of currently-active prescriptions (NHI refills collapsed by drug name). Set chronicOnly to filter to 慢箋.',
      inputSchema: activeMedicationsSchema,
      execute: async ({ chronicOnly }: z.infer<typeof activeMedicationsSchema>) => {
        const list = getData().collection?.medications ?? []
        const now = Date.now()
        const active = list.filter((m: any) => {
          const status = String(m.status || '').toLowerCase()
          if (['stopped', 'cancelled'].includes(status)) return false
          if (chronicOnly && !isChronicByCourseOfTherapy(m.courseOfTherapyType)) return false
          // Heuristic: filter out clearly-expired refills (authoredOn > 1 year ago AND not chronic)
          if (m.authoredOn && !isChronicByCourseOfTherapy(m.courseOfTherapyType)) {
            const age = (now - Date.parse(m.authoredOn)) / 86400000
            if (age > 365) return false
          }
          return true
        })

        const deduped = dedupMedsByName(active)
          .sort((a, b) => (b.authoredOn || '').localeCompare(a.authoredOn || ''))

        return scrub({
          success: true,
          summary: `${deduped.length} active medication(s)`,
          count: deduped.length,
          data: deduped.map((m: any) => ({
            medication: pickName(m.medicationCodeableConcept),
            dosage: m.dosageInstruction?.[0]?.text,
            authoredOn: m.authoredOn,
            chronic: isChronicByCourseOfTherapy(m.courseOfTherapyType),
            refillCount: m.refillCount,
          })),
        })
      },
    }),

    queryAllergies: tool({
      description: 'Query patient allergies and intolerances. Filter by `severity` (high/moderate/low) to narrow to clinically significant ones.',
      inputSchema: allergiesSchema,
      execute: async ({ type, severity }: z.infer<typeof allergiesSchema>) => {
        const list = getData().collection?.allergies ?? []
        const filtered = list.filter((a: any) =>
          matchAllergyType(a.type, type) &&
          matchAllergySeverity(a.criticality, severity)
        )
        return scrub({
          success: true,
          summary: `Found ${filtered.length} AllergyIntolerance record(s)`,
          count: filtered.length,
          data: filtered.map((a: any) => ({
            substance: pickName(a.code),
            criticality: a.criticality,
            type: a.type,
            recordedDate: a.recordedDate,
          })),
        })
      },
    }),

    queryImmunizations: tool({
      description: 'Query preventive vaccinations (FHIR Immunization). Supports date range.',
      inputSchema: immunizationsSchema,
      execute: async ({ dateFrom, dateTo, limit }: z.infer<typeof immunizationsSchema>) => {
        const list = getData().collection?.immunizations ?? []
        let filtered = list
        if (dateFrom || dateTo) {
          filtered = filtered.filter((imm: any) => isWithinDateRange(imm.occurrenceDateTime, dateFrom, dateTo))
        }
        const capped = applyLimit(filtered, limit)
        return scrub({
          success: true,
          summary: `Found ${filtered.length} Immunization record(s)`,
          count: filtered.length,
          dateRange: { from: dateFrom, to: dateTo },
          data: capped.map((imm: any) => ({
            vaccine: pickName(imm.vaccineCode),
            code: imm.vaccineCode?.coding?.[0]?.code,
            status: imm.status,
            occurrenceDateTime: imm.occurrenceDateTime,
            lotNumber: imm.lotNumber,
            manufacturer: imm.manufacturer?.display,
          })),
        })
      },
    }),
  }
}
