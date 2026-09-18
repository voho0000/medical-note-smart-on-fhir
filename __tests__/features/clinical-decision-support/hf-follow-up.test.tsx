import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { HfFollowUpPriorities } from '@/features/clinical-decision-support/renderers/HfFollowUpPriorities'
import { hfFollowUpHistory } from '@/features/clinical-decision-support/utils/hf-follow-up'
import { mergeClinicVitals, type ClinicVitals } from '@/features/clinical-decision-support/stores/clinic-vitals.store'

const now = new Date('2026-09-17T10:00:00+08:00')
it('shows all visits chronologically with notes, measured differences and separate reported changes', () => {
  render(<HfFollowUpPriorities now={now} isEnglish={false} onBreathDetails={() => {}}
    history={{ complaints: [
      { text: '走路喘', date: '2026-09-17', source: 'clinic', change: 'improved', comparedWith: '2026-09-10', note: '可走較遠' },
      { text: '走路喘', date: '2026-09-01', source: 'Observation/old' },
      { text: '走路喘', date: '2026-09-10', source: 'clinic', change: 'worse' },
      { text: '未來紀錄', date: '2026-09-20', source: 'clinic' },
    ], weights: [
      { value: 72, date: '2026-09-10', source: 'clinic' },
      { value: 70, date: '2026-09-01', source: 'clinic' },
    ], weightChanges: [{ date: '2026-09-17', value: 'decreased' }] }} />)
  const history = screen.getByTestId('cdss-followup-history')
  const visits = within(history).getAllByRole('listitem')
  expect(visits.map(item => item.getAttribute('data-date'))).toEqual(['2026-09-01', '2026-09-10', '2026-09-17'])
  expect(visits[0]).toHaveTextContent('未評估變化')
  expect(visits[1]).toHaveTextContent('惡化')
  expect(visits[1]).toHaveTextContent('相較 2026-09-01：+2.0 kg')
  expect(visits[2]).toHaveTextContent('進步 (相較 2026-09-10)')
  expect(visits[2]).toHaveTextContent('可走較遠')
  expect(visits[2]).toHaveTextContent('回報體重變化：減少')
  expect(history).not.toHaveTextContent('未來紀錄')
})
it('imports explicit chief complaints and dated weights, rejects unknown units and cancelled observations', () => {
  const history = hfFollowUpHistory([
    { id: 'cc', code: { text: '主訴' }, valueString: '走路喘', effectiveDateTime: '2026-09-10' },
    { id: 'dx', code: { text: '診斷' }, valueString: 'HF', effectiveDateTime: '2026-09-10' },
    { id: 'kg', code: { text: 'Weight' }, valueQuantity: { value: 70, unit: 'kg' }, effectiveDateTime: '2026-09-10' },
    { id: 'bad', code: { text: 'Weight' }, valueQuantity: { value: 150, unit: 'unknown' }, effectiveDateTime: '2026-09-11' },
    { id: 'cancel', status: 'entered-in-error', code: { text: 'Weight' }, valueQuantity: { value: 80, unit: 'kg' }, effectiveDateTime: '2026-09-12' },
  ])
  expect(history.complaints).toEqual([{ text: '走路喘', date: '2026-09-10', source: 'Observation/cc' }])
  expect(history.weights).toEqual([{ value: 70, date: '2026-09-10', source: 'Observation/kg' }])
})

it('retains dated weight history, corrects the same day and preserves unrelated answers', () => {
  let vitals = mergeClinicVitals(undefined, { entries: { bodyWeight: { value: 70, measuredOn: '2026-09-10' } }, nyhaClass: 'II' }, now)
  vitals = mergeClinicVitals(vitals, { entries: { bodyWeight: { value: 71, measuredOn: '2026-09-17' } } }, now)
  vitals = mergeClinicVitals(vitals, { entries: { bodyWeight: { value: 72, measuredOn: '2026-09-17' } } }, now)
  expect(vitals.hfFollowUp?.weights.map(point => point.value)).toEqual([70, 72])
  expect(vitals.nyhaClass?.value).toBe('II')
})

it('carries the complaint but requires fresh status, and saves weight through the shared vitals path', () => {
  function View() {
    const [vitals, setVitals] = useState<ClinicVitals>(() => mergeClinicVitals(undefined, { hfFollowUp: { complaints: [{ text: '走路喘', date: '2026-09-10', source: 'clinic', change: 'improved' }], weights: [{ value: 70, date: '2026-09-10', source: 'clinic' }] } }, now))
    return <HfFollowUpPriorities now={now} isEnglish={false} vitals={vitals} onSave={patch => setVitals(current => mergeClinicVitals(current, patch, now))} onBreathDetails={() => {}} />
  }
  render(<View />)
  expect(screen.getByText('請確認本次症狀變化')).toBeVisible()
  expect(screen.getByRole('button', { name: '進步' })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(screen.getByRole('button', { name: '惡化' }))
  expect(screen.getByText('主訴加重・請於本次評估')).toBeVisible()
  expect(screen.getByTestId('cdss-weight-records')).not.toHaveAttribute('open')
  fireEvent.click(screen.getByRole('button', { name: '增加' }))
  expect(screen.getByRole('button', { name: '增加' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByTestId('cdss-weight-records').querySelector('summary')!)
  fireEvent.change(screen.getByLabelText('輸入體重（kg）'), { target: { value: '72' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存體重' }))
  expect(screen.getByText('本日：72.0 kg')).toBeVisible()
  expect(screen.getByText(/Δ 2.0 kg/)).toBeVisible()
  expect(screen.getByRole('img', { name: /體重趨勢/ })).toBeVisible()
})
