// multi-region-grouping.ts
// NHI 健保存摺 bills every body part imaged on the same machine (CT, MRI,
// US, X-ray) under one health-record code (33070B, 33080B, …) with NO
// `body_part` field. Patients who undergo head + chest + abdomen CT on the
// same admission end up with several DRs that share `(code, date, hospital)`
// — some narrative-only (the radiologist's report per body part), some
// image-only (the JPEG preview frames per study). Bridge can content-dedup
// the bytes but cannot reliably pair "this image set belongs to that
// narrative" because nothing in the source carries that link.
//
// Per bridge v0.17.1 SMART-side guidance, the app:
//   1. Groups same-(code, date, hospital) DRs together visually.
//   2. Surfaces an ambiguity warning when the group has more narratives
//      and/or image sets than a single pairing could justify.
//   3. Leaves the actual image↔narrative pairing to the clinician's eye
//      (CT slice content is visually unmistakable: brain ≠ chest ≠ abdomen).
//
// This module is the pure data layer: turn a flat Row[] into a Row[] where
// ambiguous clusters are folded into one synthetic group row that carries
// the underlying rows. Single-DR groups pass through unchanged.

import type { Row } from '../types'

/** Normalise a date to YYYY-MM-DD for grouping. Empty string when missing. */
function dayKey(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/** Composite grouping key: rawTitle is preferred over title (rawTitle is the
 *  pre-display NHI order text, e.g. "電腦斷層造影 - 無造影劑"; title may have
 *  been enhanced with an English abbreviation appended). Falls back to title
 *  when rawTitle is empty. Institution is normalised by trim to avoid spurious
 *  splits on trailing whitespace. */
function groupKey(row: Row): string {
  const code = (row.rawTitle?.trim() || row.title?.trim() || '')
  const date = dayKey(row.effectiveDate)
  const inst = (row.institution?.trim() || '')
  return `${code}|${date}|${inst}`
}

/** Has at least one observation that carries a free-text narrative — the
 *  conventional storage for an imaging report's findings/impression on
 *  bridge's narrative channel. Reports built solely from image attachments
 *  return false here even if they carry presentedForm. */
function isNarrative(row: Row): boolean {
  // Bridge writes the radiologist's text either as the first observation's
  // valueString (single-obs narrative reports) OR as note[].text on the DR.
  // The Row.meta strip carries category/status, so check obs instead.
  for (const o of row.obs || []) {
    if (typeof o.valueString === 'string' && o.valueString.trim().length > 30) return true
  }
  return false
}

/** Has at least one inline image attachment (presentedForm bytes). */
function isImageSet(row: Row): boolean {
  return !!row.images && row.images.length > 0
}

/**
 * Bridge spec §"hasAmbiguousAssociation":
 *   • ≥2 narrative-only rows in the group  ⇒ multi-region study
 *   • ≥1 narrative + ≥1 image + total > 2  ⇒ mixed ambiguous set
 *   • a single narrative paired with a single image set is NOT flagged
 *     (1+1 is the unambiguous baseline)
 */
export function hasAmbiguousAssociation(rows: Row[]): boolean {
  if (rows.length < 2) return false
  let narrativeOnly = 0
  let imageOnly = 0
  for (const r of rows) {
    const narr = isNarrative(r)
    const img = isImageSet(r)
    if (narr && !img) narrativeOnly++
    else if (img && !narr) imageOnly++
    // rows that have BOTH narrative and image are unambiguous — their
    // own pairing is already clear, so they don't add to the count.
  }
  if (narrativeOnly >= 2) return true
  if (narrativeOnly >= 1 && imageOnly >= 1 && narrativeOnly + imageOnly > 2) return true
  return false
}

/**
 * Walk a flat list of report rows, cluster by (code, date, institution),
 * and replace every multi-row cluster with one synthetic "group" row whose
 * `groupedRows` holds the originals. Single-row clusters pass through.
 *
 * The synthetic row's identity (id, title, …) is derived from the first
 * underlying row so existing sorts / virtualizer keys stay stable. The
 * caller's render layer is expected to switch on `row.groupedRows` and
 * render MultiRegionStudyCard instead of the default ReportRow.
 *
 * Original ordering is preserved: a group row takes the position of the
 * EARLIEST member in the input list. Non-grouped rows stay where they were.
 */
export function groupMultiRegionStudies(rows: Row[]): Row[] {
  if (!rows.length) return rows
  // Cluster while remembering first-appearance index per key so we can put
  // the group row back at the earliest position.
  const clusters = new Map<string, { firstIdx: number; rows: Row[] }>()
  rows.forEach((row, idx) => {
    const key = groupKey(row)
    const c = clusters.get(key)
    if (c) c.rows.push(row)
    else clusters.set(key, { firstIdx: idx, rows: [row] })
  })

  // Build the output by walking the original order, emitting each cluster's
  // synthetic row at its firstIdx position and skipping subsequent members.
  const emitted = new Set<string>()
  const out: Row[] = []
  rows.forEach((row, idx) => {
    const key = groupKey(row)
    const cluster = clusters.get(key)!
    if (cluster.rows.length === 1) {
      out.push(row)
      return
    }
    if (idx !== cluster.firstIdx) return // already emitted as part of the group
    out.push(buildGroupRow(cluster.rows))
    emitted.add(key)
  })
  return out
}

/** Build a synthetic Row that represents the whole cluster. Copies the first
 *  row's display-relevant fields so the row sits naturally amongst its
 *  ungrouped siblings; the renderer knows to switch on `groupedRows`. */
function buildGroupRow(rows: Row[]): Row {
  const head = rows[0]
  return {
    ...head,
    // Distinct id so virtualizer keys don't collide with the underlying row.
    id: `group:${groupKey(head)}`,
    // Keep title/meta from head — MultiRegionStudyCard re-renders its own
    // header anyway, but a sensible fallback matters for screen readers
    // and any consumer that still treats this as a plain Row.
    title: head.title,
    obs: [], // The card lists per-row obs; the top-level row has none.
    images: undefined, // images come from individual grouped rows.
    groupedRows: rows,
    hasAmbiguity: hasAmbiguousAssociation(rows),
  }
}
