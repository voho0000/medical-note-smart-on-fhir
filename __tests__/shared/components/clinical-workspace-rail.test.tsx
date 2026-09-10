import { render, screen } from '@testing-library/react'
import { ClinicalWorkspaceRail } from '@/src/shared/components/clinical-workspace/workspace-layout'

describe('ClinicalWorkspaceRail', () => {
  it('is a quiet expand control by default', () => {
    render(
      <ClinicalWorkspaceRail label="展開功能面板" iconDirection="left" onClick={() => {}}>
        功能
      </ClinicalWorkspaceRail>,
    )
    const rail = screen.getByRole('button', { name: '展開功能面板' })
    expect(rail).not.toHaveAttribute('data-badge')
    expect(rail.className).not.toContain('text-primary')
  })

  it('takes the selected treatment when something waits inside', () => {
    render(
      <ClinicalWorkspaceRail
        label="AI 摘要已完成，展開查看"
        iconDirection="left"
        onClick={() => {}}
        badge
      >
        AI 摘要已完成
      </ClinicalWorkspaceRail>,
    )
    const rail = screen.getByRole('button', { name: 'AI 摘要已完成，展開查看' })
    expect(rail).toHaveAttribute('data-badge', 'true')
    // Finished reads teal (醫療摘要's own colour), not the interaction blue
    // that marks a run still in flight.
    expect(rail.className).toContain('text-teal-800')
    expect(rail.className).not.toContain('text-primary')
    expect(rail).toHaveTextContent('AI 摘要已完成')
  })
})

describe('ClinicalWorkspaceRail — running state', () => {
  it('shows a spinner and the elapsed note while work is in flight', () => {
    render(
      <ClinicalWorkspaceRail
        label="AI 摘要產生中"
        iconDirection="left"
        onClick={() => {}}
        busy
        note="24 秒"
      >
        AI 摘要產生中
      </ClinicalWorkspaceRail>,
    )
    const rail = screen.getByRole('button', { name: 'AI 摘要產生中' })
    expect(rail.className).toContain('text-primary')
    expect(rail).toHaveTextContent('24 秒')
    expect(rail.querySelector('.animate-spin')).not.toBeNull()
  })

  it('does not spin once the run is only waiting to be read', () => {
    render(
      <ClinicalWorkspaceRail
        label="AI 摘要已完成，展開查看"
        iconDirection="left"
        onClick={() => {}}
        badge
      >
        AI 摘要已完成
      </ClinicalWorkspaceRail>,
    )
    const rail = screen.getByRole('button', { name: 'AI 摘要已完成，展開查看' })
    expect(rail.querySelector('.animate-spin')).toBeNull()
    expect(rail).toHaveAttribute('data-badge', 'true')
    expect(rail.className).toContain('text-teal-800')
  })
})
