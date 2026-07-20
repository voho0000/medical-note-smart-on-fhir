import { fireEvent, render, screen } from "@testing-library/react"
import {
  getSummaryGenerationActivityState,
  SummaryGenerationButton,
} from "@/features/medical-summary/components/SummaryGenerationButton"

const labels = {
  generate: "產生摘要",
  regenerate: "重新產生",
  stop: "終止",
  stopping: "正在終止…",
  resolveOverflow: "處理內容過長",
}

describe("SummaryGenerationButton", () => {
  it("keeps stop available while another pipeline runs beside an overflow", () => {
    const onGenerate = jest.fn()
    const onStop = jest.fn()
    const onResolveOverflow = jest.fn()
    const { container } = render(
      <SummaryGenerationButton
        isBusy
        isStopping={false}
        isRestoring={false}
        hasContextOverflow
        hasAnyResult
        labels={labels}
        onGenerate={onGenerate}
        onStop={onStop}
        onResolveOverflow={onResolveOverflow}
      />,
    )

    const button = screen.getByRole("button", { name: "終止" })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute("aria-busy", "true")
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(onResolveOverflow).not.toHaveBeenCalled()
    expect(onGenerate).not.toHaveBeenCalled()
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it("shows the overflow action after active generation has stopped", () => {
    const onResolveOverflow = jest.fn()
    render(
      <SummaryGenerationButton
        isBusy={false}
        isStopping={false}
        isRestoring={false}
        hasContextOverflow
        hasAnyResult
        labels={labels}
        onGenerate={jest.fn()}
        onStop={jest.fn()}
        onResolveOverflow={onResolveOverflow}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "處理內容過長" }))
    expect(onResolveOverflow).toHaveBeenCalledTimes(1)
  })

  it("replaces the busy indicator with an actionable stop button", () => {
    const onGenerate = jest.fn()
    const onStop = jest.fn()
    const { container } = render(
      <SummaryGenerationButton
        isBusy
        isStopping={false}
        isRestoring={false}
        hasContextOverflow={false}
        hasAnyResult={false}
        labels={labels}
        onGenerate={onGenerate}
        onStop={onStop}
        onResolveOverflow={jest.fn()}
      />,
    )

    const button = screen.getByRole("button", { name: "終止" })
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute("aria-busy")
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it("disables repeated clicks while the request is stopping", () => {
    const { container } = render(
      <SummaryGenerationButton
        isBusy
        isStopping
        isRestoring={false}
        hasContextOverflow={false}
        hasAnyResult
        labels={labels}
        onGenerate={jest.fn()}
        onStop={jest.fn()}
        onResolveOverflow={jest.fn()}
      />,
    )

    const button = screen.getByRole("button", { name: "正在終止…" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(container.querySelector(".animate-spin")).toBeInTheDocument()
  })

  it("shows overflow actions instead of the blocking loader on a first run", () => {
    expect(getSummaryGenerationActivityState({
      isBusy: true,
      hasContextOverflow: true,
      hasCompleteResult: false,
    })).toEqual({
      actionBusy: false,
      showBlockingLoader: false,
      showGenerationErrors: true,
    })

    expect(getSummaryGenerationActivityState({
      isBusy: true,
      hasContextOverflow: false,
      hasCompleteResult: false,
    })).toEqual({
      actionBusy: true,
      showBlockingLoader: true,
      showGenerationErrors: false,
    })
  })
})
