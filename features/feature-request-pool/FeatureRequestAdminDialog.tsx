'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useLanguage } from '@/src/application/providers/language.provider'
import { updateFeatureRequestAsAdmin } from '@/features/feature-request-pool/service'
import type { FeatureRequest, FeatureRequestOwnership, FeatureRequestStatus } from './types'

interface FeatureRequestAdminDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: FeatureRequest | null
  ownership?: FeatureRequestOwnership
}

export function FeatureRequestAdminDialog({
  open,
  onOpenChange,
  request,
  ownership,
}: FeatureRequestAdminDialogProps) {
  const { t } = useLanguage()
  const copy = t.featureRequests
  const [status, setStatus] = useState<FeatureRequestStatus>(request?.status ?? 'evaluating')
  const [officialNote, setOfficialNote] = useState(request?.officialNote ?? '')
  const [visible, setVisible] = useState(request?.visibility !== 'hidden')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!request) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await updateFeatureRequestAsAdmin(request.id, {
        status,
        officialNote,
        visibility: visible ? 'visible' : 'hidden',
      })
      onOpenChange(false)
    } catch (saveError) {
      console.error('Feature request admin update failed:', saveError)
      setError(copy.admin.error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.admin.title}</DialogTitle>
          <DialogDescription className="line-clamp-2">{request.title}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feature-request-admin-status">{copy.statusLabel}</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as FeatureRequestStatus)}>
              <SelectTrigger id="feature-request-admin-status" className="min-h-[44px] sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evaluating">{copy.statuses.evaluating}</SelectItem>
                <SelectItem value="planned">{copy.statuses.planned}</SelectItem>
                <SelectItem value="in-progress">{copy.statuses.inProgress}</SelectItem>
                <SelectItem value="completed">{copy.statuses.completed}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feature-request-admin-note">{copy.admin.officialNoteLabel}</Label>
            <Textarea
              id="feature-request-admin-note"
              value={officialNote}
              maxLength={1000}
              onChange={(event) => setOfficialNote(event.target.value)}
              placeholder={copy.admin.officialNotePlaceholder}
              className="min-h-24"
            />
          </div>

          <div className="flex min-h-[44px] items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <Label htmlFor="feature-request-admin-visible">{copy.admin.visibilityLabel}</Label>
              <p className="mt-1 text-xs text-muted-foreground">{copy.admin.visibilityHint}</p>
            </div>
            <Switch id="feature-request-admin-visible" checked={visible} onCheckedChange={setVisible} />
          </div>

          {ownership?.authorEmail && (
            <div className="text-sm">
              <span className="text-muted-foreground">{copy.admin.submitter}: </span>
              <span className="break-all">{ownership.authorEmail}</span>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={submitting}>{copy.admin.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
