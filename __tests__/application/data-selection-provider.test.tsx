// The 資料選擇 panel drives the "working" AI (chat + insights) as one selection;
// IPS is configured independently on its own tab. These lock the decoupling:
// panel edits never touch ips, and the per-consumer setters never touch the panel.
import { renderHook, act } from '@testing-library/react'
import { DataSelectionProvider, useDataSelection } from '@/src/application/providers/data-selection.provider'

beforeEach(() => localStorage.clear())

function setup() {
  return renderHook(() => useDataSelection(), { wrapper: DataSelectionProvider })
}

describe('DataSelectionProvider — chat+insights panel vs decoupled ips', () => {
  it('panel updateSelection broadcasts to chat + insights, never ips', () => {
    const { result } = setup()
    act(() => result.current.updateSelection('medications', false))
    expect(result.current.getProfile('chat').selection.medications).toBe(false)
    expect(result.current.getProfile('insights').selection.medications).toBe(false)
    expect(result.current.getProfile('ips').selection.medications).toBe(true) // untouched
  })

  it('applyPreset (template fill) loads chat + insights, not ips', () => {
    const { result } = setup()
    // 初診 (newPatient) turns 其他觀察 (observations) ON.
    act(() => result.current.applyPreset('newPatient'))
    expect(result.current.getProfile('chat').selection.observations).toBe(true)
    expect(result.current.getProfile('insights').selection.observations).toBe(true)
    expect(result.current.getProfile('ips').selection.observations).toBe(false) // untouched
  })

  it('updateSelectionFor edits only the named consumer', () => {
    const { result } = setup()
    act(() => result.current.updateSelectionFor('ips', 'medications', false))
    expect(result.current.getProfile('ips').selection.medications).toBe(false)
    expect(result.current.getProfile('chat').selection.medications).toBe(true) // untouched
    expect(result.current.getProfile('insights').selection.medications).toBe(true)
  })

  it('setFiltersFor edits only the named consumer filters', () => {
    const { result } = setup()
    const next = { ...result.current.getProfile('ips').filters, labReportTimeRange: '1y' as const }
    act(() => result.current.setFiltersFor('ips', next))
    expect(result.current.getProfile('ips').filters.labReportTimeRange).toBe('1y')
    expect(result.current.getProfile('chat').filters.labReportTimeRange).toBe('6m') // default, untouched
  })

  it('activePreset is derived from the live selection (catch-all = general)', () => {
    const { result } = setup()
    expect(result.current.activePreset).toBe('general') // default baseline
    act(() => result.current.applyPreset('newPatient'))
    expect(result.current.activePreset).toBe('newPatient')
    act(() => result.current.updateSelection('problemList', false)) // hand-tune off the preset
    expect(result.current.activePreset).toBe('general') // falls back
  })
})
