// Chart-size arithmetic for the `ai_result` count parameters.
//
// Pure function, no React tree: what matters here is that the total matches
// the named parts and that nothing is counted twice.
import {
  SINGLE_REPORT_FED_COUNTS,
  countContextResources,
  countPatientResources,
} from '@/src/application/telemetry/patient-resource-counts'

/** A small chart: enough of every counted type to catch a mis-summed field. */
function fixtureBundle(overrides: Record<string, unknown[]> = {}) {
  return {
    conditions: [{ id: 'c1' }, { id: 'c2' }],
    // MedicationRequest + MedicationStatement arrive merged in this one list.
    medications: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    // App-derived remaining-days view: loaded, but never counted and never fed.
    medicationRemainingSummaries: [{ id: 'b1' }],
    allergies: [{ id: 'a1' }],
    observations: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4' }],
    // The vitals subset of `observations` — already counted above, so it must
    // NOT add to resource_count.
    vitalSigns: [{ id: 'o1' }, { id: 'o2' }],
    diagnosticReports: [{ id: 'r1' }, { id: 'r2' }],
    imagingStudies: [{ id: 'i1' }],
    procedures: [{ id: 'p1' }],
    encounters: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
    documentReferences: [{ id: 'd1' }, { id: 'd2' }],
    compositions: [],
    immunizations: [{ id: 'v1' }],
    consents: [],
    devices: [],
    carePlans: [],
    ...overrides,
  } as never
}

describe('countPatientResources', () => {
  it('totals every loaded resource type without double-counting vitals', () => {
    // 2+3+1+4+2+1+1+3+2+0+1+0+0+0 = 20. Excluded: the 2 vitalSigns (already in
    // observations) and the 1 medicationRemainingSummaries (app-derived).
    expect(countPatientResources(fixtureBundle())).toEqual({
      resource_count: 20,
      obs_count: 4,
      med_count: 3,
      doc_count: 2,
      encounter_count: 3,
      report_count: 2,
    })
  })

  it('reports zeros for a chart that loaded with nothing in it', () => {
    const empty = Object.fromEntries(
      Object.keys(fixtureBundle() as object).map((key) => [key, []]),
    )
    expect(countPatientResources(empty as never)).toEqual({
      resource_count: 0,
      obs_count: 0,
      med_count: 0,
      doc_count: 0,
      encounter_count: 0,
      report_count: 0,
    })
  })

  it('survives a collection field the loader left undefined', () => {
    const counts = countPatientResources(
      fixtureBundle({ consents: undefined as unknown as unknown[] }),
    )
    expect(counts.resource_count).toBe(20)
  })

  it('tracks each named part independently of the total', () => {
    const counts = countPatientResources(
      fixtureBundle({ documentReferences: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }] }),
    )
    expect(counts).toMatchObject({ doc_count: 3, resource_count: 21 })
  })

  it('leaves the app-derived remaining-days view out of the total', () => {
    // It is not patient data and never reaches a prompt, so counting it on the
    // loaded side alone would show a permanent phantom "trimmed" difference
    // against fed_resource_count.
    const withMore = countPatientResources(
      fixtureBundle({ medicationRemainingSummaries: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }] }),
    )
    expect(withMore.resource_count).toBe(20)
  })
})

describe('countContextResources', () => {
  /** The AI context after Data Selection: same collection keys, all optional,
   *  and never a `medicationRemainingSummaries` field. */
  const fedContext = {
    conditions: [{ id: 'c1' }, { id: 'c2' }],
    medications: [{ id: 'm1' }],
    observations: [{ id: 'o1' }, { id: 'o2' }],
    diagnosticReports: [{ id: 'r1' }],
    encounters: [{ id: 'e1' }],
    documentReferences: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }],
    // allergies / procedures / imagingStudies / … absent entirely, which is
    // the normal shape once Data Selection has dropped a category.
  }

  it('counts what survived selection, with absent categories as zero', () => {
    // 2+1+2+1+1+3 = 10
    expect(countContextResources(fedContext)).toEqual({
      fed_resource_count: 10,
      fed_obs_count: 2,
      fed_med_count: 1,
      fed_doc_count: 3,
      fed_encounter_count: 1,
      fed_report_count: 1,
    })
  })

  it('reports all zeros for a context that selected nothing', () => {
    expect(countContextResources({})).toEqual({
      fed_resource_count: 0,
      fed_obs_count: 0,
      fed_med_count: 0,
      fed_doc_count: 0,
      fed_encounter_count: 0,
      fed_report_count: 0,
    })
  })

  it('ignores a medicationRemainingSummaries field if one ever appears', () => {
    // Excluded on BOTH sides, so it can never contribute to the difference.
    const withSummaries = {
      ...fedContext,
      medicationRemainingSummaries: [{ id: 'b1' }, { id: 'b2' }],
    } as Record<string, unknown[]>
    expect(countContextResources(withSummaries).fed_resource_count).toBe(10)
  })

  it('subtracts from the loaded totals to give exactly what was trimmed', () => {
    const loaded = countPatientResources(fixtureBundle())
    const fed = countContextResources(fedContext)

    // 20 loaded, 10 fed -> 10 resources dropped by selection + fitting. No
    // correction term: both counters walk the same collection set.
    expect(loaded.resource_count - fed.fed_resource_count).toBe(10)
    expect(loaded.obs_count - fed.fed_obs_count).toBe(2)
    expect(loaded.med_count - fed.fed_med_count).toBe(2)
  })

  it('reports a zero difference when nothing was trimmed', () => {
    // The identity that makes the subtraction meaningful: feed the whole chart
    // and the two totals must agree exactly, with no phantom offset from a
    // field one counter walks and the other does not.
    const wholeChart = fixtureBundle()
    const loaded = countPatientResources(wholeChart)
    const fed = countContextResources(wholeChart as unknown as Record<string, unknown[]>)

    expect(fed.fed_resource_count).toBe(loaded.resource_count)
    expect(fed.fed_obs_count).toBe(loaded.obs_count)
    expect(fed.fed_med_count).toBe(loaded.med_count)
    expect(fed.fed_doc_count).toBe(loaded.doc_count)
    expect(fed.fed_encounter_count).toBe(loaded.encounter_count)
    expect(fed.fed_report_count).toBe(loaded.report_count)
  })
})

describe('SINGLE_REPORT_FED_COUNTS', () => {
  it('says one report and nothing else — the other fields stay absent', () => {
    expect(SINGLE_REPORT_FED_COUNTS).toEqual({
      fed_resource_count: 1,
      fed_report_count: 1,
    })
    // Absent, not zero: report interpretation never had a chart to feed, which
    // is a different statement from "fed zero medications".
    expect('fed_med_count' in SINGLE_REPORT_FED_COUNTS).toBe(false)
  })
})
