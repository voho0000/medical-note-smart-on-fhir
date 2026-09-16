/** @jest-environment node */

const sendEmail = jest.fn()

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendEmail },
  })),
}))

import { NextRequest } from "next/server"
import { POST } from "@/app/api/feedback/route"

const validBody = {
  reportId: "FB-20260915-ABCDEF12",
  email: "reporter@example.test",
  issueType: "ai",
  severity: "medium",
  description: "A sufficiently detailed issue description for the route.",
  systemInfo: {
    timestamp: "2026-09-15T00:00:00.000Z",
    userAgent: "test-browser",
    screenResolution: "1280x720",
    language: "zh-TW",
    currentPath: "/",
    fhirServerOrigin: "https://fhir.example.test",
  },
}

function feedbackRequest(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  })
}

describe("feedback Next route", () => {
  const previousApiKey = process.env.RESEND_API_KEY
  const previousTo = process.env.FEEDBACK_TO_EMAIL
  const previousFrom = process.env.FEEDBACK_FROM_EMAIL

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key"
    process.env.FEEDBACK_TO_EMAIL = "maintainer@example.test"
    process.env.FEEDBACK_FROM_EMAIL = "MediPrisma <feedback@example.test>"
    sendEmail.mockReset()
    sendEmail.mockResolvedValue({ data: { id: "email-1" }, error: null })
  })

  afterAll(() => {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previousApiKey
    if (previousTo === undefined) delete process.env.FEEDBACK_TO_EMAIL
    else process.env.FEEDBACK_TO_EMAIL = previousTo
    if (previousFrom === undefined) delete process.env.FEEDBACK_FROM_EMAIL
    else process.env.FEEDBACK_FROM_EMAIL = previousFrom
  })

  it("returns the report ID and uses it to prevent duplicate email delivery", async () => {
    const response = await POST(feedbackRequest(validBody, "192.0.2.1"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      emailSent: true,
      reportId: "FB-20260915-ABCDEF12",
    })
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "MediPrisma <feedback@example.test>",
        to: ["maintainer@example.test"],
        subject: expect.stringContaining("FB-20260915-ABCDEF12"),
      }),
      { idempotencyKey: "FB-20260915-ABCDEF12" },
    )
    expect(sendEmail.mock.calls[0][0].subject)
      .toContain("AI 回答或臨床解讀問題")
  })

  it("rejects issue types outside the allowlist", async () => {
    const response = await POST(feedbackRequest({
      ...validBody,
      issueType: "<style>bad</style>",
    }, "192.0.2.2"))

    expect(response.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("rejects an oversized email before running format validation", async () => {
    const response = await POST(feedbackRequest({
      ...validBody,
      email: `a@${".".repeat(160_000)} `,
    }, "192.0.2.3"))

    expect(response.status).toBe(413)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
