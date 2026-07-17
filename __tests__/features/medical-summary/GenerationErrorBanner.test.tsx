import { fireEvent, render, screen } from "@testing-library/react"
import { GenerationErrorBanner } from "@/features/medical-summary/components/GenerationErrorBanner"

describe("GenerationErrorBanner", () => {
  const errors = [{
    label: "摘要重點",
    message: "選取的病歷資料超過此模型的內容上限。",
  }]

  it("can be dismissed with its close button", () => {
    render(
      <GenerationErrorBanner
        title="部分摘要內容尚未完成"
        errors={errors}
        retryLabel="重試"
        closeLabel="關閉"
        isBusy={false}
        onRetry={jest.fn()}
      />,
    )

    expect(screen.getByRole("alert")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "關閉" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("keeps retry available while idle", () => {
    const onRetry = jest.fn()
    render(
      <GenerationErrorBanner
        title="部分摘要內容尚未完成"
        errors={errors}
        retryLabel="重試"
        closeLabel="關閉"
        isBusy={false}
        onRetry={onRetry}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "重試" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
