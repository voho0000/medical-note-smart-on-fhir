/**
 * Share Template Dialog Component
 * Dialog for publishing a reusable prompt template to the gallery.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ClipboardList,
  Loader2,
  Maximize2,
  MessageSquare,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import { guidedPreviewEvents, GUIDED_PREVIEW_DIALOG_CLASSES } from '@/features/right-feature-tour/guided-preview'
import { createSharedPrompt, EXAMPLE_OUTPUT_MAX_LENGTH } from '@/features/prompt-gallery/services/prompt-gallery.service'
import type { PromptCategory, PromptSpecialty, PromptType, TenantMembership } from '../types/prompt.types'
import { createTenantPrompt } from '@/features/prompt-gallery/services/tenant-prompts.service'
import { PromptSpecialtyPicker } from './PromptSpecialtyPicker'
import {
  coerceInsightOutputFormat,
  INSIGHT_OUTPUT_FORMATS,
  type InsightLanguagePolicy,
  type InsightOutputFormat,
} from '@/src/shared/constants/clinical-insights.constants'

const TITLE_MAX_LENGTH = 100
const DESCRIPTION_MAX_LENGTH = 180
const TAG_MAX_LENGTH = 24
const TAG_MAX_COUNT = 8

interface SharePromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTitle?: string
  initialDescription?: string
  initialExampleOutput?: string
  initialPrompt?: string
  initialType?: PromptType
  initialOutputFormat?: InsightOutputFormat
  initialLanguagePolicy?: InsightLanguagePolicy
  onSuccess?: () => void
  guidedPreview?: boolean
  /** Departments the user may publish to; when non-empty a publish-target picker appears. */
  memberships?: TenantMembership[]
  initialTenantId?: string
}

export function SharePromptDialog(props: SharePromptDialogProps) {
  // Remount the form for each open session so every launch starts from its
  // latest source template without synchronously resetting state in an effect.
  return <SharePromptDialogForm key={props.open ? 'open' : 'closed'} {...props} />
}

function SharePromptDialogForm({
  open,
  onOpenChange,
  initialTitle,
  initialDescription,
  initialExampleOutput,
  initialPrompt,
  initialType = 'chat',
  initialOutputFormat,
  initialLanguagePolicy,
  onSuccess,
  guidedPreview = false,
  memberships = [],
  initialTenantId,
}: SharePromptDialogProps) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const { user } = useAuth()

  const [title, setTitle] = useState(initialTitle || '')
  const [description, setDescription] = useState(initialDescription || '')
  const [exampleOutput, setExampleOutput] = useState(initialExampleOutput || '')
  const [prompt, setPrompt] = useState(initialPrompt || '')
  const [outputFormat, setOutputFormat] = useState<InsightOutputFormat>(() =>
    coerceInsightOutputFormat(initialOutputFormat),
  )
  const [selectedTypes, setSelectedTypes] = useState<PromptType[]>([initialType])
  const [category, setCategory] = useState<PromptCategory>(
    initialType === 'summary' ? 'summary' : 'other',
  )
  const [selectedSpecialties, setSelectedSpecialties] = useState<PromptSpecialty[]>(['general'])
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isAnonymous, setIsAnonymous] = useState(!user?.displayName?.trim())
  const publishTargets = memberships.filter((membership) => membership.canPublish)
  const [publishTarget, setPublishTarget] = useState<string>(() =>
    initialTenantId && publishTargets.some((membership) => membership.tenantId === initialTenantId) ? initialTenantId : 'public')
  const targetMembership = publishTargets.find((membership) => membership.tenantId === publishTarget)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categories: PromptCategory[] = [
    'soap', 'admission', 'discharge', 'safety', 'summary',
    'progress', 'consult', 'procedure', 'other',
  ]

  const types: PromptType[] = ['chat', 'summary']
  const outputFormatLabels: Record<InsightOutputFormat, string> = {
    'plain-text': t.settings.outputFormatPlain,
    markdown: t.settings.outputFormatMarkdown,
    html: t.settings.outputFormatHtml,
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!loading) onOpenChange(nextOpen)
  }

  const handleAddTag = () => {
    const trimmed = tagInput.trim().slice(0, TAG_MAX_LENGTH)
    if (trimmed && !tags.includes(trimmed) && tags.length < TAG_MAX_COUNT) {
      setTags([...tags, trimmed])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((item) => item !== tag))
  }

  const toggleType = (type: PromptType) => {
    if (selectedTypes.includes(type)) {
      // At least one destination is required.
      if (selectedTypes.length > 1) {
        setSelectedTypes(selectedTypes.filter((item) => item !== type))
      }
      return
    }

    setSelectedTypes([...selectedTypes, type])
    if (type === 'summary' && category === 'other') setCategory('summary')
  }

  const handleShare = async () => {
    if (guidedPreview) return
    if (!user) {
      setError(t.promptGallery.loginRequiredDesc)
      return
    }

    if (!title.trim()) {
      setError(`${t.promptGallery.shareError}: ${t.promptGallery.errorTitleRequired}`)
      return
    }

    if (!prompt.trim()) {
      setError(`${t.promptGallery.shareError}: ${t.promptGallery.errorPromptRequired}`)
      return
    }

    // Specialty is a medical concept and is hidden in patient mode.
    if (audience === 'medical' && selectedSpecialties.length === 0) {
      setError(`${t.promptGallery.shareError}: ${t.promptGallery.errorSpecialtyRequired}`)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        prompt,
        types: selectedTypes,
        category,
        specialty: audience === 'medical' ? selectedSpecialties : [],
        audience: [audience],
        tags,
        authorId: user.uid,
        authorName: isAnonymous ? undefined : user.displayName?.trim() || undefined,
        isAnonymous,
        outputFormat,
        languagePolicy: initialLanguagePolicy,
        exampleOutput: exampleOutput.trim() || undefined,
      }
      if (targetMembership) await createTenantPrompt({ ...payload, tenantId: targetMembership.tenantId })
      else await createSharedPrompt(payload)

      onSuccess?.()
      toast.success(targetMembership ? t.promptGallery.tenantShareSuccess : t.promptGallery.shareSuccess)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.promptGallery.shareError)
    } finally {
      setLoading(false)
    }
  }

  const getCategoryLabel = (value: PromptCategory) => {
    return t.promptGallery.categories[value as keyof typeof t.promptGallery.categories] || value
  }

  const getSpecialtyLabel = (value: PromptSpecialty) => {
    return t.promptGallery.specialties[value as keyof typeof t.promptGallery.specialties] || value
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!guidedPreview) handleDialogOpenChange(next) }} modal={!guidedPreview}>
      <DialogContent
        data-tour="custom-summary-share-form"
        className={cn("flex max-h-[94vh] max-w-5xl flex-col gap-0 overflow-hidden p-0", guidedPreview && GUIDED_PREVIEW_DIALOG_CLASSES)}
        {...guidedPreviewEvents(guidedPreview)}
      >
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{t.promptGallery.sharePrompt}</DialogTitle>
          <DialogDescription>{t.promptGallery.shareDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Alert data-tour="template-share-review" className="mb-4 border-blue-200 bg-blue-50/70 py-2.5 dark:border-blue-500/25 dark:bg-blue-500/10">
            <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="mb-0.5 text-sm">{t.promptGallery.sharePrivacyTitle}</AlertTitle>
            <AlertDescription className="text-xs leading-relaxed">
              {t.promptGallery.sharePrivacyDescription}
            </AlertDescription>
          </Alert>

          <div className={cn("grid items-start gap-4", !guidedPreview && "lg:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]")}>
          <section className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="share-template-title">{t.promptGallery.titleLabel} *</Label>
                <span className="text-xs text-muted-foreground">{title.length}/{TITLE_MAX_LENGTH}</span>
              </div>
              <Input
                id="share-template-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t.promptGallery.titlePlaceholder}
                maxLength={TITLE_MAX_LENGTH}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="share-template-description">{t.promptGallery.descriptionLabel}</Label>
                <span className="text-xs text-muted-foreground">
                  {description.length}/{DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
              <Input
                id="share-template-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t.promptGallery.descriptionPlaceholder}
                maxLength={DESCRIPTION_MAX_LENGTH}
                autoComplete="off"
              />
            </div>

            <Dialog>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="share-template-prompt">{t.promptGallery.promptLabel} *</Label>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{prompt.length} {t.clinicalInsights.chars}</span>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled={guidedPreview || loading}
                        className="gap-1.5 px-2 text-xs shadow-none max-md:min-h-11">
                        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {t.settings.expandPromptEditor}
                      </Button>
                    </DialogTrigger>
                  </div>
                </div>
                <Textarea
                  id="share-template-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t.promptGallery.promptPlaceholder}
                  className="h-48 min-h-0 field-sizing-fixed resize-none overflow-y-auto text-sm leading-relaxed shadow-none"
                />
              </div>
              <DialogContent showCloseButton={false}
                className="flex h-[100dvh] max-h-[100dvh] max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(90dvh,54rem)] sm:max-h-[90dvh] sm:max-w-4xl sm:rounded-lg sm:border">
                <div className="flex shrink-0 items-center gap-3 border-b px-3 py-3 sm:px-4">
                  <DialogClose asChild>
                    <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5 px-2 max-md:min-h-11">
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      {t.promptGallery.backToShareForm}
                    </Button>
                  </DialogClose>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-sm sm:text-base">{t.settings.promptEditorTitle}</DialogTitle>
                    <DialogDescription className="mt-1 text-xs tabular-nums">
                      {prompt.length} {t.clinicalInsights.chars} · {outputFormatLabels[outputFormat]}
                    </DialogDescription>
                  </div>
                </div>
                <div className="min-h-0 flex-1 p-3 sm:p-4">
                  <Textarea
                    aria-label={t.promptGallery.promptLabel}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={t.promptGallery.promptPlaceholder}
                    className="h-full min-h-0 field-sizing-fixed resize-none overflow-y-auto text-sm leading-relaxed shadow-none"
                  />
                </div>
              </DialogContent>
            </Dialog>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="share-template-example-output">{t.promptGallery.exampleOutputLabel}</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {exampleOutput.length}/{EXAMPLE_OUTPUT_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                id="share-template-example-output"
                value={exampleOutput}
                onChange={(event) => setExampleOutput(event.target.value)}
                placeholder={t.promptGallery.exampleOutputPlaceholder}
                maxLength={EXAMPLE_OUTPUT_MAX_LENGTH}
                aria-describedby="share-template-example-output-hint"
                className="h-28 min-h-0 field-sizing-fixed resize-none overflow-y-auto text-sm leading-relaxed shadow-none"
              />
              <p id="share-template-example-output-hint" className="text-xs leading-relaxed text-muted-foreground">
                {t.promptGallery.exampleOutputHint}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="share-template-output-format">{t.promptGallery.outputFormatLabel}</Label>
              <Select value={outputFormat} onValueChange={(value) => setOutputFormat(coerceInsightOutputFormat(value))}>
                <SelectTrigger id="share-template-output-format" aria-describedby="share-template-output-format-hint" className="w-full shadow-none max-md:min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSIGHT_OUTPUT_FORMATS.map((format) => (
                    <SelectItem key={format} value={format} className="max-md:min-h-11">
                      {outputFormatLabels[format]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="share-template-output-format-hint" className="text-xs leading-relaxed text-muted-foreground">
                {t.promptGallery.outputFormatHint}
              </p>
            </div>
          </section>

          <div className="space-y-3">
          <section className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{t.promptGallery.typeLabel} *</Label>
              <Badge variant="outline" className="gap-1.5 bg-background font-normal">
                {audience === 'medical'
                  ? <Stethoscope className="h-3.5 w-3.5" />
                  : <UserRound className="h-3.5 w-3.5" />}
                {t.promptGallery.shareAudience}: {audience === 'medical'
                  ? t.audience.medical
                  : t.audience.patient}
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {types.map((type) => {
                const selected = selectedTypes.includes(type)
                const isChat = type === 'chat'
                const TypeIcon = isChat ? MessageSquare : ClipboardList

                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleType(type)}
                    className={cn(
                      'relative flex min-h-16 items-start gap-2 rounded-lg border bg-background p-2.5 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected && 'border-primary bg-primary/5 ring-1 ring-primary/30',
                    )}
                  >
                    <span className="mt-0.5 text-muted-foreground">
                      <TypeIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 pr-5">
                      <span className="block text-sm font-medium">
                        {isChat ? t.promptGallery.typeChat : t.promptGallery.typeSummary}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {isChat
                          ? t.promptGallery.typeChatDescription
                          : t.promptGallery.typeSummaryDescription}
                      </span>
                    </span>
                    {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                  </button>
                )
              })}
            </div>
          </section>

          {audience === 'medical' && (
            <section className="space-y-2 rounded-xl border p-3">
              <h3 className="text-sm font-medium">{t.promptGallery.classificationTitle}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t.promptGallery.categoryLabel} *</Label>
                  <Select value={category} onValueChange={(value) => setCategory(value as PromptCategory)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((item) => (
                        <SelectItem key={item} value={item}>
                          {getCategoryLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="share-template-specialty">{t.promptGallery.specialtyLabel} *</Label>
                  <PromptSpecialtyPicker id="share-template-specialty" multiple
                    value={selectedSpecialties} onChange={setSelectedSpecialties}
                    describedBy="share-template-selected-specialties" />
                  <p id="share-template-selected-specialties" className="text-xs leading-relaxed text-muted-foreground">
                    {selectedSpecialties.map(getSpecialtyLabel).join(' / ')}
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-xl border p-3">
            <h3 className="text-sm font-medium">{t.promptGallery.publishingOptions}</h3>

            {publishTargets.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="share-template-target">{t.promptGallery.publishTarget}</Label>
                <Select value={publishTarget} onValueChange={setPublishTarget}>
                  <SelectTrigger id="share-template-target" aria-describedby="share-template-target-hint" className="w-full shadow-none max-md:min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public" className="max-md:min-h-11">{t.promptGallery.publishPublic}</SelectItem>
                    {publishTargets.map((membership) => (
                      <SelectItem key={membership.tenantId} value={membership.tenantId} className="max-md:min-h-11">
                        {t.promptGallery.publishTenant.replace('{name}', membership.displayName)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="share-template-target-hint" className="text-xs leading-relaxed text-muted-foreground">
                  {t.promptGallery.publishTenantHint}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="share-template-tag">{t.promptGallery.tagsLabel}</Label>
                <span className="text-xs text-muted-foreground">{tags.length}/{TAG_MAX_COUNT}</span>
              </div>
              <div className="flex gap-2">
                <Input
                  id="share-template-tag"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value.slice(0, TAG_MAX_LENGTH))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleAddTag()
                    }
                  }}
                  placeholder={t.promptGallery.tagsPlaceholder}
                  maxLength={TAG_MAX_LENGTH}
                  disabled={tags.length >= TAG_MAX_COUNT}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  onClick={handleAddTag}
                  variant="outline"
                  disabled={!tagInput.trim() || tags.length >= TAG_MAX_COUNT}
                >
                  {t.promptGallery.addTag}
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                      <span>{tag}</span>
                      <button
                        type="button"
                        aria-label={`${t.common.delete} ${tag}`}
                        onClick={() => handleRemoveTag(tag)}
                        className="rounded-sm p-0.5 hover:bg-secondary-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 p-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="share-template-anonymous" className="text-sm font-medium">
                  {t.promptGallery.anonymousLabel}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isAnonymous || !user?.displayName?.trim()
                    ? t.promptGallery.anonymousOn
                    : `${t.promptGallery.anonymousOff}：${user.displayName}`}
                </p>
              </div>
              <Switch
                id="share-template-anonymous"
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
                disabled={!user?.displayName?.trim()}
              />
            </div>
          </section>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleShare} disabled={guidedPreview || loading || !title.trim() || !prompt.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? t.promptGallery.sharing : t.promptGallery.sharePrompt}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
