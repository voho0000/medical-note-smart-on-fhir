/**
 * Run Deep-Mode Agent (headless core)
 *
 * The deep-mode agent "brain" extracted out of the React hook
 * (features/medical-chat/hooks/useAgentChat.ts) so the SAME orchestration runs
 * in two places:
 *   1. The UI hook (maps emitted events → setChatMessages).
 *   2. Headless eval scripts in node (no React, no DOM).
 *
 * Lives in the infrastructure layer (not core) because it drives the AI SDK and
 * the streaming idle-watchdog — core stays pure/UI-free and may not import
 * infrastructure. The pure pieces it relies on (stream post-processing) remain
 * in core and are imported here.
 *
 * This is a VERBATIM extraction of the existing orchestration — the three
 * streamText rounds (main → follow-up → synthesis), the AI-SDK native
 * multi-step loop (stopWhen: stepCountIs(10)), tool-result summarisation and
 * citation post-processing are unchanged, so the eval measures the REAL current
 * harness as the v0 baseline. The only thing left behind in the hook is pure UI
 * rendering: every setChatMessages call becomes an `onEvent` emission, and the
 * 100ms update throttling (a main-thread-blocking guard, not agent behaviour)
 * stays in the hook's event handler. Agent output is byte-identical.
 */

import { streamText, stepCountIs, type LanguageModel, type ModelMessage, type ToolSet } from "ai"
import { processAgentStreamUseCase } from "@/src/core/use-cases/agent/process-agent-stream.use-case"
import { getToolDisplayName } from "@/src/shared/constants/agent-tool-names.constants"
import { withIdleTimeout } from "@/src/infrastructure/ai/streaming/stream-idle-timeout"

export type AgentRunRole = "system" | "user" | "assistant"

export interface AgentRunMessage {
  role: AgentRunRole
  content: string
}

/**
 * The subset of `t.agent` strings the orchestration itself consumes. These are
 * part of the harness (they shape the follow-up/synthesis prompts and the
 * tool-result summaries), so the eval must pass the SAME translations the UI
 * uses — otherwise it measures a different harness.
 */
export interface AgentRunTranslations {
  organizingResults: string
  queriedFhirData: string
  answerQuestion: string
  answerQuestionCitationsHint?: string
  synthesizeResults: string
  queryResult: string
  queryFailed: string
  noData: string
  noDataFound: string
  foundRecords: string
  toolNames: Record<string, string>
}

/**
 * Events the core emits in place of the hook's setChatMessages calls. The hook
 * translates each back into a UI update (with throttling); eval scripts ignore
 * them or record them.
 */
export type AgentRunEvent =
  /** A labelled intermediate state (tool-running / organizing). UI shows it as
   *  content AND appends it to agentStates. */
  | { type: "status"; state: string }
  /** Accumulated answer text so far (UI sets content, throttled). */
  | { type: "content"; content: string }
  /** A tool was invoked. UI shows the 🔍 label + tracks the tool-name list. */
  | { type: "tool-call"; toolName: string; state: string; toolCalls: string[] }
  /** A tool returned (collected for the trajectory; no direct UI update). */
  | { type: "tool-result"; toolName: string; result: unknown }
  /** Final processed content + the full tool-name list. */
  | { type: "final"; content: string; toolCalls: string[] }

export interface AgentTrajectoryStep {
  round: number
  kind: "tool-call" | "tool-result" | "text"
  toolName?: string
  input?: unknown
  result?: unknown
  text?: string
}

export interface RunDeepModeAgentParams {
  /** Provider model from aiProviderFactory.create({...}).model */
  model: LanguageModel
  /** system message + conversation history (already assembled by the caller) */
  messages: AgentRunMessage[]
  tools: ToolSet | undefined
  translations: AgentRunTranslations
  /** idle-timeout window in ms (caller resolves it — UI from env, eval pins it) */
  idleMs: number
  /** caller owns the controller so it can wire a stop button / overall timeout */
  abortController: AbortController
  onEvent?: (event: AgentRunEvent) => void
}

export interface AgentRunUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface RunDeepModeAgentResult {
  answer: string
  toolCalls: string[]
  citations: string[]
  trajectory: AgentTrajectoryStep[]
  /** Token usage summed across all streamText rounds (main + follow-up + synthesis). */
  usage: AgentRunUsage
}

/**
 * Run the deep-mode agent once and return its final answer + trajectory.
 * Throws on stream error / abort (callers keep their own try/catch, exactly as
 * the hook did before extraction).
 */
export async function runDeepModeAgent(
  params: RunDeepModeAgentParams,
): Promise<RunDeepModeAgentResult> {
  const { model, messages, tools, translations: t, idleMs, abortController, onEvent } = params

  const emit = (event: AgentRunEvent) => onEvent?.(event)
  const onStreamIdle = () => abortController.abort()
  const trajectory: AgentTrajectoryStep[] = []

  // Token usage is summed across every streamText round below so callers (the
  // eval harness) can report tokens + cost per model.
  const usage: AgentRunUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const addUsage = (u: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) => {
    const inp = u.inputTokens ?? 0
    const out = u.outputTokens ?? 0
    usage.inputTokens += inp
    usage.outputTokens += out
    usage.totalTokens += u.totalTokens ?? inp + out
  }

  const summaryTranslations = {
    queryResult: t.queryResult,
    queryFailed: t.queryFailed,
    noData: t.noData,
    noDataFound: t.noDataFound,
    foundRecords: t.foundRecords,
  }

  // Stream with tools. stopWhen enables the AI SDK's NATIVE multi-step loop:
  // after a tool call the SDK feeds the result back to the model automatically
  // and continues, up to N steps.
  const result = await streamText({
    model,
    messages: messages as ModelMessage[],
    tools,
    stopWhen: stepCountIs(10),
    abortSignal: abortController.signal,
    onStepFinish: ({ toolCalls }) => {
      if (toolCalls && toolCalls.length > 0) {
        const toolNames = toolCalls
          .map((tc) => getToolDisplayName(tc?.toolName || "", t.toolNames))
          .join("、")
        emit({ type: "status", state: `🔍 ${toolNames}...` })
      }
    },
  })

  let accumulatedContent = ""
  const toolResults: Array<{ toolName: string; result: unknown }> = []
  const usedToolNames: string[] = []

  // Round 1 — main stream (idle-watchdog guarded)
  for await (const chunk of withIdleTimeout(result.fullStream, idleMs, onStreamIdle)) {
    if (chunk.type === "text-delta") {
      accumulatedContent += chunk.text
      emit({ type: "content", content: accumulatedContent })
    } else if (chunk.type === "tool-call") {
      const displayName = getToolDisplayName(chunk.toolName, t.toolNames)
      if (!usedToolNames.includes(chunk.toolName)) usedToolNames.push(chunk.toolName)
      trajectory.push({
        round: 1,
        kind: "tool-call",
        toolName: chunk.toolName,
        input: (chunk as { input?: unknown }).input,
      })
      emit({
        type: "tool-call",
        toolName: chunk.toolName,
        state: `🔍 ${displayName}...`,
        toolCalls: [...usedToolNames],
      })
    } else if (chunk.type === "tool-result") {
      const chunkAny = chunk as any
      const toolResult = chunkAny.result ?? chunkAny.output ?? chunkAny.toolResult ?? chunkAny
      toolResults.push({ toolName: chunk.toolName, result: toolResult })
      trajectory.push({ round: 1, kind: "tool-result", toolName: chunk.toolName, result: toolResult })
      emit({ type: "tool-result", toolName: chunk.toolName, result: toolResult })
    } else if (chunk.type === "error") {
      // A failed request (proxy 401 / no guest token / network) arrives as an
      // error chunk, NOT a throw. Propagate so the caller's catch surfaces it.
      throw (chunk as { error?: unknown }).error ?? new Error("AI stream error")
    }
  }
  addUsage(await result.usage)

  if (accumulatedContent.length > 0) {
    trajectory.push({ round: 1, kind: "text", text: accumulatedContent })
    emit({
      type: "final",
      content: accumulatedContent,
      toolCalls: usedToolNames.length > 0 ? usedToolNames : [],
    })
  }

  // Round 2 — follow-up when there are tool results but the model produced no text.
  if (toolResults.length > 0 && accumulatedContent.length === 0) {
    emit({ type: "status", state: `📝 ${t.organizingResults}` })

    const { summary: toolResultsSummary, citations: literatureCitations } =
      processAgentStreamUseCase.buildToolResultsSummary(toolResults, summaryTranslations)

    const originalQuestion =
      [...messages].reverse().find((m) => m.role === "user")?.content || ""
    // Only inject the citation-preservation hint when literature search actually
    // produced numbered references — otherwise the LLM hallucinates [1][2] tags.
    const answerQuestionText =
      literatureCitations.length > 0
        ? t.answerQuestion + (t.answerQuestionCitationsHint ?? "")
        : t.answerQuestion
    const followUpMessages = processAgentStreamUseCase.buildFollowUpMessages(
      messages,
      toolResultsSummary,
      originalQuestion,
      { queriedFhirData: t.queriedFhirData, answerQuestion: answerQuestionText },
    )

    const followUpResult = await streamText({
      model,
      messages: followUpMessages as ModelMessage[],
      tools, // allow more tools in follow-up (e.g. searchMedicalLiterature after FHIR query)
      abortSignal: abortController.signal,
    })

    let followUpContent = ""
    const followUpToolResults: Array<{ toolName: string; result: unknown }> = []

    for await (const chunk of withIdleTimeout(followUpResult.fullStream, idleMs, onStreamIdle)) {
      if (chunk.type === "text-delta") {
        followUpContent += chunk.text
        emit({ type: "content", content: followUpContent })
      } else if (chunk.type === "tool-call") {
        const displayName = getToolDisplayName(chunk.toolName, t.toolNames)
        if (!usedToolNames.includes(chunk.toolName)) usedToolNames.push(chunk.toolName)
        trajectory.push({
          round: 2,
          kind: "tool-call",
          toolName: chunk.toolName,
          input: (chunk as { input?: unknown }).input,
        })
        emit({
          type: "tool-call",
          toolName: chunk.toolName,
          state: `🔍 ${displayName}...`,
          toolCalls: [...usedToolNames],
        })
      } else if (chunk.type === "tool-result") {
        const chunkAny = chunk as any
        const toolResult = chunkAny.result ?? chunkAny.output ?? chunkAny.toolResult ?? chunkAny
        followUpToolResults.push({ toolName: chunk.toolName, result: toolResult })
        trajectory.push({ round: 2, kind: "tool-result", toolName: chunk.toolName, result: toolResult })
        emit({ type: "tool-result", toolName: chunk.toolName, result: toolResult })
      } else if (chunk.type === "error") {
        throw (chunk as { error?: unknown }).error ?? new Error("AI stream error")
      }
    }
    addUsage(await followUpResult.usage)

    // Round 3 — synthesis: follow-up itself called tools but still emitted no text.
    if (followUpToolResults.length > 0 && followUpContent.length === 0) {
      emit({ type: "status", state: `📝 ${t.organizingResults}` })

      const { summary: finalToolSummary } =
        processAgentStreamUseCase.buildToolResultsSummary(followUpToolResults, summaryTranslations)

      const finalMessages = [
        ...followUpMessages,
        { role: "user" as const, content: `${finalToolSummary}\n\n${t.synthesizeResults}` },
      ]

      const finalResult = await streamText({
        model,
        messages: finalMessages as ModelMessage[],
        abortSignal: abortController.signal,
      })

      let finalContent = ""
      for await (const chunk of withIdleTimeout(finalResult.fullStream, idleMs, onStreamIdle)) {
        if (chunk.type === "text-delta") {
          finalContent += chunk.text
          emit({ type: "content", content: finalContent })
        } else if (chunk.type === "error") {
          throw (chunk as { error?: unknown }).error ?? new Error("AI stream error")
        }
      }
      addUsage(await finalResult.usage)

      followUpContent = finalContent
    }

    if (followUpContent.length > 0) {
      trajectory.push({ round: 2, kind: "text", text: followUpContent })
    }

    // Literature search can happen in EITHER round; merge citations from both so
    // the Sources list survives regardless of which round produced them.
    const followUpCitations = processAgentStreamUseCase.buildToolResultsSummary(
      followUpToolResults,
      summaryTranslations,
    ).citations
    const allLiteratureCitations = [...new Set([...literatureCitations, ...followUpCitations])]

    let finalDisplayContent = followUpContent
    if (allLiteratureCitations.length > 0) {
      const { processedContent } = processAgentStreamUseCase.processCitations({
        content: followUpContent,
        citations: allLiteratureCitations,
      })
      finalDisplayContent = processedContent
    }

    emit({
      type: "final",
      content: finalDisplayContent,
      toolCalls: usedToolNames.length > 0 ? usedToolNames : [],
    })

    return {
      answer: finalDisplayContent,
      toolCalls: usedToolNames,
      citations: allLiteratureCitations,
      trajectory,
      usage,
    }
  }

  // Direct path — the model answered in one shot while calling tools; just
  // post-process any literature citations.
  if (toolResults.length > 0 && accumulatedContent.length > 0) {
    const { citations: literatureCitations } =
      processAgentStreamUseCase.buildToolResultsSummary(toolResults, summaryTranslations)

    if (literatureCitations.length > 0) {
      const { processedContent } = processAgentStreamUseCase.processCitations({
        content: accumulatedContent,
        citations: literatureCitations,
      })
      emit({ type: "content", content: processedContent })
      return {
        answer: processedContent,
        toolCalls: usedToolNames,
        citations: literatureCitations,
        trajectory,
        usage,
      }
    }

    return { answer: accumulatedContent, toolCalls: usedToolNames, citations: [], trajectory, usage }
  }

  return { answer: accumulatedContent, toolCalls: usedToolNames, citations: [], trajectory, usage }
}
