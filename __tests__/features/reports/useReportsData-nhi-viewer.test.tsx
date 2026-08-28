import { renderHook } from '@testing-library/react'
import { useReportsData } from '@/features/clinical-summary/reports/hooks/useReportsData'
import { NHI_VIEWER_REQUEST_EXTENSION_URL } from '@/features/clinical-summary/reports/utils/nhi-viewer-request'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>
    <AudienceProvider>{children}</AudienceProvider>
  </LanguageProvider>
)

const HASH = 'b'.repeat(64)
const liveExtension = (caseNo: string) => ({
  url: NHI_VIEWER_REQUEST_EXTENSION_URL,
  extension: [
    { url: 'version', valueInteger: 1 },
    { url: 'proc-id', valueCode: 'IMUE0130' },
    { url: 'patient-context-hash', valueString: HASH },
    { url: 'ipl-case-seq-no', valueString: caseNo },
  ],
})

describe('useReportsData NHI DICOM viewer actions', () => {
  it('keeps a live-viewer-only report visible without creating or retaining a Viewer URL', () => {
    const { result } = renderHook(() => useReportsData([{
      id: 'viewer-only',
      status: 'final',
      code: { text: '影像檢查' },
      extension: [liveExtension('CASE-1')],
    }]), { wrapper: Wrapper })

    expect(result.current.reportRows).toHaveLength(1)
    expect(result.current.reportRows[0].viewerActions).toEqual([{
      kind: 'live',
      descriptor: {
        version: 1,
        procId: 'IMUE0130',
        patientContextHash: HASH,
        iplCaseSeqNo: 'CASE-1',
        readPos: '',
        ordMark: '',
        fileType: '',
        fileQty: '',
        feeYm: '',
      },
    }])
    expect(JSON.stringify(result.current.reportRows[0])).not.toContain('https://')
    expect(result.current.reportRows[0].obs[0]).toMatchObject({
      code: { text: 'Report Summary' },
      valueString: '',
    })
  })

  it('hides a stale legacy URL whenever the live request extension is present', () => {
    const staleUrl = 'https://meddcm.nhi.gov.tw/zfp/IMME/stale-ticket'
    const { result } = renderHook(() => useReportsData([{
      id: 'live-wins',
      status: 'final',
      code: { text: '影像檢查' },
      extension: [liveExtension('CASE-LIVE')],
      presentedForm: [{ contentType: 'text/html', url: staleUrl, title: 'Stale Viewer' }],
    }]), { wrapper: Wrapper })

    expect(result.current.reportRows[0].viewerActions).toHaveLength(1)
    expect(result.current.reportRows[0].viewerActions?.[0].kind).toBe('live')
    expect(JSON.stringify(result.current.reportRows[0])).not.toContain(staleUrl)
  })

  it('uses a trusted legacy URL only when the live extension is absent', () => {
    const url = 'https://meddcmc.nhi.gov.tw/zfp/IMME/legacy-ticket'
    const { result } = renderHook(() => useReportsData([{
      id: 'legacy-only',
      status: 'final',
      code: { text: '影像檢查' },
      presentedForm: [{ contentType: 'text/html', url, title: 'Legacy Viewer' }],
    }]), { wrapper: Wrapper })

    expect(result.current.reportRows[0].viewerActions).toEqual([{
      kind: 'legacy',
      contentType: 'text/html',
      url,
      title: 'Legacy Viewer',
    }])
  })

  it('does not cap a patient with 18 distinct live Viewer-only imaging reports', () => {
    const reports = Array.from({ length: 18 }, (_, index) => ({
      id: `viewer-${index}`,
      status: 'final',
      code: { text: `影像檢查 ${index + 1}` },
      extension: [liveExtension(`CASE-${index + 1}`)],
    }))

    const { result } = renderHook(() => useReportsData(reports), { wrapper: Wrapper })
    expect(result.current.reportRows).toHaveLength(18)
    expect(result.current.reportRows.every((row) => row.viewerActions?.length === 1)).toBe(true)
  })

  it('collapses viewer requests when duplicate report narratives share one ImagingStudy', () => {
    const reports = ['CASE-A', 'CASE-B'].map((caseNo, index) => ({
      id: `duplicate-report-${index + 1}`,
      status: 'final',
      code: { text: '胸部電腦斷層' },
      effectiveDateTime: '2026-08-12',
      performer: [{ display: '示範醫院;門診;1234567890' }],
      conclusion: 'Same complete imaging narrative.',
      imagingStudy: [{ reference: 'ImagingStudy/shared-study' }],
      extension: [liveExtension(caseNo)],
    }))

    const { result } = renderHook(() => useReportsData(reports), { wrapper: Wrapper })

    expect(result.current.reportRows).toHaveLength(1)
    expect(result.current.reportRows[0].viewerActions?.map((action) => (
      action.kind === 'live' ? action.descriptor.iplCaseSeqNo : action.url
    ))).toEqual(['CASE-A'])
    expect(result.current.reportRows[0].bridgeDupCount).toBe(1)
  })

  it('keeps distinct viewer requests when copied narratives point to different ImagingStudies', () => {
    const reports = ['CASE-A', 'CASE-B'].map((caseNo, index) => ({
      id: `distinct-study-report-${index + 1}`,
      status: 'final',
      code: { text: '胸部電腦斷層' },
      effectiveDateTime: '2026-08-12',
      performer: [{ display: '示範醫院;門診;1234567890' }],
      conclusion: 'Same complete imaging narrative.',
      imagingStudy: [{ reference: `ImagingStudy/study-${index + 1}` }],
      extension: [liveExtension(caseNo)],
    }))

    const { result } = renderHook(() => useReportsData(reports), { wrapper: Wrapper })

    expect(result.current.reportRows).toHaveLength(1)
    expect(result.current.reportRows[0].viewerActions?.map((action) => (
      action.kind === 'live' ? action.descriptor.iplCaseSeqNo : action.url
    ))).toEqual(['CASE-A', 'CASE-B'])
  })

  it('collapses an exact duplicate viewer descriptor without requiring an ImagingStudy', () => {
    const reports = [1, 2].map((index) => ({
      id: `exact-viewer-copy-${index}`,
      status: 'final',
      code: { text: '胸部X光' },
      effectiveDateTime: '2026-08-12',
      performer: [{ display: '示範醫院;門診;1234567890' }],
      conclusion: 'Same complete imaging narrative.',
      extension: [liveExtension('CASE-SAME')],
    }))

    const { result } = renderHook(() => useReportsData(reports), { wrapper: Wrapper })

    expect(result.current.reportRows[0].viewerActions).toHaveLength(1)
  })
})
