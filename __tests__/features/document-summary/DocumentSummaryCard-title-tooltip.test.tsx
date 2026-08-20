import { render, screen } from '@testing-library/react'

import { DocumentSummaryCard } from '@/features/clinical-summary/document-summary/DocumentSummaryCard'

jest.mock('@/features/clinical-summary/document-summary/hooks/useDocumentSummaries', () => ({
  useDocumentSummaries: () => ({
    entries: [],
    isLoading: false,
    error: null,
  }),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ t: { documentSummary: {} } }),
}))

describe('DocumentSummaryCard title help', () => {
  it('places a single tooltip icon beside the title without a separate hint row', () => {
    render(<DocumentSummaryCard />)

    const help = screen.getByRole('button', { name: '文件摘要說明' })
    const cardTitle = help.closest('[data-slot="card-title"]')
    const cardContent = help.closest('[data-slot="card"]')?.querySelector('[data-slot="card-content"]')

    expect(cardTitle).toHaveTextContent('文件摘要')
    expect(cardContent).not.toContainElement(help)
    expect(screen.getAllByText('文件摘要')).toHaveLength(1)
  })
})
