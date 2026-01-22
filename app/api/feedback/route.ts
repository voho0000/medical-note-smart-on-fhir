import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

interface FeedbackRequest {
  email: string
  issueType: string
  severity: string
  description: string
  steps?: string
  systemInfo: {
    timestamp: string
    userAgent: string
    screenResolution: string
    language: string
    currentPath: string
    fhirServerUrl: string
    patientId: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: FeedbackRequest = await request.json()

    const { email, issueType, severity, description, steps, systemInfo } = body

    if (!email || !issueType || !description) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

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
    .badge-ui { background: #dbeafe; color: #1e40af; }
    .badge-performance { background: #fef3c7; color: #92400e; }
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
        <span class="label">回報者 Email:</span> ${email}
      </div>
      
      <div class="section">
        <span class="label">問題類型:</span> 
        <span class="badge badge-${issueType}">${getIssueTypeLabel(issueType)}</span>
      </div>
      
      <div class="section">
        <span class="label">嚴重程度:</span> 
        <span class="badge badge-${severity}">${getSeverityLabel(severity)}</span>
      </div>
      
      <div class="section">
        <span class="label">問題描述:</span>
        <div style="margin-top: 8px; white-space: pre-wrap; background: white; padding: 12px; border-radius: 6px;">${description}</div>
      </div>
      
      ${steps ? `
      <div class="section">
        <span class="label">重現步驟:</span>
        <div style="margin-top: 8px; white-space: pre-wrap; background: white; padding: 12px; border-radius: 6px;">${steps}</div>
      </div>
      ` : ''}
      
      <div class="section">
        <span class="label">系統資訊:</span>
        <div class="system-info">
          <div><strong>時間:</strong> ${new Date(systemInfo.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
          <div><strong>瀏覽器:</strong> ${systemInfo.userAgent}</div>
          <div><strong>螢幕解析度:</strong> ${systemInfo.screenResolution}</div>
          <div><strong>語言:</strong> ${systemInfo.language}</div>
          <div><strong>當前頁面:</strong> ${systemInfo.currentPath}</div>
          <div><strong>FHIR Server:</strong> ${systemInfo.fhirServerUrl}</div>
          <div><strong>患者 ID:</strong> ${systemInfo.patientId}</div>
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

回報者 Email: ${email}
問題類型: ${getIssueTypeLabel(issueType)}
嚴重程度: ${getSeverityLabel(severity)}

問題描述:
${description}

${steps ? `重現步驟:\n${steps}\n` : ''}

系統資訊:
- 時間: ${new Date(systemInfo.timestamp).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
- 瀏覽器: ${systemInfo.userAgent}
- 螢幕解析度: ${systemInfo.screenResolution}
- 語言: ${systemInfo.language}
- 當前頁面: ${systemInfo.currentPath}
- FHIR Server: ${systemInfo.fhirServerUrl}
- 患者 ID: ${systemInfo.patientId}

---
此郵件由 MediPrisma 系統自動發送
This email was automatically sent by MediPrisma system
`

    // 使用 Resend SDK 發送郵件
    const resendApiKey = process.env.RESEND_API_KEY
    
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured")
      // 在沒有配置 API key 的情況下，記錄到控制台並返回成功
      // 這樣開發環境中不會因為缺少 API key 而失敗
      console.log("Feedback submission (no email sent):", {
        email,
        issueType,
        severity,
        description: description.substring(0, 100) + "...",
      })
      
      return NextResponse.json({ 
        success: true,
        message: "Feedback received (email not configured)" 
      })
    }

    // 初始化 Resend
    const resend = new Resend(resendApiKey)

    console.log("Sending email via Resend SDK...")

    // 使用 Resend SDK 發送郵件
    const { data, error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: ["voho0000@gmail.com"],
      replyTo: email,
      subject: `[問題回報] ${getIssueTypeLabel(issueType)} - ${getSeverityLabel(severity)}`,
      html: emailContent,
      text: plainTextContent,
    })

    if (error) {
      console.error("Resend SDK error:", error)
      throw new Error(`Failed to send email: ${error.message}`)
    }

    console.log("Email sent successfully:", data)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Feedback API error:", error)
    console.error("Error details:", error instanceof Error ? error.message : String(error))
    
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

function getIssueTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    bug: "功能錯誤 (Bug)",
    ui: "UI/UX 問題",
    performance: "效能問題 (Performance)",
    feature: "功能建議 (Feature Request)",
    other: "其他 (Other)",
  }
  return labels[type] || type
}

function getSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    low: "低 (Low)",
    medium: "中 (Medium)",
    high: "高 (High)",
    critical: "緊急 (Critical)",
  }
  return labels[severity] || severity
}
