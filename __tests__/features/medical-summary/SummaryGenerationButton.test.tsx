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

  it("keeps a generous icon-only target when the summary panel is narrow", () => {
    render(
      <SummaryGenerationButton
        isBusy={false}
        isStopping={false}
        isRestoring={false}
        hasContextOverflow={false}
        hasAnyResult
        labels={labels}
        onGenerate={jest.fn()}
        onStop={jest.fn()}
        onResolveOverflow={jest.fn()}
      />,
    )

    const button = screen.getByRole("button", { name: "重新產生" })
    expect(button).toHaveClass(
      "@max-[36rem]:h-10",
      "@max-[36rem]:w-10",
      "@max-[36rem]:px-0",
    )
    expect(screen.getByText("重新產生")).toHaveClass("@max-[36rem]:hidden")
    expect(button).toHaveAttribute("title", "重新產生")
  })

  it("renders a larger primary action for the empty summary area", () => {
    const onGenerate = jest.fn()
    render(
      <SummaryGenerationButton
        presentation="empty"
        isBusy={false}
        isStopping={false}
        isRestoring={false}
        hasContextOverflow={false}
        hasAnyResult={false}
        labels={labels}
        onGenerate={onGenerate}
        onStop={jest.fn()}
        onResolveOverflow={jest.fn()}
      />,
    )

    const button = screen.getByTestId("medical-summary-empty-generate")
    expect(button).toHaveClass(
      "min-h-12",
      "min-w-44",
      "border-border",
      "bg-secondary",
      "text-base",
      "text-secondary-foreground",
      "shadow-none",
    )
    expect(button).not.toHaveClass("@max-[36rem]:w-10")
    expect(screen.getByText("產生摘要")).not.toHaveClass("@max-[36rem]:hidden")

    fireEvent.click(button)
    expect(onGenerate).toHaveBeenCalledTimes(1)
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
      hasAnyResult: false,
    })).toEqual({
      actionBusy: false,
      showBlockingLoader: false,
      showGenerationErrors: true,
    })

    expect(getSummaryGenerationActivityState({
      isBusy: true,
      hasContextOverflow: false,
      hasAnyResult: false,
    })).toEqual({
      actionBusy: true,
      showBlockingLoader: true,
      showGenerationErrors: false,
    })
  })

  it("stops blocking as soon as the first validated card is available", () => {
    expect(getSummaryGenerationActivityState({
      isBusy: true,
      hasContextOverflow: false,
      hasAnyResult: true,
    })).toEqual({
      actionBusy: true,
      showBlockingLoader: false,
      showGenerationErrors: false,
    })
  })
})
