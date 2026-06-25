import {
  listClinicalDocuments,
  resolveSelectedDocuments,
  stripHtmlToText,
} from '@/src/core/utils/clinical-documents.utils'

const data = {
  compositions: [
    {
      id: 'ips',
      title: 'IPS',
      date: '2024-01-01',
      type: { coding: [{ code: '60591-5' }] },
      section: [{ title: 'Problems', text: { div: '<p>HTN</p>' } }],
    },
  ],
  documentReferences: [
    {
      id: 'dc1',
      date: '2025-05-20',
      type: { coding: [{ code: '18842-5' }] },
      content: [{ attachment: { contentType: 'text/html', data: btoa('<p>Discharge note A</p>') } }],
    },
    {
      id: 'dc2',
      date: '2025-03-10',
      type: { coding: [{ code: '18842-5' }] },
      content: [{ attachment: { contentType: 'text/html', data: btoa('<p>Older discharge</p>') } }],
    },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('clinical-documents.utils', () => {
  it('lists all documents newest-first with discharge detection', () => {
    const docs = listClinicalDocuments(data)
    expect(docs.map((d) => d.id)).toEqual(['dc1', 'dc2', 'ips'])
    expect(docs.find((d) => d.id === 'dc1')!.isDischargeSummary).toBe(true)
    expect(docs.find((d) => d.id === 'ips')!.isDischargeSummary).toBe(false)
  })

  it('decodes a DocumentReference base64 html attachment to text', () => {
    const docs = listClinicalDocuments(data)
    expect(docs.find((d) => d.id === 'dc1')!.text).toContain('Discharge note A')
  })

  it('extracts the Composition section narrative', () => {
    const docs = listClinicalDocuments(data)
    expect(docs.find((d) => d.id === 'ips')!.text).toContain('HTN')
  })

  it('uses the encounter period start, not the clustered DocumentReference.date', () => {
    // The NHI bridge sets `date` to a shared registration timestamp (so it
    // clusters), while context.period.start is the real, distinct admission.
    const docs = listClinicalDocuments({
      documentReferences: [
        {
          id: 'p1',
          date: '2024-08-02',
          context: { period: { start: '2024-08-29', end: '2024-08-30' } },
          type: { coding: [{ code: '18842-5' }] },
          content: [{ attachment: { contentType: 'text/html', data: btoa('<p>x</p>') } }],
        },
        {
          id: 'p2',
          date: '2024-08-02',
          context: { period: { start: '2024-08-07', end: '2024-08-08' } },
          type: { coding: [{ code: '18842-5' }] },
          content: [{ attachment: { contentType: 'text/html', data: btoa('<p>y</p>') } }],
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    expect(docs.find((d) => d.id === 'p1')!.date).toBe('2024-08-29')
    // Distinct period dates → correct newest-first order (no clustering).
    expect(docs.map((d) => d.id)).toEqual(['p1', 'p2'])
  })

  describe('resolveSelectedDocuments', () => {
    const docs = listClinicalDocuments(data)

    it('latestAdmission picks the most recent discharge summary', () => {
      expect(resolveSelectedDocuments(docs, 'latestAdmission', []).map((d) => d.id)).toEqual(['dc1'])
    })

    it('all returns every document', () => {
      expect(resolveSelectedDocuments(docs, 'all', []).length).toBe(3)
    })

    it('custom returns only the ticked ids', () => {
      expect(resolveSelectedDocuments(docs, 'custom', ['ips', 'dc2']).map((d) => d.id).sort()).toEqual(['dc2', 'ips'])
    })

    it('latestAdmission falls back to the latest doc when there is no discharge summary', () => {
      const noDischarge = listClinicalDocuments({
        compositions: [
          { id: 'a', date: '2020-01-01' },
          { id: 'b', date: '2021-01-01' },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      expect(resolveSelectedDocuments(noDischarge, 'latestAdmission', []).map((d) => d.id)).toEqual(['b'])
    })
  })

  it('stripHtmlToText flattens block tags to newlines', () => {
    expect(stripHtmlToText('<p>a</p><p>b</p>')).toBe('a\nb')
  })

  it('strips <style>/<script> bodies so CSS/JS never leaks into the text', () => {
    const html = '<style>.title{font-family:標楷體;font-size:18pt;}</style><p>內文</p><script>var x=1;</script>'
    const out = stripHtmlToText(html)
    expect(out).toBe('內文')
    expect(out).not.toContain('font-family')
    expect(out).not.toContain('var x')
  })

  it('decodes a UTF-8 (Chinese) discharge summary without mojibake and drops its CSS', () => {
    const html =
      '<html><head><style>.title{font-family:標楷體;}</style></head>' +
      '<body><p>出院病摘</p><p>診斷：高血壓、糖尿病</p></body></html>'
    // The bridge encodes UTF-8 bytes in base64 (NOT Latin-1).
    const b64 = Buffer.from(html, 'utf-8').toString('base64')
    const docs = listClinicalDocuments({
      documentReferences: [
        {
          id: 'dc',
          date: '2025-05-23',
          type: { coding: [{ code: '18842-5' }] },
          content: [{ attachment: { contentType: 'text/html', data: b64 } }],
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const text = docs[0].text
    expect(text).toContain('出院病摘')
    expect(text).toContain('診斷：高血壓、糖尿病')
    expect(text).not.toContain('font-family') // CSS gone
    expect(text).not.toContain('標楷體') // <style> body gone
    expect(text).not.toMatch(/Ã|å·|é¢/) // no UTF-8 mojibake
  })
})
