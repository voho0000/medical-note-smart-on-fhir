/** @jest-environment jsdom */
// 開藥注意: one neutral list ordered most important first, no severity badge,
// the first three open and the rest behind one control. Synthetic alerts.
import { fireEvent, render, screen } from '@testing-library/react'
import { MedicationSafetySection } from '@/features/medical-summary/components/MedicationSafetySection'
import type { SafetyAlert } from '@/src/core/entities/safety-alert.entity'

const alert = (id: string, severity: 'high' | 'medium' | 'low', title: string): SafetyAlert => ({
  id, severity, category: 'interaction', title, detail: `${title} detail`, sources: [],
} as unknown as SafetyAlert)

const renderSection = (alerts: SafetyAlert[]) => render(
  <MedicationSafetySection
    alerts={alerts}
    title="開藥注意"
    moreLabel="顯示其餘 {count} 項"
    lessLabel="收合"
    disclaimer="AI 掃描，僅供參考"
  />,
)

describe('MedicationSafetySection', () => {
  it('renders nothing when the scan found nothing', () => {
    const { container } = renderSection([])
    expect(container).toBeEmptyDOMElement()
  })

  it('lists alerts in the given order with no severity badge, three open', () => {
    const { container } = renderSection([
      alert('h1', 'high', 'Synthetic A'),
      alert('m1', 'medium', 'Synthetic B'),
      alert('m2', 'medium', 'Synthetic C'),
      alert('l1', 'low', 'Synthetic D'),
    ])
    expect(screen.getByRole('heading', { name: '開藥注意' })).toBeInTheDocument()
    expect([...container.querySelectorAll('[data-safety-alerts] li p:first-child')].map((n) => n.textContent))
      .toEqual(['Synthetic A', 'Synthetic B', 'Synthetic C'])
    expect(screen.queryByText(/高危|High/)).toBeNull()
    expect(container.querySelector('[class*="red-"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '顯示其餘 1 項' }))
    expect(screen.getByText('Synthetic D')).toBeInTheDocument()
  })

  it('shows no fold control for three alerts or fewer', () => {
    renderSection([alert('m1', 'medium', 'Synthetic B')])
    expect(screen.queryByRole('button')).toBeNull()
  })
})
