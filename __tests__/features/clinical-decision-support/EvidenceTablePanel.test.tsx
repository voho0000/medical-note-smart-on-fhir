/**
 * The itemised evidence, rendered from a table the pack actually produced.
 *
 * A literal table would prove only that the component can render a literal.
 * The rows here come from the real chain the app runs — app entities in,
 * `createFhirCdssPatientProfile`, the heart-failure pack, out — so a change to
 * the row ids, the categories, or the counting shows up here rather than in
 * production.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createFhirCdssPatientProfile } from '@voho0000/personalized-care-fhir'
import { HEART_FAILURE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { EvidenceTablePanel } from '@/features/clinical-decision-support/renderers/EvidenceTablePanel'
import {
  getEvidenceOverrides,
  useEvidenceOverridesStore,
} from '@/features/clinical-decision-support/stores/evidence-overrides.store'
import type { EvidenceTable } from '@/features/clinical-decision-support/types'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type {
  DiagnosticReportEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'
const PATIENT_ID = 'evidence-panel-patient'

const patient: PatientEntity = {
  id: PATIENT_ID,
  resourceType: 'Patient',
  age: 78,
}

const ntProBnp: ObservationEntity = {
  id: 'nt-probnp-latest',
  resourceType: 'Observation',
  status: 'final',
  effectiveDateTime: '2026-07-20',
  code: {
    coding: [{ system: LOINC_SYSTEM, code: '33762-6', display: 'NT-proBNP' }],
  },
  valueQuantity: { value: 3200, unit: 'pg/mL', system: UCUM_SYSTEM, code: 'pg/mL' },
}

const lvef: ObservationEntity = {
  id: 'lvef-latest',
  resourceType: 'Observation',
  status: 'final',
  effectiveDateTime: '2026-07-18',
  code: {
    coding: [{ system: LOINC_SYSTEM, code: '10230-1', display: 'Left ventricular ejection fraction' }],
  },
  valueQuantity: { value: 32, unit: '%', system: UCUM_SYSTEM, code: '%' },
}

const chestXray: DiagnosticReportEntity = {
  id: 'cxr-2026-07-19',
  status: 'final',
  effectiveDateTime: '2026-07-19',
  code: { text: 'Chest X-ray', coding: [{ code: '32001C', display: 'Chest PA' }] },
  conclusion: 'Cardiomegaly with bilateral pleural effusion and pulmonary congestion.',
}

function congestionTable(): EvidenceTable {
  const profile = createFhirCdssPatientProfile({
    patient,
    conditions: [{
      id: 'hf-condition',
      code: {
        coding: [{ system: ICD10_SYSTEM, code: 'I50.22', display: 'Chronic systolic heart failure' }],
      },
      clinicalStatus: 'active',
    }],
    encounters: [],
    observations: [ntProBnp, lvef],
    medications: [],
    allergies: [],
    carePlans: [],
    procedures: [],
    immunizations: [],
    diagnosticReports: [chestXray],
    documentReferences: [],
    now: new Date('2026-07-29T00:00:00Z'),
  })

  const result = HEART_FAILURE_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
  const table = result.recommendations
    .flatMap((recommendation) => recommendation.evidenceTables ?? [])
    .find((candidate) => candidate.concept === 'congestion')

  if (!table) throw new Error('the heart-failure pack produced no congestion evidence table')
  return table
}

function renderPanel(table: EvidenceTable, patientId: string | undefined = PATIENT_ID) {
  return render(
    <EvidenceTablePanel
      table={table}
      recommendationId="heart-failure-congestion-diuretic"
      locale="zh-TW"
      patientId={patientId}
      onNavigate={jest.fn()}
    />,
  )
}

describe('EvidenceTablePanel', () => {
  beforeEach(() => {
    useEvidenceOverridesStore.setState({ byPatientId: {} })
    window.localStorage.clear()
  })

  it('heads the table with the concept and the counts the pack computed', () => {
    const table = congestionTable()
    renderPanel(table)

    expect(screen.getByRole('region', { name: '鬱血證據' })).toBeInTheDocument()
    expect(screen.getByTestId('cdss-evidence-counts-congestion')).toHaveTextContent(
      `支持 ${table.supportsCount} · 不支持 ${table.againstCount} · 無法判定 ${table.unknownCount}`,
    )
  })

  it('renders the record-derived rows with their value and direction', () => {
    renderPanel(congestionTable())

    const ntProBnpRow = screen.getByTestId('cdss-evidence-row-congestion:nt-probnp')
    expect(within(ntProBnpRow).getByText('NT-proBNP')).toBeInTheDocument()
    expect(ntProBnpRow).toHaveTextContent('3200 pg/mL')
    expect(screen.getByTestId('cdss-evidence-direction-congestion:nt-probnp'))
      .toHaveTextContent('支持')

    expect(screen.getByTestId('cdss-evidence-direction-congestion:loop-dose-increase'))
      .toHaveTextContent('無法判定')
  })

  it('groups the rows biomarker → weight → imaging → examination → context', () => {
    renderPanel(congestionTable())

    const groupOrder = screen.getAllByTestId(/^cdss-evidence-group-/)
      .map((group) => group.getAttribute('data-testid'))

    expect(groupOrder).toEqual([
      'cdss-evidence-group-biomarker',
      'cdss-evidence-group-weight',
      'cdss-evidence-group-imaging',
      'cdss-evidence-group-examination',
      'cdss-evidence-group-context',
    ])
  })

  it('marks the physician-entered signs and leaves them switched off', () => {
    renderPanel(congestionTable())

    const jvpRow = screen.getByTestId('cdss-evidence-row-congestion:jvp')
    expect(within(jvpRow).getByText('醫師填')).toBeInTheDocument()
    expect(jvpRow).toHaveAttribute('data-enabled', 'false')
    expect(screen.getByTestId('cdss-evidence-switch-congestion:jvp'))
      .toHaveAttribute('aria-checked', 'false')

    // A record-derived row inside the reading arrives switched on.
    expect(screen.getByTestId('cdss-evidence-row-congestion:cxr'))
      .toHaveAttribute('data-enabled', 'true')
  })

  it('shows the matched terms and the quoted report sentence behind an imaging row', () => {
    renderPanel(congestionTable())

    const sources = screen.getByTestId('cdss-evidence-sources-congestion:cxr')
    expect(within(sources).getByText('cardiomegaly')).toBeInTheDocument()
    expect(within(sources).getByText('pleural-effusion')).toBeInTheDocument()
    expect(sources).toHaveTextContent('檢查報告')
    expect(sources).toHaveTextContent('2026-07-19')
    expect(sources).toHaveTextContent(
      'Cardiomegaly with bilateral pleural effusion and pulmonary congestion',
    )
  })

  it('writes a toggle to the override store under this patient', () => {
    renderPanel(congestionTable())

    fireEvent.click(screen.getByTestId('cdss-evidence-switch-congestion:cxr'))
    expect(getEvidenceOverrides(PATIENT_ID)).toEqual({ 'congestion:cxr': false })

    fireEvent.click(screen.getByTestId('cdss-evidence-switch-congestion:jvp'))
    expect(getEvidenceOverrides(PATIENT_ID)).toEqual({
      'congestion:cxr': false,
      'congestion:jvp': true,
    })
  })

  it('renders a stored override instead of the pack default', () => {
    useEvidenceOverridesStore.getState().setOverride(PATIENT_ID, 'congestion:cxr', false)
    renderPanel(congestionTable())

    expect(screen.getByTestId('cdss-evidence-row-congestion:cxr'))
      .toHaveAttribute('data-enabled', 'false')
  })

  it('lists the limitations under the table', () => {
    const table = congestionTable()
    renderPanel(table)

    const limitations = screen.getByTestId('cdss-evidence-limitations-congestion')
    expect(within(limitations).getAllByRole('listitem')).toHaveLength(table.limitations.length)
    expect(limitations).toHaveTextContent(table.limitations[0])
  })
})
