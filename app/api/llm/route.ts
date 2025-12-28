import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-openai-key") || request.headers.get("x-openai-api-key")

    if (!apiKey) {
      return NextResponse.json({ error: "Missing OpenAI API key" }, { status: 401 })
    }

    const { model, messages, temperature } = await request.json()

    if (!model || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const proxyBody: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    }

    // For gpt-5-mini, use temperature = 1 to avoid Gemini routing issues
    // Some proxy services route gpt-5-mini to Gemini which only supports temperature = 1
    if (model === "gpt-5-mini") {
      proxyBody.temperature = 1
    } else if (typeof temperature === "number") {
      proxyBody.temperature = temperature
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(proxyBody),
    })

    if (!response.ok) {
      let errorPayload: unknown
      try {
        errorPayload = await response.json()
      } catch (error) {
        errorPayload = { error: response.statusText }
      }

      return NextResponse.json(
        {
          error: typeof errorPayload === "object" && errorPayload !== null ? (errorPayload as Record<string, unknown>).error ?? errorPayload : errorPayload,
          status: response.status,
        },
        { status: response.status || 500 },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("LLM proxy error", error)
    return NextResponse.json({ error: "Failed to query language model" }, { status: 500 })
  }
}
