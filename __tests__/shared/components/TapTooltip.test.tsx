import { fireEvent, render, screen } from '@testing-library/react'
import { TapTooltip } from '@/src/shared/components/TapTooltip'

// jsdom ships neither PointerEvent nor ResizeObserver; Radix's tooltip needs
// both to open. Minimal stand-ins so the touch path is testable at all.
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string
  readonly pointerId: number
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerType = init.pointerType ?? ''
    this.pointerId = init.pointerId ?? 0
  }
}

beforeAll(() => {
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// Radix tooltips only open on hover/focus, so on an iPad the bubble content is
// unreachable. These cover the touch path and the "don't also activate the row
// behind me" rule the clinical rows depend on.
describe('TapTooltip', () => {
  it('opens on a touch tap and closes on the next one', () => {
    render(
      <TapTooltip content="Taipei Veterans General Hospital">
        <span>TVGH</span>
      </TapTooltip>,
    )
    const trigger = screen.getByText('TVGH').parentElement as HTMLElement

    expect(screen.queryByText('Taipei Veterans General Hospital')).not.toBeInTheDocument()

    fireEvent.pointerDown(trigger, { pointerType: 'touch' })
    expect(screen.getAllByText('Taipei Veterans General Hospital').length).toBeGreaterThan(0)

    fireEvent.pointerDown(trigger, { pointerType: 'touch' })
    expect(screen.queryByText('Taipei Veterans General Hospital')).not.toBeInTheDocument()
  })

  it('counts one tap once even when the browser also dispatches a click', () => {
    render(
      <TapTooltip content="full value">
        <span>1.2…</span>
      </TapTooltip>,
    )
    const trigger = screen.getByText('1.2…').parentElement as HTMLElement

    fireEvent.pointerDown(trigger, { pointerType: 'touch' })
    fireEvent.click(trigger)

    expect(screen.getAllByText('full value').length).toBeGreaterThan(0)
  })

  it('does not let the reveal tap activate the row behind it', () => {
    const onRowClick = jest.fn()
    render(
      <div onClick={onRowClick}>
        <TapTooltip content="full value">
          <span>1.2…</span>
        </TapTooltip>
      </div>,
    )
    const trigger = screen.getByText('1.2…').parentElement as HTMLElement

    fireEvent.pointerDown(trigger, { pointerType: 'touch' })
    fireEvent.click(trigger)

    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('keeps the trigger keyboard reachable', () => {
    render(
      <TapTooltip content="full value">
        <span>1.2…</span>
      </TapTooltip>,
    )
    const trigger = screen.getByText('1.2…').parentElement as HTMLElement
    expect(trigger).toHaveAttribute('tabindex', '0')
  })
})
