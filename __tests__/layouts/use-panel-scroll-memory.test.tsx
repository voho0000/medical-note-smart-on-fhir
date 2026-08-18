import { act, fireEvent, render } from '@testing-library/react'
import { useEffect } from 'react'
import { usePanelScrollMemory } from '@/src/layouts/use-panel-scroll-memory'

/**
 * The right panel itself scrolls for `scrollMode: 'panel'` features (醫療摘要).
 * Hiding that content on a tab switch collapses the panel's scrollHeight and
 * the browser clamps scrollTop to 0, which used to throw a clinician back to
 * the top of a long summary.
 *
 * jsdom does no layout, so the scroll box is emulated: scrollTop is a plain
 * stored value and scrollHeight/clientHeight are stubbed to say "this element
 * scrolls".
 */
function makeScrollHost() {
  const host = document.createElement('div')
  host.setAttribute('style', 'overflow-y: auto')
  let scrollTop = 0
  let scrollable = true
  Object.defineProperty(host, 'scrollTop', {
    get: () => scrollTop,
    // A collapsed panel clamps to 0 exactly like a real browser does.
    set: (value: number) => { scrollTop = scrollable ? value : 0 },
  })
  Object.defineProperty(host, 'scrollHeight', { get: () => (scrollable ? 2000 : 0) })
  Object.defineProperty(host, 'clientHeight', { get: () => (scrollable ? 500 : 0) })
  return {
    host,
    collapse: () => { scrollable = false; scrollTop = 0 },
    expand: () => { scrollable = true },
    scrollTo: (value: number) => {
      scrollTop = value
      fireEvent.scroll(host)
    },
  }
}

type CaptureRef = { current: (() => void) | null }

function Harness({ activeTab, captureRef }: {
  activeTab: string
  captureRef?: CaptureRef
}) {
  const { hostRef, captureBeforeSwitch } = usePanelScrollMemory(activeTab)
  useEffect(() => {
    if (captureRef) captureRef.current = captureBeforeSwitch
  }, [captureBeforeSwitch, captureRef])
  return <div ref={hostRef} />
}

describe('usePanelScrollMemory', () => {
  it('restores the previous tab reading position after a switch', () => {
    const { host, collapse, expand, scrollTo } = makeScrollHost()
    document.body.appendChild(host)
    const { rerender } = render(<Harness activeTab="medical-summary" />, { container: host })

    scrollTo(840)

    // Switching away hides the content: scrollHeight collapses and the
    // browser clamps scrollTop before any effect could have read it.
    collapse()
    rerender(<Harness activeTab="medical-chat" />)
    expect(host.scrollTop).toBe(0)

    expand()
    act(() => { rerender(<Harness activeTab="medical-summary" />) })
    expect(host.scrollTop).toBe(840)
  })

  it('keeps each tab on its own position', () => {
    const { host, scrollTo } = makeScrollHost()
    document.body.appendChild(host)
    const { rerender } = render(<Harness activeTab="medical-summary" />, { container: host })

    scrollTo(600)
    act(() => { rerender(<Harness activeTab="medical-calculator" />) })
    expect(host.scrollTop).toBe(0)

    scrollTo(120)
    act(() => { rerender(<Harness activeTab="medical-summary" />) })
    expect(host.scrollTop).toBe(600)

    act(() => { rerender(<Harness activeTab="medical-calculator" />) })
    expect(host.scrollTop).toBe(120)
  })

  it('ignores the clamp-to-0 scroll event a collapsed panel emits', () => {
    const { host, collapse, expand, scrollTo } = makeScrollHost()
    document.body.appendChild(host)
    const { rerender } = render(<Harness activeTab="medical-summary" />, { container: host })

    scrollTo(500)
    collapse()
    // This is the event the browser fires as the hidden content collapses —
    // recording it would erase the saved position.
    fireEvent.scroll(host)
    expand()

    act(() => { rerender(<Harness activeTab="medical-chat" />) })
    act(() => { rerender(<Harness activeTab="medical-summary" />) })
    expect(host.scrollTop).toBe(500)
  })

  it('captures the exact position when the switch runs through the tab control', () => {
    const { host, collapse, expand } = makeScrollHost()
    document.body.appendChild(host)
    const captureRef: CaptureRef = { current: null }
    const { rerender } = render(
      <Harness activeTab="medical-summary" captureRef={captureRef} />,
      { container: host },
    )

    // No scroll event at all — only the pre-switch capture knows the value.
    host.scrollTop = 333
    act(() => { captureRef.current?.() })

    collapse()
    rerender(<Harness activeTab="medical-chat" captureRef={captureRef} />)
    expand()
    act(() => { rerender(<Harness activeTab="medical-summary" captureRef={captureRef} />) })

    expect(host.scrollTop).toBe(333)
  })
})
