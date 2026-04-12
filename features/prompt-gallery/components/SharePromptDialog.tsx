/**
 * Share Prompt Dialog Component
 * Dialog for sharing a prompt to the gallery
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, X, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import type { PromptType, PromptCategory, PromptSpecialty } from '../types/prompt.types'
import { createSharedPrompt } from '../services/prompt-gallery.service'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'

interface SharePromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTitle?: string
  initialPrompt?: string
  initialType?: PromptType
  onSuccess?: () => void
}

export function SharePromptDialog({
  open,
  onOpenChange,
  initialTitle,
  initialPrompt,
  initialType = 'chat',
  onSuccess,
}: SharePromptDialogProps) {
  const { t } = useLanguage()
  const { user } = useAuth()
  
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<PromptType[]>([initialType])
  const [category, setCategory] = useState<PromptCategory>('other')
  const [selectedSpecialties, setSelectedSpecialties] = useState<PromptSpecialty[]>(['general'])
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Update title and prompt when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(initialTitle || '')
      setPrompt(initialPrompt || '')
    }
  }, [open, initialTitle, initialPrompt])

  const categories: PromptCategory[] = [
    'soap', 'admission', 'discharge', 'safety', 'summary', 
    'progress', 'consult', 'procedure', 'other'
  ]
  
  const types: PromptType[] = ['chat', 'insight']
  
  const specialties: PromptSpecialty[] = [
    'general', 'internal', 'surgery', 'emergency', 
    'pediatrics', 'obstetrics', 'psychiatry', 'neurology',
    'rehabilitation', 'anesthesiology', 'ophthalmology', 
    'dermatology', 'urology', 'orthopedics', 'ent',
    'radiology', 'radiation_oncology', 'pathology',
    'nuclear_medicine', 'plastic_surgery', 'family_medicine', 'other'
  ]

  const handleAddTag = () => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag))
  }

  const toggleType = (type: PromptType) => {
    if (selectedTypes.includes(type)) {
      // 至少要保留一個類型
      if (selectedTypes.length > 1) {
        setSelectedTypes(selectedTypes.filter(t => t !== type))
      }
    } else {
      setSelectedTypes([...selectedTypes, type])
    }
  }

  const toggleSpecialty = (specialty: PromptSpecialty) => {
    if (selectedSpecialties.includes(specialty)) {
      setSelectedSpecialties(selectedSpecialties.filter(s => s !== specialty))
    } else {
      setSelectedSpecialties([...selectedSpecialties, specialty])
    }
  }

  const handleShare = async () => {
    console.log('=== SharePromptDialog: handleShare 開始 ===')
    
    if (!title.trim()) {
      setError(t.promptGallery.shareError + ': ' + t.promptGallery.errorTitleRequired)
      return
    }

    if (!prompt.trim()) {
      setError(t.promptGallery.shareError + ': ' + t.promptGallery.errorPromptRequired)
      return
    }

    if (selectedSpecialties.length === 0) {
      setError(t.promptGallery.shareError + ': ' + t.promptGallery.errorSpecialtyRequired)
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log('準備分享的資料:', {
        title: title.trim(),
        promptLength: prompt.trim().length,
        types: selectedTypes,
        category,
        specialty: selectedSpecialties,
        tags,
        isAnonymous,
        userId: user?.uid,
      })

      const promptId = await createSharedPrompt({
        title: title.trim(),
        prompt: prompt.trim(),
        types: selectedTypes,
        category,
        specialty: selectedSpecialties,
        tags,
        authorId: user?.uid,
        authorName: user?.displayName || user?.email || undefined,
        isAnonymous,
      })

      console.log('✅ Prompt 分享成功，ID:', promptId)
      setSuccess(true)
      
      // Call onSuccess callback to refresh the gallery
      if (onSuccess) {
        onSuccess()
      }
      
      setTimeout(() => {
        onOpenChange(false)
        // Reset form
        setTitle('')
        setPrompt('')
        setSelectedTypes(['chat'])
        setCategory('other')
        setSelectedSpecialties(['general'])
        setTags([])
        setIsAnonymous(false)
        setSuccess(false)
      }, 2000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t.promptGallery.shareError
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const getCategoryLabel = (cat: PromptCategory) => {
    return t.promptGallery.categories[cat as keyof typeof t.promptGallery.categories] || cat
  }

  const getSpecialtyLabel = (spec: PromptSpecialty) => {
    return t.promptGallery.specialties[spec as keyof typeof t.promptGallery.specialties] || spec
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.promptGallery.sharePrompt}</DialogTitle>
          <DialogDescription>{t.promptGallery.shareDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">{t.promptGallery.titleLabel} *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.promptGallery.titlePlaceholder}
            />
          </div>

          {/* Prompt Content */}
          <div className="space-y-2">
            <Label htmlFor="prompt">{t.promptGallery.promptLabel} *</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t.promptGallery.promptPlaceholder}
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          {/* Type */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Label>{t.promptGallery.typeLabel} *</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{t.promptGallery.typeTooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex gap-2">
              {types.map((type) => (
                <Badge
                  key={type}
                  variant={selectedTypes.includes(type) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleType(type)}
                >
                  {type === 'chat' ? t.promptGallery.typeChat : t.promptGallery.typeInsight}
                </Badge>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>{t.promptGallery.categoryLabel} *</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as PromptCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {getCategoryLabel(cat)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Specialties */}
          <div className="space-y-2">
            <Label>{t.promptGallery.specialtyLabel} *</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="truncate">
                    {selectedSpecialties.length === 0
                      ? t.promptGallery.selectSpecialty
                      : t.promptGallery.selectedSpecialties.replace('{count}', String(selectedSpecialties.length))}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[400px] max-h-[300px] overflow-y-auto">
                <DropdownMenuLabel>{t.promptGallery.selectSpecialtyLabel}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {specialties.map((spec) => (
                  <DropdownMenuCheckboxItem
                    key={spec}
                    checked={selectedSpecialties.includes(spec)}
                    onCheckedChange={() => toggleSpecialty(spec)}
                  >
                    {getSpecialtyLabel(spec)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {selectedSpecialties.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedSpecialties.map((spec) => (
                  <Badge key={spec} variant="secondary" className="text-xs">
                    {getSpecialtyLabel(spec)}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSpecialty(spec)
                      }}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Anonymous Toggle */}
          <div className="flex items-center justify-between space-x-2 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="anonymous" className="text-sm font-medium">
                {t.promptGallery.anonymousLabel}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isAnonymous 
                  ? t.promptGallery.anonymousOn
                  : t.promptGallery.anonymousOff}
              </p>
            </div>
            <Switch
              id="anonymous"
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">{t.promptGallery.tagsLabel}</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
                placeholder={t.promptGallery.tagsPlaceholder}
              />
              <Button type="button" onClick={handleAddTag} variant="outline">
                {t.promptGallery.addTag}
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag, index) => (
                  <Badge key={`${tag}-${index}`} variant="secondary" className="gap-1 pr-1">
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveTag(tag)
                      }}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-sm p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success */}
          {success && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950/30">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                {t.promptGallery.shareSuccess}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleShare} disabled={loading || success}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t.promptGallery.sharePrompt}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
