// 總覽 → 檢驗 → 我的固定: the clinician's own pins, each with its own latest
// result and date, independent of the overview window.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'
import { OverviewLabsSection } from '@/features/clinical-summary/overview/components/OverviewLabsSection'
import type { OverviewLabsData } from '@/features/clinical-summary/overview/hooks/useOverviewData'
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
const mockSetActiveTab = jest.fn()
jest.mock('@/src/application/providers/right-panel.provider', () => ({
  useRightPanel: () => ({ revealTab: mockSetActiveTab }),
}))

function obs(id: string, code: string, date: string, value: number, unit: string, interpretation?: string) {
  return {
    resourceType: 'Observation',
    id,
    status: 'final',
    code: { text: code },
    effectiveDateTime: `${date}T09:00:00+08:00`,
    valueQuantity: { value, unit },
    ...(interpretation ? { interpretation: [{ coding: [{ code: interpretation }] }] } : {}),
  }
}

const OBSERVATIONS = [
  obs('o1', 'CREA', '2026-09-18', 1.32, 'mg/dL', 'H'),
  obs('o2', 'CREA', '2026-06-30', 1.28, 'mg/dL', 'H'),
  obs('o3', 'ALT', '2026-09-18', 22, 'U/L'),
  obs('o4', 'AST', '2026-09-18', 30, 'U/L'),
  obs('o5', 'NT-PROBNP', '2025-11-02', 2105, 'pg/mL', 'H'),
]

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => ({ observations: OBSERVATIONS }),
}))

const EMPTY_DATA: OverviewLabsData = {
  columns: [],
  rows: [],
  pinnedRowCount: 0,
  hiddenDayCount: 0,
  resultCount: 0,
  abnormalCount: 0,
  unpivotedCount: 0,
}

function renderSection() {
  return render(<OverviewLabsSection data={EMPTY_DATA} fit={{ bounded: false }} />)
}

describe('OverviewLabsSection — 我的固定', () => {
  beforeEach(() => {
    useOutpatientPrefsStore.setState({ byUser: {} })
    mockSetActiveTab.mockReset()
  })

  it('offers to choose pins when there are none yet', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: zhTW.overview.labs.mine }))
    expect(screen.getByText(zhTW.overview.myLabs.empty)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: zhTW.overview.myLabs.emptyAction }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows each pin in the chosen order with its own latest date, even outside the overview window', () => {
    useOutpatientPrefsStore.getState().update('doc-1', {
      pinnedLabs: ['chem:NT-PROBNP', 'chem:ALT', 'chem:CREA', 'lipid:LDL', 'note:Digoxin 濃度'],
      labMode: 'mine',
    })
    renderSection()
    const card = within(document.getElementById('overview-section-labs')!)
    // NT-proBNP from last year still shows, with its full date.
    expect(card.getByText('NT-proBNP')).toBeInTheDocument()
    expect(card.getByText('2105 ↑')).toBeInTheDocument()
    expect(card.getByText(/^2025\/11\/02 · /)).toBeInTheDocument()
    // ALT without AST.
    expect(card.getByText('22')).toBeInTheDocument()
    expect(card.queryByText('AST')).not.toBeInTheDocument()
    // Latest and previous creatinine, each with its date.
    expect(card.getByText('1.32 ↑')).toBeInTheDocument()
    expect(card.getByText('1.28 ↑')).toBeInTheDocument()
    // A pin with no result keeps its row and says so.
    expect(card.getByText(zhTW.overview.myLabs.noResult)).toBeInTheDocument()
    // A reminder row for an unsupported test.
    expect(card.getByText('Digoxin 濃度')).toBeInTheDocument()
    expect(card.getByText(zhTW.overview.myLabs.reminderBadge)).toBeInTheDocument()

    const labels = card.getAllByText(/^(NT-proBNP|ALT|CREA|LDL|Digoxin 濃度)$/).map((node) => node.textContent)
    expect(labels).toEqual(['NT-proBNP', 'ALT', 'CREA', 'LDL', 'Digoxin 濃度'])
  })

  it('opens the handoff tab from the card', () => {
    useOutpatientPrefsStore.getState().update('doc-1', { pinnedLabs: ['chem:CREA'], labMode: 'mine' })
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: zhTW.overview.labs.handoff }))
    expect(mockSetActiveTab).toHaveBeenCalledWith('ips-export')
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
