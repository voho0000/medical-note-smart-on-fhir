/**
 * @jest-environment jsdom
 */
// Smoke test for HeaderOverflowMenu. As of v0.4.0 the component is
// purely CSS-responsive (wrapper carries `sm:hidden`) — no JS detects
// viewport, no useFhirContext / useResponsiveView dependencies — so this
// test just confirms it mounts and the kebab trigger renders. Actual
// menu open/close behaviour is verified in browser; Radix DropdownMenu
// uses Portal + pointer events that jsdom handles inconsistently.
import { render, screen } from '@testing-library/react'
import { HeaderOverflowMenu } from '@/src/shared/components/HeaderOverflowMenu'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { RightPanelProvider } from '@/src/application/providers/right-panel.provider'

function renderMenu() {
  return render(
    <LanguageProvider>
      <AudienceProvider>
        <RightPanelProvider>
          <HeaderOverflowMenu />
        </RightPanelProvider>
      </AudienceProvider>
    </LanguageProvider>,
  )
}

describe('HeaderOverflowMenu — smoke', () => {
  it('renders the kebab trigger', () => {
    renderMenu()
    expect(screen.getByRole('button', { name: /更多|more/i })).toBeInTheDocument()
  })

  it('keeps the compact menu through tablet widths and hides it on wide desktop', () => {
    const { container } = renderMenu()
    const wrapper = container.querySelector('.lg\\:hidden')
    expect(wrapper).not.toBeNull()
    // The kebab trigger must remain inside the responsive wrapper, not a sibling.
    expect(wrapper?.querySelector('button[aria-label]')).not.toBeNull()
  })
})
