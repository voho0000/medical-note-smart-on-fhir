// The 資料選擇 panel drives the "working" AI (chat + insights) as one selection;
// IPS is configured independently on its own tab. These lock the decoupling:
// panel edits never touch ips, and the per-consumer setters never touch the panel.
import { renderHook, act } from '@testing-library/react'
import { DataSelectionProvider, useDataSelection, coerceProfile } from '@/src/application/providers/data-selection.provider'
import { IPS_DEFAULT_DATA_FILTERS } from '@/src/shared/constants/data-selection.constants'

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
    act(() => result.current.applyPreset('followUp'))
    expect(result.current.activePreset).toBe('followUp')
    expect(result.current.getProfile('chat').selection.medicalDevices).toBe(false)
    expect(result.current.getProfile('insights').selection.medicalDevices).toBe(false)
    // Follow-up now uses an event-based window (since the previous visit) rather
    // than a fixed 3-month wall-clock window.
    expect(result.current.getProfile('chat').filters.labReportTimeRange).toBe('sinceLastVisit')
    expect(result.current.getProfile('ips').selection.observations).toBe(false) // untouched
  })

  it('selectAllData turns on every category, opens all-time windows, and sets documents to all', () => {
    const { result } = setup()
    act(() => result.current.selectAllData())
    const chat = result.current.getProfile('chat')
    // every category on
    expect(Object.values(chat.selection).every((v, i) =>
      // observations is the hidden legacy field (stays false); everything else true
      Object.keys(chat.selection)[i] === 'observations' ? v === false : v === true,
    )).toBe(true)
    // windows opened
    expect(chat.filters.labReportTimeRange).toBe('all')
    expect(chat.filters.encounterTimeRange).toBe('all')
    expect(chat.filters.medicationTimeRange).toBe('all')
    expect(chat.filters.labPanelIds).toBe('')
    expect(chat.filters.labTrendPoints).toBe('16')
    expect(chat.documentMode).toBe('all')
    // broadcast to insights, never ips
    expect(result.current.getProfile('insights').filters.labReportTimeRange).toBe('all')
    expect(result.current.getProfile('ips').filters.labReportTimeRange).toBe('6m')
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

  it('defaults to 初診 and keeps the selected mode while the user tweaks it', () => {
    const { result } = setup()
    expect(result.current.activePreset).toBe('newPatient')
    act(() => result.current.updateSelection('problemList', false))
    expect(result.current.activePreset).toBe('newPatient')
    expect(result.current.getProfile('chat').selection.problemList).toBe(false)
  })

  it('custom starts from 初診 and auto-saves edits made in custom mode', () => {
    const { result } = setup()
    act(() => result.current.applyPreset('custom'))
    expect(result.current.activePreset).toBe('custom')
    expect(result.current.getProfile('chat').selection.problemList).toBe(true)

    act(() => result.current.updateSelection('problemList', false))
    expect(result.current.getProfile('chat').selection.problemList).toBe(false)

    act(() => result.current.applyPreset('followUp'))
    expect(result.current.getProfile('chat').selection.problemList).toBe(true)

    act(() => result.current.applyPreset('custom'))
    expect(result.current.getProfile('chat').selection.problemList).toBe(false)
  })

  it('seeds the ips profile with latestPerAnalyte labs — chat/insights keep the working default', () => {
    const { result } = setup()
    expect(result.current.getProfile('ips').filters.labReportVersion).toBe('latestPerAnalyte')
    expect(result.current.getProfile('chat').filters.labReportVersion).toBe('all')
    expect(result.current.getProfile('insights').filters.labReportVersion).toBe('all')
  })

  it('coerceProfile keeps a stored labReportVersion choice over the ips seed', () => {
    // 既有使用者在 IPS profile 存過 'all' → 升級後不得被 seed 蓋掉。
    const kept = coerceProfile({ filters: { labReportVersion: 'all' } as never }, IPS_DEFAULT_DATA_FILTERS)
    expect(kept.filters.labReportVersion).toBe('all')
    // 沒存過 → 用 ips seed。
    const seeded = coerceProfile(undefined, IPS_DEFAULT_DATA_FILTERS)
    expect(seeded.filters.labReportVersion).toBe('latestPerAnalyte')
  })

  it('resetToDefaults restores the currently selected mode baseline', () => {
    const { result } = setup()
    act(() => result.current.applyPreset('followUp'))
    act(() => result.current.updateSelection('medicalDevices', true))
    expect(result.current.getProfile('chat').selection.medicalDevices).toBe(true)

    act(() => result.current.resetToDefaults())
    expect(result.current.activePreset).toBe('followUp')
    expect(result.current.getProfile('chat').selection.medicalDevices).toBe(false)
  })
})
