"use client"

// 回報檢驗資料問題 — built for a busy clinic: 回報 → 送出 → 確定送出, no
// required field. Every laboratory row of the cumulative report is sent (one
// mis-filed result usually shows up in two panels at once); ticking the
// panels that look wrong, the problem type and a one-line note are optional.
// The per-row preview and the full disclosure are folded, one click away.
// Nothing leaves the browser before the second confirmation.
//
// The preview table and the JSON view render the SAME payload object that is
// posted (see buildLabDataReport), so what is shown is what is sent.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { AlertCircle, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { detectLaunchSource, detectSite } from "@/src/application/telemetry/launch-context"
import { useAppVersion } from "@/src/shared/hooks/use-app-version.hook"
import { getLabRowDisplayParts } from "@/src/shared/utils/lab-analyte-display.utils"
import { cn } from "@/src/shared/utils/cn.utils"
import type { AnalyteNameMode } from "@voho0000/clinical-lab-normalization/display"
import {
  buildLabDataReport,
  collectLabDataReportCandidates,
  detectLabDataSource,
  type LabDataReportLabelResolver,
} from "../utils/build-lab-data-report"
import { findDescriptionIdentifiers } from "../utils/identifier-scan"
import { submitLabDataReport, type LabDataReportSubmitResult } from "../utils/submit-lab-data-report"
import {
  LAB_DATA_REPORT_MAX_DESCRIPTION,
  LAB_DATA_REPORT_MAX_ROWS,
  LAB_DATA_REPORT_PROBLEM_TYPES,
  type LabDataReportContext,
  type LabDataReportPayload,
  type LabDataReportProblemType,
  type LabDataReportRow,
} from "../types"

export interface LabDataReportPanel {
  id: string
  label: string
}

export interface LabDataReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Panels that have data, in the clinician's order. */
  panels: readonly LabDataReportPanel[]
  observations: readonly any[]
  nameMode: AnalyteNameMode
}

type Strings = Record<string, any>

const PRIVACY_POLICY_URL = "https://github.com/voho0000/medical-note-smart-on-fhir/blob/master/PRIVACY_POLICY.md"
/** The preview table stops here; the JSON view always holds every row. */
const PREVIEW_TABLE_ROWS = 300

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  )

function errorMessage(result: Exclude<LabDataReportSubmitResult, { ok: true }>, strings: Strings): string {
  const errors = strings.errors ?? {}
  switch (result.status) {
    case 'unconfigured': return errors.unconfigured
    case 'timeout': return errors.timeout
    case 401: return errors.auth
    case 413: return errors.tooLarge
    case 429: return errors.rateLimited
    case 400: return result.reason?.startsWith('description-identifier') ? errors.identifier : errors.rejected
    default: return errors.generic
  }
}

export function LabDataReportDialog({
  open,
  onOpenChange,
  panels,
  observations,
  nameMode,
}: LabDataReportDialogProps) {
  const { t, locale } = useLanguage()
  const strings = ((t as any).labDataReport ?? {}) as Strings
  const { audience } = useAudience()
  const appVersion = useAppVersion()
  const ids = useId()

  const resolveLabel = useCallback<LabDataReportLabelResolver>(
    (identity) => getLabRowDisplayParts(identity, audience, locale, nameMode).name,
    [audience, locale, nameMode],
  )
  const collected = useMemo(
    () => collectLabDataReportCandidates(observations, nameMode, resolveLabel),
    [nameMode, observations, resolveLabel],
  )
  // Chips only for panels that actually have laboratory rows to send.
  const reportablePanels = useMemo(
    () => panels.filter((panel) => (collected.rowsByCategory[panel.id] ?? 0) > 0),
    [collected.rowsByCategory, panels],
  )
  const panelLabels = useMemo(
    () => Object.fromEntries(panels.map((panel) => [panel.id, panel.label])),
    [panels],
  )

  const [flagged, setFlagged] = useState<string[]>([])
  const [problemType, setProblemType] = useState<LabDataReportProblemType | null>(null)
  const [description, setDescription] = useState('')
  const [includeValues, setIncludeValues] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [rawOpen, setRawOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [launchSource, setLaunchSource] = useState<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const sendRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    void detectLaunchSource().then((source) => {
      if (!cancelled) setLaunchSource(source)
    })
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, [])

  const context = useMemo<LabDataReportContext>(() => ({
    appVersion: appVersion ?? 'unknown',
    dataSource: detectLabDataSource(collected.candidates.map((candidate) => candidate.observation), launchSource),
    site: detectSite() === 'vghtpe' ? 'vghtpe' : 'unknown',
    language: locale,
    nameMode: nameMode === 'original' ? 'original' : 'standardized',
  }), [appVersion, collected, launchSource, locale, nameMode])

  const categoryOrder = useMemo(() => panels.map((panel) => panel.id), [panels])
  // Rows do not depend on the note or problem type, so typing does not
  // rebuild every row; those two fields are merged in below.
  const built = useMemo(() => buildLabDataReport(collected, {
    problemType: 'unspecified',
    description: '',
    includeValues,
    context,
    categoryOrder,
    flaggedCategories: flagged,
  }), [categoryOrder, collected, context, flagged, includeValues])

  const payload = useMemo<LabDataReportPayload>(() => ({
    ...built.payload,
    problemType: problemType ?? 'unspecified',
    description: description.trim(),
  }), [built.payload, description, problemType])

  const rowCount = payload.rows.length
  const descriptionIssues = useMemo(() => findDescriptionIdentifiers(description), [description])
  const canSend = rowCount > 0 && descriptionIssues.length === 0 && !sending

  const handleOpenChange = (next: boolean) => {
    if (!next && sending) return
    onOpenChange(next)
  }

  const requestSend = () => {
    setError(null)
    if (!canSend) return
    setConfirmOpen(true)
  }

  const send = async () => {
    setConfirmOpen(false)
    setSending(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    const result = await submitLabDataReport(payload, { signal: controller.signal })
    abortRef.current = null
    setSending(false)
    if (result.ok) {
      setReportId(result.reportId)
      return
    }
    setError(errorMessage(result, strings))
  }

  const copyId = async () => {
    if (!reportId) return
    try {
      await navigator.clipboard.writeText(reportId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // The id stays on screen and selectable.
    }
  }

  const toggleFlagged = (id: string) => {
    setFlagged((previous) => previous.includes(id)
      ? previous.filter((item) => item !== id)
      : [...previous, id])
  }

  const identifierKinds = strings.identifierKinds ?? {}
  const descriptionErrorId = `${ids}-description-error`
  const detailsId = `${ids}-details`
  const previewId = `${ids}-preview`
  const linkButton = "inline-flex min-h-6 items-center gap-0.5 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:min-h-11"
  const chip = (pressed: boolean) => cn(
    "inline-flex min-h-8 items-center gap-1 rounded-md border px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:min-h-11",
    pressed
      ? "border-primary bg-primary/10 font-medium text-primary"
      : "border-border text-foreground hover:bg-muted/50",
  )

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(
            "flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 max-md:max-h-[calc(100dvh-1rem)] max-md:max-w-[calc(100%-1rem)]",
            previewOpen ? "sm:max-w-3xl" : "sm:max-w-lg",
          )}
          // Land on 送出 so the fastest path is two presses.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            sendRef.current?.focus()
          }}
          onInteractOutside={(event) => { if (sending) event.preventDefault() }}
          onEscapeKeyDown={(event) => { if (sending) event.preventDefault() }}
        >
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-base">{strings.title}</DialogTitle>
            <DialogDescription className="text-xs">{strings.subtitle}</DialogDescription>
          </DialogHeader>

          {reportId ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" role="status" aria-live="polite">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                {strings.successTitle}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{strings.successId}</span>
                <span className="select-all rounded border border-border bg-muted/40 px-2 py-0.5 font-mono text-foreground tabular-nums">
                  {reportId}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={copyId} className="h-7 px-2 text-xs max-md:h-11">
                  <Copy aria-hidden="true" />
                  {copied ? strings.copied : strings.copyId}
                </Button>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {reportablePanels.length > 0 && (
                <fieldset>
                  <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{strings.panelLegend}</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {reportablePanels.map((panel) => {
                      const pressed = flagged.includes(panel.id)
                      return (
                        <button
                          key={panel.id}
                          type="button"
                          aria-pressed={pressed}
                          onClick={() => toggleFlagged(panel.id)}
                          className={chip(pressed)}
                        >
                          {pressed && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          {panel.label}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )}

              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{strings.problemLegend}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {LAB_DATA_REPORT_PROBLEM_TYPES.map((type) => {
                    const pressed = problemType === type
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={pressed}
                        onClick={() => setProblemType(pressed ? null : type)}
                        className={chip(pressed)}
                      >
                        {pressed && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                        {strings.problemTypes?.[type] ?? type}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <div className="space-y-1">
                <Label htmlFor={`${ids}-description`} className="text-xs font-medium text-muted-foreground">
                  {strings.descriptionLabel}
                </Label>
                <Input
                  id={`${ids}-description`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault()
                      requestSend()
                    }
                  }}
                  placeholder={strings.descriptionPlaceholder}
                  maxLength={LAB_DATA_REPORT_MAX_DESCRIPTION}
                  aria-invalid={descriptionIssues.length > 0 || undefined}
                  aria-describedby={descriptionIssues.length > 0 ? descriptionErrorId : undefined}
                  className="h-9"
                />
                {descriptionIssues.length > 0 && (
                  <p id={descriptionErrorId} className="flex items-start gap-1 text-xs text-destructive" role="alert">
                    <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {fill(strings.descriptionBlocked ?? '{kinds}', {
                      kinds: descriptionIssues.map((kind) => identifierKinds[kind] ?? kind).join(locale === 'en' ? ', ' : '、'),
                    })}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${ids}-values`}
                  checked={includeValues}
                  onCheckedChange={(checked) => setIncludeValues(checked === true)}
                />
                <Label htmlFor={`${ids}-values`} className="text-sm max-md:min-h-11">{strings.includeValues}</Label>
              </div>

              <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {fill(includeValues ? strings.summaryWithValues : strings.summaryWithoutValues, { count: rowCount })}
                </p>
                <div className="flex flex-wrap gap-x-4">
                  <button type="button" onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen} aria-controls={detailsId} className={linkButton}>
                    {detailsOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                    {strings.detailsToggle}
                  </button>
                  <button type="button" onClick={() => setPreviewOpen((value) => !value)} aria-expanded={previewOpen} aria-controls={previewId} className={linkButton}>
                    {previewOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                    {fill(strings.previewToggle ?? '{count}', { count: rowCount })}
                  </button>
                </div>
                {detailsOpen && (
                  <div id={detailsId} className="space-y-1 pt-1 text-xs leading-relaxed text-muted-foreground">
                    <p>{strings.disclosure}</p>
                    <p>{strings.includeValuesHint}</p>
                    <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className={linkButton}>
                      {strings.policyLink}
                    </a>
                  </div>
                )}
              </div>

              {previewOpen && (
                <section id={previewId} aria-label={fill(strings.previewToggle ?? '{count}', { count: rowCount })} className="space-y-1.5">
                  <PreviewNotes payload={payload} totalRows={built.totalRows} strings={strings} />
                  {rowCount > 0 && (
                    <PreviewTable
                      rows={payload.rows.slice(0, PREVIEW_TABLE_ROWS)}
                      includesValues={payload.includesValues}
                      panelLabels={panelLabels}
                      strings={strings}
                    />
                  )}
                  {rowCount > PREVIEW_TABLE_ROWS && (
                    <p className="text-xs text-muted-foreground">
                      {fill(strings.previewTableLimited ?? '{shown}/{count}', { shown: PREVIEW_TABLE_ROWS, count: rowCount })}
                    </p>
                  )}
                  <button type="button" onClick={() => setRawOpen((value) => !value)} aria-expanded={rawOpen} className={linkButton}>
                    {rawOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                    {strings.rawToggle}
                  </button>
                  {rawOpen && (
                    <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[0.6875rem] leading-snug text-foreground">
                      {JSON.stringify({ ...payload, problemType }, null, 2)}
                    </pre>
                  )}
                </section>
              )}
            </div>
          )}

          {error && !reportId && (
            <Alert variant="destructive" role="alert" aria-live="assertive" className="mx-4 mb-2 w-auto shrink-0">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="shrink-0 gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:flex-col-reverse sm:justify-end">
            {reportId ? (
              <Button type="button" autoFocus onClick={() => onOpenChange(false)} className="max-md:h-11 max-md:w-full">
                {strings.close}
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={sending} className="max-md:h-11 max-md:w-full">
                  {strings.cancel}
                </Button>
                <Button
                  ref={sendRef}
                  type="button"
                  onClick={requestSend}
                  disabled={sending || rowCount === 0}
                  aria-disabled={!canSend || undefined}
                  className="max-md:h-11 max-md:w-full"
                >
                  {sending && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {sending ? strings.sending : fill(strings.send ?? '{count}', { count: rowCount })}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {fill(includeValues ? strings.confirmWithValues : strings.confirmWithoutValues, { count: rowCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-md:flex-col-reverse max-md:gap-2">
            <AlertDialogCancel className="max-md:h-11">{strings.confirmBack}</AlertDialogCancel>
            <AlertDialogAction className="max-md:h-11" onClick={() => { void send() }}>
              {strings.confirmSend}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function PreviewNotes({ payload, totalRows, strings }: { payload: LabDataReportPayload; totalRows: number; strings: Strings }) {
  const notes = [
    payload.truncatedRows > 0 && fill(strings.previewTruncated, { total: totalRows, max: LAB_DATA_REPORT_MAX_ROWS }),
    payload.droppedStrings > 0 && fill(strings.previewDropped, { count: payload.droppedStrings }),
    payload.excludedNonLabRows > 0 && fill(strings.previewExcluded, { count: payload.excludedNonLabRows }),
  ].filter((note): note is string => !!note)
  if (notes.length === 0) return null
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {notes.map((note) => <li key={note}>{note}</li>)}
    </ul>
  )
}

function formatValue(row: LabDataReportRow, includesValues: boolean, strings: Strings): string {
  const notAttached = strings.valueNotAttached ?? '—'
  const value = row.value
  switch (value.kind) {
    case 'quantity':
      return value.value === undefined ? notAttached : `${value.comparator ?? ''}${value.value}`
    case 'range':
      return value.low === undefined && value.high === undefined
        ? notAttached
        : `${value.low ?? '?'}–${value.high ?? '?'}`
    case 'coded':
      return value.text ?? value.code ?? notAttached
    case 'string':
      return value.value ?? (includesValues ? `(${value.length})` : notAttached)
    case 'other':
      return value.type
    default:
      return '—'
  }
}

function PreviewTable({
  rows,
  includesValues,
  panelLabels,
  strings,
}: {
  rows: LabDataReportRow[]
  includesValues: boolean
  panelLabels: Record<string, string>
  strings: Strings
}) {
  const columns = strings.previewColumns ?? {}
  const decidedBy = strings.decidedBy ?? {}
  return (
    <div
      role="region"
      aria-label={strings.previewTableLabel}
      tabIndex={0}
      // Phones get one vertical scroller (the dialog body); the table keeps
      // only its horizontal scroll there. Wider screens cap its height.
      className="overflow-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:max-h-72"
    >
      <table className="w-max min-w-full border-collapse text-xs tabular-nums">
        <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
          <tr>
            <th scope="col" className="sticky left-0 z-20 bg-muted px-2 py-1.5 font-medium">{columns.ref}</th>
            <th scope="col" className="px-2 py-1.5 font-medium">{columns.placed}</th>
            <th scope="col" className="px-2 py-1.5 font-medium">{columns.day}</th>
            <th scope="col" className="px-2 py-1.5 font-medium">{columns.hospital}</th>
            <th scope="col" className="px-2 py-1.5 font-medium">{columns.code}</th>
            <th scope="col" className="px-2 py-1.5 font-medium">{columns.name}</th>
            <th scope="col" className="px-2 py-1.5 font-medium">{columns.specimen}</th>
            <th scope="col" className="px-2 py-1.5 font-medium">{columns.value}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const codes = row.code.codings.map((coding) => coding.code).filter(Boolean).join(' · ')
            const displays = row.code.codings
              .map((coding) => coding.display)
              .filter((display): display is string => !!display && display !== row.code.text)
            const time = row.timeOfDay ?? row.sourceTime?.time
            const panel = row.app.categoryId ? panelLabels[row.app.categoryId] ?? row.app.categoryId : '—'
            return (
              <tr key={row.ref} className="border-t border-border/70 align-top">
                <th scope="row" className="sticky left-0 bg-background px-2 py-1 text-left font-normal text-muted-foreground">{row.ref}</th>
                <td className="whitespace-nowrap px-2 py-1">
                  {panel} › {row.app.column}
                  <span className="block text-muted-foreground">{decidedBy[row.app.decidedBy] ?? row.app.decidedBy}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-1">
                  {row.day === null ? '—' : fill(strings.dayValue ?? '{day}', { day: row.day })}
                  {time && <span className="ml-1 text-muted-foreground">{time}</span>}
                </td>
                <td className="max-w-40 px-2 py-1">{row.performer.join('、') || '—'}</td>
                <td className="whitespace-nowrap px-2 py-1 font-mono">{codes || '—'}</td>
                <td className="max-w-56 px-2 py-1">
                  <span className="text-foreground">{row.code.text ?? '—'}</span>
                  {displays.length > 0 && (
                    <span className="block text-muted-foreground">{displays.join(' / ')}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-1">{row.specimen ?? '—'}</td>
                <td className="whitespace-nowrap px-2 py-1">
                  <span className={cn(!includesValues && 'text-muted-foreground')}>{formatValue(row, includesValues, strings)}</span>
                  {row.unit && <span className="ml-1 text-muted-foreground">{row.unit}</span>}
                  {row.sameValueGroup !== undefined && (
                    <span className="ml-1.5 text-muted-foreground">{fill(strings.sameValue ?? '#{group}', { group: row.sameValueGroup })}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
