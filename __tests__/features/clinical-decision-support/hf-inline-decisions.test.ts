import { HEART_FAILURE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import { usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import type {
  CdssPatientProfile,
  CdssRecommendation,
} from '@/features/clinical-decision-support/types'
import type { ClinicVitals } from '@/features/clinical-decision-support/stores/clinic-vitals.store'

/**
 * The three ways the room enters the page, end to end: the shared symptom
 * strip, the buttons on a row, and the measurements that close the follow-up
 * card. Each one travels as profile input and the pack recomputes — nothing
 * patches a rendered row, and nothing is written to the chart.
 */

const HFPEF_PROFILE: CdssPatientProfile = {
  id: 'hfpef-inline',
  evaluatedAt: '2026-09-09T00:00:00+08:00',
  demographics: { sex: 'female' },
  facts: {
    age: { zh: '78 歲', en: '78 years', numericValue: 78 },
    LVEF: { zh: '63%（2026-06-11）', en: '63% (2026-06-11)', numericValue: 63, date: '2026-06-11' },
    echoEOverEPrime: { zh: '13.2', en: '13.2', numericValue: 13.2, date: '2026-06-11' },
    echoLaVolumeIndex: { zh: '41 mL/m²', en: '41 mL/m2', numericValue: 41, date: '2026-06-11' },
    NTproBNP: { zh: '1159 pg/mL（2026-06-11）', en: '1159 pg/mL (2026-06-11)', numericValue: 1159, date: '2026-06-11' },
    eGFR: { zh: '52 mL/min/1.73m²（2026-08-30）', en: '52 mL/min/1.73m2 (2026-08-30)', numericValue: 52, date: '2026-08-30' },
    potassium: { zh: '4.2 mmol/L（2026-08-30）', en: '4.2 mmol/L (2026-08-30)', numericValue: 4.2, date: '2026-08-30' },
  },
}

function build(profile: CdssPatientProfile): readonly CdssRecommendation[] {
  return HEART_FAILURE_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' }).recommendations
}

function card(profile: CdssPatientProfile, id: string): CdssRecommendation | undefined {
  return build(profile).find((item) => item.id === id)
}

function withVitals(profile: CdssPatientProfile, vitals: ClinicVitals): CdssPatientProfile {
  return applyClinicVitals(profile, vitals)
}

describe('the shared symptom strip', () => {
  it('fills criterion (i) on the phenotype card once a symptom is entered', () => {
    const before = card(HFPEF_PROFILE, 'heart-failure-phenotype')!
    expect(before.recommendation).toContain('雲端紀錄沒有這一項')

    const after = card(
      withVitals(HFPEF_PROFILE, { symptoms: ['orthopnea', 'nyha-class-iii'], measuredOn: '2026-09-09' }),
      'heart-failure-phenotype',
    )!
    expect(after.recommendation).toContain('本次門診醫師已填入')
    expect(after.recommendation).toContain('Orthopnea（Table 7）')
  })

  it('accepts 「過去曾有」 for (i), because ESC 5.2.2 says current or prior', () => {
    const after = card(
      withVitals(HFPEF_PROFILE, { priorSymptoms: ['pitting-edema'], measuredOn: '2026-09-09' }),
      'heart-failure-phenotype',
    )!
    const row = after.evidenceTables
      ?.flatMap((table) => table.items)
      .find((item) => item.id === 'hfpef-criteria:sign:pitting-edema')
    expect(row).toMatchObject({ direction: 'supports', value: '過去曾有（醫師填）' })
    expect(after.recommendation).toContain('Pitting edema（Table 7）')
  })

  it('writes the same tick into the congestion evidence table', () => {
    const congestion = card(
      withVitals(HFPEF_PROFILE, { symptoms: ['pitting-edema', 'jvp'], measuredOn: '2026-09-09' }),
      'heart-failure-congestion-diuretic',
    )!
    const rows = congestion.evidenceTables?.[0]?.items ?? []
    expect(rows.find((item) => item.id === 'congestion:pitting-edema'))
      .toMatchObject({ direction: 'supports', defaultEnabled: true })
    expect(rows.find((item) => item.id === 'congestion:jvp'))
      .toMatchObject({ direction: 'supports', defaultEnabled: true })
    // Two ticks plus the raised NT-proBNP the record already held.
    expect(congestion.title).toBe('鬱血證據 3 項，未用 loop 利尿劑')
  })

  it('leaves an unticked symptom undetermined rather than absent', () => {
    const congestion = card(
      withVitals(HFPEF_PROFILE, { symptoms: ['pitting-edema'], measuredOn: '2026-09-09' }),
      'heart-failure-congestion-diuretic',
    )!
    const rales = (congestion.evidenceTables?.[0]?.items ?? [])
      .find((item) => item.id === 'congestion:rales')
    expect(rales).toMatchObject({ direction: 'unknown' })
    expect(rales?.value).toBeUndefined()
  })

  it('prints the NYHA class without inventing a congestion threshold for it', () => {
    const congestion = card(
      withVitals(HFPEF_PROFILE, { symptoms: ['nyha-class-iii'], measuredOn: '2026-09-09' }),
      'heart-failure-congestion-diuretic',
    )!
    const nyha = (congestion.evidenceTables?.[0]?.items ?? [])
      .find((item) => item.id === 'congestion:nyha')
    expect(nyha).toMatchObject({ direction: 'unknown' })
    expect(nyha?.value).toContain('NYHA III')
    expect(nyha?.value).toContain('ESC 未給 NYHA 對應的鬱血門檻')
  })
})

describe('a decision pressed on a row', () => {
  beforeEach(() => {
    usePhysicianDecisionsStore.setState({ byPatientId: {} })
    window.localStorage.clear()
  })

  it('flips the card the physician answered, and only that card', () => {
    const store = usePhysicianDecisionsStore.getState()
    store.record('hfpef-inline', 'heart-failure-hfpef-sglt2', {
      option: 'prescribed',
      recordedAt: '2026-09-09',
    })
    const decisions = usePhysicianDecisionsStore.getState().byPatientId['hfpef-inline']
    const cards = build({ ...HFPEF_PROFILE, physicianDecisions: decisions })

    const sglt2 = cards.find((item) => item.id === 'heart-failure-hfpef-sglt2')!
    expect(sglt2.status).toBe('no-action')
    expect(sglt2.title).toContain('（醫師已決定：已開立，2026-09-09）')
    // The MRA gap the physician did not answer stays exactly as computed.
    expect(cards.find((item) => item.id === 'heart-failure-hfpef-mra')?.status).toBe('review')
  })

  it('survives a reload, and is withdrawn cleanly', () => {
    usePhysicianDecisionsStore.getState().record('hfpef-inline', 'heart-failure-hfpef-mra', {
      option: 'not-today',
      recordedAt: '2026-09-09',
    })
    // A fresh store reads the same decision back out of storage.
    usePhysicianDecisionsStore.setState({ byPatientId: {} })
    usePhysicianDecisionsStore.getState().hydrate('hfpef-inline')
    expect(usePhysicianDecisionsStore.getState().byPatientId['hfpef-inline'])
      .toEqual({ 'heart-failure-hfpef-mra': { option: 'not-today', recordedAt: '2026-09-09' } })

    usePhysicianDecisionsStore.getState().withdraw('hfpef-inline', 'heart-failure-hfpef-mra')
    expect(usePhysicianDecisionsStore.getState().byPatientId['hfpef-inline']).toEqual({})
    expect(window.localStorage.getItem('cdss-physician-decisions:hfpef-inline')).toBeNull()
  })

  it('never carries one patient\'s decision into the next chart', () => {
    usePhysicianDecisionsStore.getState().record('patient-a', 'heart-failure-hfpef-sglt2', {
      option: 'prescribed',
      recordedAt: '2026-09-09',
    })
    usePhysicianDecisionsStore.getState().hydrate('patient-b')
    expect(usePhysicianDecisionsStore.getState().byPatientId['patient-b']).toEqual({})
  })
})

describe('the follow-up card', () => {
  it('closes when the measurements it names are saved in the room', () => {
    const outstanding = card(HFPEF_PROFILE, 'heart-failure-monitoring')!
    expect(outstanding.status).toBe('needs-data')
    expect(outstanding.title).toContain('心率')
    expect(outstanding.title).toContain('心律')
    expect(outstanding.title).toContain('近期體重')

    const saved = card(
      withVitals(HFPEF_PROFILE, {
        entries: {
          bloodPressure: { value: 128, diastolic: 74, enteredAt: '2026-09-09' },
          heartRate: { value: 72, enteredAt: '2026-09-09' },
          bodyWeight: { value: 58.4, enteredAt: '2026-09-09' },
        },
        rhythm: 'sinus',
        measuredOn: '2026-09-09',
      }),
      'heart-failure-monitoring',
    )!
    // Sodium is the one input a clinic cannot measure, so it is what remains.
    expect(saved.title).toBe('缺 1 項：Na')
    expect(saved.requirements).toEqual(
      expect.arrayContaining([{ kind: 'record-input', label: 'Na' }]),
    )
  })
})
