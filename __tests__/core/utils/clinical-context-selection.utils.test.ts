// Clinical safety: the adaptive context ladder narrows the medication history
// window (1 year at `trimmed`, 6 months at `compact`). A medicine the patient
// is STILL taking must survive every tier — it is the single most decision-
// relevant category in the whole context — while genuinely historical orders
// keep narrowing exactly as before.
//
// The exemption is scoped to that automatic narrowing only: a medication time
// range the user chose in Data Selection still filters current medicines out,
// exactly as it did before the ladder gained this behaviour.
import {
  filterMedicationRecords,
  isMedicationCurrentlyInUse,
} from '@/src/core/utils/clinical-context-selection.utils'
import { scopeClinicalDataForAi } from '@/src/core/utils/ai-clinical-scope.utils'
import {
  buildClinicalContextFitCandidate,
  type ClinicalContextFitTier,
} from '@/src/core/utils/adaptive-clinical-context.utils'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
  DEFAULT_DATA_FILTERS,
} from '@/src/shared/constants/data-selection.constants'

const NOW = Date.parse('2026-07-13T12:00:00+08:00')

// Two years before NOW — outside the 1y (trimmed) and 6m (compact) windows.
const ACTIVE_LONG_TERM = {
  id: 'active-long-term',
  status: 'active',
  authoredOn: '2024-07-01',
  medicationCodeableConcept: { text: 'Amlodipine 5mg' },
}
const COMPLETED_LONG_AGO = {
  id: 'completed-long-ago',
  status: 'completed',
  authoredOn: '2024-07-01',
  medicationCodeableConcept: { text: 'Amoxicillin 500mg' },
}
// Eight months before NOW — inside 1y, outside 6m.
const COMPLETED_EIGHT_MONTHS_AGO = {
  id: 'completed-eight-months-ago',
  status: 'completed',
  authoredOn: '2025-11-13',
  medicationCodeableConcept: { text: 'Cephalexin 500mg' },
}

const MEDICATIONS = [ACTIVE_LONG_TERM, COMPLETED_LONG_AGO, COMPLETED_EIGHT_MONTHS_AGO]

function tierFilters(tier: ClinicalContextFitTier) {
  return buildClinicalContextFitCandidate(
    {
      selection: ALL_DATA_SELECTION,
      filters: ALL_DATA_FILTERS,
      documentMode: 'all',
      documentIds: [],
    },
    tier,
    1000,
  ).profile.filters
}

function idsFor(tier: 'trimmed' | 'compact' | 'tight') {
  return filterMedicationRecords(MEDICATIONS, tierFilters(tier), null, NOW)
    .map((medication) => medication.id)
}

describe('filterMedicationRecords medication time window', () => {
  beforeAll(() => {
    // isWithinTimeRange reads the wall clock, so the reducer's explicit
    // `scopeNowMs` is not enough to pin the window on its own.
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('keeps a currently-in-use medication ordered two years ago at every tier', () => {
    expect(idsFor('trimmed')).toContain('active-long-term')
    expect(idsFor('compact')).toContain('active-long-term')
    expect(idsFor('tight')).toContain('active-long-term')
  })

  it('still drops a completed two-year-old order at the trimmed tier', () => {
    expect(idsFor('trimmed')).not.toContain('completed-long-ago')
    expect(idsFor('compact')).not.toContain('completed-long-ago')
  })

  it('keeps narrowing historical medications down the ladder', () => {
    expect(idsFor('trimmed')).toContain('completed-eight-months-ago')
    expect(idsFor('compact')).not.toContain('completed-eight-months-ago')
  })

  it('never overrides a medication window the user saved in Data Selection', () => {
    // No adaptive narrowing here, so the exemption flag is absent and the
    // 2-year-old active order is dropped exactly as it was before the ladder
    // gained the exemption. Only the 8-month-old record is inside 1y.
    const savedOneYear = { ...ALL_DATA_FILTERS, medicationTimeRange: '1y' as const }
    expect(
      filterMedicationRecords(MEDICATIONS, savedOneYear, null, NOW)
        .map((medication) => medication.id),
    ).toEqual(['completed-eight-months-ago'])
    // A saved 3-month window keeps nothing at all, current therapy included.
    expect(
      filterMedicationRecords(
        MEDICATIONS,
        { ...ALL_DATA_FILTERS, medicationTimeRange: '3m' },
        null,
        NOW,
      ),
    ).toEqual([])
    expect(ALL_DATA_FILTERS).not.toHaveProperty('medicationKeepCurrentRegardlessOfRange')
  })

  it('exempts current medicines only while the reducer flag is set', () => {
    const savedOneYear = { ...ALL_DATA_FILTERS, medicationTimeRange: '1y' as const }
    expect(
      filterMedicationRecords(
        MEDICATIONS,
        { ...savedOneYear, medicationKeepCurrentRegardlessOfRange: true },
        null,
        NOW,
      ).map((medication) => medication.id),
    ).toEqual(['active-long-term', 'completed-eight-months-ago'])
  })

  it('marks the reducer-narrowed tiers, and only those, with the exemption flag', () => {
    for (const tier of ['trimmed', 'compact', 'tight'] as const) {
      expect(tierFilters(tier).medicationKeepCurrentRegardlessOfRange).toBe(true)
    }
    // 'full' and 'prioritized' hand back the saved filters untouched.
    for (const tier of ['full', 'prioritized'] as const) {
      expect(tierFilters(tier).medicationKeepCurrentRegardlessOfRange).toBeUndefined()
      expect(tierFilters(tier)).toBe(ALL_DATA_FILTERS)
    }
  })

  it('does not resurrect an out-of-window record via the active-status filter', () => {
    const stopped = {
      id: 'stopped-long-ago',
      status: 'stopped',
      authoredOn: '2024-07-01',
      medicationCodeableConcept: { text: 'Warfarin 5mg' },
    }
    const filtered = filterMedicationRecords(
      [stopped],
      { ...ALL_DATA_FILTERS, medicationTimeRange: '1y', medicationStatus: 'active' },
      null,
      NOW,
    )
    expect(filtered).toEqual([])
  })
})

describe('scopeClinicalDataForAi medication tiers', () => {
  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('carries the current medication into the trimmed and compact AI scopes', () => {
    for (const tier of ['trimmed', 'compact'] as const) {
      const scoped = scopeClinicalDataForAi(
        { medications: MEDICATIONS } as never,
        ALL_DATA_SELECTION,
        tierFilters(tier),
        [],
        NOW,
      )
      expect(scoped.medications?.map((medication: any) => medication.id))
        .toContain('active-long-term')
    }
  })
})

// ── Dispensing-claims sources (status `unknown` + days supply) ───────────────
// The NHI 健保存摺 / Medcloud bridge emits EVERY MedicationRequest with
// status `unknown` and intent `order`, and carries the real evidence in
// `dispenseRequest.expectedSupplyDuration` (UCUM days). Rejecting `unknown`
// wholesale meant the default `medicationStatus: 'active'` filter dropped
// 100% of medications for such a chart — the AI context rendered
// "Currently evidenced: none." for patients on a dozen drugs.
//
// Records below are SYNTHETIC: real capture SHAPE (status/intent/fields), made-up
// drug names, quantities and dates.
describe('isMedicationCurrentlyInUse — dispensing-claims shape', () => {
  const CLAIM_NOW = Date.parse('2026-07-13T12:00:00+08:00')

  // filterMedicationRecords resolves its relative window against the wall
  // clock, so pin it — otherwise "inside the last 6 months" drifts by the day
  // the suite happens to run.
  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(CLAIM_NOW)
  })
  afterAll(() => {
    jest.useRealTimers()
  })

  const claim = (
    id: string,
    authoredOn: string,
    supplyDays: number,
    status = 'unknown',
  ) => ({
    id,
    status,
    intent: 'order',
    authoredOn,
    medicationCodeableConcept: { text: `Synthetic drug ${id}` },
    dispenseRequest: {
      quantity: { value: supplyDays * 2 },
      expectedSupplyDuration: {
        value: supplyDays,
        unit: 'days',
        code: 'd',
        system: 'http://unitsofmeasure.org',
      },
    },
  })

  it('treats an unknown-status order whose days supply still covers today as current', () => {
    // Authored 10 days before NOW with 28 days supply → 18 days remaining.
    expect(isMedicationCurrentlyInUse(claim('a', '2026-07-03', 28), CLAIM_NOW)).toBe(true)
  })

  it('does not treat an unknown-status order whose supply has run out as current', () => {
    // Authored ~5 months before NOW with 28 days supply → ended long ago.
    expect(isMedicationCurrentlyInUse(claim('b', '2026-02-01', 28), CLAIM_NOW)).toBe(false)
  })

  it('never promotes an explicitly negative status, however long the supply', () => {
    for (const status of ['stopped', 'cancelled', 'entered-in-error', 'draft', 'on-hold', 'ended']) {
      expect(isMedicationCurrentlyInUse(claim('c', '2026-07-03', 28, status), CLAIM_NOW)).toBe(false)
    }
  })

  it('does not promote an unknown status that carries no supply evidence at all', () => {
    expect(isMedicationCurrentlyInUse(
      { id: 'd', status: 'unknown', intent: 'order', authoredOn: '2026-07-03' },
      CLAIM_NOW,
    )).toBe(false)
  })

  it('keeps the pre-existing order-based behaviour intact', () => {
    // `active` with no computable window stays current; `completed` does not.
    expect(isMedicationCurrentlyInUse({ status: 'active', authoredOn: '2024-01-01' }, CLAIM_NOW)).toBe(true)
    expect(isMedicationCurrentlyInUse({ status: 'completed', authoredOn: '2024-01-01' }, CLAIM_NOW)).toBe(false)
    // `active` whose supply demonstrably ran out is no longer current.
    expect(isMedicationCurrentlyInUse(claim('e', '2026-02-01', 28, 'active'), CLAIM_NOW)).toBe(false)
  })

  it('surfaces claims medications under the shipped default filters', () => {
    const meds = [
      claim('current', '2026-07-03', 28),
      claim('recently-ended', '2026-05-20', 14),
      claim('older', '2026-03-01', 7),
    ]
    const shown = filterMedicationRecords(meds, DEFAULT_DATA_FILTERS, null, CLAIM_NOW)
    // All three are inside the default 6m window, and the default no longer
    // collapses the section to the current bucket alone.
    expect(shown.map((m: any) => m.id)).toEqual(['current', 'recently-ended', 'older'])
    expect(shown.filter((m: any) => isMedicationCurrentlyInUse(m, CLAIM_NOW))).toHaveLength(1)
  })
})
