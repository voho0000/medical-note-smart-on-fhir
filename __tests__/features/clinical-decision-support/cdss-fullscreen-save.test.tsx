import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { CdssStorageActions } from '@/features/clinical-decision-support/renderers/CdssStorageActions'
import { cancelCdssGatewayRequests, saveCdssSnapshot } from '@/features/clinical-decision-support/telemetry/cdss-gateway'

jest.mock('@/features/clinical-decision-support/telemetry/cdss-gateway', () => ({
  cdssGatewayStatus: () => ({ enabled: true }),
  cancelCdssGatewayRequests: jest.fn(),
  saveCdssSnapshot: jest.fn(),
}))

const input: Parameters<typeof CdssStorageActions>[0]['input'] = {
  patient: { id: 'synthetic', resourceType: 'Patient' }, packId: 'synthetic',
  profile: { id: 'synthetic', facts: {} },
  result: { packId: 'synthetic', packVersion: '1', title: 'Synthetic', summary: 'Synthetic',
    recommendations: [], notEvaluated: [], disclaimer: 'Synthetic' },
  physicianInputs: {}, physicianDecisions: {},
}

test.each([false, true])('moving the save between panel and full-window header preserves the pending request (English=%s)', async english => {
  jest.clearAllMocks()
  let complete!: () => void
  jest.mocked(saveCdssSnapshot).mockImplementation(() => new Promise<void>(resolve => { complete = resolve }))
  const sourceRecords = jest.fn(() => [])
  const target = document.createElement('div')
  document.body.append(target)
  const view = render(<CdssStorageActions input={input} sourceRecords={sourceRecords} english={english} />)
  try {
    view.rerender(<CdssStorageActions input={input} sourceRecords={sourceRecords} english={english} saveTarget={target} />)
    const button = within(target).getByTestId('cdss-save-record')
    expect(screen.getAllByTestId('cdss-save-record')).toHaveLength(1)
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveTextContent(english ? 'Saving…' : '儲存中…')
    fireEvent.click(button)
    view.rerender(<CdssStorageActions input={input} sourceRecords={sourceRecords} english={english} />)
    expect(target).toBeEmptyDOMElement()
    expect(screen.getByTestId('cdss-save-record')).toBeDisabled()
    expect(cancelCdssGatewayRequests).not.toHaveBeenCalled()
    expect(saveCdssSnapshot).toHaveBeenCalledTimes(1)
    expect(sourceRecords).toHaveBeenCalledTimes(1)
    expect(saveCdssSnapshot).toHaveBeenCalledWith({ ...input, sourceRecords: [] })
    await act(async () => complete())
    expect(screen.getByTestId('cdss-save-record')).toBeEnabled()
    expect(screen.getByTestId('cdss-save-record')).toHaveTextContent(english ? 'Save CDSS record' : '儲存 CDSS 紀錄')
  } finally {
    view.unmount()
    target.remove()
  }
})
