/**
 * The correction a clinician makes on the status line, end to end.
 *
 * The cloud record lags the room: an echo read this morning is not in it, and a
 * page that can only show what was fetched makes the clinician discount the
 * whole line. So the numbers are entered behind the pencil — every one of them
 * in one pass — travel to the pack as facts, and the pack recomputes: the
 * phenotype, and with it which drug decisions are even on the page. Nothing
 * patches a rendered card, and nothing is written back to the record.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HEART_FAILURE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import LiveClinicalDecisionSupportFeature from '@/features/clinical-decision-support/LiveFeature'
import {
  clinicVitalsStorageKey,
  useClinicVitalsStore,
} from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import type { CdssPatientProfile } from '@/features/clinical-decision-support/types'

const mockUsePatient = jest.fn()
const mockUseClinicalData = jest.fn()

/** An HFpEF record: a preserved ejection fraction, and the criteria to match. */
const HFPEF_PROFILE: CdssPatientProfile = {
  id: 'status-line-patient',
  evaluatedAt: '2026-09-09T00:00:00+08:00',
  demographics: { sex: 'female' },
  facts: {
    age: { zh: '78 歲', en: '78 years', numericValue: 78 },
    LVEF: {
      zh: '63.6%（2026-06-24）',
      en: '63.6% (2026-06-24)',
      numericValue: 63.6,
      unit: '%',
      date: '2026-06-24',
      sources: [{ resourceType: 'Observation', resourceId: 'echo-1', date: '2026-06-24', value: 63.6, unit: '%' }],
    },
    echoEOverEPrime: { zh: '13.2', en: '13.2', numericValue: 13.2, date: '2026-06-24' },
    echoLaVolumeIndex: { zh: '41 mL/m²', en: '41 mL/m2', numericValue: 41, date: '2026-06-24' },
    NTproBNP: { zh: '1159 pg/mL（2026-06-22）', en: '1159 pg/mL (2026-06-22)', numericValue: 1159, date: '2026-06-22' },
    eGFR: { zh: '52 mL/min/1.73m²（2026-08-30）', en: '52 mL/min/1.73m2 (2026-08-30)', numericValue: 52, date: '2026-08-30' },
    potassium: { zh: '4.3 mmol/L（2026-06-22）', en: '4.3 mmol/L (2026-06-22)', numericValue: 4.3, date: '2026-06-22' },
    sodium: { zh: '140 mmol/L（2026-06-22）', en: '140 mmol/L (2026-06-22)', numericValue: 140, date: '2026-06-22' },
  },
}

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => mockUsePatient(),
}))

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockUseClinicalData(),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))

// The record half of the profile is the adapter's job and is fixtured here, so
// this test is about what the entered value does to the pack's reading of it.
jest.mock('@voho0000/personalized-care-fhir', () => ({
  createFhirCdssPatientProfile: () => HFPEF_PROFILE,
}))

jest.mock('@/features/clinical-decision-support/guideline-packs/registry', () => {
  const { HEART_FAILURE_GUIDELINE_PACK: pack } = jest.requireActual('@voho0000/personalized-care')
  return {
    getEnabledClinicalGuidelinePacks: () => [pack],
    getApplicableClinicalGuidelinePacks: () => [pack],
    getDefaultClinicalGuidelinePack: () => pack,
    getClinicalGuidelinePack: () => pack,
  }
})

function clinicalData() {
  return {
    conditions: [],
    encounters: [],
    observations: [],
    medications: [],
    allergies: [],
    carePlans: [],
    procedures: [],
    immunizations: [],
    diagnosticReports: [],
    documentReferences: [],
    isLoading: false,
    isFetching: false,
    error: null,
    hasBlockingQueryIssues: false,
  }
}

describe('correcting today’s values on the status line', () => {
  beforeEach(() => {
    useClinicVitalsStore.setState({ byPatientId: {} })
    window.localStorage.clear()
    mockUseClinicalData.mockReturnValue(clinicalData())
    mockUsePatient.mockReturnValue({
      patient: { id: 'status-line-patient', resourceType: 'Patient', age: 78 },
      loading: false,
      error: null,
    })
  })

  it('reaches the pack, flips the phenotype, and is all undone again', async () => {
    // The pack the registry is standing in for is the real one.
    expect(HEART_FAILURE_GUIDELINE_PACK.id).toBe('heart-failure-cdss')
    render(<LiveClinicalDecisionSupportFeature />)
    await screen.findByTestId('cdss-hf-board')

    expect(screen.getByTestId('cdss-hf-phenotype-word')).toHaveTextContent('HFpEF')
    expect(screen.getByTestId('cdss-hf-metric-LVEF')).toHaveTextContent('63.6%')
    expect(screen.getByTestId('cdss-hf-decisions-block'))
      .toHaveAttribute('data-pillar-pathway', 'hfpEF')

    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    // The dialog opens on what the record holds, so a clinician can see what
    // they are about to override.
    expect(screen.getByTestId('cdss-hf-value-record-LVEF')).toHaveTextContent('紀錄 63.6%（06-24）')
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-LVEF'), { target: { value: '35' } })
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-potassium'), { target: { value: '5.4' } })
    fireEvent.click(screen.getByTestId('cdss-hf-values-save'))

    await waitFor(() => {
      expect(screen.getByTestId('cdss-hf-phenotype-word')).toHaveTextContent('HFrEF')
    })
    const lvef = screen.getByTestId('cdss-hf-metric-LVEF')
    expect(lvef).toHaveTextContent('35%')
    expect(lvef).toHaveTextContent('門診輸入')
    expect(lvef).toHaveAttribute('data-entered', 'true')
    expect(lvef).toHaveAttribute('title', '紀錄：63.6%（2026-06-24）')
    const potassium = screen.getByTestId('cdss-hf-metric-potassium')
    expect(potassium).toHaveTextContent('5.4')
    expect(potassium).toHaveTextContent('門診輸入')
    // Block 2 is now the four HFrEF pillars, not the HFpEF five.
    expect(screen.getByTestId('cdss-hf-decisions-block'))
      .toHaveAttribute('data-pillar-pathway', 'hfrEF')
    expect(screen.getByTestId('cdss-hf-therapy-heart-failure-beta-blocker')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-hf-therapy-heart-failure-hfpef-glp1')).toBeNull()
    // It survives a reload for this chart, and only this chart.
    expect(window.localStorage.getItem(clinicVitalsStorageKey('status-line-patient')))
      .toContain('"LVEF"')

    // 「全部撤銷」 puts every value back on the record's own, in one act.
    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    fireEvent.click(screen.getByTestId('cdss-hf-values-clear-all'))
    fireEvent.click(screen.getByTestId('cdss-hf-values-clear-all'))

    await waitFor(() => {
      expect(screen.getByTestId('cdss-hf-phenotype-word')).toHaveTextContent('HFpEF')
    })
    expect(screen.getByTestId('cdss-hf-metric-LVEF')).toHaveTextContent('63.6%')
    expect(screen.getByTestId('cdss-hf-metric-LVEF')).not.toHaveAttribute('data-entered')
    expect(screen.getByTestId('cdss-hf-metric-potassium')).toHaveTextContent('4.3')
    expect(window.localStorage.getItem(clinicVitalsStorageKey('status-line-patient'))).toBeNull()
  })

  /**
   * The height is the measurement 健保雲端 usually does not hold, and without
   * it the BMI the ESC incretin row is written on cannot exist. Entered beside
   * the weight it does exist, the line prints it, and the recommendation
   * reaches a patient no diagnosis code would have reached.
   */
  it('turns an entered height and weight into a BMI the incretin row decides on', async () => {
    render(<LiveClinicalDecisionSupportFeature />)
    await screen.findByTestId('cdss-hf-board')

    // No height, so no BMI on the line, and the incretin tile is out of scope:
    // the record carries neither an E66 nor an E11 code.
    expect(screen.queryByTestId('cdss-hf-metric-bmi')).toBeNull()
    expect(screen.getByTestId('cdss-hf-therapy-heart-failure-hfpef-glp1'))
      .toHaveTextContent('不適用（BMI 未達 30 或無 BMI，且無 T2DM／肥胖診斷）')

    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    // The height sits right after the weight it is divided into, and the BMI
    // gets no box: it is derived, not entered.
    const dialog = screen.getByTestId('cdss-hf-values-dialog')
    expect(
      [...dialog.querySelectorAll('[data-testid^="cdss-hf-value-input-"]')]
        .map((input) => input.getAttribute('data-testid')?.replace('cdss-hf-value-input-', '')),
    ).toEqual([
      'LVEF', 'NTproBNP', 'potassium', 'eGFR', 'sodium',
      'bloodPressure', 'bloodPressure-diastolic', 'bodyWeight', 'height', 'heartRate',
    ])
    expect(screen.getByTestId('cdss-hf-value-record-height')).toHaveTextContent('紀錄 無')
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-height'), { target: { value: '150' } })
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-bodyWeight'), { target: { value: '70' } })
    fireEvent.click(screen.getByTestId('cdss-hf-values-save'))

    // 70 / 1.5² = 31.1 kg/m2.
    await waitFor(() => {
      expect(screen.getByTestId('cdss-hf-metric-bmi')).toHaveTextContent('31.1')
    })
    const bmi = screen.getByTestId('cdss-hf-metric-bmi')
    // Derived, so it is not editable and carries no undo of its own; undoing
    // the height or the weight is what removes it.
    expect(bmi).not.toHaveAttribute('data-editable')
    expect(screen.queryByTestId('cdss-hf-metric-undo-bmi')).toBeNull()
    expect(screen.queryByTestId('cdss-hf-metric-height')).toBeNull()

    // The Table 18 row now applies on the measurement alone — the record
    // carries no obesity and no diabetes code.
    const glp1 = screen.getByTestId('cdss-hf-therapy-heart-failure-hfpef-glp1')
    expect(glp1).toHaveTextContent('無處方')
    expect(glp1).toHaveTextContent(
      'BMI 31.1 kg/m²、LVEF 63.6%，符合 ESC 2026 Table 18 的「應考慮」條件（Class IIa）',
    )

    // Taking the height back takes the BMI with it, and the row with that.
    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-height'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('cdss-hf-values-save'))
    await waitFor(() => {
      expect(screen.queryByTestId('cdss-hf-metric-bmi')).toBeNull()
    })
    expect(screen.getByTestId('cdss-hf-therapy-heart-failure-hfpef-glp1'))
      .toHaveTextContent('不適用（BMI 未達 30 或無 BMI，且無 T2DM／肥胖診斷）')
    expect(screen.getByTestId('cdss-hf-metric-bodyWeight')).toHaveTextContent('70')
  })

  it('carries an entered potassium into the safety inputs, and takes it back one at a time', async () => {
    render(<LiveClinicalDecisionSupportFeature />)
    await screen.findByTestId('cdss-hf-board')

    fireEvent.click(screen.getByTestId('cdss-hf-values-trigger'))
    fireEvent.change(screen.getByTestId('cdss-hf-value-input-potassium'), { target: { value: '5.6' } })
    fireEvent.click(screen.getByTestId('cdss-hf-values-save'))

    await waitFor(() => {
      expect(screen.getByTestId('cdss-hf-metric-potassium')).toHaveTextContent('5.6')
    })
    expect(useClinicVitalsStore.getState().byPatientId['status-line-patient']?.entries?.potassium)
      .toMatchObject({ value: 5.6 })
    // The record's own ejection fraction is untouched by a potassium entry.
    expect(screen.getByTestId('cdss-hf-metric-LVEF')).toHaveTextContent('63.6%')

    // Taking one value back is a click on the line; it needs no dialog.
    fireEvent.click(screen.getByTestId('cdss-hf-metric-undo-potassium'))
    await waitFor(() => {
      expect(screen.getByTestId('cdss-hf-metric-potassium')).toHaveTextContent('4.3')
    })
    expect(window.localStorage.getItem(clinicVitalsStorageKey('status-line-patient'))).toBeNull()
  })
})
