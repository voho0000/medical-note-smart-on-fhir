import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Preview from '@/app/dev/af/preview'
import {
  clinicVitalsStorageKey,
  useClinicVitalsStore,
} from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import {
  physicianDecisionsStorageKey,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { storedCiphertext, useRealWebCrypto } from './encrypted-answers.helper'

function openPanels() {
  for (const id of ['diagnosis', 'prognosis'])
    fireEvent.click(within(screen.getByTestId(`cdss-af-${id}`)).getByRole('button'))
  fireEvent.click(
    within(screen.getByTestId('cdss-af-action-af-documented-cha2ds2-vasc')).getByRole('button'),
  )
}

describe('AF preview uses the same encrypted visit data as the live feature', () => {
  useRealWebCrypto()

  it('waits for reload hydration and keeps measurements and decisions with their patient', async () => {
    const patientId = 'synthetic-af-untreated'
    const now = new Date('2026-09-12T09:00:00+08:00')
    useClinicVitalsStore.getState().setVitals(
      patientId,
      {
        entries: { bodyWeight: { value: 62, measuredOn: '2026-09-12' } },
      },
      now,
    )
    usePhysicianDecisionsStore.getState().recordDecision(
      patientId,
      'af-documented-cha2ds2-vasc',
      {
        decision: 'reviewed',
        packVersion: '0.1.0-poc',
      },
      now,
    )
    await storedCiphertext(clinicVitalsStorageKey(patientId))
    await storedCiphertext(physicianDecisionsStorageKey(patientId))
    useClinicVitalsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
    usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    render(<Preview />)
    expect(screen.getByRole('status')).toHaveTextContent('正在讀取本次量測與處置紀錄')
    expect(screen.queryByTestId('cdss-af-visit-flow')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('cdss-af-visit-flow')).toBeInTheDocument())
    openPanels()
    expect(screen.getByTestId('cdss-af-diagnosis')).toHaveTextContent('62 kg')
    expect(screen.getByRole('combobox', { name: '血栓風險：處置' })).toHaveValue('reviewed')

    fireEvent.change(screen.getByRole('combobox', { name: '案例' }), {
      target: { value: 'apixaban' },
    })
    await waitFor(() => expect(screen.getByTestId('cdss-af-prognosis')).toBeInTheDocument())
    openPanels()
    expect(screen.getByTestId('cdss-af-diagnosis')).toHaveTextContent('55 kg')
    expect(
      within(screen.getByTestId('cdss-af-diagnosis')).queryByText(/62 kg/),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '血栓風險：處置' })).toHaveValue('')

    fireEvent.change(screen.getByRole('combobox', { name: '案例' }), {
      target: { value: 'untreated' },
    })
    await waitFor(() => expect(screen.getByTestId('cdss-af-visit-flow')).toBeInTheDocument())
    openPanels()
    expect(screen.getByTestId('cdss-af-diagnosis')).toHaveTextContent('62 kg')
    expect(screen.getByRole('combobox', { name: '血栓風險：處置' })).toHaveValue('reviewed')
  })
})
