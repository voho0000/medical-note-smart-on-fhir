import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Tabs } from '@/components/ui/tabs'
import { ReportsTabContent } from '@/features/clinical-summary/reports/components/ReportsTabContent'

const mockScrollToIndex = jest.fn()
const mockScrollElement = jest.fn()
const mockVirtualizerOptions: Array<{
  enabled: boolean
  scrollMargin: number
  getScrollElement: () => HTMLElement | null
  useFlushSync?: boolean
}> = []

function mockUseVirtualizer(options: {
  enabled: boolean
  scrollMargin: number
  getScrollElement: () => HTMLElement | null
  useFlushSync?: boolean
}) {
  mockVirtualizerOptions.push(options)
  return {
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
  }
}

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: mockUseVirtualizer,
}))

jest.mock('@/features/clinical-summary/reports/components/ReportRow', () => ({
  ReportRow: ({ row, defaultOpen }: { row: { id: string; title: string }; defaultOpen: string[] }) => (
    <div
      data-testid="generic-report-row"
      data-default-open={defaultOpen.includes(row.id) ? 'true' : 'false'}
    >
      {row.title}
    </div>
  ),
}))

jest.mock('@/features/clinical-summary/reports/components/CancerScreeningRow', () => ({
  CancerScreeningRow: ({ row }: { row: { title: string } }) => (
    <div data-testid="cancer-screening-row">{row.title}</div>
  ),
}))

jest.mock('@/features/clinical-summary/reports/components/AdultPreventiveGroupCard', () => ({
  AdultPreventiveGroupCard: ({ row }: { row: { title: string } }) => (
    <div data-testid="adult-preventive-group-row">{row.title}</div>
  ),
}))

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function NestedScrollFixture({ children }: { children: ReactNode }) {
  const outerPanelRef = useRef<HTMLDivElement>(null)
  const tabViewportRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const outerPanel = outerPanelRef.current
    const tabViewport = tabViewportRef.current
    if (!outerPanel || !tabViewport) return

    Object.defineProperties(outerPanel, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 400 },
    })
    Object.defineProperties(tabViewport, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1200 },
    })
  }, [])

  return (
    <div ref={outerPanelRef} data-testid="outer-panel" style={{ height: 400, overflowY: 'auto' }}>
      <div
        ref={tabViewportRef}
        data-testid="tab-scroll-container"
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
    mockVirtualizerOptions.length = 0
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
      expect(mockVirtualizerOptions).toEqual(expect.arrayContaining([
        expect.objectContaining({ useFlushSync: false }),
      ]))
      expect(mockScrollToIndex).toHaveBeenCalledWith(0, { align: 'center' })
      expect(onScrollResolved).toHaveBeenCalledWith(7)
    }, { timeout: 1000 })
  })

  it('uses the dedicated row renderer for cancer-screening records', async () => {
    const row = {
      id: 'screening-row',
      title: '大腸癌篩檢',
      meta: '癌篩',
      obs: [{ valueString: '無異常' }],
      group: 'cancer-screening' as const,
    }

    render(
      <div style={{ height: 400, overflowY: 'auto' }}>
        <Tabs value="cancer-screening">
          <ReportsTabContent value="cancer-screening" rows={[row]} isActive />
        </Tabs>
      </div>,
    )

    expect(await screen.findByTestId('cancer-screening-row')).toHaveTextContent('大腸癌篩檢')
    expect(screen.queryByTestId('generic-report-row')).not.toBeInTheDocument()
  })

  it('uses the dedicated row renderer for grouped adult health exams', async () => {
    const row = {
      id: 'adult-preventive:2024-06-28',
      title: 'Adult health exam',
      meta: 'Adult preventive',
      obs: [],
      group: 'other' as const,
      sourceProgram: 'adult-preventive' as const,
      adultPreventiveGroup: true,
      groupedRows: [],
    }

    render(
      <NestedScrollFixture>
        <Tabs value="all">
          <ReportsTabContent value="all" rows={[row]} isActive />
        </Tabs>
      </NestedScrollFixture>,
    )

    expect(await screen.findByTestId('adult-preventive-group-row'))
      .toHaveTextContent('Adult health exam')
    expect(screen.queryByTestId('generic-report-row')).not.toBeInTheDocument()
  })

  it('defaults complete blood-pressure panels open in the vitals tab', async () => {
    const row = {
      id: 'blood-pressure',
      title: 'Blood Pressure',
      meta: 'Vital signs',
      group: 'vitals' as const,
      obs: [{
        component: [
          {
            code: { coding: [{ code: '8480-6' }] },
            valueQuantity: { value: 130, unit: 'mmHg' },
          },
          {
            code: { coding: [{ code: '8462-4' }] },
            valueQuantity: { value: 90, unit: 'mmHg' },
          },
        ],
      }],
    }

    render(
      <NestedScrollFixture>
        <Tabs value="vitals">
          <ReportsTabContent value="vitals" rows={[row]} isActive />
        </Tabs>
      </NestedScrollFixture>,
    )

    expect(await screen.findByTestId('generic-report-row'))
      .toHaveAttribute('data-default-open', 'true')
  })

  it('keeps unrelated composite results collapsed in the vitals tab', async () => {
    const row = {
      id: 'other-composite',
      title: 'Other composite vital',
      meta: 'Vital signs',
      group: 'vitals' as const,
      obs: [{
        component: [
          { code: { text: 'First component' }, valueQuantity: { value: 1 } },
          { code: { text: 'Second component' }, valueQuantity: { value: 2 } },
        ],
      }],
    }

    render(
      <NestedScrollFixture>
        <Tabs value="vitals">
          <ReportsTabContent value="vitals" rows={[row]} isActive />
        </Tabs>
      </NestedScrollFixture>,
    )

    expect(await screen.findByTestId('generic-report-row'))
      .toHaveAttribute('data-default-open', 'false')
  })

  it('uses the tab-owned viewport instead of the shared outer panel', async () => {
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
      expect(mockScrollElement).toHaveBeenCalledWith(getByTestId('tab-scroll-container'))
    }, { timeout: 1000 })
  })

  it('keeps the report window cached but detaches it from another top-level tab scroll', async () => {
    const row = {
      id: 'dr-row',
      title: '胸部影像報告',
      meta: 'Radiology • final',
      obs: [],
      group: 'imaging' as const,
    }
    const renderTree = (workspaceActive: boolean) => (
      <NestedScrollFixture>
        <Tabs value="all">
          <ReportsTabContent
            value="all"
            rows={[row]}
            isActive
            workspaceActive={workspaceActive}
          />
        </Tabs>
      </NestedScrollFixture>
    )

    const { getByTestId, rerender } = render(renderTree(true))

    await waitFor(() => {
      const latestOptions = mockVirtualizerOptions.at(-1)
      expect(latestOptions?.enabled).toBe(true)
      expect(latestOptions?.getScrollElement()).toBe(getByTestId('tab-scroll-container'))
    })

    rerender(renderTree(false))

    await waitFor(() => {
      const latestOptions = mockVirtualizerOptions.at(-1)
      expect(latestOptions?.enabled).toBe(true)
      expect(latestOptions?.getScrollElement()).toBeNull()
    })

    rerender(renderTree(true))

    await waitFor(() => {
      expect(mockVirtualizerOptions.at(-1)?.getScrollElement())
        .toBe(getByTestId('tab-scroll-container'))
    })
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

describe('ReportsTabContent empty states', () => {
  it('uses the localized category label when the selected tab has no rows', () => {
    render(
      <Tabs value="pathology">
        <ReportsTabContent
          value="pathology"
          rows={[]}
          emptyLabel="此分類中沒有可用的報告。"
          noMatchesLabel="沒有符合搜尋的報告。"
        />
      </Tabs>,
    )

    expect(screen.getByText('此分類中沒有可用的報告。')).toBeInTheDocument()
  })

  it('uses the localized search label when a query has no matches', () => {
    render(
      <Tabs value="pathology">
        <ReportsTabContent
          value="pathology"
          rows={[]}
          searchActive
          emptyLabel="此分類中沒有可用的報告。"
          noMatchesLabel="沒有符合搜尋的報告。"
        />
      </Tabs>,
    )

    expect(screen.getByText('沒有符合搜尋的報告。')).toBeInTheDocument()
  })
})
