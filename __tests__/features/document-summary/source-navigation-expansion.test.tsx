import { render, screen, waitFor } from '@testing-library/react'
import { HtmlDocumentRenderer } from '@/features/clinical-summary/document-summary/components/HtmlDocumentRenderer'
import { CompositionRenderer } from '@/features/clinical-summary/document-summary/components/CompositionRenderer'

describe('document source navigation expansion', () => {
  it('opens a DocumentReference body when a citation navigates to it', async () => {
    render(
      <HtmlDocumentRenderer
        attachment={{
          contentType: 'text/html',
          data: Buffer.from('<p>出院病摘記載胃潰瘍</p>').toString('base64'),
        }}
        forceExpandKey={1}
        labels={{ bodyHeader: '文件內容', noContent: '無內容', externalUrl: '外部文件' }}
      />,
    )

    await waitFor(() => expect(screen.getByText('出院病摘記載胃潰瘍')).toBeInTheDocument())
  })

  it('opens Composition sections when a citation navigates to it', async () => {
    render(
      <CompositionRenderer
        composition={{
          id: 'composition-1',
          status: 'final',
          section: [{ title: '診斷', text: { div: '<div>病摘中的診斷內容</div>' } }],
        }}
        forceExpandKey={2}
        resolveSectionLabel={() => null}
        labels={{ documentDate: '日期', author: '作者', custodian: '保管單位', noSections: '無內容' }}
      />,
    )

    await waitFor(() => expect(screen.getByText('病摘中的診斷內容')).toBeInTheDocument())
  })
})
