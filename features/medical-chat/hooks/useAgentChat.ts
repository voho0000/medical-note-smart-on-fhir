// Agent Chat Hook - AI Agent with Client-Side FHIR Tool Calling
"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import { streamText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { useChatMessages, useSetChatMessages, type ChatMessage, type AgentState } from "@/src/application/stores/chat.store"
import { useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { getUserErrorMessage } from "@/src/core/errors"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useFhirTools } from "@/src/application/hooks/ai/use-fhir-tools.hook"
import { useLiteratureTools } from "@/src/application/hooks/ai/use-literature-tools.hook"
import { createUserMessage, createAgentState } from "@/src/shared/utils/chat-message.utils"
import { useAuth } from "@/src/application/providers/auth.provider"
import { ENV_CONFIG } from "@/src/shared/config/env.config"

export function useAgentChat(systemPrompt: string, modelId: string, onInputClear?: () => void, onStreamComplete?: () => void) {
  const chatMessages = useChatMessages()
  const setChatMessages = useSetChatMessages()
  const { apiKey: openAiKey, geminiKey, perplexityKey } = useAllApiKeys()
  const { patient } = usePatient()
  const { locale, t } = useLanguage()
  const { getFullClinicalContext } = useClinicalContext()
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const hasReceivedChunkRef = useRef(false)

  // Use Application Layer hooks for tools (Clean Architecture)
  const fhirTools = useFhirTools(patient?.id)
  const literatureTools = useLiteratureTools(perplexityKey)

  const tools = useMemo(() => {
    if (!fhirTools && !literatureTools) return undefined
    return {
      ...(fhirTools || {}),
      ...(literatureTools || {}),
    }
  }, [fhirTools, literatureTools])

  const handleSend = useCallback(
    async (input: string) => {
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed) return

      // Create user message
      const userMessage = createUserMessage(trimmed)
      const newMessages = [...chatMessages, userMessage]
      setChatMessages(newMessages)

      // Create assistant message with thinking state
      const assistantMessageId = crypto.randomUUID()
      const thinkingMessage = `🤔 ${t.agent.thinking}`
      const initialState = createAgentState(thinkingMessage)
      
      setChatMessages([...newMessages, {
        id: assistantMessageId,
        role: "assistant",
        content: thinkingMessage,
        timestamp: Date.now(),
        modelId,
        agentStates: [initialState],
      }])

      setIsLoading(true)
      setError(null)
      abortControllerRef.current = new AbortController()

      try {
        const isGemini = modelId.startsWith("gemini") || modelId.startsWith("models/gemini")
        const apiKey = isGemini ? geminiKey : openAiKey

        // Check if user can use deep mode: either has API key or is logged in (can use Firebase Proxy)
        if (!apiKey && !user) {
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId ? { ...m, content: t.agent.apiKeyRequired } : m)
          )
          setIsLoading(false)
          return
        }

        // Check proxy availability for logged-in users without API key
        const useProxy = !apiKey && !!user
        if (useProxy) {
          if (isGemini && !ENV_CONFIG.hasGeminiProxy) {
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { 
                ...m, 
                content: t.agent.geminiRequiresApiKey || 'Gemini models require an API key for deep mode. Please add your Gemini API key in Settings or switch to an OpenAI model.' 
              } : m)
            )
            setIsLoading(false)
            return
          }
          if (!isGemini && !ENV_CONFIG.hasChatProxy) {
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { ...m, content: t.agent.apiKeyRequired } : m)
            )
            setIsLoading(false)
            return
          }
        }

        // Configure provider with proxy or direct API
        let provider
        let model
        if (useProxy) {
          // Custom fetch to use proxy without Authorization header
          const proxyUrl = isGemini ? ENV_CONFIG.geminiProxyUrl : ENV_CONFIG.chatProxyUrl
          const originalFetch = globalThis.fetch
          const customFetch: typeof fetch = async (url, init) => {
            const headers = new Headers(init?.headers)
            headers.delete('authorization')
            headers.delete('x-goog-api-key')
            if (ENV_CONFIG.proxyClientKey) {
              headers.set('x-proxy-key', ENV_CONFIG.proxyClientKey)
            }
            
            // For OpenAI proxy: convert "developer" role to "system"
            // AI SDK uses "developer" for newer OpenAI models, but OpenAI API expects "system"
            if (!isGemini) {
              let body = init?.body
              if (body && typeof body === 'string') {
                try {
                  const parsed = JSON.parse(body)
                  if (parsed.messages && Array.isArray(parsed.messages)) {
                    parsed.messages = parsed.messages.map((msg: { role: string; content: string }) => ({
                      ...msg,
                      role: msg.role === 'developer' ? 'system' : msg.role
                    }))
                    body = JSON.stringify(parsed)
                  }
                } catch {
                  // Keep original body if parsing fails
                }
              }
              return originalFetch(url, { ...init, headers, body })
            }
            
            // For Gemini proxy: convert AI SDK Gemini native format to proxy expected format
            // AI SDK sends: { contents: [...], tools: [...], generationConfig: {...} }
            // Proxy expects: { model, messages: [...], stream: true, tools: [...] }
            let body = init?.body
            if (body && typeof body === 'string') {
              try {
                const parsed = JSON.parse(body)
                
                // Convert contents to messages format
                const messages: Array<{ role: string; content: string }> = []
                
                // Add system instruction as system message
                if (parsed.systemInstruction?.parts) {
                  const systemText = parsed.systemInstruction.parts
                    .map((p: { text?: string }) => p.text || '')
                    .join('\n')
                  if (systemText) {
                    messages.push({ role: 'system', content: systemText })
                  }
                }
                
                // Convert contents to messages
                if (Array.isArray(parsed.contents)) {
                  for (const content of parsed.contents) {
                    const role = content.role === 'model' ? 'assistant' : 'user'
                    const text = content.parts
                      ?.map((p: { text?: string }) => p.text || '')
                      .join('') || ''
                    if (text) {
                      messages.push({ role, content: text })
                    }
                  }
                }
                
                // Build proxy request body
                const proxyBody: Record<string, unknown> = {
                  model: modelId,
                  messages,
                  stream: true,
                }
                
                // Forward tools if present
                if (parsed.tools) {
                  proxyBody.tools = parsed.tools
                }
                if (parsed.toolConfig) {
                  proxyBody.toolConfig = parsed.toolConfig
                }
                if (parsed.generationConfig) {
                  proxyBody.generationConfig = parsed.generationConfig
                }
                if (parsed.safetySettings) {
                  proxyBody.safetySettings = parsed.safetySettings
                }
                
                body = JSON.stringify(proxyBody)
              } catch {
                // Keep original body if parsing fails
              }
            }
            
            return originalFetch(proxyUrl, { ...init, headers, body })
          }
          
          // Use appropriate provider based on model type
          // Both proxies now return native SSE format
          if (isGemini) {
            provider = createGoogleGenerativeAI({
              baseURL: proxyUrl,
              apiKey: 'proxy', // Dummy key required by SDK
              fetch: customFetch
            })
            model = provider(modelId)
          } else {
            provider = createOpenAI({
              baseURL: proxyUrl,
              apiKey: 'proxy', // Dummy key required by SDK
              fetch: customFetch
            })
            // Use .chat() to force Chat Completions API instead of Responses API
            model = provider.chat(modelId)
          }
        } else {
          // Direct API access with user's API key
          if (isGemini) {
            provider = createGoogleGenerativeAI({ apiKey: apiKey! })
            model = provider(modelId)
          } else {
            provider = createOpenAI({ apiKey: apiKey! })
            model = provider.chat(modelId)
          }
        }

        const clinicalContext = getFullClinicalContext()
        const hasClinicalData = clinicalContext.trim().length > 0
        const hasPatientId = !!patient?.id

        const sp = t.agent.systemPrompt
        const td = sp.toolDescriptions
        
        const enhancedSystemPrompt = `${systemPrompt}

${sp.deepModeIntro}

${hasPatientId ? `**${sp.currentPatient}**
- ${sp.patientId.replace('{id}', patient.id)}
- ${sp.hasPermission}` : `**${sp.currentPatient}**
- No patient context available
- FHIR query tools will not work without patient ID`}

${hasClinicalData ? `**${sp.organizedClinicalData}**
${sp.organizedClinicalDataDesc}

${clinicalContext}

---` : ''}

**${sp.availableTools}**
${hasClinicalData ? sp.availableToolsPrefix : ''}${sp.availableToolsSuffix}

1. queryConditions - ${td.queryConditions}
2. queryMedications - ${td.queryMedications}
3. queryAllergies - ${td.queryAllergies}
4. queryDiagnosticReports - ${td.queryDiagnosticReports}
5. queryObservations - ${td.queryObservations}
6. queryProcedures - ${td.queryProcedures}
7. queryEncounters - ${td.queryEncounters}${perplexityKey ? `
8. searchMedicalLiterature - ${td.searchMedicalLiterature}` : ''}

${sp.importantNote}

**${sp.usageGuidelines}**
${hasClinicalData ? `- ${sp.prioritizeClinicalData}
- ${sp.useToolsWhenNeeded}` : `- ${sp.useToolsDirectly}`}
- ${sp.noAuthNeeded}
- ${sp.mustExplainResults}
- ${sp.provideAnalysis}
- ${sp.indicateNoRecords}

${hasClinicalData ? sp.helpWithClinicalData : sp.helpWithTools}`

        const apiMessages = [
          { role: "system" as const, content: enhancedSystemPrompt },
          ...newMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ]

        const result = await streamText({
          model,
          messages: apiMessages,
          tools,
          abortSignal: abortControllerRef.current.signal,
          onStepFinish: ({ toolCalls, toolResults }) => {
            if (toolCalls && toolCalls.length > 0) {
              
              const toolNames = toolCalls.map(tc => {
                const name = tc?.toolName || ''
                const displayNames: Record<string, string> = {
                  'queryConditions': '查詢診斷資料',
                  'queryMedications': '查詢用藥資料',
                  'queryAllergies': '查詢過敏史',
                  'queryObservations': '查詢檢驗數據',
                  'queryProcedures': '查詢處置紀錄',
                  'queryEncounters': '查詢就診紀錄',
                  'searchMedicalLiterature': '搜尋醫學文獻',
                }
                return displayNames[name] || name
              }).join('、')
              
              const newState = `🔍 正在${toolNames}...`
              setChatMessages((prev) =>
                prev.map((m) => m.id === assistantMessageId 
                  ? { 
                      ...m, 
                      content: newState,
                      agentStates: [...(m.agentStates || []), { state: newState, timestamp: Date.now() }]
                    } 
                  : m)
              )
            }
            
          },
        })

        let accumulatedContent = ""
        let toolResults: Array<{ toolName: string; result: unknown }> = []

        for await (const chunk of result.fullStream) {
          if (chunk.type === 'text-delta') {
            accumulatedContent += chunk.text

            if (!hasReceivedChunkRef.current && onInputClear) {
              hasReceivedChunkRef.current = true
              onInputClear()
            }

            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { ...m, content: accumulatedContent } : m)
            )
          } else if (chunk.type === 'tool-call') {
            const toolNameKey = chunk.toolName as keyof typeof t.agent.toolNames
            const displayName = t.agent.toolNames[toolNameKey] || chunk.toolName
            const newState = `🔍 ${displayName}...`
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId 
                ? { 
                    ...m, 
                    content: newState,
                    agentStates: [...(m.agentStates || []), { state: newState, timestamp: Date.now() }]
                  } 
                : m)
            )
          } else if (chunk.type === 'tool-result') {
            // AI SDK v6 tool-result chunk structure may vary, try multiple ways to get the result
            const chunkAny = chunk as any
            const result = chunkAny.result ?? chunkAny.output ?? chunkAny.toolResult ?? chunkAny
            toolResults.push({ toolName: chunk.toolName, result })
          }
        }
        
        // If there are tool results but no text generated, send a follow-up request
        if (toolResults.length > 0 && accumulatedContent.length === 0) {
          
          const organizingState = `📝 ${t.agent.organizingResults}`
          setChatMessages((prev) =>
            prev.map((m) => m.id === assistantMessageId 
              ? { 
                  ...m, 
                  content: organizingState,
                  agentStates: [...(m.agentStates || []), { state: organizingState, timestamp: Date.now() }]
                } 
              : m)
          )
          
          // Build follow-up messages containing tool results
          // Also collect citations for post-processing
          let literatureCitations: string[] = []
          
          const toolResultsSummary = toolResults.map(tr => {
            const r = tr.result as any
            
            // Handle literature search results differently from FHIR results
            if (tr.toolName === 'searchMedicalLiterature') {
              if (r?.success && r?.content) {
                // Store citations for post-processing AI response
                if (r?.citations && Array.isArray(r.citations)) {
                  literatureCitations = r.citations
                }
                return `${tr.toolName} ${t.agent.queryResult}:\n${r.content}`
              } else {
                return `${tr.toolName} ${t.agent.queryFailed}: ${r?.content || t.agent.noData}`
              }
            }
            
            // Handle FHIR tool results (with count field)
            const countInfo = r?.count === 0 
              ? t.agent.noDataFound.replace('{summary}', r?.summary || '')
              : t.agent.foundRecords.replace('{count}', String(r?.count || 0))
            return `${tr.toolName} ${t.agent.queryResult}: ${r?.success ? countInfo : t.agent.queryFailed}\n${r?.count > 0 ? JSON.stringify(r?.data?.slice(0, 10) || [], null, 2) : t.agent.noData}`
          }).join('\n\n')
          
          // Get the user's original question
          const originalQuestion = newMessages[newMessages.length - 1]?.content || trimmed
          
          const assistantMsg = `${t.agent.queriedFhirData}\n\n${toolResultsSummary}`
          const userMsg = t.agent.answerQuestion.replace('{question}', originalQuestion)
          const followUpMessages = [
            ...apiMessages,
            { role: "assistant" as const, content: assistantMsg },
            { role: "user" as const, content: userMsg }
          ]
          
          const followUpResult = await streamText({
            model,
            messages: followUpMessages,
            abortSignal: abortControllerRef.current?.signal,
          })
          
          let followUpContent = ""
          for await (const chunk of followUpResult.fullStream) {
            if (chunk.type === 'text-delta') {
              followUpContent += chunk.text
              setChatMessages((prev) =>
                prev.map((m) => m.id === assistantMessageId ? { ...m, content: followUpContent } : m)
              )
            }
          }
          
          // Post-process: Convert citation numbers [1][2] to clickable links if we have citations
          if (literatureCitations.length > 0) {
            let processedContent = followUpContent
            
            // Replace citation numbers like [1] with clickable markdown links
            literatureCitations.forEach((citation, index) => {
              const citationNum = index + 1
              const regex = new RegExp(`\\[${citationNum}\\]`, 'g')
              processedContent = processedContent.replace(regex, `[[${citationNum}]](${citation})`)
            })
            
            // Add sources list at the bottom if not already present
            if (!processedContent.includes('**Sources:**') && !processedContent.includes('**參考來源**')) {
              processedContent += '\n\n**Sources:**\n' + literatureCitations.map((c, i) => `${i + 1}. [${c}](${c})`).join('\n')
            }
            
            // Update the message with processed content
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { ...m, content: processedContent } : m)
            )
            
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        
        const errorMessage = getUserErrorMessage(err)
        const errorObj = new Error(errorMessage)
        setError(errorObj)
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content: `❌ ${errorMessage}` } : m)
        )
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
        
        // Trigger save after agent completes
        if (onStreamComplete) {
          console.log('[Agent] Calling onStreamComplete callback')
          try {
            await onStreamComplete()
            console.log('[Agent] onStreamComplete callback completed')
          } catch (error) {
            console.error('[Agent] onStreamComplete callback failed:', error)
          }
        }
      }
    },
    [chatMessages, modelId, openAiKey, geminiKey, patient, setChatMessages, systemPrompt, onInputClear, onStreamComplete, locale, tools]
  )

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort()
    setChatMessages([])
    // Clear current session ID to start a new conversation
    const { setCurrentSessionId } = require('@/src/application/stores/chat-history.store').useChatHistoryStore.getState()
    setCurrentSessionId(null)
  }, [setChatMessages])

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }, [])

  return { messages: chatMessages, isLoading, error, handleSend, handleReset, stopGeneration }
}
