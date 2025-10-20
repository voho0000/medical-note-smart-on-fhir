// features/medical-note/hooks/useGptQuery.ts
"use client"

import { useState } from "react"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"

type GptMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

type UseGptQueryOptions = {
  defaultModel?: string
  initialMessages?: GptMessage[]
}

export function useGptQuery(options: UseGptQueryOptions = {}) {
  const { defaultModel = 'gpt-4.1', initialMessages = [] } = options
  const { apiKey } = useApiKey()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [response, setResponse] = useState("")
  const [model, setModel] = useState(defaultModel)

  const queryGpt = async (messages: GptMessage[], customModel?: string) => {
    if (!apiKey) {
      const error = new Error("OpenAI API key is required")
      setError(error)
      throw error
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${apiKey}` 
        },
        body: JSON.stringify({ 
          model: customModel || model,
          messages: [...initialMessages, ...messages],
          temperature: 0.7
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'Failed to fetch from OpenAI')
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || "No response received"
      
      setResponse(content)
      return content
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An unknown error occurred')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  return {
    queryGpt,
    response,
    isLoading,
    error,
    model,
    setModel
  }
}
