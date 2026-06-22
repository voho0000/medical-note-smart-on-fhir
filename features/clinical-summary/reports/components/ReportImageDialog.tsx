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

import { Info } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useReportImageUrls } from '../hooks/useReportImageUrls'
import type { ReportImage } from '../types'

interface ReportImageDialogProps {
  images: ReportImage[]
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
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
    previewLimitNotice:
      'NHI 健康存摺 carries at most 10 preview images per exam; the full DICOM files are not transmitted. For complete imaging studies, request the DICOM disc from the imaging hospital or download the DCM file via the NHI health record.',
  }

  // Resolve only while the dialog is open; the hook revokes on close/unmount so
  // the decoded bytes don't linger in memory across the (potentially large)
  // bundle. Resolution is progressive — each image appears as it's ready.
  const urls = useReportImageUrls(images, open)

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
        {/* Source caveat — 健保存摺 only carries up to 10 preview JPEGs per
            exam (no DICOM). Make the limit explicit on every dialog open so
            clinicians don't mistake the previews for the full imaging study
            and miss key images that didn't make the 10-slot cap. */}
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{tt.previewLimitNotice}</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4">
          {images.map((img, i) => (
            <figure key={i} className="space-y-1">
              {urls[i] ? (
                // loading="lazy" + decoding="async" keep the main thread free
                // while the (large) JPEG paints.
                 
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
