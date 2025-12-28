// features/medical-note/hooks/useGptQuery.ts
"use client"

import { useState, useCallback } from "react"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { CHAT_PROXY_URL, PROXY_CLIENT_KEY, hasChatProxy, hasGeminiProxy } from "@/lib/config/ai"
import {
  getModelDefinition,
  isBuiltInModelId,
  type ModelDefinition,
} from "@/features/medical-note/constants/models"

function extractMessageContent(payload: unknown): string {
  if (!payload) return ""
  if (typeof payload === "string") return payload
  if (Array.isArray(payload)) {
    return payload
      .map((item) => extractMessageContent(item))
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .join("\n")
  }
  if (typeof payload === "object") {
    const maybeContent = (payload as Record<string, unknown>).content
    if (maybeContent) {
      const extracted = extractMessageContent(maybeContent)
      if (extracted) return extracted
    }

    const maybeText = (payload as Record<string, unknown>).text
    if (maybeText && typeof maybeText === "string") {
      return maybeText
    }

    const maybeMessage = (payload as Record<string, unknown>).message
    if (maybeMessage) {
      const extracted = extractMessageContent(maybeMessage)
      if (extracted) return extracted
    }

    const maybeChoices = (payload as Record<string, unknown>).choices
    if (Array.isArray(maybeChoices)) {
      for (const choice of maybeChoices) {
        const extracted = extractMessageContent(choice)
        if (extracted) return extracted
      }
    }
  }
  return ""
}

function extractGeminiContent(payload: unknown): string {
  if (!payload) return ""
  if (typeof payload === "string") return payload
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const extracted = extractGeminiContent(entry)
      if (extracted) return extracted
    }
    return ""
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>

    if (Array.isArray(record.candidates)) {
      for (const candidate of record.candidates) {
        const extracted = extractGeminiContent(candidate)
        if (extracted) return extracted
      }
    }

    if (record.content) {
      const extracted = extractGeminiContent(record.content)
      if (extracted) return extracted
    }

    if (Array.isArray(record.parts)) {
      const texts = record.parts
        .map((part) => {
          if (!part || typeof part !== "object") return ""
          const text = (part as Record<string, unknown>).text
          return typeof text === "string" ? text : ""
        })
        .filter((text) => text.trim().length > 0)

      if (texts.length > 0) {
        return texts.join("\n")
      }
    }

    if (typeof record.text === "string") {
      return record.text
    }
  }

  return ""
}

function transformMessagesForGemini(messages: GptMessage[]): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages.map((message) => {
    const baseRole = message.role === "assistant" ? "model" : "user"
    const role = message.role === "system" ? "user" : baseRole
    const text = message.role === "system" ? `System instruction:\n${message.content}` : message.content
    return {
      role,
      parts: [{ text }],
    }
  })
}

type GptMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface UseGptQueryOptions {
  defaultModel?: string;
  initialMessages?: GptMessage[];
  timeout?: number; // in milliseconds
  onResponse?: (response: string) => void;
  onError?: (error: Error) => void;
}

export function useGptQuery({
  defaultModel = 'gpt-4.1',
  initialMessages = [],
  timeout = 60000, // 1 minute default timeout (60000ms)
  onResponse,
  onError
}: UseGptQueryOptions = {}) {
  const { apiKey, geminiKey } = useApiKey()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [response, setResponse] = useState("")
  const [model, setModel] = useState(defaultModel)
  const [progress, setProgress] = useState(0)

  const queryGpt = useCallback(async (messages: GptMessage[], customModel?: string) => {
    const effectiveModel = customModel || model
    const modelDefinition: ModelDefinition | undefined = getModelDefinition(effectiveModel)
    const modelProvider = modelDefinition?.provider ?? "openai"

    const isBuiltInModel = isBuiltInModelId(effectiveModel)
    const shouldUseOpenAiProxy = modelProvider === "openai" && !apiKey && isBuiltInModel && hasChatProxy
    const shouldUseGeminiProxy = modelProvider === "gemini" && !geminiKey && hasGeminiProxy

    if (modelProvider === "openai") {
      if (!apiKey) {
        if (modelDefinition?.requiresUserKey) {
          const error = new Error("This GPT model requires a personal OpenAI API key")
          setError(error)
          throw error
        }

        if (!shouldUseOpenAiProxy) {
          const error = new Error("Built-in GPT models require either the PrismaCare proxy or a personal OpenAI key")
          setError(error)
          throw error
        }
      }
    } else if (modelProvider === "gemini") {
      if (!geminiKey && !shouldUseGeminiProxy) {
        const error = new Error("Gemini models require either the PrismaCare Gemini proxy or a personal Gemini key")
        setError(error)
        throw error
      }
    }

    // Reset states
    setIsLoading(true)
    setError(null)
    setResponse("")
    setProgress(0)

    // Create a controller for the fetch request to support timeouts
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort("Request timed out. Please try again.")
    }, timeout)

    try {
      // Initial progress update
      setProgress(10)
      
      const combinedMessages = [...initialMessages, ...messages]

      let targetUrl = "/api/llm"
      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      }
      let requestBody: Record<string, unknown> = {}

      if (modelProvider === "openai") {
        requestBody = {
          model: effectiveModel,
          messages: combinedMessages,
          stream: false,
        }

        if (shouldUseOpenAiProxy) {
          if (!CHAT_PROXY_URL) {
            throw new Error("Chat proxy URL is not configured")
          }
          targetUrl = CHAT_PROXY_URL
          if (PROXY_CLIENT_KEY) {
            requestHeaders["x-proxy-key"] = PROXY_CLIENT_KEY
          }
        } else if (apiKey) {
          requestHeaders["x-openai-key"] = apiKey
        }
      } else {
        // Gemini request payload
        if (shouldUseGeminiProxy) {
          targetUrl = "/api/gemini-proxy"
          requestBody = {
            messages: combinedMessages,
            model: effectiveModel,
          }
        } else {
          const trimmedKey = geminiKey?.trim()
          if (!trimmedKey) {
            throw new Error("Gemini API key is not set")
          }

          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent?key=${encodeURIComponent(trimmedKey)}`
          targetUrl = endpoint
          requestBody = {
            contents: transformMessagesForGemini(combinedMessages),
          }
        }
      }

      const response = await fetch(targetUrl, {
        method: "POST",
        signal: controller.signal,
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      })

      // Update progress after receiving headers
      setProgress(30)

      if (!response.ok) {
        let errorMessage = "Failed to fetch from model service"
        if (modelProvider === "openai") {
          errorMessage = shouldUseOpenAiProxy ? "Failed to reach clinical insights proxy" : "Failed to fetch from OpenAI"
        } else if (modelProvider === "gemini") {
          errorMessage = shouldUseGeminiProxy ? "Failed to reach Gemini proxy" : "Failed to fetch from Gemini"
        }
        try {
          const errorData = await response.json()
          errorMessage =
            errorData?.error?.message ||
            errorData?.error ||
            errorData?.message ||
            errorMessage
        } catch (e) {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }

      // Update progress before parsing response
      setProgress(70)

      const data = await response.json()
      console.log('Raw API Response:', data) // Log the full response for debugging

      let responseText = ""
      if (modelProvider === "openai") {
        if (shouldUseOpenAiProxy) {
          const proxyPayload = data?.message ?? data?.openAiResponse ?? data
          responseText = extractMessageContent(proxyPayload)
          if (!responseText) {
            console.error('Invalid proxy response:', data)
            throw new Error('Invalid response format from proxy service')
          }
        } else {
          const directPayload = data?.choices ?? data
          responseText = extractMessageContent(directPayload)
          if (!responseText) {
            console.error('Invalid response format from OpenAI API:', data)
            throw new Error('Invalid response format from OpenAI API')
          }
        }
      } else {
        if (shouldUseGeminiProxy) {
          const proxyPayload = data?.message ?? data
          responseText = extractMessageContent(proxyPayload) || extractGeminiContent(proxyPayload)
          if (!responseText) {
            console.error('Invalid Gemini proxy response:', data)
            throw new Error('Invalid response format from proxy service')
          }
        } else {
          responseText = extractGeminiContent(data)
          if (!responseText) {
            console.error('Invalid response format from Gemini API:', data)
            throw new Error('Invalid response format from Gemini API')
          }
        }
      }
      setResponse(responseText)
      onResponse?.(responseText)
      return responseText
    } catch (err) {
      let error: Error
      
      if (err instanceof Error) {
        error = err
        // Special handling for abort errors (timeouts)
        if (error.name === 'AbortError') {
          error = new Error('Request timed out after 1 minute. The server took too long to respond.')
          error.name = 'TimeoutError'
        }
      } else {
        error = new Error(typeof err === 'string' ? err : 'An unknown error occurred')
      }
      
      console.error('Error querying GPT:', error);
      const errorObj = error as Error;
      setError(errorObj);
      onError?.(errorObj);
      return '';
    } finally {
      clearTimeout(timeoutId)
      setIsLoading(false)
      setTimeout(() => setProgress(0), 500)
    }
  }, [apiKey, geminiKey, model, initialMessages, timeout, hasChatProxy, hasGeminiProxy])

  return {
    queryGpt,
    response,
    isLoading,
    error,
    model,
    setModel,
    progress
  }
}
