// 總覽 → 檢驗 → 自訂: the same analyte × collection-day pivot as 常用／全部,
// with the clinician's own rows in their own order.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'
import { OverviewLabsSection } from '@/features/clinical-summary/overview/components/OverviewLabsSection'
import type { OverviewLabRow, OverviewLabsData } from '@/features/clinical-summary/overview/hooks/useOverviewData'
import type { LabCell } from '@/src/shared/utils/lab-pivot.utils'
import { useOutpatientPrefsStore } from '@/src/application/stores/outpatient-prefs.store'

jest.mock('@/src/application/providers/language.provider', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { zhTW: translations } = require('@/src/shared/i18n/locales/zh-TW')
  return { useLanguage: () => ({ t: translations, locale: 'zh-TW' }) }
})
jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))
jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: { uid: 'doc-1' }, anonymousUid: null }),
}))
const mockRevealTab = jest.fn()
jest.mock('@/src/application/providers/right-panel.provider', () => ({
  useRightPanel: () => ({ revealTab: mockRevealTab }),
}))

const cell = (value: string, high = false): LabCell => ({
  value,
  ...(high ? { isAbnormal: true, interpretationCode: 'H' } : {}),
})

function row(testKey: string, name: string, cells: (LabCell | undefined)[], categoryId = 'chem'): OverviewLabRow {
  return {
    mapKey: `${categoryId}:${testKey}`,
    categoryId,
    categoryLabel: '生化',
    testKey,
    name,
    isPinned: false,
    hasAbnormal: cells.some((c) => c?.isAbnormal),
    cells,
  }
}

// Two collection days inside the window; NT-proBNP was last done outside it.
const DATA: OverviewLabsData = {
  columns: [{ day: '2026-06-30', institution: '示範醫院' }, { day: '2026-09-18', institution: '示範醫院' }],
  rows: [
    row('CREA', 'CREA', [cell('1.28', true), cell('1.32', true)]),
    row('ALT', 'ALT', [undefined, cell('22')]),
    row('AST', 'AST', [undefined, cell('30')]),
  ],
  pinnedRowCount: 2,
  hiddenDayCount: 0,
  resultCount: 4,
  abnormalCount: 2,
  unpivotedCount: 0,
  navResourceId: 'o1',
}

function renderSection(data: OverviewLabsData = DATA) {
  return render(<OverviewLabsSection data={data} fit={{ bounded: false }} />)
}

const card = () => within(document.getElementById('overview-section-labs')!)

describe('OverviewLabsSection — 自訂', () => {
  beforeEach(() => {
    useOutpatientPrefsStore.setState({ byUser: {} })
    mockRevealTab.mockReset()
  })

  it('offers to choose pins when there are none yet', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: zhTW.overview.labs.mine }))
    expect(screen.getByText(zhTW.overview.myLabs.empty)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: zhTW.overview.myLabs.emptyAction }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('draws the same date-column pivot, with only the pinned rows in the chosen order', () => {
    useOutpatientPrefsStore.getState().update('doc-1', {
      pinnedLabs: ['chem:NT-PROBNP', 'chem:ALT', 'chem:CREA', 'note:Digoxin 濃度'],
      labMode: 'mine',
    })
    renderSection()
    // Date columns, exactly as 常用 shows them (jsdom has no width, so the
    // card's column budget keeps only the newest day).
    expect(card().getByText('09/18')).toBeInTheDocument()
    expect(card().getByText('1.32 ↑')).toBeInTheDocument()
    expect(card().getByText('22')).toBeInTheDocument()
    // ALT without AST.
    expect(card().queryByText('AST')).not.toBeInTheDocument()
    // A pin with nothing in the window keeps its (empty) row; so does a reminder.
    const names = card().getAllByText(/^(NT-proBNP|ALT|CREA|Digoxin 濃度)$/).map((node) => node.textContent)
    expect(names).toEqual(['NT-proBNP', 'ALT', 'CREA', 'Digoxin 濃度'])
  })

  it('says so when no pinned test has a result in the period', () => {
    useOutpatientPrefsStore.getState().update('doc-1', { pinnedLabs: ['chem:NT-PROBNP'], labMode: 'mine' })
    renderSection()
    expect(card().getByText(zhTW.overview.myLabs.noneInRange)).toBeInTheDocument()
    expect(card().getByRole('button', { name: zhTW.overview.labs.editPinned })).toBeInTheDocument()
  })

  it('keeps the header the same as the other filters', () => {
    useOutpatientPrefsStore.getState().update('doc-1', { pinnedLabs: ['chem:CREA'], labMode: 'mine' })
    renderSection()
    expect(card().getByRole('button', { name: zhTW.overview.expandList })).toBeInTheDocument()
  })

  it('opens the handoff tab from the card', () => {
    useOutpatientPrefsStore.getState().update('doc-1', { pinnedLabs: ['chem:CREA'], labMode: 'mine' })
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: zhTW.overview.labs.handoff }))
    expect(mockRevealTab).toHaveBeenCalledWith('ips-export')
  })

  it('saves pins picked one by one in the editor', () => {
    useOutpatientPrefsStore.getState().update('doc-1', { pinnedLabs: ['chem:CREA'], labMode: 'mine' })
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: zhTW.overview.labs.editPinned }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByRole('searchbox'), { target: { value: 'alt' } })
    fireEvent.click(dialog.getByRole('button', { pressed: false, name: /^ALT/ }))
    fireEvent.click(dialog.getByRole('button', { name: zhTW.common.save }))
    expect(useOutpatientPrefsStore.getState().byUser['doc-1'].pinnedLabs).toEqual(['chem:CREA', 'chem:ALT'])
  })

  it('says plainly when a searched test is not recognised, and can keep a reminder row', () => {
    useOutpatientPrefsStore.getState().update('doc-1', { pinnedLabs: [], labMode: 'mine' })
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: zhTW.overview.myLabs.emptyAction }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByRole('searchbox'), { target: { value: 'digoxin' } })
    expect(dialog.getByText(zhTW.overview.myLabs.editor.unsupportedTitle.replace('{query}', 'digoxin'))).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: new RegExp(zhTW.overview.myLabs.editor.addReminder) }))
    fireEvent.click(dialog.getByRole('button', { name: zhTW.common.save }))
    expect(useOutpatientPrefsStore.getState().byUser['doc-1'].pinnedLabs).toEqual(['note:digoxin'])
  })
})
