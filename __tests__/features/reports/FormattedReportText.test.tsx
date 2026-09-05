import { render, screen } from '@testing-library/react'
import { FormattedReportText } from '@/features/clinical-summary/reports/components/FormattedReportText'

describe('FormattedReportText', () => {
  it('renders a flattened microbiology report as scannable source-faithful rows', () => {
    const raw = '報告結果 開單日期:115/08/14 15:15 採檢日期:115/08/14 15:23 ' +
      '檢驗項目:13021 抗生素敏感性試驗(MIC法)二菌種 檢體編號:11513025188 Specimen:Sputum ' +
      '〔最終報告〕 報告日期:115/08/18 08:32 報告:---------------------------------------- ' +
      ': Final report (最終報告) :Sputum Culture : Sample Type : Sputum ' +
      ': ISOLATE 1 : Klebsiella pneumoniae subsp. pneumoniae, 3+ ' +
      ': ISOLATE 2 : Streptococcus anginosus, 3+ ' +
      ': -------------------- : |Susceptibility | 1 | 2 |'

    render(<FormattedReportText text={raw} />)

    expect(screen.getByText('開單日期:115/08/14 15:15')).toBeInTheDocument()
    expect(screen.getByText('採檢日期:115/08/14 15:23')).toBeInTheDocument()
    expect(screen.getByText('Final report (最終報告)')).toHaveClass('font-semibold')
    expect(screen.getByText('Sputum Culture')).toHaveClass('font-semibold')
    expect(screen.getByText('ISOLATE 1 : Klebsiella pneumoniae subsp. pneumoniae, 3+')).toBeInTheDocument()
    expect(screen.getByText('ISOLATE 2 : Streptococcus anginosus, 3+')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(table).toHaveTextContent('Susceptibility')
    expect(table).toHaveTextContent('1')
    expect(table).toHaveTextContent('2')
  })
})
