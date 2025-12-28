// features/medical-note/hooks/useGptQuery.ts
"use client"

import { useState, useCallback } from "react"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { CHAT_PROXY_URL, PROXY_CLIENT_KEY, hasChatProxy } from "@/lib/config/ai"
import { isBuiltInModelId } from "@/features/medical-note/constants/models"

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
  const { apiKey } = useApiKey()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [response, setResponse] = useState("")
  const [model, setModel] = useState(defaultModel)
  const [progress, setProgress] = useState(0)

  const queryGpt = useCallback(async (messages: GptMessage[], customModel?: string) => {
    const effectiveModel = customModel || model
    const isBuiltInModel = isBuiltInModelId(effectiveModel)
    const shouldUseProxy = !apiKey && isBuiltInModel && hasChatProxy

    if (!apiKey) {
      if (isBuiltInModel) {
        if (!hasChatProxy) {
          const error = new Error("Built-in models require either the PrismaCare chat proxy or a user API key")
          setError(error)
          throw error
        }
      } else {
        const error = new Error("OpenAI API key is required for premium models")
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
      
      const requestBody = {
        model: effectiveModel,
        messages: [...initialMessages, ...messages],
        temperature: 0.7,
        stream: false,
      }

      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      }

      let targetUrl = "/api/llm"

      if (shouldUseProxy) {
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

      const response = await fetch(targetUrl, {
        method: "POST",
        signal: controller.signal,
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      })

      // Update progress after receiving headers
      setProgress(30)

      if (!response.ok) {
        let errorMessage = shouldUseProxy ? 'Failed to reach clinical insights proxy' : 'Failed to fetch from OpenAI'
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
      if (shouldUseProxy) {
        responseText = data?.message || data?.openAiResponse?.choices?.[0]?.message?.content || ""
        if (!responseText) {
          console.error('Invalid proxy response:', data)
          throw new Error('Invalid response format from proxy service')
        }
      } else {
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          console.error('Invalid choices in response:', data)
          throw new Error('Invalid response format from OpenAI API')
        }
        responseText = data.choices[0]?.message?.content || ''
      }
      setResponse(responseText);
      onResponse?.(responseText);
      return responseText;
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
      
      // Reset progress after a short delay to show completion
      const timer = setTimeout(() => setProgress(0), 500)
      
      // Don't return anything from finally block
      // The cleanup will happen when the component unmounts
      return undefined
    }
  }, [apiKey, model, initialMessages, timeout])

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
