/**
 * Share Template Dialog Component
 * Dialog for publishing a reusable prompt template to the gallery.
 */

import { useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { createSharedPrompt } from '../services/prompt-gallery.service'
import type { PromptCategory, PromptSpecialty, PromptType } from '../types/prompt.types'

const TITLE_MAX_LENGTH = 100
const DESCRIPTION_MAX_LENGTH = 180
const PROMPT_MAX_LENGTH = 8000
const TAG_MAX_LENGTH = 24
const TAG_MAX_COUNT = 8

interface SharePromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTitle?: string
  initialDescription?: string
  initialPrompt?: string
  initialType?: PromptType
  onSuccess?: () => void
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
  initialPrompt,
  initialType = 'chat',
  onSuccess,
}: SharePromptDialogProps) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const { user } = useAuth()

  const [title, setTitle] = useState(initialTitle || '')
  const [description, setDescription] = useState(initialDescription || '')
  const [prompt, setPrompt] = useState(initialPrompt || '')
  const [selectedTypes, setSelectedTypes] = useState<PromptType[]>([initialType])
  const [category, setCategory] = useState<PromptCategory>(
    initialType === 'summary' ? 'summary' : 'other',
  )
  const [selectedSpecialties, setSelectedSpecialties] = useState<PromptSpecialty[]>(['general'])
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const categories: PromptCategory[] = [
    'soap', 'admission', 'discharge', 'safety', 'summary',
    'progress', 'consult', 'procedure', 'other',
  ]

  const types: PromptType[] = ['chat', 'summary']

  const specialties: PromptSpecialty[] = [
    'general', 'internal', 'surgery', 'emergency',
    'pediatrics', 'obstetrics', 'psychiatry', 'neurology',
    'rehabilitation', 'anesthesiology', 'ophthalmology',
    'dermatology', 'urology', 'orthopedics', 'ent',
    'radiology', 'radiation_oncology', 'pathology',
    'nuclear_medicine', 'plastic_surgery', 'family_medicine', 'other',
  ]

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

  const toggleSpecialty = (specialty: PromptSpecialty) => {
    if (selectedSpecialties.includes(specialty)) {
      setSelectedSpecialties(selectedSpecialties.filter((item) => item !== specialty))
    } else {
      setSelectedSpecialties([...selectedSpecialties, specialty])
    }
  }

  const handleShare = async () => {
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
      await createSharedPrompt({
        title: title.trim(),
        description: description.trim() || undefined,
        prompt: prompt.trim(),
        types: selectedTypes,
        category,
        specialty: audience === 'medical' ? selectedSpecialties : [],
        audience: [audience],
        tags,
        authorId: user.uid,
        authorName: isAnonymous ? undefined : user.displayName || user.email || undefined,
        isAnonymous,
      })

      setSuccess(true)
      onSuccess?.()

      window.setTimeout(() => {
        onOpenChange(false)
        setSuccess(false)
      }, 1000)
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
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="flex max-h-[94vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{t.promptGallery.sharePrompt}</DialogTitle>
          <DialogDescription>{t.promptGallery.shareDescription}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Alert className="mb-4 border-blue-200 bg-blue-50/70 py-2.5 dark:border-blue-900 dark:bg-blue-950/30">
            <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="mb-0.5 text-sm">{t.promptGallery.sharePrivacyTitle}</AlertTitle>
            <AlertDescription className="text-xs leading-relaxed">
              {t.promptGallery.sharePrivacyDescription}
            </AlertDescription>
          </Alert>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]">
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

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="share-template-prompt">{t.promptGallery.promptLabel} *</Label>
                <span className="text-xs text-muted-foreground">{prompt.length}/{PROMPT_MAX_LENGTH}</span>
              </div>
              <Textarea
                id="share-template-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t.promptGallery.promptPlaceholder}
                maxLength={PROMPT_MAX_LENGTH}
                className="min-h-44 resize-y text-sm leading-relaxed"
              />
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
                    <span className={cn(
                      'mt-0.5 rounded-md p-1.5',
                      isChat
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        : 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
                    )}>
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
                  <Label>{t.promptGallery.specialtyLabel} *</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between font-normal">
                        <span className="truncate">
                          {selectedSpecialties.length === 0
                            ? t.promptGallery.selectSpecialty
                            : t.promptGallery.selectedSpecialties.replace(
                              '{count}',
                              String(selectedSpecialties.length),
                            )}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-[300px] w-[min(400px,calc(100vw-3rem))] overflow-y-auto">
                      <DropdownMenuLabel>{t.promptGallery.selectSpecialtyLabel}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {specialties.map((item) => (
                        <DropdownMenuCheckboxItem
                          key={item}
                          checked={selectedSpecialties.includes(item)}
                          onCheckedChange={() => toggleSpecialty(item)}
                        >
                          {getSpecialtyLabel(item)}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-xl border p-3">
            <h3 className="text-sm font-medium">{t.promptGallery.publishingOptions}</h3>

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
                  {isAnonymous ? t.promptGallery.anonymousOn : t.promptGallery.anonymousOff}
                </p>
              </div>
              <Switch
                id="share-template-anonymous"
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
              />
            </div>
          </section>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950/30">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                {t.promptGallery.shareSuccess}
              </AlertDescription>
            </Alert>
          )}
          </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleShare} disabled={loading || success || !title.trim() || !prompt.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? t.promptGallery.sharing : t.promptGallery.sharePrompt}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
