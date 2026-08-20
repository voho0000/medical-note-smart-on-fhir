'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { User } from '@/src/application/providers/auth.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { createFeatureRequest, editFeatureRequest } from '@/features/feature-request-pool/service'
import type { FeatureRequest, FeatureRequestCategory } from './types'

interface FeatureRequestFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User
  request?: FeatureRequest | null
}

function publicNameFor(user: User): string {
  return user.displayName?.trim() || user.email?.split('@')[0] || ''
}

export function FeatureRequestFormDialog({
  open,
  onOpenChange,
  user,
  request,
}: FeatureRequestFormDialogProps) {
  const { t } = useLanguage()
  const copy = t.featureRequests
  const publicName = useMemo(() => publicNameFor(user), [user])
  const [title, setTitle] = useState(request?.title ?? '')
  const [description, setDescription] = useState(request?.description ?? '')
  const [category, setCategory] = useState<FeatureRequestCategory>(request?.category ?? 'feature')
  const [displayAuthor, setDisplayAuthor] = useState(request?.displayAuthor === true && publicName.length > 0)
  const [safetyConfirmed, setSafetyConfirmed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    const cleanTitle = title.trim()
    if (cleanTitle.length < 2 || cleanTitle.length > 100) {
      nextErrors.title = copy.form.titleRequired
    }
    if (description.trim().length > 1200) {
      nextErrors.description = copy.form.error
    }
    if (!category) nextErrors.category = copy.form.categoryRequired
    if (!safetyConfirmed) nextErrors.safety = copy.form.safetyRequired
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      const input = {
        title,
        description,
        category,
        displayAuthor: displayAuthor && publicName.length > 0,
        authorName: publicName,
      }
      if (request) {
        await editFeatureRequest(request.id, input)
      } else {
        if (!user.email) throw new Error('A verified account email is required')
        await createFeatureRequest({
          ...input,
          authorId: user.uid,
          authorEmail: user.email,
        })
      }
      toast.success(request ? copy.form.save : copy.form.submit)
      onOpenChange(false)
    } catch (error) {
      console.error('Feature request save failed:', error)
      setErrors((current) => ({ ...current, submit: copy.form.error }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{request ? copy.form.editTitle : copy.form.createTitle}</DialogTitle>
          <DialogDescription>{copy.form.editWindow}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>{copy.form.privacyWarning}</AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="feature-request-title">{copy.form.titleLabel} *</Label>
            <Input
              id="feature-request-title"
              value={title}
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={copy.form.titlePlaceholder}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'feature-request-title-error' : undefined}
              autoFocus
            />
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              {errors.title ? (
                <span id="feature-request-title-error" className="text-destructive">{errors.title}</span>
              ) : <span />}
              <span className="tabular-nums">{title.length}/100</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feature-request-description">{copy.form.descriptionLabel}</Label>
            <Textarea
              id="feature-request-description"
              value={description}
              maxLength={1200}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={copy.form.descriptionPlaceholder}
              className="min-h-24"
              aria-invalid={Boolean(errors.description)}
            />
            <div className="text-right text-xs tabular-nums text-muted-foreground">
              {description.length}/1200
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feature-request-category">{copy.categoryLabel} *</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as FeatureRequestCategory)}>
              <SelectTrigger id="feature-request-category" className="min-h-[44px] sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ai">{copy.categories.ai}</SelectItem>
                <SelectItem value="feature">{copy.categories.feature}</SelectItem>
                <SelectItem value="ui">{copy.categories.ui}</SelectItem>
              </SelectContent>
            </Select>
            {errors.category && <p className="text-sm text-destructive">{errors.category}</p>}
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={displayAuthor}
              onCheckedChange={(checked) => setDisplayAuthor(checked === true)}
              disabled={!publicName}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">{copy.form.showName}</span>
              {publicName && (
                <span className="block text-xs text-muted-foreground">
                  {copy.form.showNameHint.replace('{name}', publicName)}
                </span>
              )}
            </span>
          </label>

          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={safetyConfirmed}
              onCheckedChange={(checked) => setSafetyConfirmed(checked === true)}
              aria-invalid={Boolean(errors.safety)}
              className="mt-0.5"
            />
            <span className="text-sm leading-5">{copy.form.safetyConfirmation}</span>
          </label>
          {errors.safety && <p className="text-sm text-destructive">{errors.safety}</p>}
          {errors.submit && <p className="text-sm text-destructive">{errors.submit}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? copy.form.submitting : request ? copy.form.save : copy.form.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
