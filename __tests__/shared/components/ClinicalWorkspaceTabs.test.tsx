/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ClipboardList } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import {
  ClinicalTabList,
  ClinicalTabTrigger,
} from '@/src/shared/components/clinical-workspace'

describe('Clinical workspace tabs', () => {
  it('keeps the label while hiding a secondary icon in a narrow panel', () => {
    render(
      <Tabs defaultValue="summary">
        <ClinicalTabList>
          <ClinicalTabTrigger
            value="summary"
            icon={ClipboardList}
            iconVisibility="panel"
            label="醫療摘要"
          />
        </ClinicalTabList>
      </Tabs>,
    )

    const tab = screen.getByRole('tab', { name: '醫療摘要' })
    expect(tab).toHaveAttribute('title', '醫療摘要')
    expect(tab.querySelector('svg')).toHaveClass('@max-[28rem]:hidden')
    expect(tab.querySelector('span')).toHaveClass('truncate')
    expect(tab.querySelector('span')).not.toHaveClass('@max-[28rem]:hidden')
  })

  it('synchronizes icons at workspace zoom breakpoints while remaining panel-aware', () => {
    render(
      <Tabs defaultValue="summary">
        <ClinicalTabList>
          <ClinicalTabTrigger
            value="summary"
            icon={ClipboardList}
            iconVisibility="responsive"
            label="醫療摘要"
          />
        </ClinicalTabList>
      </Tabs>,
    )

    const tab = screen.getByRole('tab', { name: '醫療摘要' })
    expect(tab.querySelector('svg')).toHaveClass(
      'max-xl:hidden',
      '@max-[28rem]:hidden',
    )
    expect(tab.querySelector('span')).not.toHaveClass('max-xl:hidden')
    expect(tab.querySelector('span')).not.toHaveClass('@max-[28rem]:hidden')
  })
})
