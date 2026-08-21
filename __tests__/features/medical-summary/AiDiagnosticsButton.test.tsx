import { fireEvent, render, screen } from "@testing-library/react"
import { AiDiagnosticsButton } from "@/features/medical-summary/components/AiDiagnosticsButton"

describe("AiDiagnosticsButton", () => {
  it("renders a quiet disabled state when no AI execution record exists", () => {
    render(
      <AiDiagnosticsButton
        hasRecords={false}
        availableLabel="查看本次 AI 執行紀錄"
        unavailableLabel="完成一次 AI 產生後即可查看執行紀錄"
        onClick={jest.fn()}
      />,
    )

    const button = screen.getByRole("button", { name: "完成一次 AI 產生後即可查看執行紀錄" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("data-state", "empty")
    expect(button).toHaveClass(
      "border-transparent",
      "bg-transparent",
      "text-muted-foreground/35",
      "disabled:opacity-100",
    )
  })

  it("uses a bounded interaction treatment and opens records when available", () => {
    const onClick = jest.fn()
    render(
      <AiDiagnosticsButton
        hasRecords
        availableLabel="查看本次 AI 執行紀錄"
        unavailableLabel="完成一次 AI 產生後即可查看執行紀錄"
        onClick={onClick}
      />,
    )

    const button = screen.getByRole("button", { name: "查看本次 AI 執行紀錄" })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute("data-state", "ready")
    expect(button).toHaveClass(
      "border-primary/30",
      "bg-primary/10",
      "text-primary",
    )

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
