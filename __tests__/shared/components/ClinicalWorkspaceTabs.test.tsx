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
  it('keeps an accessible icon tab while hiding its label in a narrow panel', () => {
    render(
      <Tabs defaultValue="summary">
        <ClinicalTabList>
          <ClinicalTabTrigger
            value="summary"
            icon={ClipboardList}
            label="醫療摘要"
            labelVisibility="panel"
          />
        </ClinicalTabList>
      </Tabs>,
    )

    const tab = screen.getByRole('tab', { name: '醫療摘要' })
    expect(tab).toHaveAttribute('title', '醫療摘要')
    expect(tab.querySelector('span')).toHaveClass('@max-[44rem]:hidden', 'truncate')
  })
})
