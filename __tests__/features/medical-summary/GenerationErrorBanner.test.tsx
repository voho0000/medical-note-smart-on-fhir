import { fireEvent, render, screen } from "@testing-library/react"
import { Database, Settings2 } from "lucide-react"
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

  it("shows overflow actions instead of the fallback retry", () => {
    const onAdjustScope = jest.fn()
    const onOpenSettings = jest.fn()
    const onRetry = jest.fn()

    render(
      <GenerationErrorBanner
        title="輸入內容超過模型上限"
        errors={errors}
        retryLabel="重試"
        closeLabel="關閉"
        isBusy={false}
        onRetry={onRetry}
        actions={[
          {
            label: "調整資料範圍",
            onClick: onAdjustScope,
            icon: <Database aria-hidden="true" />,
          },
          {
            label: "模型與內容視窗設定",
            onClick: onOpenSettings,
            icon: <Settings2 aria-hidden="true" />,
            variant: "secondary",
          },
        ]}
      />,
    )

    expect(screen.queryByRole("button", { name: "重試" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "調整資料範圍" }))
    fireEvent.click(screen.getByRole("button", { name: "模型與內容視窗設定" }))

    expect(onAdjustScope).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it("disables overflow actions while generation is busy", () => {
    render(
      <GenerationErrorBanner
        title="輸入內容超過模型上限"
        errors={errors}
        retryLabel="重試"
        closeLabel="關閉"
        isBusy
        onRetry={jest.fn()}
        actions={[
          { label: "調整資料範圍", onClick: jest.fn() },
        ]}
      />,
    )

    expect(screen.getByRole("button", { name: "調整資料範圍" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "關閉" })).toBeEnabled()
  })
})
