// Tests the Composition + DocumentReference → DocumentEntry adapter.
// Covers the IPS + 健保存摺 出院病摘 paths that the UI cares about.

import {
  buildDocumentEntries,
  compositionToEntry,
  documentReferenceToEntry,
} from '@/features/clinical-summary/document-summary/utils/document-adapter'

const ZH_DOC_TYPES = {
  ipsPatientSummary: '國際病人摘要 (IPS)',
  dischargeSummary: '出院病摘',
  consultNote: '會診紀錄',
}

describe('document-adapter', () => {
  describe('compositionToEntry', () => {
    it('returns null for compositions with no renderable narrative', () => {
      const comp: any = {
        id: 'c1',
        date: '2025-01-01',
        type: { coding: [{ code: '60591-5' }] },
        section: [{ title: 'Empty', text: { div: '<div xmlns="http://www.w3.org/1999/xhtml"></div>' } }],
      }
      expect(compositionToEntry(comp, ZH_DOC_TYPES)).toBeNull()
    })

    it('maps an IPS composition to a DocumentEntry with IPS flag', () => {
      const comp: any = {
        id: 'ips-1',
        date: '2025-06-01',
        type: { coding: [{ code: '60591-5', display: 'Patient summary' }] },
        section: [
          {
            title: 'Problem list',
            code: { coding: [{ code: '11450-4' }] },
            text: { div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>HTN</p></div>' },
          },
        ],
      }
      const entry = compositionToEntry(comp, ZH_DOC_TYPES)
      expect(entry).not.toBeNull()
      expect(entry!.sourceKind).toBe('composition')
      expect(entry!.isIps).toBe(true)
      expect(entry!.isDischargeSummary).toBe(false)
      expect(entry!.typeLabel).toBe('國際病人摘要 (IPS)')
      expect(entry!.composition).toBe(comp)
    })
  })

  describe('documentReferenceToEntry', () => {
    it('returns null when no attachment is renderable (PDF only)', () => {
      const docRef: any = {
        id: 'd1',
        date: '2025-05-23',
        type: { coding: [{ code: '18842-5' }] },
        content: [{ attachment: { contentType: 'application/pdf', data: 'somebase64' } }],
      }
      expect(documentReferenceToEntry(docRef, ZH_DOC_TYPES)).toBeNull()
    })

    it('returns null when content array is empty', () => {
      const docRef: any = {
        id: 'd2',
        date: '2025-05-23',
        type: { coding: [{ code: '18842-5' }] },
        content: [],
      }
      expect(documentReferenceToEntry(docRef, ZH_DOC_TYPES)).toBeNull()
    })

    it('maps an HTML discharge summary attachment to a DocumentEntry', () => {
      const docRef: any = {
        id: 'd3',
        date: '2025-05-23',
        type: {
          coding: [{ system: 'http://loinc.org', code: '18842-5', display: 'Discharge summary' }],
          text: '出院病摘',
        },
        context: {
          period: { start: '2025-05-18', end: '2025-05-22' },
          encounter: [{ reference: 'Encounter/abc123' }],
        },
        content: [
          {
            attachment: {
              contentType: 'text/html',
              data: 'PHA+aGVsbG88L3A+', // <p>hello</p>
              title: '出院病摘 — 長庚嘉義 2025-05-18~2025-05-22',
              size: 16226,
            },
          },
        ],
      }
      const entry = documentReferenceToEntry(docRef, ZH_DOC_TYPES)
      expect(entry).not.toBeNull()
      expect(entry!.sourceKind).toBe('documentReference')
      expect(entry!.typeLabel).toBe('出院病摘')
      expect(entry!.typeCode).toBe('18842-5')
      expect(entry!.isDischargeSummary).toBe(true)
      expect(entry!.isIps).toBe(false)
      expect(entry!.institution).toBe('長庚嘉義')
      expect(entry!.period).toEqual({ start: '2025-05-18', end: '2025-05-22' })
      expect(entry!.encounterRef).toBe('Encounter/abc123')
      expect(entry!.attachment?.contentType).toBe('text/html')
      expect(entry!.attachment?.data).toBe('PHA+aGVsbG88L3A+')
    })

    it('handles plain-text attachments', () => {
      const docRef: any = {
        id: 'd4',
        date: '2024-01-01',
        type: { coding: [{ code: '11488-4' }] },
        content: [{ attachment: { contentType: 'text/plain', data: 'aGVsbG8=' } }],
      }
      const entry = documentReferenceToEntry(docRef, ZH_DOC_TYPES)
      expect(entry).not.toBeNull()
      expect(entry!.typeLabel).toBe('會診紀錄')
    })

    it('does not extract an institution when title has no separator', () => {
      const docRef: any = {
        id: 'd5',
        type: { coding: [{ code: '18842-5' }] },
        content: [
          { attachment: { contentType: 'text/html', data: 'PA==', title: '出院病摘' } },
        ],
      }
      const entry = documentReferenceToEntry(docRef, ZH_DOC_TYPES)
      expect(entry!.institution).toBeUndefined()
    })
  })

  describe('buildDocumentEntries', () => {
    it('merges and sorts both sources newest-first', () => {
      const comp: any = {
        id: 'c1',
        date: '2025-02-01',
        type: { coding: [{ code: '60591-5' }] },
        section: [{ text: { div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>x</p></div>' } }],
      }
      const docRefNew: any = {
        id: 'd-new',
        date: '2025-05-23',
        type: { coding: [{ code: '18842-5' }] },
        content: [{ attachment: { contentType: 'text/html', data: 'PA==' } }],
      }
      const docRefOld: any = {
        id: 'd-old',
        date: '2020-09-25',
        type: { coding: [{ code: '18842-5' }] },
        content: [{ attachment: { contentType: 'text/html', data: 'PA==' } }],
      }
      const list = buildDocumentEntries([comp], [docRefNew, docRefOld], ZH_DOC_TYPES)
      expect(list).toHaveLength(3)
      expect(list[0].id).toBe('d-new')
      expect(list[1].id).toBe('c1')
      expect(list[2].id).toBe('d-old')
    })

    it('skips non-renderable entries silently', () => {
      const pdf: any = {
        id: 'pdf',
        date: '2025-01-01',
        type: { coding: [{ code: '18842-5' }] },
        content: [{ attachment: { contentType: 'application/pdf', data: 'PA==' } }],
      }
      expect(buildDocumentEntries([], [pdf], ZH_DOC_TYPES)).toEqual([])
    })

    it('returns [] when no sources contribute anything', () => {
      expect(buildDocumentEntries(undefined, undefined, ZH_DOC_TYPES)).toEqual([])
      expect(buildDocumentEntries([], [], ZH_DOC_TYPES)).toEqual([])
    })
  })
})
