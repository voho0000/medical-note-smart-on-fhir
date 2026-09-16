import { render, screen, within } from '@testing-library/react'
import { HpaRiskResults } from '@/features/medical-calculator/components/HpaRiskResults'
import { calculateHpaRisks } from '@/features/medical-calculator/hpa-risk-model'
import type { CalcValues } from '@/features/medical-calculator/types'

const baseline: CalcValues = {
  gender: 'male', age: '50', height: '170', weight: '70', waist: '85',
  sbp: '120', glu: '90', chol: '180', tg: '100', ldlc: '100', hdlc: '50',
  diabetes: 'no', hbp: 'no', smoke: 'no', prior_cvd: 'no',
}

it('truncates the displayed approximate risk instead of rounding it', () => {
  const diabetes = calculateHpaRisks(baseline).find((result) => result.outcome === 'diabetes')!
  expect(diabetes.status).toBe('estimated')
  expect(diabetes.risk!).toBeGreaterThan(16.5)
  expect(diabetes.risk!).toBeLessThan(17)

  render(<HpaRiskResults values={baseline} locale="zh-TW" mixedDates={false} />)
  const diabetesRow = screen.getByText('糖尿病').parentElement!.parentElement!
  expect(within(diabetesRow).getByText('約16%')).toBeInTheDocument()
  expect(within(diabetesRow).queryByText('約17%')).not.toBeInTheDocument()
})
