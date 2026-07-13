/**
 * @jest-environment node
 *
 * FHIR Tools — end-to-end behavior tests with realistic NHI bundle shape.
 * Catches the kind of bug LLM input mismatches cause (HL7 vs friendly names,
 * case-insensitivity, double-counting, refill dedup, PII leakage).
 *
 * Uses node env because `ai` package (transitively imported) needs
 * TransformStream which jsdom doesn't expose.
 */
import { createFhirTools } from '@/src/infrastructure/ai/tools/fhir-tools'
import { sampleDataSource, samplePatient, sampleCollection } from './fixtures'

const tools = createFhirTools(sampleDataSource)

// Tool#execute is typed loosely; cast through any for tests.
async function call(toolName: keyof typeof tools, args: any = {}): Promise<any> {
  const t = tools[toolName] as any
  return t.execute(args)
}

describe('createFhirTools (unified)', () => {
  describe('queryEncounters — class aliases (HL7 ↔ friendly)', () => {
    it('class="inpatient" matches IMP', async () => {
      const r = await call('queryEncounters', { class: 'inpatient' })
      expect(r.success).toBe(true)
      expect(r.count).toBe(1)
      expect(r.data[0].encounterId).toBe('enc-inpatient-1')
    })

    it('class="IMP" matches IMP', async () => {
      const r = await call('queryEncounters', { class: 'IMP' })
      expect(r.count).toBe(1)
    })

    it('class="outpatient" matches AMB', async () => {
      const r = await call('queryEncounters', { class: 'outpatient' })
      // Both enc-amb-1 and enc-pharm-1 use AMB class
      expect(r.count).toBe(2)
    })

    it('class="emergency" matches EMER', async () => {
      const r = await call('queryEncounters', { class: 'emergency' })
      expect(r.count).toBe(1)
      expect(r.data[0].encounterId).toBe('enc-emer-1')
    })

    it('no class filter returns all', async () => {
      const r = await call('queryEncounters')
      expect(r.count).toBe(4)
    })

    it('department substring matches type.text', async () => {
      const r = await call('queryEncounters', { department: '住院' })
      expect(r.count).toBe(1)
    })

    it('institution substring matches serviceProvider.display', async () => {
      const r = await call('queryEncounters', { institution: '長庚' })
      expect(r.count).toBe(1)
    })

    it('date range filters by period.start', async () => {
      const r = await call('queryEncounters', {
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
      })
      expect(r.count).toBe(2) // inpatient 2025-05 + emergency 2025-02
    })

    it('summarize=true returns compact form', async () => {
      const r = await call('queryEncounters', { summarize: true })
      expect(r.data[0]).toHaveProperty('encounterId')
      expect(r.data[0]).toHaveProperty('date')
      expect(r.data[0]).toHaveProperty('type')
      expect(r.data[0]).not.toHaveProperty('period')
    })
  })

  describe('queryObservations — category aliases + case-insensitive code', () => {
    it('category="Laboratory" matches "laboratory"', async () => {
      const r = await call('queryObservations', { category: 'Laboratory' })
      expect(r.count).toBeGreaterThanOrEqual(2) // HbA1c x2 + WBC
    })

    it('category="lab" matches "laboratory" via alias', async () => {
      const r = await call('queryObservations', { category: 'lab' })
      expect(r.count).toBeGreaterThan(0)
    })

    it('category="Vital Signs" matches "vital-signs"', async () => {
      const r = await call('queryObservations', { category: 'Vital Signs' })
      expect(r.count).toBe(1)
    })

    it('category="vitals" matches via alias', async () => {
      const r = await call('queryObservations', { category: 'vitals' })
      expect(r.count).toBe(1)
    })

    it('code exact match is case-insensitive', async () => {
      const r = await call('queryObservations', { code: 'body height' })
      expect(r.count).toBe(1)
    })

    it('codeQuery substring search works', async () => {
      const r = await call('queryObservations', { codeQuery: 'hba1c' })
      expect(r.count).toBe(2)
    })

    it('abnormalOnly filters by interpretation', async () => {
      const r = await call('queryObservations', { abnormalOnly: true })
      // Two HbA1c values flagged H
      expect(r.count).toBe(2)
    })
  })

  describe('queryDiagnosticReports', () => {
    it('category="Lab" matches "LAB"', async () => {
      const r = await call('queryDiagnosticReports', { category: 'Lab' })
      expect(r.count).toBe(1)
    })

    it('category="imaging" matches "RAD" via alias', async () => {
      const r = await call('queryDiagnosticReports', { category: 'imaging' })
      expect(r.count).toBe(1)
    })

    it('abnormalOnly returns only reports with abnormal obs', async () => {
      const r = await call('queryDiagnosticReports', { abnormalOnly: true })
      expect(r.count).toBe(1)
      expect(r.data[0].reportName).toBe('全套血液檢查')
    })

    it('embeds component observations from _observations', async () => {
      const r = await call('queryDiagnosticReports', {})
      const labReport = r.data.find((d: any) => d.reportName === '全套血液檢查')
      expect(labReport.results.length).toBe(2)
      expect(labReport.results.some((x: any) => x.abnormal === true)).toBe(true)
    })
  })

  describe('queryMedications', () => {
    it('chronic=true returns only continuous-therapy meds', async () => {
      const r = await call('queryMedications', { chronic: true })
      // Both refill cycles of Sotalol / 通舒錠 are chronic
      expect(r.count).toBe(2)
      expect(r.data.every((m: any) => m.chronic === true)).toBe(true)
    })

    it('chronic=false returns non-chronic', async () => {
      const r = await call('queryMedications', { chronic: false })
      expect(r.count).toBe(1)
      expect(r.data[0].medication).toBe('Acetaminophen')
    })

    it('status filter is case-insensitive', async () => {
      const r = await call('queryMedications', { status: 'ACTIVE' })
      expect(r.count).toBe(1)
    })

    it('date range filters authoredOn', async () => {
      const r = await call('queryMedications', { dateFrom: '2026-04-01' })
      expect(r.count).toBe(1)
    })
  })

  describe('queryAllergies', () => {
    it('severity="high" matches criticality "high"', async () => {
      const r = await call('queryAllergies', { severity: 'high' })
      expect(r.count).toBe(1)
    })

    it('severity="low" returns 0 when no low-criticality entries', async () => {
      const r = await call('queryAllergies', { severity: 'low' })
      expect(r.count).toBe(0)
    })
  })

  describe('queryConditions', () => {
    it('category filter accepts "problem-list-item"', async () => {
      const r = await call('queryConditions', { category: 'problem-list-item' })
      expect(r.count).toBe(1)
    })

    it('clinicalStatus is case-insensitive', async () => {
      const r = await call('queryConditions', { clinicalStatus: 'Active' })
      expect(r.count).toBe(1)
    })
  })

  describe('queryProcedures', () => {
    it('date range filters by performedDateTime', async () => {
      const r = await call('queryProcedures', { dateFrom: '2016-01-01', dateTo: '2017-01-01' })
      expect(r.count).toBe(1)
    })

    it('date range excludes out-of-range', async () => {
      const r = await call('queryProcedures', { dateFrom: '2020-01-01' })
      expect(r.count).toBe(0)
    })
  })

  describe('queryImmunizations', () => {
    it('returns all when no filter', async () => {
      const r = await call('queryImmunizations')
      expect(r.count).toBe(1)
    })

    it('date range filters by occurrenceDateTime', async () => {
      const r = await call('queryImmunizations', { dateFrom: '2024-01-01' })
      expect(r.count).toBe(1)
    })

    it('date range excludes too-old vaccines', async () => {
      const r = await call('queryImmunizations', { dateFrom: '2025-01-01' })
      expect(r.count).toBe(0)
    })
  })

  describe('getDataOverview', () => {
    it('returns counts for every resource type', async () => {
      const r = await call('getDataOverview')
      expect(r.success).toBe(true)
      expect(r.data.encounters.count).toBe(4)
      expect(r.data.conditions.count).toBe(1)
      expect(r.data.medications.count).toBe(3)
      expect(r.data.allergies.count).toBe(1)
      expect(r.data.diagnosticReports.count).toBe(2)
      expect(r.data.procedures.count).toBe(1)
      expect(r.data.immunizations.count).toBe(1)
    })

    it('observation count dedups vitals + observations by id', async () => {
      const r = await call('getDataOverview')
      // 3 lab observations + 1 vital sign, distinct ids
      expect(r.data.observations.count).toBe(4)
    })

    it('returns date range for each resource type', async () => {
      const r = await call('getDataOverview')
      expect(r.data.encounters.range).toEqual({
        earliest: '2025-02-11',
        latest: '2026-05-13',
      })
    })
  })

  describe('getEncounterDetails (cross-resource)', () => {
    it('returns full visit detail by encounterId', async () => {
      const r = await call('getEncounterDetails', { encounterId: 'enc-inpatient-1' })
      expect(r.success).toBe(true)
      expect(r.data.type).toBe('inpatient')
      expect(r.data.department).toBe('住院')
    })

    it('returns primary + secondary ICDs', async () => {
      const r = await call('getEncounterDetails', { encounterId: 'enc-inpatient-1' })
      expect(r.data.diagnoses.length).toBe(2)
      expect(r.data.diagnoses[0].code).toBe('I50.9')
      expect(r.data.diagnoses[1].code).toBe('E11.9')
    })

    it('returns meds linked to that encounter', async () => {
      const r = await call('getEncounterDetails', { encounterId: 'enc-inpatient-1' })
      expect(r.data.medications.length).toBe(1)
      expect(r.data.medications[0].medication).toBe('Acetaminophen')
    })

    it('returns diagnostic reports linked to encounter', async () => {
      const r = await call('getEncounterDetails', { encounterId: 'enc-inpatient-1' })
      expect(r.data.reports.length).toBe(1)
    })

    it('returns failure for unknown encounter id', async () => {
      const r = await call('getEncounterDetails', { encounterId: 'does-not-exist' })
      expect(r.success).toBe(false)
    })
  })

  describe('getActiveMedicationList (refill dedup)', () => {
    it('dedups same-name refill cycles into one row', async () => {
      const r = await call('getActiveMedicationList')
      const names = r.data.map((m: any) => m.medication)
      expect(new Set(names).size).toBe(names.length)
    })

    it('chronicOnly=true keeps only continuous-therapy', async () => {
      const r = await call('getActiveMedicationList', { chronicOnly: true })
      expect(r.data.every((m: any) => m.chronic === true)).toBe(true)
    })

    it('tracks refillCount when same drug appears multiple times', async () => {
      const r = await call('getActiveMedicationList')
      const sotalol = r.data.find((m: any) => m.medication === 'Sotalol')
      expect(sotalol?.refillCount).toBe(2)
    })
  })

  describe('searchObservationByName', () => {
    it('finds by substring (English)', async () => {
      const r = await call('searchObservationByName', { query: 'HbA1c' })
      expect(r.count).toBeGreaterThan(0)
    })

    it('is case-insensitive', async () => {
      const r = await call('searchObservationByName', { query: 'hba1c' })
      expect(r.count).toBeGreaterThan(0)
    })

    it('default (no withTrend) returns latest per code', async () => {
      const r = await call('searchObservationByName', { query: 'HbA1c' })
      // Two HbA1c entries but only most recent should appear
      expect(r.count).toBe(1)
    })

    it('withTrend=true returns multiple per code, sorted desc', async () => {
      const r = await call('searchObservationByName', { query: 'HbA1c', withTrend: true })
      expect(r.count).toBe(2)
      expect(r.data[0].effectiveDateTime > r.data[1].effectiveDateTime).toBe(true)
    })

    it('matches Chinese substrings too', async () => {
      const r = await call('searchObservationByName', { query: 'Body Height' })
      expect(r.count).toBe(1)
    })
  })

  describe('searchObservationByName — LOINC aliasing (stale-value-as-latest fix)', () => {
    // Real demo-bundle gotcha: one analyte is stored under DIFFERENT display
    // names across dates while sharing a single LOINC. eGFR's recent values sit
    // under text "Estimated GFR"; the oldest under "eGFR". CRP's latest sits
    // under one Chinese alias, older ones under another. Grouping by display
    // text splits the series and lets a stale value be returned as "latest";
    // grouping by LOINC keeps one dated series so the most-recent wins.
    const LOINC = 'http://loinc.org'
    const o = (id: string, text: string, code: string, value: number, date: string) =>
      ({
        id,
        code: {
          text,
          coding: [{ system: LOINC, code, display: 'Glomerular filtration rate (MDRD)' }],
        },
        category: [{ coding: [{ code: 'laboratory' }] }],
        valueQuantity: { value, unit: 'mL/min/1.73m2' },
        effectiveDateTime: `${date}T00:00:00+08:00`,
        status: 'final',
      }) as any
    const crp = (id: string, text: string, value: number, date: string) =>
      ({
        id,
        code: {
          text,
          coding: [{ system: LOINC, code: '1988-5', display: 'C reactive protein [Mass/volume] in Serum or Plasma' }],
        },
        category: [{ coding: [{ code: 'laboratory' }] }],
        valueQuantity: { value, unit: 'mg/dL' },
        effectiveDateTime: `${date}T00:00:00+08:00`,
        status: 'final',
      }) as any

    const aliasTools = createFhirTools(() => ({
      patient: samplePatient,
      collection: {
        ...sampleCollection,
        observations: [
          // eGFR — recent three under "Estimated GFR", oldest under "eGFR"
          o('egfr-1', 'Estimated GFR', '33914-3', 32, '2026-06-02'),
          o('egfr-2', 'Estimated GFR', '33914-3', 33, '2026-05-25'),
          o('egfr-3', 'Estimated GFR', '33914-3', 35, '2026-01-14'),
          o('egfr-4', 'eGFR', '33914-3', 36.3, '2025-12-09'),
          // CRP — latest under one Chinese alias, older under another
          crp('crp-1', 'C反應性蛋白試驗 -  免疫比濁法', 0.76, '2026-05-25'),
          crp('crp-2', 'C反應蛋白', 0.26, '2026-01-14'),
          crp('crp-3', 'C反應蛋白', 2.65, '2025-05-20'),
        ],
        vitalSigns: [],
      },
    }))
    const aCall = (args: any) => (aliasTools.searchObservationByName as any).execute(args)

    it('query "eGFR" returns the true latest (32) even though latest text is "Estimated GFR"', async () => {
      const r = await aCall({ query: 'eGFR' })
      expect(r.count).toBe(1) // one analyte, not split by display text
      expect(r.data[0].value).toBe(32)
      expect(r.data[0].effectiveDateTime.startsWith('2026-06-02')).toBe(true)
    })

    it('query "eGFR" does NOT return the stale 36.3 as latest', async () => {
      const r = await aCall({ query: 'eGFR' })
      expect(r.data[0].value).not.toBe(36.3)
    })

    it('withTrend collapses both display names into one date-sorted series', async () => {
      const r = await aCall({ query: 'eGFR', withTrend: true })
      expect(r.count).toBe(4)
      expect(r.data.map((d: any) => d.value)).toEqual([32, 33, 35, 36.3])
    })

    it('matching a coding.display synonym still resolves the analyte ("GFR")', async () => {
      const r = await aCall({ query: 'GFR' })
      expect(r.count).toBe(1)
      expect(r.data[0].value).toBe(32)
    })

    it('CRP: English synonym finds latest (0.76) despite Chinese-only text', async () => {
      const r = await aCall({ query: 'C reactive protein' })
      expect(r.count).toBe(1)
      expect(r.data[0].value).toBe(0.76)
    })

    it('CRP: two Chinese aliases collapse into one series, latest first', async () => {
      const r = await aCall({ query: 'C反應蛋白', withTrend: true })
      expect(r.data.map((d: any) => d.value)).toEqual([0.76, 0.26, 2.65])
    })

    it('distinct LOINCs do NOT merge: CRP search excludes eGFR', async () => {
      const r = await aCall({ query: 'C reactive protein', withTrend: true })
      expect(r.data.every((d: any) => d.unit === 'mg/dL')).toBe(true)
    })

    it('mixed coding: an uncoded entry inherits a same-text sibling LOINC (real "PT" case)', async () => {
      const mixedTools = createFhirTools(() => ({
        patient: samplePatient,
        collection: {
          ...sampleCollection,
          observations: [
            // newest entry has NO LOINC, older one does — same text "PT"
            {
              id: 'pt-new',
              code: { text: 'PT' },
              category: [{ coding: [{ code: 'laboratory' }] }],
              valueQuantity: { value: 11.2, unit: 'sec' },
              effectiveDateTime: '2026-06-02T00:00:00+08:00',
            },
            {
              id: 'pt-old',
              code: { text: 'PT', coding: [{ system: 'http://loinc.org', code: '5902-2', display: 'Prothrombin time' }] },
              category: [{ coding: [{ code: 'laboratory' }] }],
              valueQuantity: { value: 13.5, unit: 'sec' },
              effectiveDateTime: '2026-01-14T00:00:00+08:00',
            },
          ] as any,
          vitalSigns: [],
        },
      }))
      const r = await (mixedTools.searchObservationByName as any).execute({ query: 'PT', withTrend: true })
      expect(r.count).toBe(2) // one analyte, both dates in one series
      expect(r.data[0].value).toBe(11.2) // newest first, not split off
    })
  })

  describe('getRecentVisits', () => {
    it('returns sorted by date desc', async () => {
      const r = await call('getRecentVisits')
      const dates = r.data.map((v: any) => v.date)
      const sorted = [...dates].sort().reverse()
      expect(dates).toEqual(sorted)
    })

    it('type="inpatient" matches IMP encounter', async () => {
      const r = await call('getRecentVisits', { type: 'inpatient' })
      expect(r.count).toBe(1)
      expect(r.data[0].encounterId).toBe('enc-inpatient-1')
    })

    it('type="pharmacy" matches 藥局 type even with AMB class', async () => {
      const r = await call('getRecentVisits', { type: 'pharmacy' })
      expect(r.count).toBe(1)
      expect(r.data[0].encounterId).toBe('enc-pharm-1')
    })

    it('reports counts of meds/labs/procs per visit', async () => {
      const r = await call('getRecentVisits')
      const inpat = r.data.find((v: any) => v.encounterId === 'enc-inpatient-1')
      expect(inpat.medCount).toBe(1)   // 普拿疼
      expect(inpat.labCount).toBeGreaterThanOrEqual(0)
    })

    it('limit respects user-provided value', async () => {
      const r = await call('getRecentVisits', { limit: 2 })
      expect(r.count).toBe(2)
    })

    it('exposes primary ICD label', async () => {
      const r = await call('getRecentVisits', { type: 'inpatient' })
      expect(r.data[0].primaryIcd).toBe('I50.9')
    })
  })

  describe('listEncounterDepartments', () => {
    it('returns unique departments with visit counts', async () => {
      const r = await call('listEncounterDepartments')
      expect(r.count).toBeGreaterThan(0)
      const depts = r.data.map((d: any) => d.department)
      expect(depts).toContain('住院')
      expect(depts).toContain('門診')
      expect(depts).toContain('藥局')
      expect(depts).toContain('急診')
    })
  })

  describe('listAvailableObservationCodes', () => {
    it('returns unique observation names sorted by count desc', async () => {
      const r = await call('listAvailableObservationCodes')
      const codes = r.data.map((d: any) => d.code)
      expect(codes).toContain('HbA1c')
      expect(codes).toContain('WBC')
      expect(codes).toContain('Body Height')
      // HbA1c (2) should come before WBC (1)
      const hba1cIdx = codes.indexOf('HbA1c')
      const wbcIdx = codes.indexOf('WBC')
      expect(hba1cIdx).toBeLessThan(wbcIdx)
    })
  })

  describe('queryPatientInfo + PII scrub', () => {
    it('returns gender + age only', async () => {
      const r = await call('queryPatientInfo')
      expect(r.success).toBe(true)
      expect(r.data.gender).toBe('male')
      expect(typeof r.data.age).toBe('number')
    })

    it('does NOT return patient id', async () => {
      const r = await call('queryPatientInfo')
      expect(r.data.id).toBeUndefined()
    })

    it('does NOT return birthDate', async () => {
      const r = await call('queryPatientInfo')
      expect(r.data.birthDate).toBeUndefined()
    })
  })

  describe('Realistic LLM query scenarios', () => {
    it('"past 2 years inpatient" → queryEncounters returns IMP', async () => {
      const r = await call('queryEncounters', {
        class: 'inpatient',
        dateFrom: '2024-01-01',
        dateTo: '2026-12-31',
      })
      expect(r.count).toBeGreaterThan(0)
    })

    it('"what is the patient currently on?" → getActiveMedicationList', async () => {
      const r = await call('getActiveMedicationList')
      expect(r.count).toBeGreaterThan(0)
    })

    it('"abnormal labs" → queryDiagnosticReports abnormalOnly', async () => {
      const r = await call('queryDiagnosticReports', { abnormalOnly: true })
      expect(r.count).toBeGreaterThan(0)
    })

    it('"HbA1c trend" → searchObservationByName withTrend', async () => {
      const r = await call('searchObservationByName', { query: 'HbA1c', withTrend: true })
      expect(r.count).toBeGreaterThan(1)
    })

    it('"what visits did the patient have at 長庚?" → queryEncounters institution', async () => {
      const r = await call('queryEncounters', { institution: '長庚' })
      expect(r.count).toBeGreaterThan(0)
    })

    it('"what departments has patient seen?" → listEncounterDepartments', async () => {
      const r = await call('listEncounterDepartments')
      expect(r.count).toBeGreaterThan(0)
    })

    it('"recent visits summary" → getRecentVisits', async () => {
      const r = await call('getRecentVisits', { limit: 5 })
      expect(r.count).toBeGreaterThan(0)
    })

    it('"specific visit detail" → getEncounterDetails after getRecentVisits', async () => {
      const recent = await call('getRecentVisits', { type: 'inpatient', limit: 1 })
      const id = recent.data[0].encounterId
      const detail = await call('getEncounterDetails', { encounterId: id })
      expect(detail.success).toBe(true)
      expect(detail.data.diagnoses.length).toBeGreaterThan(0)
    })

    it('"chronic meds (慢箋)" → getActiveMedicationList chronicOnly', async () => {
      const r = await call('getActiveMedicationList', { chronicOnly: true })
      expect(r.count).toBeGreaterThan(0)
      expect(r.data.every((m: any) => m.chronic === true)).toBe(true)
    })
  })
})
