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
import { useClinicalInsightsConfig } from "@/features/clinical-insights/context/ClinicalInsightsConfigContext"

const SYSTEM_INSTRUCTION =
  "You are an expert clinical assistant helping healthcare professionals interpret EHR data. Use professional tone, stay factual, and note uncertainties when appropriate."

type PanelStatus = {
  isLoading: boolean
  error: Error | null
}

type ResponseEntry = { text: string; isEdited: boolean }

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
  subtitle?: string
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
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
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
  const { panels } = useClinicalInsightsConfig()
  const { apiKey } = useApiKey()
  const { getFormattedClinicalContext } = useClinicalContext()
  const { queryGpt } = useGptQuery({ defaultModel: DEFAULT_MODEL_ID })

  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [responses, setResponses] = useState<Record<string, ResponseEntry>>({})
  const [panelStatus, setPanelStatus] = useState<Record<string, PanelStatus>>({})
  const [hasAutoRun, setHasAutoRun] = useState(false)
  const [context, setContext] = useState("")

  useEffect(() => {
    setPrompts((prev) => {
      return panels.reduce<Record<string, string>>((acc, panel) => {
        acc[panel.id] = prev[panel.id] ?? panel.prompt
        return acc
      }, {})
    })

    setResponses((prev) => {
      return panels.reduce<Record<string, ResponseEntry>>((acc, panel) => {
        const existing = prev[panel.id]
        const text = typeof existing?.text === "string" ? existing.text : panel.prompt ?? ""
        const isEdited = existing?.isEdited ?? false
        acc[panel.id] = { text, isEdited }
        return acc
      }, {})
    })

    setPanelStatus((prev) => {
      return panels.reduce<Record<string, PanelStatus>>((acc, panel) => {
        acc[panel.id] = prev[panel.id] ?? { isLoading: false, error: null }
        return acc
      }, {})
    })

    setHasAutoRun(false)
  }, [panels])

  useEffect(() => {
    const latestContext = getFormattedClinicalContext()
    setContext((previous) => {
      if (previous === latestContext) {
        return previous
      }
      setHasAutoRun(false)
      setResponses((prev) => {
        return Object.keys(prev).reduce<Record<string, ResponseEntry>>((acc, panelId) => {
          acc[panelId] = { text: prev[panelId].text, isEdited: false }
          return acc
        }, {})
      })
      return latestContext
    })
  }, [getFormattedClinicalContext])

  useEffect(() => {
    setResponses((prev) => {
      return Object.keys(prev).reduce<Record<string, ResponseEntry>>((acc, panelId) => {
        const prevValue = prev[panelId]
        if (prevValue === undefined) return acc
        acc[panelId] = { text: prevValue.text, isEdited: false }
        return acc
      }, {})
    })
  }, [panels])

  const canUseProxy = hasChatProxy
  const canGenerate = Boolean(apiKey) || canUseProxy

  const runPanel = useCallback(
    async (panelId: string, { force } = { force: false }) => {
      const panel = panels.find((item) => item.id === panelId)
      if (!panel) return
      if (!context.trim() || (!apiKey && !canUseProxy)) return

      const prompt = prompts[panelId] ?? panel.prompt
      const responseEntry = responses[panelId]
      if (!force && responseEntry?.isEdited) {
        return
      }

      const baseMessages = [
        { role: "system" as const, content: SYSTEM_INSTRUCTION },
        {
          role: "user" as const,
          content: `${prompt}\n\n---\nPatient Clinical Context:\n${context}`,
        },
      ]

      setPanelStatus((prev) => ({
        ...prev,
        [panelId]: { isLoading: true, error: null },
      }))

      try {
        const responseText = await queryGpt(baseMessages)
        setResponses((prev) => ({
          ...prev,
          [panelId]: { text: responseText || "", isEdited: false },
        }))
        setPanelStatus((prev) => ({
          ...prev,
          [panelId]: { isLoading: false, error: null },
        }))
      } catch (error) {
        console.error(`Failed to generate insight for ${panel.title}`, error)
        setPanelStatus((prev) => ({
          ...prev,
          [panelId]: {
            isLoading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          },
        }))
      }
    },
    [apiKey, canUseProxy, context, panels, prompts, queryGpt, responses],
  )

  useEffect(() => {
    if ((!apiKey && !canUseProxy) || hasAutoRun || !context.trim() || panels.length === 0) {
      return
    }

    setHasAutoRun(true)

    const autoRun = async () => {
      await Promise.all(panels.map((panel) => runPanel(panel.id)))
    }

    autoRun().catch((error) => {
      console.error("Failed to auto-run clinical insights", error)
      setHasAutoRun(false)
    })
  }, [apiKey, canUseProxy, context, hasAutoRun, panels, runPanel])

  const handlePromptChange = useCallback((panelId: string, value: string) => {
    setPrompts((prev) => ({ ...prev, [panelId]: value }))
  }, [])

  const handleResponseChange = useCallback((panelId: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [panelId]: { text: value, isEdited: true },
    }))
  }, [])

  const panelEntries = useMemo(() => {
    return panels.map((panel) => {
      const responseEntry = responses[panel.id] ?? { text: "", isEdited: false }
      const status = panelStatus[panel.id] ?? { isLoading: false, error: null }

      return {
        id: panel.id,
        label: panel.title,
        props: {
          title: panel.title,
          subtitle: panel.subtitle,
          prompt: prompts[panel.id] ?? panel.prompt,
          onPromptChange: (value: string) => handlePromptChange(panel.id, value),
          onRegenerate: () => runPanel(panel.id, { force: true }),
          isLoading: status.isLoading,
          response: responseEntry.text,
          error: status.error,
          canGenerate,
          onResponseChange: (value: string) => handleResponseChange(panel.id, value),
          isEdited: responseEntry.isEdited,
        },
      }
    })
  }, [canGenerate, handlePromptChange, handleResponseChange, panelStatus, panels, prompts, responses, runPanel])

  const defaultTabValue = panelEntries[0]?.id ?? ""

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
        {panelEntries.length > 0 ? (
          <Tabs defaultValue={defaultTabValue} className="space-y-3">
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
        ) : (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No clinical insight tabs configured. Add one from the Settings panel to get started.
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  )
}
