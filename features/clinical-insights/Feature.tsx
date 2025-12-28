"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { AlertCircle, ChevronDown, Loader2, RefreshCcw } from "lucide-react"

import { useClinicalContext } from "@/features/data-selection/hooks/useClinicalContext"
import { useGptQuery } from "@/features/medical-note/hooks/useGptQuery"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { DEFAULT_MODEL_ID } from "@/features/medical-note/constants/models"
import { hasChatProxy } from "@/lib/config/ai"

const PANEL_DEFINITIONS = [
  {
    id: "safety" as const,
    title: "Safety Flag",
    subtitle: "Highlight any urgent safety issues, contraindications, or potential adverse events.",
    defaultPrompt:
      "Review the clinical context and flag any immediate patient safety risks, including drug interactions, abnormal results, or urgent follow-up needs. Respond with concise bullet points ordered by severity.",
  },
  {
    id: "changes" as const,
    title: "What's Changed",
    subtitle: "Summarize notable changes compared to prior data or visits.",
    defaultPrompt:
      "Compare the patient's recent clinical data to prior information and list the most important changes in status, therapy, or results. Emphasize deltas that require attention.",
  },
  {
    id: "snapshot" as const,
    title: "Clinical Snapshot",
    subtitle: "Provide a concise overview of the current clinical picture.",
    defaultPrompt:
      "Create a succinct clinical snapshot covering active problems, current therapies, recent results, and outstanding tasks. Keep it brief and actionable.",
  },
]

type PanelId = (typeof PANEL_DEFINITIONS)[number]["id"]

const SYSTEM_INSTRUCTION =
  "You are an expert clinical assistant helping healthcare professionals interpret EHR data. Use professional tone, stay factual, and note uncertainties when appropriate."

function InsightPanel({
  title,
  subtitle,
  prompt,
  onPromptChange,
  onRegenerate,
  isLoading,
  response,
  error,
  canGenerate,
  onResponseChange,
  isEdited,
}: {
  title: string
  subtitle: string
  prompt: string
  onPromptChange: (value: string) => void
  onRegenerate: () => void
  isLoading: boolean
  response: string
  error: Error | null
  canGenerate: boolean
  onResponseChange: (value: string) => void
  isEdited: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3 pb-2 pt-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold leading-tight">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Button
          onClick={onRegenerate}
          size="sm"
          disabled={isLoading || !canGenerate}
          variant="outline"
          className="gap-1"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          {isLoading ? "Running" : "Regenerate"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <Collapsible defaultOpen={false} className="space-y-1">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between px-2 text-xs font-medium">
              <span>Edit prompt</span>
              <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
            <Textarea
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              className="min-h-[88px] resize-vertical text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Prompts are saved per panel. Adjust wording, then run again when you need a refreshed insight.
            </p>
          </CollapsibleContent>
        </Collapsible>
        <Separator className="opacity-50" />
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase text-muted-foreground">Response</label>
          {error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error.message}
            </div>
          ) : (
            <Textarea
              value={response}
              onChange={(event) => onResponseChange(event.target.value)}
              placeholder="AI generated insight will appear here. You can edit the text before saving or copying."
              className="min-h-[220px] resize-vertical text-sm"
              disabled={isLoading}
            />
          )}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {isLoading ? "Generating..." : isEdited ? "Edited" : response ? "Generated" : "Awaiting generation"}
            </span>
            <span>{response.length} chars</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ClinicalInsightsFeature() {
  const { apiKey } = useApiKey()
  const { getFormattedClinicalContext } = useClinicalContext()

  const [prompts, setPrompts] = useState<Record<PanelId, string>>(() =>
    PANEL_DEFINITIONS.reduce(
      (acc, panel) => {
        acc[panel.id] = panel.defaultPrompt
        return acc
      },
      {} as Record<PanelId, string>,
    ),
  )
  const [hasAutoRun, setHasAutoRun] = useState(false)

  const [responses, setResponses] = useState<Record<PanelId, { text: string; isEdited: boolean }>>(() =>
    PANEL_DEFINITIONS.reduce(
      (acc, panel) => {
        acc[panel.id] = { text: "", isEdited: false }
        return acc
      },
      {} as Record<PanelId, { text: string; isEdited: boolean }>,
    ),
  )

  const [context, setContext] = useState("")

  useEffect(() => {
    const latestContext = getFormattedClinicalContext()
    setContext((previous) => {
      if (previous === latestContext) {
        return previous
      }
      setHasAutoRun(false)
      return latestContext
    })
  }, [getFormattedClinicalContext])

  const {
    queryGpt: runSafety,
    response: safetyResponse,
    isLoading: safetyLoading,
    error: safetyError,
  } = useGptQuery({ defaultModel: DEFAULT_MODEL_ID })

  const {
    queryGpt: runChanges,
    response: changesResponse,
    isLoading: changesLoading,
    error: changesError,
  } = useGptQuery({ defaultModel: DEFAULT_MODEL_ID })

  const {
    queryGpt: runSnapshot,
    response: snapshotResponse,
    isLoading: snapshotLoading,
    error: snapshotError,
  } = useGptQuery({ defaultModel: DEFAULT_MODEL_ID })

  const canUseProxy = hasChatProxy
  const canGenerate = Boolean(apiKey) || canUseProxy

  useEffect(() => {
    setResponses((prev) => {
      const current = prev.safety
      if (current && current.text === safetyResponse && current.isEdited === false) {
        return prev
      }
      return {
        ...prev,
        safety: { text: safetyResponse, isEdited: false },
      }
    })
  }, [safetyResponse])

  useEffect(() => {
    setResponses((prev) => {
      const current = prev.changes
      if (current && current.text === changesResponse && current.isEdited === false) {
        return prev
      }
      return {
        ...prev,
        changes: { text: changesResponse, isEdited: false },
      }
    })
  }, [changesResponse])

  useEffect(() => {
    setResponses((prev) => {
      const current = prev.snapshot
      if (current && current.text === snapshotResponse && current.isEdited === false) {
        return prev
      }
      return {
        ...prev,
        snapshot: { text: snapshotResponse, isEdited: false },
      }
    })
  }, [snapshotResponse])

  const runPanel = useCallback(
    async (panelId: PanelId) => {
      if (!context.trim() || (!apiKey && !canUseProxy)) return

      const baseMessages = [
        { role: "system" as const, content: SYSTEM_INSTRUCTION },
        {
          role: "user" as const,
          content: `${prompts[panelId]}\n\n---\nPatient Clinical Context:\n${context}`,
        },
      ]

      switch (panelId) {
        case "safety":
          await runSafety(baseMessages)
          break
        case "changes":
          await runChanges(baseMessages)
          break
        case "snapshot":
          await runSnapshot(baseMessages)
          break
        default:
          break
      }
    },
    [apiKey, canUseProxy, context, prompts, runSafety, runChanges, runSnapshot],
  )

  useEffect(() => {
    if ((!apiKey && !canUseProxy) || hasAutoRun || !context.trim()) return

    setHasAutoRun(true)

    const autoRun = async () => {
      await Promise.all(PANEL_DEFINITIONS.map((panel) => runPanel(panel.id)))
    }

    autoRun().catch((error) => {
      console.error("Failed to auto-run clinical insights", error)
      setHasAutoRun(false)
    })
  }, [apiKey, canUseProxy, context, hasAutoRun, runPanel])

  const handlePromptChange = useCallback((panelId: PanelId, value: string) => {
    setPrompts((prev) => ({ ...prev, [panelId]: value }))
  }, [])

  const handleResponseChange = useCallback((panelId: PanelId, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [panelId]: { text: value, isEdited: true },
    }))
  }, [])

  const panelEntries = useMemo(() => {
    return PANEL_DEFINITIONS.map((panel) => {
      const panelResponse = responses[panel.id] ?? { text: "", isEdited: false }

      const sharedProps = {
        title: panel.title,
        subtitle: panel.subtitle,
        prompt: prompts[panel.id],
        onPromptChange: (value: string) => handlePromptChange(panel.id, value),
        onRegenerate: () => runPanel(panel.id),
        isLoading:
          panel.id === "safety"
            ? safetyLoading
            : panel.id === "changes"
            ? changesLoading
            : snapshotLoading,
        response:
          panel.id === "safety"
            ? panelResponse.text
            : panel.id === "changes"
            ? panelResponse.text
            : panelResponse.text,
        error:
          panel.id === "safety"
            ? safetyError
            : panel.id === "changes"
            ? changesError
            : snapshotError,
        canGenerate,
        onResponseChange: (value: string) => handleResponseChange(panel.id, value),
        isEdited: panelResponse.isEdited,
      }

      return { id: panel.id, label: panel.title, props: sharedProps }
    })
  }, [apiKey, canGenerate, changesError, changesLoading, handlePromptChange, handleResponseChange, prompts, responses, runPanel, safetyError, safetyLoading, snapshotError, snapshotLoading])

  return (
    <ScrollArea className="h-full pr-3">
      <div className="space-y-3">
        {!canGenerate && (
          <Card className="border-destructive/40 bg-destructive/5 text-destructive">
            <CardContent className="flex items-center gap-3 py-4 text-sm font-medium">
              <AlertCircle className="h-5 w-5" />
              <div>
                Add an OpenAI API key in settings to automatically generate insights. Prompts can still be edited, but responses require an API key.
              </div>
            </CardContent>
          </Card>
        )}
        <Tabs defaultValue={panelEntries[0]?.id} className="space-y-3">
          <TabsList className="flex w-full flex-wrap gap-2 rounded-md bg-muted/40 p-1">
            {panelEntries.map((panel) => (
              <TabsTrigger
                key={panel.id}
                value={panel.id}
                className="text-xs font-medium uppercase tracking-wide data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                {panel.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {panelEntries.map((panel) => (
            <TabsContent key={panel.id} value={panel.id} className="mt-0">
              <InsightPanel {...panel.props} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ScrollArea>
  )
}
