import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import {
  assessMedicationClass,
  classifyCurrentMedications,
  currentMedicationRecords,
  isMedicationBeingTaken,
} from '@/features/clinical-decision-support/adapters/medication-classifier'

/**
 * The record comes from the NHI cloud (雲端病歷／健康存摺), which is
 * cross-institution and has exactly two medication states: a prescription
 * exists, or it does not. The bridge computes `status` from
 * `authoredOn + dispenseRequest.expectedSupplyDuration` — `active` while the
 * supply lasts, `completed` afterwards — and never sends `on-hold`, `stopped`,
 * or a MedicationStatement.
 *
 * So "taking" is: any `active` prescription, or a `completed` one whose supply
 * ended no more than 30 days ago (a late refill is not a discontinuation).
 * Everything else, including no record at all, is "not taking".
 */

const NOW = new Date('2026-07-29T00:00:00Z')

function statin(overrides: Partial<MedicationEntity> = {}): MedicationEntity {
  return {
    id: 'statin-1',
    status: 'active',
    authoredOn: '2026-06-25',
    medicationCodeableConcept: {
      text: 'Atorvastatin 20 mg',
      coding: [{ display: 'Atorvastatin 20 mg' }],
    },
    _sourceResourceType: 'MedicationRequest',
    ...overrides,
  }
}

function supplyWindow(value: number, unit: string, code?: string) {
  return {
    dispenseRequest: {
      expectedSupplyDuration: {
        value,
        unit,
        system: 'http://unitsofmeasure.org',
        ...(code === undefined ? {} : { code }),
      },
    },
  }
}

const patient: PatientEntity = {
  id: 'two-state-patient',
  resourceType: 'Patient',
}

function statinContext(medications: readonly MedicationEntity[]) {
  const profile = createFhirCdssPatientProfile({
    patient,
    conditions: [],
    encounters: [],
    observations: [],
    medications: [...medications],
    allergies: [],
    carePlans: [],
    now: NOW,
  })
  return {
    context: profile.medicationClassContexts?.statin,
    fact: profile.facts.statinTherapy,
  }
}

function statinState(medication: MedicationEntity) {
  return assessMedicationClass(
    classifyCurrentMedications([medication], NOW),
    'statin',
  ).state
}

describe('two-state reading of an NHI cloud prescription', () => {
  it('reads an active prescription as taken', () => {
    const medication = statin()

    expect(isMedicationBeingTaken(medication, NOW)).toBe(true)
    expect(statinState(medication)).toBe('confirmed-current')
  })

  it('reads a completed prescription whose supply ended 10 days ago as taken', () => {
    // 2026-06-19 + 30 days = 2026-07-19, ten days before NOW.
    const medication = statin({
      status: 'completed',
      authoredOn: '2026-06-19',
      ...supplyWindow(30, 'days', 'd'),
    })

    expect(isMedicationBeingTaken(medication, NOW)).toBe(true)
    expect(statinState(medication)).toBe('confirmed-current')
  })

  it('reads a completed prescription whose supply ended 45 days ago as not taken', () => {
    // 2026-05-15 + 30 days = 2026-06-14, 45 days before NOW.
    const medication = statin({
      status: 'completed',
      authoredOn: '2026-05-15',
      ...supplyWindow(30, 'days', 'd'),
    })

    expect(isMedicationBeingTaken(medication, NOW)).toBe(false)
    expect(statinState(medication)).toBe('not-found')
  })

  it('reads a completed prescription with no supply duration as not taken', () => {
    const medication = statin({ status: 'completed' })

    expect(isMedicationBeingTaken(medication, NOW)).toBe(false)
    expect(statinState(medication)).toBe('not-found')
  })

  it('reads no record at all as not taken rather than as an unanswered question', () => {
    expect(assessMedicationClass(
      classifyCurrentMedications([], NOW),
      'statin',
    )).toMatchObject({ state: 'not-found', medications: [] })
  })

  it('reports an unmapped glucose-lowering ingredient as genuinely uncertain', () => {
    const unmapped = classifyCurrentMedications([{
      id: 'compound-1',
      status: 'active',
      authoredOn: '2026-07-01',
      medicationCodeableConcept: { text: '院內降糖複方 X' },
      category: [{ text: 'ANTIDIABETIC AGENTS' }],
      _sourceResourceType: 'MedicationRequest',
    }], NOW)

    expect(assessMedicationClass(unmapped, 'insulin').state).toBe('uncertain')
    expect(assessMedicationClass(unmapped, 'sulfonylurea').state).toBe('uncertain')
    // Ingredient ambiguity among antidiabetics says nothing about other classes.
    expect(assessMedicationClass(unmapped, 'statin').state).toBe('not-found')
  })

  it('converts a supply window expressed in weeks before applying the grace period', () => {
    // 2026-06-05 + 4 weeks = 2026-07-03, 26 days before NOW: still inside grace.
    const inGrace = statin({
      status: 'completed',
      authoredOn: '2026-06-05',
      ...supplyWindow(4, 'weeks', 'wk'),
    })
    // 2026-04-01 + 4 weeks = 2026-04-29, three months before NOW.
    const lapsed = statin({
      status: 'completed',
      authoredOn: '2026-04-01',
      ...supplyWindow(4, 'weeks', 'wk'),
    })

    expect(isMedicationBeingTaken(inGrace, NOW)).toBe(true)
    expect(isMedicationBeingTaken(lapsed, NOW)).toBe(false)
  })

  it('treats an unreadable supply window as absent rather than guessing at it', () => {
    const unknownUnit = statin({
      status: 'completed',
      authoredOn: '2026-07-20',
      ...supplyWindow(30, 'boxes', 'box'),
    })
    const noAuthoredOn = statin({
      status: 'completed',
      authoredOn: undefined,
      ...supplyWindow(30, 'days', 'd'),
    })

    expect(isMedicationBeingTaken(unknownUnit, NOW)).toBe(false)
    expect(isMedicationBeingTaken(noAuthoredOn, NOW)).toBe(false)
  })

  /**
   * The bridge writes `unknown` on every MedicationRequest it emits from the
   * NHI cloud, so an `active|completed|on-hold|stopped` allowlist dropped every
   * real prescription. `unknown` is a legal FHIR status and settles nothing on
   * its own, so the supply window decides — exactly as it does for `completed`.
   */
  it('reads an unknown-status prescription still inside its supply window as taken', () => {
    // 2026-07-20 + 30 days = 2026-08-19, still supplying at NOW.
    const medication = statin({
      status: 'unknown',
      authoredOn: '2026-07-20',
      ...supplyWindow(30, 'days', 'd'),
    })

    expect(isMedicationBeingTaken(medication, NOW)).toBe(true)
    expect(statinState(medication)).toBe('confirmed-current')
  })

  it('reads an unknown-status prescription inside the refill grace period as taken', () => {
    const medication = statin({
      status: 'unknown',
      authoredOn: '2026-06-19',
      ...supplyWindow(30, 'days', 'd'),
    })

    expect(isMedicationBeingTaken(medication, NOW)).toBe(true)
    expect(statinState(medication)).toBe('confirmed-current')
  })

  it('reads an unknown-status prescription whose supply lapsed as not taken', () => {
    const medication = statin({
      status: 'unknown',
      authoredOn: '2026-05-15',
      ...supplyWindow(30, 'days', 'd'),
    })

    expect(isMedicationBeingTaken(medication, NOW)).toBe(false)
    expect(statinState(medication)).toBe('not-found')
  })

  it('reads an unknown-status prescription with no supply window as not taken', () => {
    expect(isMedicationBeingTaken(statin({ status: 'unknown' }), NOW)).toBe(false)
    expect(isMedicationBeingTaken(statin({ status: undefined }), NOW)).toBe(false)
  })

  it('keeps an unknown-status prescription visible to the class as a real record', () => {
    // Admitting the record is the point: the class reads as not taken, but the
    // prescription behind that verdict still dates the card.
    const { context, fact } = statinContext([statin({
      status: 'unknown',
      authoredOn: '2026-05-15',
      ...supplyWindow(30, 'days', 'd'),
    })])

    expect(context).toMatchObject({
      state: 'not-found',
      lastPrescriptionDate: '2026-05-15',
    })
    expect(fact.zh).toBe('目前未使用（最近一筆處方 2026-06-14 結束）')
  })

  it.each(['cancelled', 'entered-in-error'])(
    'never reads a %s prescription as a record at all',
    (status) => {
      const medication = statin({ status, authoredOn: '2026-07-20', ...supplyWindow(30, 'days', 'd') })

      expect(isMedicationBeingTaken(medication, NOW)).toBe(false)
      expect(statinState(medication)).toBe('not-found')
      expect(statinContext([medication]).context?.lastPrescriptionDate).toBeUndefined()
    },
  )

  it('keeps a real on-hold status distinct from both taking and absent', () => {
    // The NHI cloud never sends this; a directly connected hospital EHR can.
    expect(statinState(statin({ status: 'on-hold' }))).toBe('on-hold')
  })

  it('keeps the dates of a class that reads as not taken only because it lapsed', () => {
    // 2026-05-15 + 30 days = 2026-06-14. The class is not being taken, but the
    // prescription behind that verdict is real data and stays visible.
    const { context, fact } = statinContext([statin({
      status: 'completed',
      authoredOn: '2026-05-15',
      ...supplyWindow(30, 'days', 'd'),
    })])

    expect(context).toMatchObject({
      state: 'not-found',
      lastPrescriptionDate: '2026-05-15',
    })
    expect(fact.zh).toBe('目前未使用（最近一筆處方 2026-06-14 結束）')
    expect(fact.en).toBe('Not currently taking (latest prescription ended 2026-06-14)')
  })

  it('falls back to the prescription date when no supply window is readable', () => {
    const { context, fact } = statinContext([statin({
      status: 'completed',
      authoredOn: '2026-05-15',
    })])

    expect(context).toMatchObject({
      state: 'not-found',
      lastPrescriptionDate: '2026-05-15',
    })
    expect(fact.zh).toBe('目前未使用（最近一筆處方 2026-05-15 開立）')
  })

  it('reports the latest lapsed prescription when a class has several', () => {
    const { context, fact } = statinContext([
      statin({ id: 'older', status: 'completed', authoredOn: '2025-11-01', ...supplyWindow(28, 'days', 'd') }),
      statin({ id: 'newer', status: 'completed', authoredOn: '2026-05-15', ...supplyWindow(30, 'days', 'd') }),
    ])

    expect(context).toMatchObject({ lastPrescriptionDate: '2026-05-15' })
    expect(fact.zh).toBe('目前未使用（最近一筆處方 2026-06-14 結束）')
  })

  it('carries no date at all when the class has no record to date', () => {
    const { context, fact } = statinContext([])

    expect(context?.state).toBe('not-found')
    expect(context?.lastPrescriptionDate).toBeUndefined()
    expect(fact.zh).toBe('目前未使用')
    expect(fact.en).toBe('Not currently taking')
  })

  it('scans the same records the class assessment calls current', () => {
    const records = [
      statin({ id: 'active', status: 'active' }),
      statin({
        id: 'in-grace',
        status: 'completed',
        authoredOn: '2026-06-19',
        ...supplyWindow(30, 'days', 'd'),
      }),
      // The shape every real NHI cloud prescription arrives in.
      statin({
        id: 'unknown-supplying',
        status: 'unknown',
        authoredOn: '2026-07-20',
        ...supplyWindow(30, 'days', 'd'),
      }),
      statin({
        id: 'unknown-lapsed',
        status: 'unknown',
        authoredOn: '2026-05-15',
        ...supplyWindow(30, 'days', 'd'),
      }),
      statin({ id: 'cancelled', status: 'cancelled' }),
      statin({
        id: 'lapsed',
        status: 'completed',
        authoredOn: '2026-05-15',
        ...supplyWindow(30, 'days', 'd'),
      }),
      statin({ id: 'no-supply', status: 'completed' }),
    ]

    expect(currentMedicationRecords(records, NOW).map((item) => item.id))
      .toEqual(['active', 'in-grace', 'unknown-supplying'])
  })
})
