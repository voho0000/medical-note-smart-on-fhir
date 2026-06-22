// useReportImageUrls — resolve DiagnosticReport.presentedForm images to object
// URLs with strict memory discipline, shared by the lightbox
// (ReportImageDialog) and the docked right-pane gallery (ReportImagingDetail).
//
// A single image is ~2-3 MB and a bundle can hold many, so bytes are NEVER held
// eagerly: URLs are created only while `enabled`, and revoked the moment the
// consumer disables or unmounts. Two sources (see ReportImage):
//   - `ref`:  bytes live off-heap in an IndexedDB Blob (local-bundle import).
//   - `data`: raw base64 inline (SMART live path).
"use client"

import { useEffect, useState } from 'react'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import type { ReportImage } from '../types'

/** Decode raw base64 → Blob → object URL. Tolerates a stray
 *  `data:<mime>;base64,` prefix even though the bridge omits it. */
export function base64ToBlobUrl(base64: string, contentType: string): string {
  const raw = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binary = atob(raw)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: contentType || 'image/jpeg' }))
}

/** Resolve a single image source to an object URL. Prefers the IndexedDB Blob
 *  (`ref`); falls back to inline base64 (`data`). Returns '' when neither
 *  resolves so the caller can keep showing the loading placeholder. */
export async function resolveImageUrl(img: ReportImage): Promise<string> {
  if (img.ref) {
    const blob = await LocalBundleService.getImage(img.ref)
    if (blob) return URL.createObjectURL(blob)
  }
  if (img.data) return base64ToBlobUrl(img.data, img.contentType)
  return ''
}

/** Resolve `images` to object URLs while `enabled`, revoking on disable/unmount.
 *  Resolution is async (IndexedDB Blob fetch) and progressive — each URL
 *  appears as soon as it's ready rather than waiting for the whole set. */
export function useReportImageUrls(images: ReportImage[], enabled: boolean): string[] {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    if (!enabled) {
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
          console.warn('[useReportImageUrls] Failed to load image', err)
        }
        created.push(url)
        if (!cancelled) setUrls([...created])
      }
    })()
    return () => {
      cancelled = true
      created.forEach((u) => u && URL.revokeObjectURL(u))
    }
  }, [enabled, images])
  return urls
}
