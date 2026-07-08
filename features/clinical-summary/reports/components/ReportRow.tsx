// Report Row Component
import { useRef, useState, memo } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TrendingUp, Building2, AlertCircle, Copy, Check, ChevronDown, GripHorizontal, ImageIcon, Info, PanelRight } from 'lucide-react'
import { cn } from "@/src/shared/utils/cn.utils"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useRightDetail } from "@/src/application/providers/right-detail.provider"
import { useReportImageUrls } from '../hooks/useReportImageUrls'
import type { Row, Observation, ReportImage } from '../types'
import { getValueWithUnit, getReferenceRangeText, getCodeableConceptText } from '../utils/fhir-helpers'
import { isObservationAbnormal } from '../utils/interpretation-helpers'
import { ObservationBlock } from './ObservationBlock'
import { ObservationTrendDialog } from './ObservationTrendDialog'
import { HighlightText } from '@/src/shared/components/HighlightText'
import { ReportImageDialog } from './ReportImageDialog'
import { FormattedReportText } from './FormattedReportText'
import { MultiRegionStudyCard } from './MultiRegionStudyCard'
import { ReportInterpretationButton, ReportInterpretationPanel } from '@/features/report-interpretation'
// Circular at module level (LabDayGroupCard nests ReportRow for its members)
// but safe: `export function ReportRow` is hoisted, and the reference is only
// dereferenced at render time, long after both modules finish initialising.
import { LabDayGroupCard } from './LabDayGroupCard'

/** Small badge surfaced on a Row's header when bridge sent N duplicate
 *  DRs that the SMART app merged via strict-prefix dedup. It's a QA signal
 *  (surfaces a bridge-side dedup miss so it can be filed) — so it's scoped to
 *  the CLINICIAN view: a patient neither files bridge reports nor benefits from
 *  a ⚠ "duplicate copies" flag (it only worries them). The dedup itself always
 *  happens; only this badge is audience-gated. The visible label drops the
 *  "bridge" jargon; the file-a-report hint stays in the tooltip. */
function BridgeDupBadge({ count }: { count: number }) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  if (audience === 'patient') return null
  const bd = (t.reports as { bridgeDup?: { label: string; tooltip: string } }).bridgeDup
  const tooltip = (bd?.tooltip ?? '').replace('{count}', String(count + 1))
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0 text-[0.625rem] font-medium text-amber-800 cursor-help"
          aria-label={tooltip}
        >
          ⚠ {bd?.label ?? 'dup'} ×{count}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

function formatImageBytes(size?: number): string {
  if (!size || size <= 0) return ''
  const mb = size / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.round(size / 1024)} KB`
}

/** Report detail rendered in the right pane (向右展開) — findings text on top,
 *  images below, each its own scroll region (per the user's 文上圖下、各自捲動).
 *  Self-contained (owns copy + lightbox state + image-URL lifecycle) because the
 *  node is snapshotted into the right-detail context and rendered apart from the
 *  originating ReportRow, so it can't share the row's local state. Falls back to
 *  a single natural-scroll column when only text OR only images are present. */
function ReportImagingDetail({ text, images, title, reportId }: { text: string; images: ReportImage[]; title: string; reportId?: string }) {
  const { t } = useLanguage()
  const tt = (t as any).reports?.image
  const hasText = text.length > 0
  const hasImages = images.length > 0
  const urls = useReportImageUrls(images, hasImages)
  const [copied, setCopied] = useState(false)
  // Lazy-mount the full-screen lightbox only after the user clicks an image;
  // kept mounted afterwards so re-opening is instant. Inline images already
  // decode (via the hook) for the docked preview; the lightbox offers the
  // zoom/full-res view the half-width pane can't.
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxMounted, setLightboxMounted] = useState(false)
  const openLightbox = () => {
    setLightboxMounted(true)
    setLightboxOpen(true)
  }

  // Draggable splitter between the text (top) and image (bottom) regions: the
  // user can pull it to give the image more (or less) room. `topPct` is the text
  // region's share of the height; pointer capture keeps the drag tracking even
  // when the cursor leaves the thin handle. Clamped so neither region vanishes.
  const splitRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false) // synchronous flag so moves track off-handle
  // null = auto: the text region hugs its content (a short report leaves no
  // blank gap — the image starts right under the text) and the image takes the
  // rest. Becomes a number once the user drags the splitter, switching to an
  // explicit ratio they control (needed when BOTH text and image are long).
  const [topPct, setTopPct] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false) // mirror, for the visual state
  const clampPct = (p: number) => Math.min(80, Math.max(15, p))
  // Current rendered share of the text region — the starting point for keyboard
  // nudges while still in auto mode.
  const measurePct = () => {
    const c = splitRef.current?.getBoundingClientRect()
    const tr = textRef.current?.getBoundingClientRect()
    if (!c || !tr || c.height === 0) return 42
    return (tr.height / c.height) * 100
  }
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    draggingRef.current = true
    setDragging(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* capture is best-effort */ }
  }
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const rect = splitRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return
    setTopPct(clampPct(((e.clientY - rect.top) / rect.height) * 100))
  }
  const onHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no-op */ }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.warn('[ReportRow] Clipboard copy failed', err)
    }
  }

  const textBlock = hasText ? (
    <div>
      {/* Copy button pinned to the top-right of the (scrolling) text region —
          floated so the report text flows past it, sticky so it stays put as
          the text scrolls. */}
      <button
        type="button"
        onClick={copy}
        className="sticky top-0 z-10 float-right ml-2 inline-flex items-center gap-1 rounded-md border bg-card/95 px-1.5 py-0.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-primary"
        aria-label="複製報告全文"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" />
            已複製
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            複製全文
          </>
        )}
      </button>
      <FormattedReportText text={text} className="text-sm leading-relaxed text-foreground/90" />
    </div>
  ) : null

  // 「AI 翻譯解讀」in the docked (向右展開) view — manual mode: shows the result
  // already generated inline (shared per-reportId cache) or a trigger button, so
  // docking a report to read it never auto-spends an AI call. Sits above the
  // original text so a 民眾 sees the AI result first.
  const interpretBlock = reportId && hasText ? (
    <ReportInterpretationPanel
      reportId={reportId}
      reportText={text}
      reportTitle={title}
      autoGenerate={false}
    />
  ) : null

  // Source caveat — 健保存摺 carries at most 10 preview JPEGs per exam (no
  // DICOM). It's an IMAGE caveat, so it renders inside the image region (above
  // the images, below the splitter) — not above the text report.
  const noticeBlock = hasImages && tt?.previewLimitNotice ? (
    <div className="flex shrink-0 items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[0.6875rem] leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{tt.previewLimitNotice}</span>
    </div>
  ) : null

  const imageBlock = hasImages ? (
    <div className="space-y-3">
      {images.map((img, i) => (
        <figure key={i} className="space-y-1">
          {urls[i] ? (
            <button
              type="button"
              onClick={openLightbox}
              title={tt?.view ?? '放大檢視'}
              className="block w-full"
            >
              <img
                src={urls[i]}
                alt={img.title || title}
                loading="lazy"
                decoding="async"
                className="mx-auto max-h-[60vh] w-auto max-w-full rounded-md border bg-black/5 object-contain cursor-zoom-in"
              />
            </button>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md border bg-muted/40 text-sm text-muted-foreground">
              {tt?.loading ?? '載入影像…'}
            </div>
          )}
          {(img.title || img.size) && (
            <figcaption className="text-center text-xs text-muted-foreground">
              {img.title}
              {img.title && img.size ? ' • ' : ''}
              {formatImageBytes(img.size)}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  ) : null

  const lightbox = lightboxMounted ? (
    <ReportImageDialog images={images} title={title} open={lightboxOpen} onOpenChange={setLightboxOpen} />
  ) : null

  // Both present → a fixed notice bar on top, then two independently-scrolling
  // regions split 50/50 (the text caps at half so the image gets a genuine
  // half — the notice sits OUTSIDE the split so it doesn't steal image space).
  // Otherwise a single natural-scroll column (the pane's own overflow handles).
  if (hasText && hasImages) {
    return (
      <div ref={splitRef} className="flex h-full flex-col">
        <div
          ref={textRef}
          className="scrollbar-thin-persistent shrink-0 overflow-y-auto pr-1"
          style={topPct === null ? { maxHeight: '40%' } : { height: `${topPct}%` }}
        >{interpretBlock}{textBlock}</div>
        {/* Draggable splitter — defaults to sitting right under the text (auto),
            so a short report leaves no blank gap; drag up/down (or focus + ↑/↓)
            to rebalance when both text and image are long enough to scroll. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖移以調整文字與影像的高度比例"
          aria-valuenow={topPct === null ? undefined : Math.round(topPct)}
          aria-valuemin={15}
          aria-valuemax={80}
          tabIndex={0}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); setTopPct((p) => clampPct((p ?? measurePct()) - 4)) }
            else if (e.key === 'ArrowDown') { e.preventDefault(); setTopPct((p) => clampPct((p ?? measurePct()) + 4)) }
          }}
          className="group relative shrink-0 cursor-row-resize touch-none py-2 outline-none"
        >
          {/* full-width hairline so the divider reads as a movable boundary */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
          {/* centered grip handle — a clear, obviously-draggable affordance */}
          <div
            className={cn(
              'relative mx-auto flex h-4 w-9 items-center justify-center rounded-md border bg-card shadow-sm transition-colors',
              dragging
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground group-hover:border-primary/50 group-hover:text-primary group-focus-visible:border-primary/50',
            )}
          >
            <GripHorizontal className="h-3.5 w-3.5" />
          </div>
        </div>
        {/* Image region — the preview-limit caveat lives HERE (with the images,
            below the splitter), not above the text. The image gets the majority
            of the height since the text caps at 40%. */}
        <div className="scrollbar-thin-persistent min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {noticeBlock}
          {imageBlock}
        </div>
        {lightbox}
      </div>
    )
  }
  return (
    <>
      {interpretBlock}
      {textBlock}
      {noticeBlock}
      {imageBlock}
      {lightbox}
    </>
  )
}

/** Lab-panel detail rendered in the right pane (向右展開) — the panel's analyte
 *  rows (the very same ObservationBlocks the accordion expands to inline), in a
 *  scroll region with a persistent scrollbar so a long panel reads beside the
 *  list. */
function ReportPanelDetail({ observations }: { observations: Observation[] }) {
  return (
    <div className="scrollbar-thin-persistent grid h-full content-start gap-3 overflow-y-auto pr-1">
      {observations.map((obs, i) => (
        <ObservationBlock key={obs.id ? `obs-${obs.id}` : `obs-${i}`} observation={obs} />
      ))}
    </div>
  )
}

interface ReportRowProps {
  row: Row
  defaultOpen: string[]
  /** Active search query — highlights matches in the report title. */
  query?: string
  /** Hide the per-row institution + date cluster — set by LabDayGroupCard,
   *  whose group header already states both, so nested members don't repeat
   *  the same date/hospital on every line of the "lab sheet". */
  hideMeta?: boolean
}

function formatDisplayDate(date?: string, showTime?: boolean): string {
  if (!date) return ''
  try {
    const d = new Date(date)
    if (showTime) {
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString()
  } catch {
    return date
  }
}

// Time-only label for rows inside a LabDayGroupCard (hideMeta): the group
// header owns the date, but same-analyte serials (q6h troponin, repeat CBC)
// still need their draw TIME to be tellable apart. Only rendered when the
// row carries the showTime disambiguation flag.
function formatTimeOnly(date?: string): string {
  if (!date) return ''
  try {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Collapse repeated blank lines so verbose hospital-report text doesn't waste
// vertical space when expanded inline. Keeps single line breaks intact.
function compactBlankLines(s: string): string {
  return (s || '').replace(/(\r?\n)[ \t]*(?:\r?\n)+/g, '\n').trim()
}

function countAbnormal(obs: Observation[]): number {
  let count = 0
  for (const o of obs) {
    if (isObservationAbnormal(o)) {
      count++
      continue
    }
    if (Array.isArray(o.component)) {
      for (const c of o.component) {
        if (isObservationAbnormal(c)) {
          count++
          break
        }
      }
    }
  }
  return count
}

function ReportRowImpl({ row, defaultOpen, query, hideMeta }: ReportRowProps) {
  const [trendDialogOpen, setTrendDialogOpen] = useState(false)
  // Separate "mounted" flag so the dialog (and its expensive history hooks)
  // only enter the React tree after the user actually opens it the first
  // time. We keep it mounted afterwards so re-opening is instant.
  const [trendDialogMounted, setTrendDialogMounted] = useState(false)
  const openTrendDialog = () => {
    setTrendDialogMounted(true)
    setTrendDialogOpen(true)
  }
  // Image lightbox — same lazy-mount discipline as the trend dialog: only enter
  // the tree (and decode the multi-MB base64) after the user clicks the
  // indicator. Kept mounted afterwards; the dialog itself revokes its Blob URLs
  // whenever it closes, so memory is released without unmounting.
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [imageDialogMounted, setImageDialogMounted] = useState(false)
  const openImageDialog = () => {
    setImageDialogMounted(true)
    setImageDialogOpen(true)
  }
  // Long-text reports honour defaultOpen too: a day-group card opening all its
  // members, or a search matching INSIDE the narrative (valueString), starts
  // this expanded — previously only accordion panels respected defaultOpen.
  const [textExpanded, setTextExpanded] = useState(() => defaultOpen.includes(row.id))
  const [copied, setCopied] = useState(false)
  // 「AI 翻譯解讀」panel — opened per report on demand (民眾 feature). Host owns the
  // open state; the panel below self-generates on first open.
  const [interpretOpen, setInterpretOpen] = useState(false)
  // 向右展開 — single long reports (imaging / ECG / pathology narratives) can be
  // pushed to the right pane so the long text reads beside the rest of the list.
  // Lab panels / 累積報告 are deliberately excluded (handled below in the
  // isLongText branch only).
  const { detail: rightDetail, toggleDetail } = useRightDetail()

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.warn('[ReportRow] Clipboard copy failed', err)
    }
  }

  // A procedure's details (status, date, performer, NHI/PCS codes, reason) live
  // as components on the synthetic observation at index 0 — keep it. (It used to
  // be sliced off, which left bridge ≥0.18.14 procedures — that carry no related
  // observations — showing "0 項" with an empty body.)
  const displayObs = row.obs
  const firstObs = row.obs[0]

  const images = row.images
  const hasImages = !!images && images.length > 0

  // Inline-image indicator. Clicking opens the lazy lightbox. `stopProp` is set
  // when the button lives inside an AccordionTrigger so the click doesn't also
  // toggle the accordion (mirrors TrendButton).
  const ImageButton = ({ stopProp }: { stopProp?: boolean }) => (
    <div
      onClick={(e) => {
        if (stopProp) e.stopPropagation()
        openImageDialog()
      }}
      className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors cursor-pointer shrink-0"
      role="button"
      tabIndex={0}
      aria-label="查看影像"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (stopProp) e.stopPropagation()
          openImageDialog()
        }
      }}
    >
      <ImageIcon className="h-4 w-4" />
      {images!.length > 1 && <span className="text-xs tabular-nums">{images!.length}</span>}
    </div>
  )

  // Computed element (not an inner component) so the same reference is dropped
  // into whichever return branch renders — a `() => <Dialog/>` inner component
  // would get a fresh identity each render and remount the dialog (re-decoding
  // images, losing open state). Mirrors how the trend dialog is inlined.
  const imageLightbox = imageDialogMounted && hasImages ? (
    <ReportImageDialog
      images={images!}
      title={row.title}
      open={imageDialogOpen}
      onOpenChange={setImageDialogOpen}
    />
  ) : null

  const isSingleValue =
    displayObs.length === 1 &&
    (!(displayObs[0].component) || displayObs[0].component.length === 0)

  const TrendButton = ({ stopProp }: { stopProp?: boolean }) => (
    <div
      onClick={(e) => {
        if (stopProp) e.stopPropagation()
        openTrendDialog()
      }}
      className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label="查看趨勢"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (stopProp) e.stopPropagation()
          openTrendDialog()
        }
      }}
    >
      <TrendingUp className="h-4 w-4" />
    </div>
  )

  // Single-value report: compact display
  if (isSingleValue) {
    const obs = displayObs[0]
    const isAbnormal = isObservationAbnormal(obs)
    const refText = getReferenceRangeText(obs.referenceRange)
    // Synthetic narrative obs from text-based DiagnosticReports (imaging / ECG /
    // pathology) carry code.text === 'Report Summary'. These are ALWAYS routed to
    // the expandable long-text branch regardless of length — a short ECG
    // conclusion ("Sinus rhythm") must still be fully readable + expandable, not
    // truncated to one line behind a hover tooltip like a short lab string value.
    const isReportSummary = obs.code?.text === 'Report Summary'
    const isLongText = !obs.valueQuantity && ((obs.valueString?.length ?? 0) > 80 || isReportSummary)

    const dateLabel = formatDisplayDate(row.effectiveDate, row.showTime)
    const metaWithDate = row.meta + (dateLabel ? ` • ${dateLabel}` : '')

    // Date-only badge + institution inline, consistent with the single-value
    // and accordion rows. Category/status (e.g. "Radiology • final") are noise
    // in this dataset — they live on the badge's hover tooltip instead.
    // bridgeDupCount badge surfaces bridge-side dedup misses so the bug
    // doesn't get silently hidden by our merge (no-mask-bridge-bugs rule).
    const HeaderRight = () => (
      <div className="flex items-center gap-2 shrink-0">
        {row.bridgeDupCount && row.bridgeDupCount > 0 ? <BridgeDupBadge count={row.bridgeDupCount} /> : null}
        {!hideMeta && row.institution && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-600/80 dark:text-blue-400/80 min-w-0 max-w-[6rem]">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{row.institution}</span>
          </span>
        )}
        {!hideMeta && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">{dateLabel || metaWithDate}</Badge>
            </TooltipTrigger>
            <TooltipContent>{metaWithDate}</TooltipContent>
          </Tooltip>
        )}
        {hideMeta && row.showTime && formatTimeOnly(row.effectiveDate) && (
          <Badge variant="outline" className="text-xs font-normal whitespace-nowrap tabular-nums">
            {formatTimeOnly(row.effectiveDate)}
          </Badge>
        )}
      </div>
    )

    // Long text (ECG conclusion, CT description): collapsed shows truncated preview,
    // header row toggles open/close (mirrors the multi-item accordion below).
    // Body text stays selectable; a Copy button shows when expanded.
    if (isLongText) {
      const fullText = compactBlankLines(obs.valueString || '')
      // Image-only imaging reports (X-ray / ECG with empty conclusion) reach
      // this branch via the synthetic "Report Summary" obs but carry no text —
      // render just the header (title + image indicator), with no toggle,
      // chevron, or empty expandable.
      const hasText = fullText.length > 0
      // 向右展開 target id — namespaced so it can't collide with visit/med ids
      // that share the single right-pane slot.
      const reportSourceId = `report:${row.id}`
      const isReportRightActive = rightDetail?.sourceId === reportSourceId
      const openReportRight = (e: React.MouseEvent) => {
        e.stopPropagation()
        toggleDetail({
          sourceId: reportSourceId,
          title: (
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">{row.title}</span>
              {dateLabel && (
                <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">· {dateLabel}</span>
              )}
            </span>
          ),
          // key per report so the splitter ratio (and lightbox state) reset to
          // the content-aware default on each open instead of React reusing the
          // instance and carrying a previous report's dragged ratio over.
          node: <ReportImagingDetail key={reportSourceId} text={fullText} images={images ?? []} title={row.title} reportId={reportSourceId} />,
        })
      }
      return (
        <>
          <div
            className={cn(
              'rounded-lg border bg-muted/40 px-3 py-2 transition-colors',
              // 向右展開 active: tint the row so it's clear which report the
              // right pane is showing.
              isReportRightActive && 'border-primary/40 bg-primary/5',
            )}
          >
            <div
              className={cn(
                'flex items-center justify-between gap-2 mb-1 rounded-md transition-all outline-none',
                hasText && 'cursor-pointer select-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50'
              )}
              role={hasText ? 'button' : undefined}
              tabIndex={hasText ? 0 : undefined}
              aria-expanded={hasText ? textExpanded : undefined}
              onClick={(e) => {
                if (!hasText) return
                if ((e.target as HTMLElement).closest('[aria-label="查看趨勢"]')) return
                if ((e.target as HTMLElement).closest('[aria-label="查看影像"]')) return
                setTextExpanded(!textExpanded)
              }}
              onKeyDown={(e) => {
                if (!hasText) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setTextExpanded(!textExpanded)
                }
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm font-semibold text-foreground truncate"><HighlightText text={row.title} query={query} /></span>
                  </TooltipTrigger>
                  <TooltipContent>{row.title}</TooltipContent>
                </Tooltip>
                <TrendButton />
                {hasImages && <ImageButton />}
              </div>
              <div className="flex items-center gap-2">
                <HeaderRight />
                {row.isPossibleDuplicate && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">⚠ 可能重複</span>
                )}
                {/* 「AI 翻譯解讀」— only when there's narrative text to work on.
                    Hidden while this report is docked to the right pane, which
                    owns the AI card there (no duplicate left card / orphan
                    button); it returns when the right pane is closed.
                    stopPropagation so opening it doesn't also toggle the
                    accordion (the header row is itself a toggle button). */}
                {hasText && !isReportRightActive && (
                  <ReportInterpretationButton
                    active={interpretOpen}
                    onToggle={(e) => {
                      e.stopPropagation()
                      setInterpretOpen((v) => !v)
                    }}
                  />
                )}
                {/* 向右展開 — full report text + images in the right pane
                    (desktop only; no side-by-side room on phones). Sits beside
                    the ▼ chevron (向下展開) so the user picks per report. Shown
                    whenever there's text OR images to dock. */}
                {(hasText || hasImages) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={openReportRight}
                        aria-label={hasImages ? '在右側面板展開報告與影像' : '在右側面板展開全文'}
                        className={cn(
                          // A real, self-evident button (visible border + fill) —
                          // the old transparent ghost icon read as non-interactive
                          // and first-time users missed it. Neutral grey so it
                          // stays secondary to the primary-blue 「AI 翻譯解讀」button.
                          'hidden md:inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition-colors',
                          isReportRightActive
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-muted/40 text-muted-foreground hover:border-foreground/30 hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <PanelRight className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    {/* Radix tooltip (not the native title) so the icon-only
                        button explains itself on hover, quickly and styled. */}
                    <TooltipContent>
                      {isReportRightActive
                        ? '已在右側面板展開'
                        : hasImages
                          ? '在右側面板展開報告與影像'
                          : '在右側面板展開全文'}
                    </TooltipContent>
                  </Tooltip>
                )}
                {hasText && (
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground pointer-events-none transition-transform duration-200',
                      textExpanded && 'rotate-180'
                    )}
                  />
                )}
              </div>
            </div>
            {/* 「AI 翻譯解讀」panel — rendered ABOVE the original report text so a
                民眾 who only reads the AI result sees it immediately without
                scrolling past the English narrative. The original stays below
                for anyone who wants to compare. Auto-generates on open. Hidden
                while docked to the right pane (which shows the same card there),
                so the result isn't duplicated. */}
            {hasText && interpretOpen && !isReportRightActive && (
              <ReportInterpretationPanel
                reportId={`report:${row.id}`}
                reportText={fullText}
                reportTitle={row.title}
              />
            )}
            {hasText && (
              textExpanded ? (
                <FormattedReportText text={fullText} className="text-xs leading-relaxed text-foreground/80" />
              ) : (
                <p
                  className="line-clamp-1 cursor-pointer text-xs leading-relaxed text-foreground/80"
                  onClick={() => setTextExpanded(true)}
                >
                  {obs.valueString}
                </p>
              )
            )}
            {hasText && textExpanded && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopy(fullText)
                  }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  aria-label="複製報告全文"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      已複製
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      複製全文
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          {imageLightbox}
          {trendDialogMounted && (
            <ObservationTrendDialog
              observation={firstObs}
              reportTitle={row.title}
              reportLookupTitle={row.rawTitle}
              open={trendDialogOpen}
              onOpenChange={setTrendDialogOpen}
            />
          )}
        </>
      )
    }

    // Numeric or short text: single-row compact display. Falls through to a
    // coded value (valueCodeableConcept — e.g. a qualitative "Positive" / blood
    // type / mCODE result) so a single-obs report never shows a bare "—".
    const value = obs.valueQuantity
      ? getValueWithUnit(obs.valueQuantity)
      : obs.valueString || getCodeableConceptText(obs.valueCodeableConcept) || '—'

    // For string results the bridge often emits a "reference range" that just
    // repeats the result verbatim (e.g. value "Target Not Detected" with ref
    // "[Target Not Detected]"). Hide that redundant copy — it only steals width
    // from the report name. Numeric ranges (e.g. "[0.27–4.2]") are kept.
    const normRef = refText.replace(/[[\]]/g, '').trim()
    const showRef = !!refText && normRef !== (obs.valueString || '').trim()

    // Single line by design: the row stays compact and overflow shows an
    // ellipsis. The name has priority — it gets the flexible width — while the
    // value and institution are capped/truncate first (full text on hover) and
    // the date stays fully visible. Keeps a long report name like "Nucleic acid
    // amplification (DNA), quantitative" readable instead of collapsing to "Nu…".
    return (
      <>
        <div
          className={cn(
            'flex items-center gap-x-2 rounded-lg border bg-muted/40 px-3 py-2',
            isAbnormal && 'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10'
          )}
        >
          {/* Single line on every size (keeps mobile dense — more rows visible).
              • Mobile (<md): name grows + value right-aligned; the reference
                range is collapsed to a tap-to-reveal ⓘ (popover) so it doesn't
                eat width or force a second line.
              • md+: fixed ~45% name column so the value starts at a consistent
                position across rows regardless of name length (short English
                codes vs longer 民眾版 Chinese names); reference range shown
                inline, filling the remaining width. Long names truncate, full
                name on hover. */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 md:flex-none md:basis-[45%] md:grow-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-semibold text-foreground truncate"><HighlightText text={row.title} query={query} /></span>
              </TooltipTrigger>
              <TooltipContent>{row.title}</TooltipContent>
            </Tooltip>
            <TrendButton />
            {hasImages && <ImageButton />}
          </div>
          {obs.valueQuantity ? (
            <span
              className={cn(
                'text-sm font-bold tabular-nums shrink-0',
                isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-foreground'
              )}
            >
              {value}
            </span>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'text-sm font-bold shrink max-w-[9rem] truncate',
                    isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                  )}
                >
                  {value}
                </span>
              </TooltipTrigger>
              <TooltipContent>{value}</TooltipContent>
            </Tooltip>
          )}
          {/* Interpretation label chip intentionally NOT rendered — abnormal is
              shown by red value text only (per user, no Normal/Abnormal badges). */}
          {showRef && (
            <>
              {/* md+: inline reference, hover tooltip for the full (possibly long) text */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="hidden md:inline-block text-xs text-muted-foreground md:min-w-0 md:flex-1 truncate">{refText}</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[min(90vw,28rem)] whitespace-normal break-words max-h-[50vh] overflow-y-auto text-xs leading-relaxed">{refText}</TooltipContent>
              </Tooltip>
              {/* Mobile: collapsed to a tap-to-reveal ⓘ so the row stays single-line */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="參考範圍"
                    className="md:hidden shrink-0 -m-1 p-1 text-muted-foreground/70 hover:text-muted-foreground"
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="max-w-[min(88vw,22rem)] text-xs leading-relaxed">
                  <div className="font-medium text-foreground">參考範圍</div>
                  <div className="mt-0.5 whitespace-normal break-words text-muted-foreground">{refText}</div>
                </PopoverContent>
              </Popover>
            </>
          )}
          {/* Institution + date — the compact badge shows only the date to give
              the report name maximum width; category/status (row.meta) move to
              the hover tooltip. Falls back to the full meta when there's no date.
              Hidden inside a LabDayGroupCard (hideMeta) — the group header
              already states both. */}
          {!hideMeta && (
            <div className="flex items-center gap-2 shrink-0">
              {row.institution && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-600/80 dark:text-blue-400/80 min-w-0 max-w-[5rem]">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{row.institution}</span>
                </span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">{dateLabel || metaWithDate}</Badge>
                </TooltipTrigger>
                <TooltipContent>{metaWithDate}</TooltipContent>
              </Tooltip>
            </div>
          )}
          {hideMeta && row.showTime && formatTimeOnly(row.effectiveDate) && (
            <Badge variant="outline" className="text-xs font-normal whitespace-nowrap tabular-nums shrink-0">
              {formatTimeOnly(row.effectiveDate)}
            </Badge>
          )}
          {row.isPossibleDuplicate && (
            <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">⚠ 可能重複</span>
          )}
        </div>
        {imageLightbox}
        {trendDialogMounted && (
          <ObservationTrendDialog
            observation={firstObs}
            reportTitle={row.title}
            reportLookupTitle={row.rawTitle}
            open={trendDialogOpen}
            onOpenChange={setTrendDialogOpen}
          />
        )}
      </>
    )
  }

  // Multi-item report: accordion with summary
  const abnormalCount = countAbnormal(displayObs)
  const accordionDateLabel = formatDisplayDate(row.effectiveDate, row.showTime)
  const accordionMeta = row.meta + (accordionDateLabel ? ` • ${accordionDateLabel}` : '')

  // A panel report can ALSO carry a narrative (e.g. a pathology report whose
  // presentedForm text rides as a "Report Summary" obs alongside structured
  // histologic / biomarker results). The narrative deserves the same 「AI 翻譯
  // 解讀」affordance as a standalone text report — the button is gated on
  // "has narrative", not on "is a single-obs long-text report". This keeps the
  // clinically-faithful grouping (results belong to their report) without
  // sacrificing translatability.
  const panelNarrativeObs = displayObs.find(
    (o) => o.code?.text === 'Report Summary' && (o.valueString?.trim().length ?? 0) > 0,
  )
  const panelNarrative = compactBlankLines(panelNarrativeObs?.valueString || '')
  const panelHasNarrative = panelNarrative.length > 0

  // 向右展開 for multi-analyte lab panels (e.g. CBC's 8 items) and procedures:
  // dock the detail in the right pane to read it beside the list. Lab panels
  // gate to 3+ analytes (a 1–2 item panel expands inline fine); a procedure is
  // always eligible — its detail (status / date / performer / NHI codes /
  // reason, plus any related sub-procedures) is rich enough to be worth docking.
  const panelSourceId = `report:${row.id}`
  const isPanelRightActive = rightDetail?.sourceId === panelSourceId
  const canExpandPanelRight = row.group === 'procedures' || displayObs.length >= 3
  const openPanelRight = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    toggleDetail({
      sourceId: panelSourceId,
      title: (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{row.title}</span>
          {accordionDateLabel && (
            <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">· {accordionDateLabel}</span>
          )}
          {abnormalCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0 text-[0.6875rem] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {abnormalCount} 異常
            </span>
          )}
        </span>
      ),
      node: <ReportPanelDetail key={panelSourceId} observations={displayObs} />,
    })
  }

  return (
    <>
      <Accordion
        type="multiple"
        defaultValue={defaultOpen.includes(row.id) ? [row.id] : []}
        className="w-full"
      >
        <AccordionItem
          value={row.id}
          className={cn(
            'border rounded-lg bg-muted/40 px-3 transition-colors',
            // 向右展開 active: tint the panel row so it's clear which one the
            // right pane is showing.
            isPanelRightActive && 'border-primary/40 bg-primary/5',
          )}
        >
          <AccordionTrigger className="py-3">
            <div className="flex w-full flex-col gap-1 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-semibold text-foreground truncate"><HighlightText text={row.title} query={query} /></span>
                    </TooltipTrigger>
                    <TooltipContent>{row.title}</TooltipContent>
                  </Tooltip>
                  {/* Single observation that expands to components (e.g. Blood
                      Pressure → systolic/diastolic) — surface its composite
                      trend here. Multi-item panels (length > 1) are skipped:
                      the dialog only trends firstObs, which would mislead.
                      Procedures are skipped too — they're events, not values. */}
                  {displayObs.length === 1 && row.group !== 'procedures' && <TrendButton stopProp />}
                  {abnormalCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      {abnormalCount} 異常
                    </span>
                  )}
                  {/* Same-session sub-procedures grouped via Procedure.partOf —
                      tells the user this one title expands to several. */}
                  {row.group === "procedures" && (row.relatedCount ?? 0) > 0 && (
                    <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300 shrink-0">
                      +{row.relatedCount} 相關處置
                    </span>
                  )}
                  {hasImages && <ImageButton stopProp />}
                </div>
                {/* Right cluster mirrors the single-value rows: count +
                    institution inline + date-only badge. Category/status
                    (accordionMeta) live on the badge's hover tooltip — no
                    separate meta line, so nothing is shown twice. */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* "N 項" = sub-item count for a lab panel; meaningless for a
                      single procedure event, so hide it there. */}
                  {row.group !== "procedures" && (
                    <span className="text-xs text-muted-foreground">{displayObs.length} 項</span>
                  )}
                  {!hideMeta && row.institution && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600/80 dark:text-blue-400/80 min-w-0 max-w-[6rem]">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{row.institution}</span>
                    </span>
                  )}
                  {!hideMeta && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">{accordionDateLabel || accordionMeta}</Badge>
                      </TooltipTrigger>
                      <TooltipContent>{accordionMeta}</TooltipContent>
                    </Tooltip>
                  )}
                  {hideMeta && row.showTime && formatTimeOnly(row.effectiveDate) && (
                    <Badge variant="outline" className="text-xs font-normal whitespace-nowrap tabular-nums shrink-0">
                      {formatTimeOnly(row.effectiveDate)}
                    </Badge>
                  )}
                  {/* 「AI 翻譯解讀」— shown when this panel report carries a
                      narrative (e.g. a pathology report with its report text +
                      structured results). asDiv so it can nest inside the
                      AccordionTrigger <button> without button-in-button. Hidden
                      while docked to the right pane (which owns the card). */}
                  {panelHasNarrative && !isPanelRightActive && (
                    <ReportInterpretationButton
                      asDiv
                      active={interpretOpen}
                      onToggle={(e) => {
                        e.stopPropagation()
                        setInterpretOpen((v) => !v)
                      }}
                    />
                  )}
                  {/* 向右展開 — placed LAST in the right cluster so it sits just
                      to the left of the AccordionTrigger's ▼ chevron, matching
                      the imaging-report layout. div[role=button] (not <button>)
                      avoids button-in-button; mousedown stopProp keeps the click
                      from toggling the accordion. */}
                  {canExpandPanelRight && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={openPanelRight}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openPanelRight(e)
                        }
                      }}
                      title={isPanelRightActive ? '已在右側面板展開' : '在右側面板展開細項'}
                      aria-label="在右側面板展開細項"
                      className={cn(
                        'hidden md:inline-flex items-center rounded-md border px-1 py-0.5 cursor-pointer transition-colors',
                        isPanelRightActive
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <PanelRight className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </AccordionTrigger>
          {/* 「AI 翻譯解讀」panel — above the structured rows, shown whenever the
              button is toggled, independent of the accordion's expand state so a
              民眾 sees the AI result without expanding. Hidden while docked. */}
          {panelHasNarrative && interpretOpen && !isPanelRightActive && (
            <ReportInterpretationPanel
              reportId={`report:${row.id}`}
              reportText={panelNarrative}
              reportTitle={row.title}
            />
          )}
          <AccordionContent className="pb-4">
            <div className="grid gap-3">
              {displayObs.map((obs, i) => (
                <ObservationBlock
                  key={obs.id ? `obs-${obs.id}` : `obs-${i}`}
                  observation={obs}
                />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      {imageLightbox}
      {/* Lazy-mount the trend dialog only after the user actually clicks
          the trend button. The dialog runs four history hooks
          (useObservationHistory + 3 variants), each of which iterates the
          full observations array. With 500+ rows in the "全部" tab, eagerly
          mounting the dialog inside every row meant 2000+ full-array
          scans on every render — the real reason switching to "全部" felt
          slow, not the row count itself. Once opened we keep it mounted
          so re-opening is instant. */}
      {trendDialogMounted && (
        <ObservationTrendDialog
          observation={firstObs}
          reportTitle={row.title}
          reportLookupTitle={row.rawTitle}
          open={trendDialogOpen}
          onOpenChange={setTrendDialogOpen}
        />
      )}
    </>
  )
}

// Memoized — `row` is stable across re-renders because the parent
// (ReportsCard) memoizes the rows array via useMemo, so referential
// equality skips re-render when only the active tab changes. This is
// the key win for tab-switch latency when "全部" has 500+ rows. The
// inactive tabs are kept mounted via forceMount, so without memo every
// tab switch would re-render every row.
const SingleReportRow = memo(ReportRowImpl)

// Public ReportRow — dispatches between the regular single-DR card
// (SingleReportRow above, with all its hooks), the lab collection-day group
// (LabDayGroupCard, `dayGroup` synthetic rows) and the multi-region study
// card (MultiRegionStudyCard) for imaging group rows. Kept as a thin
// component so the hook order inside SingleReportRow stays unconditional,
// honouring React's rules of hooks even when the same virtualizer slot
// flips between a group and an ungrouped row across re-renders.
export function ReportRow(props: ReportRowProps) {
  const { row } = props
  // dayGroup first — day-group rows also carry groupedRows, but their members
  // are heterogeneous lab DRs, not one ambiguous imaging study. Unlike
  // multi-region groups, a day group can hold a SINGLE member (single-report
  // days still render as a day card so the by-day list keeps one row shape).
  if (row.dayGroup && row.groupedRows && row.groupedRows.length > 0) {
    return <LabDayGroupCard row={row} defaultOpen={props.defaultOpen} query={props.query} />
  }
  if (row.groupedRows && row.groupedRows.length > 1) {
    return <MultiRegionStudyCard row={row} />
  }
  return <SingleReportRow {...props} />
}
