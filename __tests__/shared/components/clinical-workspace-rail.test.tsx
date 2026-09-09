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
    expect(rail.className).toContain('text-primary')
    expect(rail).toHaveTextContent('AI 摘要已完成')
  })
})
