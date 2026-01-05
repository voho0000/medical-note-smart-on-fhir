import { NextRequest } from "next/server"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, model } = body

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const apiKey = request.headers.get("x-openai-key") || request.headers.get("x-openai-api-key")
    const geminiKey = request.headers.get("x-gemini-key")

    const isGemini = model?.startsWith("gemini") || model?.startsWith("models/gemini")
    
    if (isGemini) {
      if (!geminiKey) {
        return new Response(JSON.stringify({ error: "Missing Gemini API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      }
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages.filter((m: any) => m.role !== "system").map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          })),
          systemInstruction: messages.find((m: any) => m.role === "system")?.content,
        }),
      })

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`)
      }

      return new Response(response.body, {
        headers: { "Content-Type": "text/plain" },
      })
    } else {
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "Missing OpenAI API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages,
          stream: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`)
      }

      return new Response(response.body, {
        headers: { "Content-Type": "text/event-stream" },
      })
    }
  } catch (error) {
    console.error("Agent API error:", error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to process agent request" 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
