import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { Tabs } from '@/components/ui/tabs'
import { ReportsTabContent } from '@/features/clinical-summary/reports/components/ReportsTabContent'

const mockScrollToIndex = jest.fn()
const mockScrollElement = jest.fn()

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    enabled: boolean
    scrollMargin: number
    getScrollElement: () => HTMLElement | null
  }) => ({
    getVirtualItems: () => options.enabled
      ? [{ index: 0, key: 'dr-row', start: 0 }]
      : [],
    getTotalSize: () => 56,
    scrollToIndex: (index: number, config: unknown) => {
      if (!options.enabled) throw new Error('virtualizer scrolled before its viewport was ready')
      mockScrollElement(options.getScrollElement())
      mockScrollToIndex(index, config)
    },
    measureElement: () => undefined,
    options: { scrollMargin: options.scrollMargin },
  }),
}))

jest.mock('@/features/clinical-summary/reports/components/ReportRow', () => ({
  ReportRow: ({ row }: { row: { title: string } }) => <div>{row.title}</div>,
}))

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function NestedScrollFixture({ children }: { children: ReactNode }) {
  const realScrollerRef = useRef<HTMLDivElement>(null)
  const inertRadixViewportRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const realScroller = realScrollerRef.current
    const inertViewport = inertRadixViewportRef.current
    if (!realScroller || !inertViewport) return

    Object.defineProperties(realScroller, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1200 },
    })
    Object.defineProperties(inertViewport, {
      clientHeight: { configurable: true, value: 1200 },
      scrollHeight: { configurable: true, value: 1200 },
    })
  }, [])

  return (
    <div ref={realScrollerRef} data-testid="real-scroll-container" style={{ height: 400, overflowY: 'auto' }}>
      <div
        ref={inertRadixViewportRef}
        data-slot="scroll-area-viewport"
        style={{ overflowY: 'scroll' }}
      >
        {children}
      </div>
    </div>
  )
}

describe('ReportsTabContent source navigation', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    })
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: { escape: (value: string) => value },
    })
  })

  beforeEach(() => {
    mockScrollToIndex.mockClear()
    mockScrollElement.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('waits for the external scroll viewport and confirms only after the row mounts', async () => {
    const onScrollResolved = jest.fn()
    const row = {
      id: 'dr-row',
      title: '胸部影像報告',
      meta: 'Radiology • final',
      obs: [],
      group: 'imaging' as const,
    }

    render(
      <div style={{ height: 400, overflowY: 'auto' }}>
        <Tabs value="all">
          <ReportsTabContent
            value="all"
            rows={[row]}
            isActive
            scrollToId="dr-row"
            scrollNonce={7}
            onScrollResolved={onScrollResolved}
          />
        </Tabs>
      </div>,
    )

    await waitFor(() => {
      expect(mockScrollToIndex).toHaveBeenCalledWith(0, { align: 'center' })
      expect(onScrollResolved).toHaveBeenCalledWith(7)
    }, { timeout: 1000 })
  })

  it('skips an inert Radix viewport and uses the outer panel that can actually scroll', async () => {
    const row = {
      id: 'dr-row',
      title: '超音波導引(為組織切片，抽吸、注射等)',
      meta: 'Radiology • final',
      obs: [],
      group: 'imaging' as const,
    }

    const { getByTestId } = render(
      <NestedScrollFixture>
        <Tabs value="all">
          <ReportsTabContent
            value="all"
            rows={[row]}
            isActive
            scrollToId="dr-row"
            scrollNonce={33}
          />
        </Tabs>
      </NestedScrollFixture>,
    )

    await waitFor(() => {
      expect(mockScrollToIndex).toHaveBeenCalledWith(0, { align: 'center' })
      expect(mockScrollElement).toHaveBeenCalledWith(getByTestId('real-scroll-container'))
    }, { timeout: 1000 })
  })

  it('does not acknowledge a mounted row that is still outside the visible scroll area', async () => {
    const onScrollResolved = jest.fn()
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isTargetRow = this.hasAttribute('data-row-id')
      const top = isTargetRow ? 900 : 0
      const height = isTargetRow ? 56 : 400
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 800,
        bottom: top + height,
        width: 800,
        height,
        toJSON: () => ({}),
      } as DOMRect
    })

    const row = {
      id: 'dr-row',
      title: '其他超音波',
      meta: 'Radiology • final',
      obs: [],
      group: 'imaging' as const,
    }

    render(
      <NestedScrollFixture>
        <Tabs value="all">
          <ReportsTabContent
            value="all"
            rows={[row]}
            isActive
            scrollToId="dr-row"
            scrollNonce={8}
            onScrollResolved={onScrollResolved}
          />
        </Tabs>
      </NestedScrollFixture>,
    )

    await waitFor(() => {
      expect(mockScrollToIndex).toHaveBeenCalledWith(0, { align: 'center' })
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })

    expect(onScrollResolved).not.toHaveBeenCalled()
  })
})
