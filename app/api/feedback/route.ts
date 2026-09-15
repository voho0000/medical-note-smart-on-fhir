import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { randomBytes } from "crypto"
import {
  validateFeedbackImages,
  type FeedbackImagePayload,
} from "./image-attachments"

interface FeedbackRequest {
  reportId?: string
  email: string
  issueType: string
  severity: string
  description: string
  steps?: string
  images?: FeedbackImagePayload[]
  // patientId 刻意排除 — 回報信經第三方郵件服務（Resend），不可夾帶病人識別資訊
  systemInfo: {
    timestamp: string
    userAgent: string
    screenResolution: string
    viewport?: string
    devicePixelRatio?: string
    rootFontSize?: string
    theme?: string
    timeZone?: string
    language: string
    currentPath: string
    currentView?: string
    fhirServerOrigin?: string
    fhirServerUrl?: string
    appVersion?: string
    launchSource?: string
    site?: string
  }
}

// All request fields are attacker-controlled; escape anything interpolated into the HTML email
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const ISSUE_TYPES = new Set(["bug", "ai", "ui", "data", "performance", "privacy", "feature", "other"])
const SEVERITIES = new Set(["low", "medium", "high", "critical"])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REPORT_ID_PATTERN = /^FB-\d{8}-[A-Z0-9]{8}$/
const MAX_SYSTEM_FIELD_LENGTH = 1000

// 瀏覽器發出的跨站請求帶 Origin — 擋掉非本站的網頁；curl 可偽造，但配合
// rate limit 已足以擋掉順手亂打的濫用（正式驗證需等 Functions 端做 ID token）
const ALLOWED_ORIGINS = new Set([
  "https://voho0000.github.io",
  "http://localhost:3001",
  "http://localhost:3000",
])

// Serverless 每個 instance 各自計數（非全域精確），但足以把單一來源的
// email 轟炸從「無上限」壓到「每 instance 每小時個位數」
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 5
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT_MAX
}

const MAX_FIELD_LENGTH = 5000

function createReportId(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "")
  return `FB-${date}-${randomBytes(4).toString("hex").toUpperCase()}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasValidSystemInfo(value: unknown): boolean {
  if (!isRecord(value)) return false
  const required = ["timestamp", "userAgent", "screenResolution", "language", "currentPath"]
  if (required.some((key) =>
    typeof value[key] !== "string" ||
    (value[key] as string).length === 0 ||
    (value[key] as string).length > MAX_SYSTEM_FIELD_LENGTH
  )) return false
  if (Number.isNaN(Date.parse(value.timestamp as string))) return false

  const optional = [
    "viewport", "devicePixelRatio", "rootFontSize", "theme", "timeZone",
    "currentView", "fhirServerOrigin", "fhirServerUrl", "appVersion",
    "launchSource", "site",
  ]
  return optional.every((key) => value[key] === undefined ||
    (typeof value[key] === "string" && (value[key] as string).length <= MAX_SYSTEM_FIELD_LENGTH))
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    const vercelHost = request.headers.get("host")
    const sameHostOrigin = origin && vercelHost && origin === `https://${vercelHost}`
    if (origin && !ALLOWED_ORIGINS.has(origin) && !sameHostOrigin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "3600" } }
      )
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    if (!isRecord(payload)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const body = payload as unknown as FeedbackRequest

    const { email, issueType, severity, description, steps, images, systemInfo, reportId: submittedReportId } = body

    if (
      typeof email !== "string" || !EMAIL_PATTERN.test(email) ||
      typeof issueType !== "string" || !ISSUE_TYPES.has(issueType) ||
      typeof severity !== "string" || !SEVERITIES.has(severity) ||
      typeof description !== "string" || description.trim().length < 20 ||
      (steps !== undefined && typeof steps !== "string") ||
      !hasValidSystemInfo(systemInfo) ||
      (submittedReportId !== undefined &&
        (typeof submittedReportId !== "string" || !REPORT_ID_PATTERN.test(submittedReportId)))
    ) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      )
    }
    const reportId = submittedReportId || createReportId()

    if (
      String(email).length > 320 ||
      String(description).length > MAX_FIELD_LENGTH ||
      String(steps ?? "").length > MAX_FIELD_LENGTH
    ) {
      return NextResponse.json(
        { error: "Payload too large" },
        { status: 413 }
      )
    }

    const imageValidation = validateFeedbackImages(images)
    if (!imageValidation.ok) {
      return NextResponse.json(
        { error: imageValidation.status === 413 ? "Payload too large" : "Invalid image attachment" },
        { status: imageValidation.status }
      )
    }
    const validatedImages = imageValidation.images

    // Badge CSS classes must come from the allowlist, never from raw input
    const issueTypeClass = issueType
    const severityClass = severity

    const emailContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #3b82f6; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .section { margin-bottom: 20px; }
    .label { font-weight: bold; color: #1f2937; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-bug { background: #fee2e2; color: #991b1b; }
    .badge-ai { background: #e0e7ff; color: #3730a3; }
    .badge-ui { background: #dbeafe; color: #1e40af; }
    .badge-data { background: #e0f2fe; color: #075985; }
    .badge-performance { background: #fef3c7; color: #92400e; }
    .badge-privacy { background: #fee2e2; color: #991b1b; }
    .badge-feature { background: #d1fae5; color: #065f46; }
    .badge-other { background: #e5e7eb; color: #374151; }
    .badge-low { background: #d1fae5; color: #065f46; }
    .badge-medium { background: #fef3c7; color: #92400e; }
    .badge-high { background: #fed7aa; color: #9a3412; }
    .badge-critical { background: #fee2e2; color: #991b1b; }
    .system-info { background: white; padding: 15px; border-radius: 6px; font-size: 13px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">🐛 醫療筆記系統 - 問題回報</h2>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">Medical Note System - Issue Report</p>
    </div>
    
    <div class="content">
      <div class="section">
        <span class="label">回報編號:</span> ${escapeHtml(reportId)}
      </div>
      <div class="section">
        <span class="label">回報者 Email:</span> ${escapeHtml(email)}
      </div>

      <div class="section">
        <span class="label">問題類型:</span>
        <span class="badge badge-${issueTypeClass}">${escapeHtml(getIssueTypeLabel(issueType))}</span>
      </div>

      <div class="section">
        <span class="label">影響程度:</span>
        <span class="badge badge-${severityClass}">${escapeHtml(getSeverityLabel(severity))}</span>
      </div>

      <div class="section">
        <span class="label">問題描述:</span>
        <div style="margin-top: 8px; white-space: pre-wrap; background: white; padding: 12px; border-radius: 6px;">${escapeHtml(description)}</div>
      </div>

      ${steps ? `
      <div class="section">
        <span class="label">重現步驟:</span>
        <div style="margin-top: 8px; white-space: pre-wrap; background: white; padding: 12px; border-radius: 6px;">${escapeHtml(steps)}</div>
      </div>
      ` : ''}

      ${validatedImages.length > 0 ? `
      <div class="section">
        <span class="label">圖片附件:</span> ${validatedImages.length} 張（請見郵件附件）
      </div>
      ` : ''}

      <div class="section">
        <span class="label">系統資訊:</span>
        <div class="system-info">
          <div><strong>時間:</strong> ${escapeHtml(new Date(systemInfo.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }))}</div>
          <div><strong>瀏覽器:</strong> ${escapeHtml(systemInfo.userAgent)}</div>
          <div><strong>螢幕解析度:</strong> ${escapeHtml(systemInfo.screenResolution)}</div>
          <div><strong>視窗大小:</strong> ${escapeHtml(systemInfo.viewport ?? "unknown")}</div>
          <div><strong>像素比:</strong> ${escapeHtml(systemInfo.devicePixelRatio ?? "unknown")}</div>
          <div><strong>根字級:</strong> ${escapeHtml(systemInfo.rootFontSize ?? "unknown")}</div>
          <div><strong>主題:</strong> ${escapeHtml(systemInfo.theme ?? "unknown")}</div>
          <div><strong>時區:</strong> ${escapeHtml(systemInfo.timeZone ?? "unknown")}</div>
          <div><strong>語言:</strong> ${escapeHtml(systemInfo.language)}</div>
          <div><strong>當前頁面:</strong> ${escapeHtml(systemInfo.currentPath)}</div>
          <div><strong>當前檢視:</strong> ${escapeHtml(systemInfo.currentView ?? "unknown")}</div>
          <div><strong>FHIR Server origin:</strong> ${escapeHtml(systemInfo.fhirServerOrigin ?? systemInfo.fhirServerUrl ?? "unknown")}</div>
          <div><strong>應用程式版本:</strong> ${escapeHtml(systemInfo.appVersion ?? "unknown")}</div>
          <div><strong>啟動來源:</strong> ${escapeHtml(systemInfo.launchSource ?? "unknown")}</div>
          <div><strong>站點:</strong> ${escapeHtml(systemInfo.site ?? "unknown")}</div>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>此郵件由 MediPrisma 系統自動發送</p>
      <p>This email was automatically sent by MediPrisma system</p>
    </div>
  </div>
</body>
</html>
`

    const plainTextContent = `
醫療筆記系統 - 問題回報
Medical Note System - Issue Report

回報編號: ${reportId}
回報者 Email: ${email}
問題類型: ${getIssueTypeLabel(issueType)}
影響程度: ${getSeverityLabel(severity)}

問題描述:
${description}

${steps ? `重現步驟:\n${steps}\n` : ''}
${validatedImages.length > 0 ? `圖片附件: ${validatedImages.length} 張（請見郵件附件）\n` : ''}

系統資訊:
- 時間: ${new Date(systemInfo.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
- 瀏覽器: ${systemInfo.userAgent}
- 螢幕解析度: ${systemInfo.screenResolution}
- 視窗大小: ${systemInfo.viewport ?? "unknown"}
- 像素比: ${systemInfo.devicePixelRatio ?? "unknown"}
- 根字級: ${systemInfo.rootFontSize ?? "unknown"}
- 主題: ${systemInfo.theme ?? "unknown"}
- 時區: ${systemInfo.timeZone ?? "unknown"}
- 語言: ${systemInfo.language}
- 當前頁面: ${systemInfo.currentPath}
- 當前檢視: ${systemInfo.currentView ?? "unknown"}
- FHIR Server origin: ${systemInfo.fhirServerOrigin ?? systemInfo.fhirServerUrl ?? "unknown"}
- 應用程式版本: ${systemInfo.appVersion ?? "unknown"}
- 啟動來源: ${systemInfo.launchSource ?? "unknown"}
- 站點: ${systemInfo.site ?? "unknown"}

---
此郵件由 MediPrisma 系統自動發送
This email was automatically sent by MediPrisma system
`

    // 使用 Resend SDK 發送郵件。收件信箱由部署者透過 FEEDBACK_TO_EMAIL 設定，
    // 不在原始碼中硬編任何個人信箱。
    const resendApiKey = process.env.RESEND_API_KEY
    const feedbackTo = process.env.FEEDBACK_TO_EMAIL
    const feedbackFrom = process.env.FEEDBACK_FROM_EMAIL

    if (!resendApiKey || !feedbackTo || !feedbackFrom) {
      // 沒有寄送或持久化能力時明確回報不可用，避免 UI 顯示假成功；
      // server logs 只保留類型與嚴重度，不記回報內容或圖片。
      console.error("Feedback email not configured (RESEND_API_KEY / FEEDBACK_TO_EMAIL) — feedback received but no email sent", {
        issueType,
        severity,
      })

      return NextResponse.json(
        { error: "Feedback service unavailable", emailSent: false, reportId },
        { status: 503 }
      )
    }

    // 初始化 Resend
    const resend = new Resend(resendApiKey)

    // 使用 Resend SDK 發送郵件
    const { data, error } = await resend.emails.send(
      {
        from: feedbackFrom,
        to: [feedbackTo],
        replyTo: email,
        subject: `[問題回報 ${reportId}] ${getIssueTypeLabel(issueType)} - ${getSeverityLabel(severity)}`,
        html: emailContent,
        text: plainTextContent,
        ...(validatedImages.length > 0 && {
          attachments: validatedImages.map((image, index) => ({
            filename: `feedback-image-${index + 1}.${image.extension}`,
            content: image.data,
            contentType: image.contentType,
          })),
        }),
      },
      { idempotencyKey: reportId }
    )

    if (error) {
      console.error("Resend SDK error:", error)
      throw new Error(`Failed to send email: ${error.message}`)
    }

    console.log("Email sent successfully, id:", data?.id)

    return NextResponse.json({ success: true, emailSent: true, reportId })
  } catch (error) {
    // 細節只留在 server log，不回給 caller
    console.error("Feedback API error:", error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

function getIssueTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    bug: "功能錯誤 (Bug)",
    ai: "AI 回答或臨床解讀問題 (AI Response / Clinical Interpretation)",
    ui: "介面與操作問題 (UI/UX)",
    data: "資料顯示問題 (Data)",
    performance: "速度或穩定性問題 (Performance)",
    privacy: "病安或隱私疑慮 (Safety / Privacy)",
    feature: "功能建議 (Feature Request)",
    other: "其他 (Other)",
  }
  return labels[type] || type
}

function getSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    low: "仍可繼續使用 (Low impact)",
    medium: "部分操作受影響 (Medium impact)",
    high: "無法完成工作 (High impact)",
    critical: "疑似病安或隱私事件 (Safety / Privacy)",
  }
  return labels[severity] || severity
}
