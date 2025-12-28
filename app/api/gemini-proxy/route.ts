import { NextRequest, NextResponse } from "next/server"

import { GEMINI_PROXY_URL, PROXY_CLIENT_KEY } from "@/lib/config/ai"

export async function POST(request: NextRequest) {
  if (!GEMINI_PROXY_URL) {
    return NextResponse.json({ error: "Gemini proxy URL is not configured" }, { status: 500 })
  }

  try {
    const payload = await request.json()
    const model = payload?.model
    const messages = payload?.messages
    const temperature = typeof payload?.temperature === "number" ? payload.temperature : undefined

    if (!model || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (PROXY_CLIENT_KEY) {
      headers["x-proxy-key"] = PROXY_CLIENT_KEY
    }

    const proxyBody: Record<string, unknown> = {
      model,
      messages,
    }

    if (typeof temperature === "number") {
      proxyBody.temperature = temperature
    }

    const response = await fetch(GEMINI_PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(proxyBody),
      cache: "no-store",
    })

    if (!response.ok) {
      let errorPayload: unknown
      try {
        errorPayload = await response.json()
      } catch (error) {
        errorPayload = { error: response.statusText || "Unknown error from Gemini proxy" }
      }

      return NextResponse.json(
        {
          error:
            typeof errorPayload === "object" && errorPayload !== null
              ? (errorPayload as Record<string, unknown>).error ?? errorPayload
              : errorPayload,
          status: response.status,
        },
        { status: response.status || 500 },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Gemini proxy request failed", error)
    return NextResponse.json({ error: "Failed to query Gemini proxy" }, { status: 500 })
  }
}
