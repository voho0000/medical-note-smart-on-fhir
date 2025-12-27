import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-openai-key") || request.headers.get("x-openai-api-key")

    if (!apiKey) {
      return NextResponse.json({ error: "Missing OpenAI API key" }, { status: 401 })
    }

    const { model, messages, temperature = 0.7 } = await request.json()

    if (!model || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: false,
      }),
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
