"use client"

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Database, ExternalLink, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DataSelectionDrawer } from '@/features/data-selection'
import { useClinicalContext } from '@/src/application/hooks/use-clinical-context.hook'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import {
  buildAiArtifact,
  buildQuestionOnlyArtifact,
  type AiArtifactProfile,
} from '../utils/ai-export-artifact'

const DESTINATIONS = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
] as const

const OPEN_EVIDENCE_URL = 'https://www.openevidence.com/'

function newExportId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `export-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function openWithoutOpener(url: string): Window | null {
  const popup = window.open('', '_blank')
  if (popup) {
    popup.opener = null
    popup.location.replace(url)
  }
  return popup
}

export function AiHandoffPanel() {
  const { t } = useLanguage()
  const x = t.ipsExport.aiHandoff
  const { audience } = useAudience()
  const { patient } = usePatient()
  const { getFormattedClinicalContext, getFullClinicalContext } = useClinicalContext('aiExport')
  const { copied, copy } = useCopyToClipboard()
  const [question, setQuestion] = useState('')
  const [profile, setProfile] = useState<AiArtifactProfile>('quick')
  const [maskIdentifiers, setMaskIdentifiers] = useState(true)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [openEvidenceAttested, setOpenEvidenceAttested] = useState(false)
  const [exportId, setExportId] = useState(newExportId)
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString())

  const clinicalContext = useMemo(
    () => maskIdentifiers ? getFullClinicalContext() : getFormattedClinicalContext(),
    [getFormattedClinicalContext, getFullClinicalContext, maskIdentifiers],
  )

  useEffect(() => {
    setExportId(newExportId())
    setGeneratedAt(new Date().toISOString())
  }, [question, clinicalContext, maskIdentifiers, profile, patient?.id])

  useEffect(() => {
    setOpenEvidenceAttested(false)
  }, [question, patient?.id, audience])

  const artifact = useMemo(
    () => buildAiArtifact({
      profile,
      question,
      clinicalContext,
      exportId,
      generatedAt,
      identifiersMasked: maskIdentifiers,
    }),
    [clinicalContext, exportId, generatedAt, maskIdentifiers, profile, question],
  )
  const questionOnlyArtifact = useMemo(() => buildQuestionOnlyArtifact(question), [question])
  const canHandoff = question.trim().length > 0 && clinicalContext.trim().length > 0
  const openEvidenceEligible = audience === 'medical' && openEvidenceAttested && question.trim().length > 0

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

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{x.title}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{x.description}</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-xs" onClick={() => setScopeOpen(true)}>
            <Database className="h-3.5 w-3.5" />
            {x.chooseData}
          </Button>
        </div>
        <label htmlFor="ai-export-question" className="text-xs font-medium">{x.questionLabel}</label>
        <Textarea
          id="ai-export-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={x.questionPlaceholder}
          className="mt-1 min-h-24 resize-y text-sm"
        />
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">{x.freeTextHint}</p>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={profile} onValueChange={(value) => setProfile(value as AiArtifactProfile)}>
            <TabsList className="grid h-8 w-64 grid-cols-2">
              <TabsTrigger value="quick" className="text-xs">{x.quickProfile}</TabsTrigger>
              <TabsTrigger value="traceable" className="text-xs">{x.traceableProfile}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <label htmlFor="ai-export-mask-identifiers" className="text-xs text-muted-foreground">{x.maskIdentifiers}</label>
            <Switch
              id="ai-export-mask-identifiers"
              checked={maskIdentifiers}
              onCheckedChange={setMaskIdentifiers}
              aria-label={x.maskIdentifiers}
            />
          </div>
        </div>
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
          {profile === 'quick' ? x.quickDescription : x.traceableDescription}
        </p>
        {!maskIdentifiers && (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {x.unmaskedWarning}
          </div>
        )}
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
            className="max-h-[420px] min-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-3 pr-24 font-mono text-xs leading-relaxed"
          >
            {artifact}
          </pre>
        </div>
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">{x.exactPreviewHint}</p>
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
              onClick={() => copyAndOpen(artifact, destination.url, destination.label)}
            >
              {destination.label}
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">{x.pasteHint}</p>
      </div>

      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">OpenEvidence</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{x.openEvidenceQuestionOnly}</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => openWithoutOpener(OPEN_EVIDENCE_URL)}>
            {x.openEvidencePreflight}
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>

        {audience !== 'medical' ? (
          <p className="mt-2 rounded-md border bg-background px-2.5 py-2 text-xs text-muted-foreground">{x.openEvidenceClinicianOnly}</p>
        ) : (
          <label className="mt-2 flex items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-xs leading-relaxed">
            <input
              type="checkbox"
              checked={openEvidenceAttested}
              onChange={(event) => setOpenEvidenceAttested(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span>{x.openEvidenceAttestation}</span>
          </label>
        )}

        <Button
          className="mt-2 w-full justify-between"
          disabled={!openEvidenceEligible}
          onClick={() => copyAndOpen(questionOnlyArtifact, OPEN_EVIDENCE_URL, 'OpenEvidence')}
        >
          {x.openEvidenceAction}
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>

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

