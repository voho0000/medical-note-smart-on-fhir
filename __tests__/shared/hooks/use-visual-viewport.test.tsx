/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react"

import { useVisualViewport } from "@/src/shared/hooks/layout/use-visual-viewport.hook"

type ViewportEvent = "resize" | "scroll"

function installVisualViewport({
  height,
  offsetTop,
  scale = 1,
}: {
  height: number
  offsetTop: number
  scale?: number
}) {
  const listeners = new Map<ViewportEvent, () => void>()
  const viewport = {
    height,
    offsetTop,
    scale,
    addEventListener: jest.fn((event: ViewportEvent, listener: () => void) => {
      listeners.set(event, listener)
    }),
    removeEventListener: jest.fn((event: ViewportEvent) => {
      listeners.delete(event)
    }),
  }

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  })

  return { viewport, listeners }
}

describe("useVisualViewport", () => {
  const originalInnerHeight = window.innerHeight

  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    })
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0)
      return 1
    })
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    })
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    })
    document.documentElement.removeAttribute("style")
    delete document.documentElement.dataset.keyboardOpen
  })

  it("keeps the workspace aligned with an iOS viewport panned by the keyboard", () => {
    const { viewport, listeners } = installVisualViewport({
      height: 420,
      offsetTop: 260,
    })

    const { unmount } = renderHook(() => useVisualViewport())

    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("420px")
    expect(document.documentElement.style.getPropertyValue("--app-viewport-offset-top")).toBe("260px")
    expect(document.documentElement.style.getPropertyValue("--keyboard-inset")).toBe("164px")
    expect(document.documentElement).toHaveAttribute("data-keyboard-open", "true")

    viewport.height = 844
    viewport.offsetTop = 0
    act(() => listeners.get("resize")?.())

    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("844px")
    expect(document.documentElement.style.getPropertyValue("--app-viewport-offset-top")).toBe("0px")
    expect(document.documentElement).toHaveAttribute("data-keyboard-open", "false")

    unmount()
    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("")
    expect(document.documentElement.style.getPropertyValue("--app-viewport-offset-top")).toBe("")
  })

  it("does not reflow the app shell when the user pinch zooms", () => {
    installVisualViewport({ height: 360, offsetTop: 120, scale: 2 })

    renderHook(() => useVisualViewport())

    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("844px")
    expect(document.documentElement.style.getPropertyValue("--app-viewport-offset-top")).toBe("0px")
    expect(document.documentElement.style.getPropertyValue("--keyboard-inset")).toBe("0px")
    expect(document.documentElement).toHaveAttribute("data-keyboard-open", "false")
  })

  it("detects an Android keyboard when both viewport heights shrink together", () => {
    const { viewport, listeners } = installVisualViewport({
      height: 844,
      offsetTop: 0,
    })
    renderHook(() => useVisualViewport())

    const editor = document.createElement("textarea")
    document.body.appendChild(editor)
    editor.focus()
    viewport.height = 430
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 430,
    })
    act(() => listeners.get("resize")?.())

    expect(document.documentElement).toHaveAttribute("data-keyboard-open", "true")
    editor.remove()
  })
})
