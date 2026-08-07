"use client"

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  Database,
  ExternalLink,
  FileText,
  MessageSquarePlus,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DataSelectionDrawer } from '@/features/data-selection'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import {
  buildAiArtifact,
  type AiArtifactProfile,
} from '../utils/ai-export-artifact'

const DESTINATIONS = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
] as const

function newExportId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `export-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function AiHandoffPanel() {
  const { t, locale } = useLanguage()
  const x = t.ipsExport.aiHandoff
  const { patient } = usePatient()
  const { getFormattedClinicalContext, getFullClinicalContext } = useClinicalContext('aiExport')
  const { copied, copy } = useCopyToClipboard()
  const [attachedQuestion, setAttachedQuestion] = useState('')
  const [questionExpanded, setQuestionExpanded] = useState(false)
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const [profile, setProfile] = useState<AiArtifactProfile>('quick')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [maskIdentifiers, setMaskIdentifiers] = useState(true)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [unmaskConfirmationOpen, setUnmaskConfirmationOpen] = useState(false)
  const [pendingDestination, setPendingDestination] = useState<(typeof DESTINATIONS)[number] | null>(null)
  const [artifactIdentity, setArtifactIdentity] = useState(() => ({
    exportId: newExportId(),
    generatedAt: new Date().toISOString(),
  }))

  const clinicalContext = useMemo(
    () => maskIdentifiers ? getFullClinicalContext() : getFormattedClinicalContext(),
    [getFormattedClinicalContext, getFullClinicalContext, maskIdentifiers],
  )

  useEffect(() => {
    // A changed question, scope, privacy mode, or patient is a new export
    // artifact. Keep its identifier and timestamp in one atomic update so the
    // exact preview always matches the copied payload.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArtifactIdentity({
      exportId: newExportId(),
      generatedAt: new Date().toISOString(),
    })
  }, [attachedQuestion, clinicalContext, maskIdentifiers, profile, patient?.id])

  const artifact = useMemo(
    () => buildAiArtifact({
      profile,
      question: attachedQuestion,
      clinicalContext,
      exportId: artifactIdentity.exportId,
      generatedAt: artifactIdentity.generatedAt,
      identifiersMasked: maskIdentifiers,
      locale,
    }),
    [artifactIdentity, attachedQuestion, clinicalContext, locale, maskIdentifiers, profile],
  )
  const canHandoff = clinicalContext.trim().length > 0

  const copyArtifact = async () => {
    const ok = await copy(artifact)
    if (!ok) toast.error(t.common.copyFailed)
  }

  const copyAndOpen = async (payload: string, url: string, label: string) => {
    // Open synchronously while the browser still considers this a user gesture.
    // Health data is never placed in a URL/query/fragment.
    const popup = window.open('', '_blank')
    if (popup) popup.opener = null
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(payload)
      if (!popup) {
        toast.error(x.popupBlocked)
        return
      }
      popup.location.replace(url)
      toast.success(x.copiedAndOpened.replace('{destination}', label))
    } catch {
      popup?.close()
      toast.error(t.common.copyFailed)
    }
  }

  const handleMaskIdentifiersChange = (checked: boolean) => {
    if (checked) {
      setMaskIdentifiers(true)
      return
    }
    setUnmaskConfirmationOpen(true)
  }

  const handleDestination = (destination: (typeof DESTINATIONS)[number]) => {
    if (!maskIdentifiers) {
      setPendingDestination(destination)
      return
    }
    void copyAndOpen(artifact, destination.url, destination.label)
  }

  const openDataScope = () => {
    setSettingsOpen(false)
    setScopeOpen(true)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{x.pageTitle}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{x.pageDescription}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="rounded-lg bg-teal-50 p-2 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{x.currentData}</p>
            <p className="truncate text-sm font-semibold">
              {profile === 'quick' ? x.quickProfile : x.traceableProfile}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {profile === 'quick' ? x.quickDescription : x.traceableDescription}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
          <Badge variant={maskIdentifiers ? 'secondary' : 'outline'} className={maskIdentifiers ? 'text-teal-700 dark:text-teal-300' : 'border-amber-400 text-amber-700 dark:text-amber-300'}>
            <ShieldCheck className="mr-1 h-3 w-3" />
            {maskIdentifiers ? x.maskedBadge : x.unmaskedBadge}
          </Badge>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            {x.adjust}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        {!questionExpanded ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={() => setQuestionExpanded(true)}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            {x.optionalQuestionAction}
          </Button>
        ) : (
          <div className="rounded-lg border bg-muted/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="ai-export-optional-question" className="text-sm font-medium">{x.optionalQuestionLabel}</label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={x.optionalQuestionRemove}
                onClick={() => {
                  setAttachedQuestion('')
                  setQuestionExpanded(false)
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              id="ai-export-optional-question"
              value={attachedQuestion}
              onChange={(event) => setAttachedQuestion(event.target.value)}
              placeholder={x.questionPlaceholder}
              className="mt-2 min-h-20 resize-y text-sm"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{x.optionalQuestionHint}</p>
          </div>
        )}

        {!maskIdentifiers && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {x.unmaskedWarning}
          </div>
        )}

        <Button
          type="button"
          size="lg"
          className="mt-4 w-full gap-2"
          onClick={copyArtifact}
          disabled={!canHandoff}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? t.common.copied : x.copyData}
        </Button>

        <Collapsible open={previewExpanded} onOpenChange={setPreviewExpanded} className="mt-3">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground">
              <span>{x.exactPreview}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${previewExpanded ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="mb-2 mt-1 text-xs leading-relaxed text-muted-foreground">{x.exactPreviewHint}</p>
            <pre
              data-testid="ai-export-exact-preview"
              className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/20 p-3 font-mono text-xs leading-relaxed"
            >
              {artifact}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
          <div>
            <h3 className="text-sm font-semibold">{x.destinationsTitle}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">{x.destinationsDescription}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {DESTINATIONS.map((destination) => (
            <Button
              key={destination.id}
              variant="outline"
              className="justify-between"
              disabled={!canHandoff}
              onClick={() => handleDestination(destination)}
            >
              {destination.label}
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{x.pasteHint}</p>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b bg-muted/20 px-5 py-4 pr-10">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-teal-600" />
              {x.settingsTitle}
            </SheetTitle>
            <SheetDescription className="text-xs leading-relaxed">{x.settingsDescription}</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 overflow-y-auto p-5">
            <div>
              <p className="mb-2 text-sm font-medium">{x.outputFormat}</p>
              <Tabs value={profile} onValueChange={(value) => setProfile(value as AiArtifactProfile)}>
                <TabsList className="grid h-9 w-full grid-cols-2">
                  <TabsTrigger value="quick" className="text-xs">{x.quickProfile}</TabsTrigger>
                  <TabsTrigger value="traceable" className="text-xs">{x.traceableProfile}</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {profile === 'quick' ? x.quickDescription : x.traceableDescription}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="ai-export-mask-identifiers" className="text-sm font-medium">{x.maskIdentifiers}</label>
                <Switch
                  id="ai-export-mask-identifiers"
                  checked={maskIdentifiers}
                  onCheckedChange={handleMaskIdentifiersChange}
                  aria-label={x.maskIdentifiers}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{x.maskingLimitNotice}</p>
            </div>
            <Button type="button" variant="outline" className="w-full justify-between" onClick={openDataScope}>
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                {x.chooseData}
              </span>
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={unmaskConfirmationOpen} onOpenChange={setUnmaskConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{x.unmaskConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{x.unmaskConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setMaskIdentifiers(false)}>{x.unmaskConfirmAction}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingDestination !== null} onOpenChange={(open) => !open && setPendingDestination(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{x.externalConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {x.externalConfirmDescription.replace('{destination}', pendingDestination?.label ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const destination = pendingDestination
                setPendingDestination(null)
                if (destination) void copyAndOpen(artifact, destination.url, destination.label)
              }}
            >
              {x.externalConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DataSelectionDrawer
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        title={x.scopeTitle}
        description={x.scopeDescription}
        applyHint={x.scopeApplyHint}
        consumer="aiExport"
        showTemplates={false}
      />
    </div>
  )
}
