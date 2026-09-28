import type { ImgHTMLAttributes } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { FeedbackDialog } from "@/features/feedback/components/FeedbackDialog"

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean
    unoptimized?: boolean
  }) => <img {...props} alt={props.alt || ""} />,
}))

jest.mock("@/src/application/providers/language.provider", () => ({
  useLanguage: () => ({
    t: jest.requireActual("@/src/shared/i18n/locales/zh-TW").zhTW,
  }),
}))

jest.mock("@/src/application/hooks/chat/use-fhir-context.hook", () => ({
  useFhirContext: () => ({ fhirServerUrl: "https://fhir.example.test" }),
}))

jest.mock("@/src/application/providers/auth.provider", () => ({
  useAuth: () => ({ user: { email: "signed-in@example.test" } }),
}))

jest.mock("@/src/shared/hooks/use-app-version.hook", () => ({
  useAppVersion: () => "2.0.0-test",
}))

jest.mock("@/src/application/feedback/feedback-request-headers", () => ({
  getFeedbackRequestHeaders: async () => ({
    "Content-Type": "application/json",
    Authorization: "Bearer id-token",
    "X-Firebase-AppCheck": "app-check-token",
  }),
}))

jest.mock("@/src/application/telemetry/launch-context", () => ({
  detectLaunchSource: async () => "smart",
  detectSite: () => "vghtpe",
}))

jest.mock("@/features/feedback/image-attachments", () => ({
  ...jest.requireActual("@/features/feedback/image-attachments"),
  prepareFeedbackImage: async (file: File) => file,
}))

describe("FeedbackDialog image upload", () => {
  const createObjectURL = jest.fn(() => "blob:feedback-preview")
  const revokeObjectURL = jest.fn()

  beforeAll(() => {
    Object.defineProperty(global, "ResizeObserver", {
      configurable: true,
      value: class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    })
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    })
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    })
  })

  it("previews a selected screenshot and allows removing it", async () => {
    render(<FeedbackDialog open onOpenChange={jest.fn()} />)
    const input = screen.getByLabelText("附加截圖（選填）")
    const file = new File([new Uint8Array([1, 2, 3])], "screen.png", {
      type: "image/png",
    })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText("已選 1 / 3 張")).toBeVisible())
    expect(screen.getByText("screen.png")).toBeVisible()
    expect(screen.getByAltText("附加圖片 1")).toHaveAttribute(
      "src",
      "blob:feedback-preview",
    )

    fireEvent.click(screen.getByRole("button", { name: "移除圖片 1" }))

    expect(screen.getByText("已選 0 / 3 張")).toBeVisible()
    expect(screen.queryByText("screen.png")).not.toBeInTheDocument()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:feedback-preview")
  })

  it("does not show an extra warning for the critical impact option", async () => {
    render(<FeedbackDialog open onOpenChange={jest.fn()} />)

    fireEvent.click(screen.getByRole("combobox", { name: /影響程度/ }))
    fireEvent.click(await screen.findByRole("option", { name: "疑似病安或隱私事件" }))

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByText(/院內正式通報|緊急處理流程/)).not.toBeInTheDocument()
  })

  it("keeps the selection empty when an unsupported image is chosen", async () => {
    render(<FeedbackDialog open onOpenChange={jest.fn()} />)
    const input = screen.getByLabelText("附加截圖（選填）")
    const file = new File([new Uint8Array([1])], "animation.gif", {
      type: "image/gif",
    })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText(
      "animation.gif 不是支援的圖片格式",
    )).toBeVisible())
    expect(screen.getByText("已選 0 / 3 張")).toBeVisible()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it("submits a screenshot without requiring a confirmation checkbox", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        emailSent: true,
        reportId: "FB-20260915-12345678",
      }),
    } as Response)
    render(<FeedbackDialog open onOpenChange={jest.fn()} />)
    const file = new File([new Uint8Array([1, 2, 3])], "screen.png", {
      type: "image/png",
    })
    fireEvent.change(screen.getByLabelText("附加截圖（選填）"), {
      target: { files: [file] },
    })
    await waitFor(() => expect(screen.getByText("已選 1 / 3 張")).toBeVisible())
    fireEvent.click(screen.getByRole("combobox", { name: /問題類型/ }))
    fireEvent.click(await screen.findByRole("option", { name: "功能錯誤" }))
    fireEvent.change(screen.getByLabelText(/問題描述/), {
      target: { value: "這是一段足夠完整而且可以重現的問題描述內容。" },
    })

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "傳送" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, request] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(request?.body))
    expect(body.images).toHaveLength(1)
    fetchMock.mockRestore()
  })

  it("sends the authenticated contract and keeps a visible report ID", async () => {
    const onOpenChange = jest.fn()
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        emailSent: true,
        reportId: "FB-20260915-ABCDEF12",
      }),
    } as Response)
    render(<FeedbackDialog open onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText(/您的電子郵件/), {
      target: { value: "codex-e2e-test@example.com" },
    })
    fireEvent.click(screen.getByRole("combobox", { name: /問題類型/ }))
    fireEvent.click(await screen.findByRole("option", { name: "AI 回答或臨床解讀問題" }))
    expect(screen.getByPlaceholderText(
      "請指出哪一段回答有問題、原本預期的內容；如有參考依據也請一併提供…",
    )).toBeVisible()
    expect(screen.getByText(
      /可說明內容錯誤、遺漏、與原始資料不一致或引用依據有誤/,
    )).toBeVisible()
    fireEvent.change(screen.getByLabelText(/問題描述/), {
      target: { value: "這是一段足夠完整而且可以重現的問題描述內容。" },
    })
    fireEvent.click(screen.getByRole("button", { name: "傳送" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, request] = fetchMock.mock.calls[0]
    expect(request?.headers).toEqual(expect.objectContaining({
      Authorization: "Bearer id-token",
      "X-Firebase-AppCheck": "app-check-token",
    }))
    const body = JSON.parse(String(request?.body))
    expect(body).toEqual(expect.objectContaining({
      email: "codex-e2e-test@example.com",
      issueType: "ai",
      reportId: expect.stringMatching(/^FB-\d{8}-[A-Z0-9]{8}$/),
      systemInfo: expect.objectContaining({
        appVersion: "2.0.0-test",
        fhirServerOrigin: "https://fhir.example.test",
        launchSource: "smart",
      }),
    }))
    expect(await screen.findByText("回報編號：FB-20260915-ABCDEF12")).toBeVisible()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    fetchMock.mockRestore()
  })

  it("keeps the draft and explains when delivery is unavailable", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Feedback service unavailable" }),
    } as Response)
    render(<FeedbackDialog open onOpenChange={jest.fn()} />)

    fireEvent.click(screen.getByRole("combobox", { name: /問題類型/ }))
    fireEvent.click(await screen.findByRole("option", { name: "功能錯誤" }))
    const description = "這是一段送出失敗後仍然必須保留的問題描述內容。"
    fireEvent.change(screen.getByLabelText(/問題描述/), { target: { value: description } })
    fireEvent.click(screen.getByRole("button", { name: "傳送" }))

    expect(await screen.findByText(/回報服務目前未完成設定/)).toBeVisible()
    expect(screen.getByLabelText(/問題描述/)).toHaveValue(description)
    fetchMock.mockRestore()
  })
})
