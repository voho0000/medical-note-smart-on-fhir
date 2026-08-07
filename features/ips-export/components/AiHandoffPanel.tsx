"use client"

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Database, ExternalLink, MessageSquarePlus, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  const [profile, setProfile] = useState<AiArtifactProfile>('quick')
  const [advancedOpen, setAdvancedOpen] = useState(false)
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
    // We intentionally do not place health data in URL/query/fragment.
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

  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-card p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Collapsible className="relative" open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {x.advancedOptions}: {profile === 'quick' ? x.quickProfile : x.traceableProfile}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="absolute z-20 mt-1 rounded-md border bg-popover p-2 shadow-md">
              <p className="mb-1 text-[0.6875rem] font-medium text-muted-foreground">{x.outputFormat}</p>
              <Tabs value={profile} onValueChange={(value) => setProfile(value as AiArtifactProfile)}>
                <TabsList className="grid h-8 w-56 grid-cols-2">
                  <TabsTrigger value="quick" className="text-xs">{x.quickProfile}</TabsTrigger>
                  <TabsTrigger value="traceable" className="text-xs">{x.traceableProfile}</TabsTrigger>
                </TabsList>
              </Tabs>
            </CollapsibleContent>
          </Collapsible>
          {!questionExpanded && (
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
          )}
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="ai-export-mask-identifiers" className="text-xs text-muted-foreground">{x.maskIdentifiers}</label>
            <Switch
              id="ai-export-mask-identifiers"
              checked={maskIdentifiers}
              onCheckedChange={handleMaskIdentifiersChange}
              aria-label={x.maskIdentifiers}
            />
            <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs" onClick={() => setScopeOpen(true)}>
              <Database className="h-3.5 w-3.5" />
              {x.chooseData}
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
          {profile === 'quick' ? x.quickDescription : x.traceableDescription}
        </p>
        <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
          {x.maskingLimitNotice}
        </p>
        {questionExpanded && (
          <div className="mt-2 rounded-md border bg-muted/10 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="ai-export-optional-question" className="text-xs font-medium">{x.optionalQuestionLabel}</label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6"
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
              className="mt-1 min-h-20 resize-y text-sm"
            />
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">{x.optionalQuestionHint}</p>
          </div>
        )}
        {!maskIdentifiers && (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {x.unmaskedWarning}
          </div>
        )}
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
          {x.exactPreviewHint}
        </p>
        <div className="relative mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyArtifact}
            disabled={!canHandoff}
            className="absolute right-2 top-2 z-10 h-7 gap-1 px-2 text-xs"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t.common.copied : t.common.copy}
          </Button>
          <pre
            data-testid="ai-export-exact-preview"
            className="h-[58vh] min-h-80 max-h-[680px] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-3 pr-24 font-mono text-xs leading-relaxed"
          >
            {artifact}
          </pre>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-start gap-2">
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
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">{x.pasteHint}</p>
      </div>

      <AlertDialog open={unmaskConfirmationOpen} onOpenChange={setUnmaskConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{x.unmaskConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{x.unmaskConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setMaskIdentifiers(false)}>
              {x.unmaskConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDestination !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDestination(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{x.externalConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {x.externalConfirmDescription.replace(
                '{destination}',
                pendingDestination?.label ?? '',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const destination = pendingDestination
                setPendingDestination(null)
                if (destination) {
                  void copyAndOpen(artifact, destination.url, destination.label)
                }
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
