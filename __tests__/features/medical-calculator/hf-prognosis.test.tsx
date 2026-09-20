/** @jest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { HF_PROGNOSIS_MODELS, evidenceForModel, matchesPrognosisRequest, type PrognosisRequest, type PrognosisResponse } from '@/features/medical-calculator/prognosis/models'
import { HfPrognosisModels } from '@/features/medical-calculator/prognosis/HfPrognosisModels'
import { hfPrognosisEvidence } from '@/features/clinical-decision-support/utils/hf-prognosis-evidence'
import { prognosisAutofillEvidence } from '@/features/medical-calculator/prognosis/autofill-evidence'

const request: PrognosisRequest = {
  requestId: 'request-1', patientId: 'synthetic-A', modelId: 'maggic', modelVersion: 'test-1',
  inputRevision: 'revision-1', endpoint: 'all-cause-mortality', horizons: ['1-year', '3-year'],
  setting: 'chronic-hf', inputs: {},
}
const response: PrognosisResponse = {
  requestId: 'request-1', patientId: 'synthetic-A', modelId: 'maggic', modelVersion: 'test-1',
  inputRevision: 'revision-1', endpoint: 'all-cause-mortality', calculatedAt: '2026-09-17T01:00:00Z',
  estimates: [{ horizon: '1-year', probability: 0.1 }, { horizon: '3-year', probability: 0.2 }],
}

describe('HF prognosis calculator boundary', () => {
  it('does not use current outpatient values as admission values', () => {
    const input = { bloodPressure: { value: '120/80', date: '2026-09-17' } }
    expect(evidenceForModel(HF_PROGNOSIS_MODELS[0], input)).toBe(input)
    expect(evidenceForModel(HF_PROGNOSIS_MODELS[2], input)).toEqual({})
  })
  it('preserves source text and date without treating missing diagnoses or medication as negative', () => {
    const fields = hfPrognosisEvidence({ serumCreatinine: { en: '90 µmol/L', zh: '90 µmol/L', date: '2026-08-01', sources: [{ resourceType: 'Observation', resourceId: 'cr-1' }] } }, false)
    expect(fields.serumCreatinine).toEqual({ value: '90 µmol/L', date: '2026-08-01', source: 'Observation/cr-1' })
    expect(fields.diabetes).toBeUndefined()
    expect(fields.aceArb).toBeUndefined()
  })
  it('accepts only results for the requested patient, model, version, inputs and endpoint', () => {
    expect(matchesPrognosisRequest(request, response)).toBe(true)
    for (const key of ['requestId', 'patientId', 'modelId', 'modelVersion', 'inputRevision', 'endpoint']) {
      expect(matchesPrognosisRequest(request, { ...response, [key]: 'wrong' })).toBe(false)
    }
  })
  it('rejects wrong horizons, non-probabilities, invalid dates and admission requests without an encounter', () => {
    for (const probability of [-0.1, 1.1, NaN, Infinity]) {
      expect(matchesPrognosisRequest(request, { ...response, estimates: [{ horizon: '1-year', probability }, response.estimates[1]] })).toBe(false)
    }
    expect(matchesPrognosisRequest(request, { ...response, estimates: [response.estimates[0], response.estimates[0]] })).toBe(false)
    expect(matchesPrognosisRequest(request, { ...response, estimates: [{ horizon: '5-year', probability: 0.1 }, response.estimates[1]] })).toBe(false)
    expect(matchesPrognosisRequest(request, { ...response, calculatedAt: 'invalid' })).toBe(false)
    expect(matchesPrognosisRequest({ ...request, setting: 'hf-admission' }, response)).toBe(false)
  })
  it('uses serum-specific autofill and preserves source units for review', () => {
    const resolve = jest.fn(source => source?.kind === 'labSpecimen' && source.specimen === 'blood' && source.keys[0] === 'CREA' ? { value: 90, unit: 'µmol/L', date: '2026-08-01' } : undefined)
    expect(prognosisAutofillEvidence({ resolve }).serumCreatinine?.value).toBe('90 µmol/L')
  })
  it('opens the shared calculator with references but never presents an uncomputed risk', () => {
    render(<HfPrognosisModels locale="zh-TW" evidence={{ LVEF: { value: '30%', date: '2026-09-01' } }} />)
    const card = screen.getByTestId('hf-prognosis-model-maggic')
    fireEvent.click(card.querySelector('summary')!)
    fireEvent.click(screen.getByTestId('open-prognosis-calculator-maggic'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('status')).toHaveTextContent('尚未計算風險')
    expect(within(dialog).getByText('30%')).toBeVisible()
    expect(within(dialog).getByRole('link', { name: /Pocock/ })).toHaveAttribute('href', 'https://pubmed.ncbi.nlm.nih.gov/23095984/')
    expect(within(dialog).getByRole('link', { name: '開啟外部計算機' })).toHaveAttribute('href', 'https://www.heartfailurerisk.org/')
  })
})
