import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { LabReportsAdminPage } from '@/features/lab-data-report/admin/LabReportsAdminPage'
import * as service from '@/features/lab-data-report/admin/service'
import type { LabDataReportRow } from '@/features/lab-data-report/types'

let mockUser: any = null
jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ user: mockUser, loading: false, signOut: jest.fn() }),
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW', t: jest.requireActual('@/src/shared/i18n/locales/zh-TW').zhTW }),
}))
jest.mock('@/features/auth', () => ({ AuthDialog: () => null }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/features/lab-data-report/admin/service', () => ({
  listLabDataReports: jest.fn(),
  getLabDataReport: jest.fn(),
  getLabDataReportRows: jest.fn(),
  deleteLabDataReport: jest.fn(),
}))

const admin = { uid: 'a', email: 'voho0000@gmail.com', emailVerified: true, displayName: null, photoURL: null }
const report: service.StoredLabDataReport = {
  id: 'LDR-20260927-AAAAAAAA',
  problemType: 'wrong-panel',
  description: 'C3 在尿液',
  includesValues: true,
  scope: { flaggedCategories: ['urine'], categories: [{ categoryId: 'urine', rows: 2 }] },
  context: { appVersion: '0.51.0', dataSource: 'medcloud', site: 'vghtpe', language: 'zh-TW', nameMode: 'standardized' },
  rowCount: 2,
  rowChunks: 1,
  truncatedRows: 0,
  excludedNonLabRows: 0,
  droppedStrings: 0,
  serverDroppedStrings: 0,
  reporterIsAnonymous: true,
  createdAt: new Date('2026-09-27T16:04:00Z'),
  expireAt: new Date(Date.now() + 90 * 86_400_000),
}
const rows: LabDataReportRow[] = [
  {
    ref: 1, day: 3, timeOfDay: '09:30:00', performer: ['合成醫院'], code: { text: 'C3', codings: [{ code: '12999C', display: '免疫球蛋白(尿液相關)' }] },
    category: ['laboratory'], value: { kind: 'quantity', value: 98, magnitude: 1, decimals: 0 }, unit: 'mg/dL',
    interpretation: [], referenceRange: [{ text: '90~180' }], sourceExtensions: [], sourceTags: [],
    app: { categoryId: 'urine', decidedBy: 'text-urine', testKey: 'C3', column: 'C3' },
  },
  {
    ref: 2, day: 3, performer: [], code: { text: 'RBC', codings: [] }, category: ['laboratory'], specimen: 'Urine',
    value: { kind: 'quantity', value: 4.1, magnitude: 0, decimals: 1 }, interpretation: [], referenceRange: [],
    sourceExtensions: [], sourceTags: [], app: { categoryId: 'urine', decidedBy: 'specimen-urine', testKey: 'RBC', column: 'RBC' },
  },
]

describe('LabReportsAdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(service.listLabDataReports as jest.Mock).mockResolvedValue([report])
    ;(service.getLabDataReportRows as jest.Mock).mockResolvedValue(rows)
    ;(service.deleteLabDataReport as jest.Mock).mockResolvedValue(undefined)
    window.history.replaceState(null, '', '/lab-reports')
  })

  it('asks for the admin account and reads nothing before that', async () => {
    mockUser = null
    render(<LabReportsAdminPage />)
    expect(screen.getByText('請用開發團隊的管理帳號登入後查看。')).toBeInTheDocument()
    mockUser = { ...admin, email: 'someone@example.com' }
    render(<LabReportsAdminPage />)
    expect(screen.getByText(/目前登入的帳號（someone@example.com）沒有權限/)).toBeInTheDocument()
    expect(service.listLabDataReports).not.toHaveBeenCalled()
  })

  it('shows a report as the clinician saw it, opens a cell, and deletes it once handled', async () => {
    mockUser = admin
    render(<LabReportsAdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: /LDR-20260927-AAAAAAAA/ }))
    expect(window.location.search).toBe('?id=LDR-20260927-AAAAAAAA')
    expect(await screen.findByText('「C3 在尿液」')).toBeInTheDocument()
    const panel = await screen.findByRole('region', { name: /尿液/ })
    // The placement rule sits under each column name.
    expect(within(panel).getByText('名稱含「尿」')).toBeInTheDocument()
    expect(within(panel).getByText('檢體為尿液')).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: '98' }))
    expect(within(panel).getByText('免疫球蛋白(尿液相關)', { exact: false })).toBeInTheDocument()
    expect(within(panel).getByText('09:30:00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /已處理，刪除/ }))
    const confirm = await screen.findByRole('alertdialog')
    await act(async () => { fireEvent.click(within(confirm).getByRole('button', { name: '刪除' })) })
    expect(service.deleteLabDataReport).toHaveBeenCalledWith('LDR-20260927-AAAAAAAA')
    await waitFor(() => expect(screen.queryByRole('button', { name: /LDR-20260927-AAAAAAAA/ })).not.toBeInTheDocument())
  })

  it('opens the report a mailed link points to', async () => {
    mockUser = admin
    window.history.replaceState(null, '', '/lab-reports?id=LDR-20260927-AAAAAAAA')
    render(<LabReportsAdminPage />)
    expect(await screen.findByText('「C3 在尿液」')).toBeInTheDocument()
  })
})
