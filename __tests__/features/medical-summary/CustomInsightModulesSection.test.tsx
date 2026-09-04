import { fireEvent, render, screen } from "@testing-library/react"
import { CustomInsightModulesSection } from "@/features/medical-summary/components/CustomInsightModulesSection"

jest.mock("@/src/application/providers/language.provider", () => ({
  useLanguage: () => ({
    t: {
      common: { stop: "停止", copied: "已複製", copyFailed: "複製失敗" },
      settings: {
        outputFormatPlain: "純文字",
        outputFormatMarkdown: "Markdown",
        outputFormatHtml: "HTML",
      },
      medicalSummary: {
        customSummaryTab: "自訂摘要",
        customInsightsEmpty: "尚無摘要",
        customAutoBadge: "自動",
        customNoCitations: "目前不提供逐項來源引註",
        customGenerate: "產生摘要",
        customRegenerate: "重新產生摘要",
        customExpandResult: "展開「{title}」摘要結果",
        customCollapseResult: "收合「{title}」摘要結果",
        customOpenResult: "放大閱讀「{title}」摘要結果",
        customGenerating: "正在產生",
        customDisplayAs: "顯示格式",
        customCopyText: "複製文字",
        customCopySource: "複製原始碼",
        editCustomInsight: "編輯",
      },
    },
  }),
}))

jest.mock("@/features/clinical-insights/ClinicalInsightsRuntimeProvider", () => ({
  useClinicalInsightsRuntime: () => ({
    panels: [
      { id: "first", title: "第一張", prompt: "第一個提示", showInSummary: true, outputFormat: "markdown" },
      { id: "second", title: "第二張", prompt: "第二個提示", showInSummary: true, outputFormat: "markdown" },
    ],
    canGenerate: true,
    hasData: true,
    responses: {
      first: {
        text: "### 第一張標題\n\n**第一張的完整內容**\n\n更多資訊",
        isEdited: false,
        metadata: null,
      },
      second: { text: "第二張的完整內容", isEdited: false, metadata: null },
    },
    panelStatus: {},
    runPanel: jest.fn(),
    stopPanel: jest.fn(),
  }),
}))

describe("CustomInsightModulesSection result disclosure", () => {
  it("collapses and expands each generated card independently", () => {
    const onManage = jest.fn()
    render(<CustomInsightModulesSection onManage={onManage} />)

    expect(screen.getByText("第一張的完整內容")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "第一張標題" })).toBeInTheDocument()
    expect(screen.getByText("第二張的完整內容")).toBeInTheDocument()
    expect(screen.queryByTestId("custom-insight-preview-first")).not.toBeInTheDocument()
    const firstDisclaimer = screen.getAllByText("目前不提供逐項來源引註")[0]
    const firstUtilityRow = firstDisclaimer.parentElement
    expect(firstUtilityRow)
      .toContainElement(screen.getByRole("combobox", { name: "顯示格式: 第一張" }))
    expect(firstUtilityRow?.lastElementChild).toBe(firstDisclaimer)

    const editButton = screen.getAllByRole("button", { name: "編輯" })[0]
    const regenerateButton = screen.getAllByRole("button", { name: "重新產生摘要" })[0]
    expect(editButton).toHaveClass("sm:h-7", "px-1.5")
    expect(regenerateButton).toHaveClass("border", "bg-background", "sm:h-8", "px-3")

    fireEvent.click(editButton)

    expect(onManage).toHaveBeenCalledWith("first")
    expect(screen.getByText("第一張的完整內容")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "收合「第一張」摘要結果" }))
      .toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "放大閱讀「第一張」摘要結果" }))
      .toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "收合「第一張」摘要結果" }))

    const preview = screen.getByTestId("custom-insight-preview-first")
    expect(preview).toHaveClass("line-clamp-3")
    expect(preview).toHaveTextContent("第一張標題 第一張的完整內容 更多資訊")
    expect(preview).not.toHaveTextContent("**")
    expect(screen.queryByRole("heading", { name: "第一張標題" })).not.toBeInTheDocument()
    expect(screen.getByText("第二張的完整內容")).toBeInTheDocument()
    expect(screen.queryByTestId("custom-insight-preview-second")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "展開「第一張」摘要結果" }))
      .toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("combobox", { name: "顯示格式: 第一張" }))
      .not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "展開「第一張」摘要結果" }))

    expect(screen.queryByTestId("custom-insight-preview-first")).not.toBeInTheDocument()
    expect(screen.getByText("第一張的完整內容")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "收合「第一張」摘要結果" }))
      .toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("combobox", { name: "顯示格式: 第一張" }))
      .toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "放大閱讀「第一張」摘要結果" }))

    const dialog = screen.getByRole("dialog", { name: "第一張" })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent("第一張的完整內容")
  })
})
