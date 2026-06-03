// ReportImageDialog — on-demand viewer for images carried on a
// DiagnosticReport.presentedForm (bridge v0.14.0+: 健保存摺 X-ray / ECG …).
//
// Memory discipline: a single image is ~2-3 MB and a bundle can hold many, so
// we NEVER load eagerly. Two image sources (see ReportImage):
//   - `ref`:  bytes live off-heap in an IndexedDB Blob (local-bundle import
//             path); we fetch the Blob only while this dialog is open.
//   - `data`: raw base64 inline (SMART live path); decoded on open.
// Either way the object URL is created on open and revoked the moment the dialog
// closes (or unmounts), so decoded bytes never linger across the (potentially
// large) bundle. The parent (ReportRow) also lazy-mounts this on first open.
"use client"

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/src/application/providers/language.provider'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import type { ReportImage } from '../types'

interface ReportImageDialogProps {
  images: ReportImage[]
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Decode raw base64 → Blob → object URL. Tolerates a stray
 *  `data:<mime>;base64,` prefix even though the bridge omits it. */
function base64ToBlobUrl(base64: string, contentType: string): string {
  const raw = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binary = atob(raw)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: contentType || 'image/jpeg' }))
}

/** Resolve a single image source to an object URL. Prefers the IndexedDB Blob
 *  (`ref`); falls back to inline base64 (`data`). Returns '' when neither
 *  resolves so the caller can keep showing the loading placeholder. */
async function resolveImageUrl(img: ReportImage): Promise<string> {
  if (img.ref) {
    const blob = await LocalBundleService.getImage(img.ref)
    if (blob) return URL.createObjectURL(blob)
  }
  if (img.data) return base64ToBlobUrl(img.data, img.contentType)
  return ''
}

function formatBytes(size?: number): string {
  if (!size || size <= 0) return ''
  const mb = size / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.round(size / 1024)} KB`
}

export function ReportImageDialog({ images, title, open, onOpenChange }: ReportImageDialogProps) {
  const { t } = useLanguage()
  const tt = (t as any).reports?.image || {
    view: 'View image',
    images: 'Images',
    loading: 'Loading image…',
  }

  // Resolve only while the dialog is open; revoke on close/unmount so the
  // decoded bytes don't linger in memory across the (potentially large) bundle.
  // Resolution is async (IndexedDB Blob fetch) and progressive — each image
  // appears as soon as it's ready rather than waiting for the whole set.
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    if (!open) {
      setUrls([])
      return
    }
    let cancelled = false
    const created: string[] = []
    ;(async () => {
      for (const img of images) {
        if (cancelled) break
        let url = ''
        try {
          url = await resolveImageUrl(img)
        } catch (err) {
          console.warn('[ReportImageDialog] Failed to load image', err)
        }
        created.push(url)
        if (!cancelled) setUrls([...created])
      }
    })()
    return () => {
      cancelled = true
      created.forEach((u) => u && URL.revokeObjectURL(u))
    }
  }, [open, images])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">
            {title}
            {images.length > 1 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {images.length} {tt.images}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4">
          {images.map((img, i) => (
            <figure key={i} className="space-y-1">
              {urls[i] ? (
                // loading="lazy" + decoding="async" keep the main thread free
                // while the (large) JPEG paints.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[i]}
                  alt={img.title || title}
                  loading="lazy"
                  decoding="async"
                  className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md border bg-black/5 object-contain"
                />
              ) : (
                <div className="flex h-48 items-center justify-center rounded-md border bg-muted/40 text-sm text-muted-foreground">
                  {tt.loading}
                </div>
              )}
              {(img.title || img.size) && (
                <figcaption className="text-center text-xs text-muted-foreground">
                  {img.title}
                  {img.title && img.size ? ' • ' : ''}
                  {formatBytes(img.size)}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
