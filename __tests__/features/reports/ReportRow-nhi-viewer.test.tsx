import { fireEvent, render, screen } from '@testing-library/react'
import { ReportRow } from '@/features/clinical-summary/reports/components/ReportRow'
import type { Row } from '@/features/clinical-summary/reports/types'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { RightDetailProvider } from '@/src/application/providers/right-detail.provider'

jest.mock('@/features/report-interpretation', () => ({
  ReportInterpretationButton: () => null,
  ReportInterpretationPanel: () => null,
}))

const renderRow = (row: Row) => render(
  <LanguageProvider>
    <AudienceProvider>
      <RightDetailProvider>
        <ReportRow row={row} defaultOpen={[]} />
      </RightDetailProvider>
    </AudienceProvider>
  </LanguageProvider>,
)

const baseRow = (): Row => ({
  id: 'viewer-report',
  title: '影像檢查',
  meta: 'Radiology • final',
  group: 'imaging',
  institution: '臺北醫院',
  obs: [{
    id: 'viewer-summary',
    code: { text: 'Report Summary' },
    valueString: '',
  }],
})

describe('ReportRow NHI DICOM viewer actions', () => {
  it('renders the live action compactly before the institution and exposes no URL', () => {
    const row = baseRow()
    row.viewerActions = [{
      kind: 'live',
      descriptor: {
        version: 1,
        procId: 'IMUE0130',
        patientContextHash: 'c'.repeat(64),
        iplCaseSeqNo: 'CASE-UI',
        readPos: '',
        ordMark: '',
        fileType: '',
        fileQty: '',
        feeYm: '',
      },
    }]
    renderRow(row)

    const action = screen.getByRole('button', { name: '開啟 DICOM Viewer（健保影像）' })
    const institution = screen.getByText('臺北醫院')
    expect(action).toHaveTextContent('健保影像')
    expect(action).not.toHaveTextContent('開啟 DICOM Viewer')
    expect(action.compareDocumentPosition(institution) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.body.innerHTML).not.toContain('nhi.gov.tw')
  })

  it('groups trusted legacy fallbacks behind one compact selector and re-rejects bad rows', () => {
    const row = baseRow()
    row.viewerActions = [
      { kind: 'legacy', contentType: 'text/html', url: 'https://medvpnimg.nhi.gov.tw/ZFP?ticket=one#pl=one', title: 'One' },
      { kind: 'legacy', contentType: 'text/html', url: 'https://meddcmc.nhi.gov.tw/zfp/IMME/two', title: 'Two' },
      { kind: 'legacy', contentType: 'text/html', url: 'https://viewer-new.nhi.gov.tw/v2/whatever', title: 'Future' },
      { kind: 'legacy', contentType: 'text/html', url: 'https://medvpnimg.nhi.gov.tw.evil.example/ZFP#pl=bad', title: 'Bad' },
    ]
    renderRow(row)

    const trigger = screen.getByRole('button', { name: '選擇健保影像，共 3 筆' })
    expect(trigger).toHaveTextContent('健保影像 3')
    expect(screen.queryByRole('link', { name: /開啟/ })).not.toBeInTheDocument()

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const links = screen.getAllByRole('menuitem', { name: /開啟 健保影像/ })
    expect(links).toHaveLength(3)
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://medvpnimg.nhi.gov.tw/ZFP?ticket=one#pl=one',
      'https://meddcmc.nhi.gov.tw/zfp/IMME/two',
      'https://viewer-new.nhi.gov.tw/v2/whatever',
    ])
    links.forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
    })
    expect(document.body.innerHTML).not.toContain('evil.example')
  })

  it('keeps a long report title readable when several distinct viewers remain', () => {
    const row = baseRow()
    row.title = '這是一個很長的影像檢查名稱，用來確認 Viewer 動作不會再把標題擠到完全消失'
    row.obs[0].valueString = 'A long report narrative that keeps this report in the expandable text layout for responsive testing.'
    row.viewerActions = ['CASE-1', 'CASE-2', 'CASE-3'].map((caseNo) => ({
      kind: 'live' as const,
      descriptor: {
        version: 1 as const,
        procId: 'IMUE0130' as const,
        patientContextHash: 'f'.repeat(64),
        iplCaseSeqNo: caseNo,
        readPos: '',
        ordMark: '' as const,
        fileType: '',
        fileQty: '',
        feeYm: '',
      },
    }))
    renderRow(row)

    const trigger = screen.getByRole('button', { name: '選擇健保影像，共 3 筆' })
    expect(trigger).toHaveTextContent('健保影像 3')
    expect(screen.queryByRole('button', { name: /健保影像 1/ })).not.toBeInTheDocument()
    const titleContainer = screen.getByText(row.title).parentElement
    expect(titleContainer).toHaveClass('basis-0', 'sm:w-auto', 'sm:min-w-[12rem]')
    expect(titleContainer?.parentElement).toHaveClass('sm:flex-nowrap')
    expect(screen.getByText(row.title)).toHaveClass('min-w-0', 'flex-1', 'truncate')
    expect(screen.getByRole('button', { name: '在右側面板展開全文' })).toBeInTheDocument()
  })

  it('keeps the action inside a multi-item header instead of adding a separate row', () => {
    const row = baseRow()
    row.obs = [
      { id: 'one', code: { text: 'Finding one' }, valueString: 'One' },
      { id: 'two', code: { text: 'Finding two' }, valueString: 'Two' },
    ]
    row.viewerActions = [{
      kind: 'live',
      descriptor: {
        version: 1,
        procId: 'IMUE0130',
        patientContextHash: 'e'.repeat(64),
        iplCaseSeqNo: 'CASE-PANEL',
        readPos: '',
        ordMark: '',
        fileType: '',
        fileQty: '',
        feeYm: '',
      },
    }]
    renderRow(row)

    const action = screen.getByRole('button', { name: '開啟 DICOM Viewer（健保影像）' })
    const trigger = action.closest('[data-slot="accordion-trigger"]')
    expect(action.tagName).toBe('SPAN')
    expect(trigger).not.toBeNull()
    expect(trigger).toContainElement(screen.getByText('臺北醫院'))
    expect(trigger?.querySelectorAll('[data-nhi-viewer-actions]')).toHaveLength(1)
  })
})
