"use client"

// 帶回病歷 — build a plain-text block from the patient's labs and exam reports
// and hand it to the clipboard so the clinician can paste it into their own
// EMR's SOAP "O" field. Clipboard is the whole transport: there is no write-back
// channel into the hospital system, so the text format IS the feature (see
// utils/emr-plaintext.ts for the constraints it is shaped by).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, Languages, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useClinicalDataQuery } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useCopyToClipboard } from '@/src/shared/hooks/use-copy-to-clipboard'
import { useReportInterpretation } from '@/src/application/hooks/report-interpretation/use-report-interpretation.hook'
import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'
import {
  buildEmrLabText,
  buildEmrReportText,
  collectEmrReports,
  joinEmrSections,
  summarizeEmrLabPanels,
  translationToPlainText,
  type EmrPreset,
  type EmrRange,
  type EmrReportItem,
} from '../utils/emr-plaintext'

type CopyKey = 'labs' | 'reports' | 'all'
type ReportLanguage = 'original' | 'translated'

/** What one report's translation slot looks like to the panel. */
interface TranslationState {
  text?: string
  loading: boolean
  error: string | null
  /** The task only saw the leading part of a long document. */
  partial?: boolean
}

const EMPTY_TRANSLATION: TranslationState = { loading: false, error: null }

const SEGMENT_BASE = 'rounded px-2 py-1 text-xs font-medium transition-colors'
const SEGMENT_GROUP = 'inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-0.5'

export function EmrHandoffPanel() {
  const { t } = useLanguage()
  const x = t.ipsExport.emrHandoff
  const { data } = useClinicalDataQuery()
  const { copy } = useCopyToClipboard()

  // 「最近一次」 is the default: the smallest, least surprising paste. Widening
  // the window is one click; unpicking twenty lines out of a chart is not.
  const [range, setRange] = useState<EmrRange>('last')
  const [preset, setPreset] = useState<EmrPreset>('standard')
  // Tracked as EXCLUSIONS so everything inside a newly chosen window is
  // selected by default — an inclusion set would silently drop the panels and
  // reports that only appear once the range widens.
  const [excludedPanels, setExcludedPanels] = useState<Record<string, boolean>>({})
  const [excludedReports, setExcludedReports] = useState<Record<string, boolean>>({})
  const [copiedKey, setCopiedKey] = useState<CopyKey | ''>('')
  // 醫師端要英文原文，護理端要中文 — one toggle, no separate export.
  const [reportLanguage, setReportLanguage] = useState<ReportLanguage>('original')
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({})
  // Each loader hands its own generate() up so "翻譯 N 份" can fire them without
  // the panel needing a hook per report at the top level.
  const generators = useRef<Record<string, () => Promise<void>>>({})
  const copyTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
  }, [])

  const categoryLabels = (t.reports as any).cumulativeCategories as Record<string, string>

  const pivots = useMemo(() => buildLabPivots(data?.observations ?? []), [data?.observations])

  const panels = useMemo(
    () => summarizeEmrLabPanels(pivots, categoryLabels, range),
    [pivots, categoryLabels, range],
  )

  const selectedPanels = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const panel of panels) map[panel.id] = !excludedPanels[panel.id]
    return map
  }, [panels, excludedPanels])

  const labText = useMemo(
    () => buildEmrLabText({
      pivots,
      categoryLabels,
      selected: selectedPanels,
      range,
      preset,
      omittedLabel: x.omitted,
      drawCountLabel: x.drawCount,
    }),
    [pivots, categoryLabels, selectedPanels, range, preset, x.omitted, x.drawCount],
  )

  const reports = useMemo(
    () => collectEmrReports(data?.diagnosticReports ?? [], { range }),
    [data?.diagnosticReports, range],
  )

  const selectedReports = useMemo(
    () => reports.filter((report) => !excludedReports[report.id]),
    [reports, excludedReports],
  )

  const translatedBodies = useMemo(() => {
    if (reportLanguage === 'original') return undefined
    const bodies: Record<string, string | undefined> = {}
    for (const report of selectedReports) bodies[report.id] = translations[report.id]?.text
    return bodies
  }, [reportLanguage, selectedReports, translations])

  const reportText = useMemo(
    () => buildEmrReportText(selectedReports, preset, translatedBodies),
    [selectedReports, preset, translatedBodies],
  )

  // Only write when something actually changed: this runs from a child effect,
  // and an unconditional setState would re-render the child forever.
  const setTranslation = useCallback((
    id: string,
    next: TranslationState,
    generate: () => Promise<void>,
  ) => {
    generators.current[id] = generate
    setTranslations((prev) => {
      const current = prev[id]
      if (current
        && current.text === next.text
        && current.loading === next.loading
        && current.error === next.error
        && current.partial === next.partial) return prev
      return { ...prev, [id]: next }
    })
  }, [])

  const pendingTranslations = useMemo(
    () => selectedReports.filter((report) => !translations[report.id]?.text),
    [selectedReports, translations],
  )
  const isTranslating = useMemo(
    () => selectedReports.some((report) => translations[report.id]?.loading),
    [selectedReports, translations],
  )

  const translatePending = useCallback(async () => {
    // Sequential on purpose: a patient can have a dozen reports and this is a
    // billed model call each. One at a time also keeps the progress honest.
    for (const report of pendingTranslations) {
      const run = generators.current[report.id]
      if (run) await run()
    }
  }, [pendingTranslations])

  const allText = useMemo(() => joinEmrSections(labText, reportText), [labText, reportText])

  const doCopy = useCallback(async (key: CopyKey, text: string) => {
    if (!text.trim()) {
      toast.error(x.nothingToCopy)
      return
    }
    const ok = await copy(text)
    if (!ok) {
      toast.error(t.common.copyFailed)
      return
    }
    setCopiedKey(key)
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopiedKey(''), 2000)
    toast.success(x.copyToast)
  }, [copy, t.common.copyFailed, x.copyToast, x.nothingToCopy])

  // Panels drawn on the same morning are ONE blood draw, and panels drawn
  // months apart are several — so count distinct collection days across the
  // selected panels rather than summing or maxing per-panel counts.
  const drawCount = useMemo(() => {
    const days = new Set<string>()
    for (const panel of panels) {
      if (!selectedPanels[panel.id]) continue
      for (const day of panel.dates) days.add(day)
    }
    return days.size
  }, [panels, selectedPanels])

  const rangeOptions: Array<{ id: EmrRange; label: string }> = [
    { id: 'last', label: x.rangeLast },
    { id: 'last3', label: x.rangeLast3 },
    { id: '1m', label: x.range1m },
    { id: '3m', label: x.range3m },
    { id: '6m', label: x.range6m },
    { id: '1y', label: x.range1y },
  ]

  const languageOptions: Array<{ id: ReportLanguage; label: string }> = [
    { id: 'original', label: x.reportLangOriginal },
    { id: 'translated', label: x.reportLangTranslated },
  ]

  const presetOptions: Array<{ id: EmrPreset; label: string }> = [
    { id: 'compact', label: x.presetCompact },
    { id: 'standard', label: x.presetStandard },
    { id: 'full', label: x.presetFull },
  ]

  const hasAnything = panels.length > 0 || reports.length > 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{x.pageTitle}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{x.pageDescription}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{x.rangeLabel}</span>
          <div className={SEGMENT_GROUP} role="group" aria-label={x.rangeLabel}>
            {rangeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRange(option.id)}
                aria-pressed={range === option.id}
                className={cn(SEGMENT_BASE, range === option.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{x.presetLabel}</span>
          <div className={SEGMENT_GROUP} role="group" aria-label={x.presetLabel}>
            {presetOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPreset(option.id)}
                aria-pressed={preset === option.id}
                className={cn(SEGMENT_BASE, preset === option.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">{x.presetHint}</p>

      {!hasAnything && (
        <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {x.noData}
        </div>
      )}

      {panels.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold">{x.labsTitle}</h3>
              <span className="text-xs text-muted-foreground">
                {x.labsMeta
                  .replace('{panels}', String(panels.filter((panel) => selectedPanels[panel.id]).length))
                  .replace('{draws}', String(drawCount))}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => doCopy('labs', labText)}
            >
              {copiedKey === 'labs' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey === 'labs' ? x.copied : x.copyLabs}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {panels.map((panel) => {
              const active = !!selectedPanels[panel.id]
              return (
                <button
                  key={panel.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => setExcludedPanels((prev) => ({ ...prev, [panel.id]: active }))}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-colors',
                    active
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span>{panel.label}</span>
                  <span
                    className={cn(
                      'min-w-4 rounded-full px-1 text-center text-[0.625rem] tabular-nums',
                      active ? 'bg-primary/15' : 'bg-muted',
                    )}
                  >
                    {panel.drawCount}
                  </span>
                </button>
              )
            })}
          </div>

          <PlainTextPreview text={labText} empty={x.labsEmpty} testId="emr-handoff-lab-preview" />
        </section>
      )}

      {reports.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold">{x.reportsTitle}</h3>
              <span className="text-xs text-muted-foreground">
                {x.reportsMeta
                  .replace('{selected}', String(selectedReports.length))
                  .replace('{total}', String(reports.length))}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => doCopy('reports', reportText)}
            >
              {copiedKey === 'reports' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey === 'reports' ? x.copied : x.copyReports}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{x.reportLangLabel}</span>
            <div className={SEGMENT_GROUP} role="group" aria-label={x.reportLangLabel}>
              {languageOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setReportLanguage(option.id)}
                  aria-pressed={reportLanguage === option.id}
                  className={cn(SEGMENT_BASE, reportLanguage === option.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {reportLanguage === 'translated' && pendingTranslations.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                disabled={isTranslating}
                onClick={() => void translatePending()}
              >
                {isTranslating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Languages className="h-3.5 w-3.5" />}
                {isTranslating ? x.translating : x.translateAll.replace('{count}', String(pendingTranslations.length))}
              </Button>
            )}
          </div>

          {reportLanguage === 'translated' && (
            <>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{x.reportLangHint}</p>
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{x.aiTranslationNotice}</span>
              </div>
              {selectedReports.map((report) => (
                <ReportTranslationLoader key={report.id} report={report} onState={setTranslation} />
              ))}
            </>
          )}

          <div className="mt-2 flex flex-col">
            {reports.map((report) => {
              const active = !excludedReports[report.id]
              const translation = translations[report.id] ?? EMPTY_TRANSLATION
              return (
                <button
                  key={report.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => setExcludedReports((prev) => ({ ...prev, [report.id]: active }))}
                  className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-2',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40',
                    )}
                  >
                    {active && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {report.date.replace(/-/g, '/')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{report.name}</span>
                  {report.org && (
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{report.org}</span>
                  )}
                  {reportLanguage === 'translated' && active && (
                    <TranslationBadge state={translation} labels={x} />
                  )}
                </button>
              )
            })}
          </div>

          <PlainTextPreview text={reportText} empty={x.reportsEmpty} testId="emr-handoff-report-preview" />
        </section>
      )}

      {hasAnything && (
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <span className="text-xs text-muted-foreground">
            {x.footerMeta.replace('{chars}', String(allText.length))}
          </span>
          <Button type="button" className="gap-2 px-6" onClick={() => doCopy('all', allText)}>
            {copiedKey === 'all' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedKey === 'all' ? x.copiedAll : x.copyAll}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Exactly what lands on the clipboard. Rendered in the UI's own proportional
 * font — NOT monospace — because the destination textarea is proportional too;
 * a monospaced preview would suggest an alignment the chart will not keep.
 */
function PlainTextPreview({ text, empty, testId }: { text: string; empty: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/20 p-3 text-[0.8125rem] leading-relaxed',
        !text.trim() && 'text-muted-foreground',
      )}
    >
      {text.trim() ? text : empty}
    </div>
  )
}

/**
 * Owns one report's translation slot. Renders nothing: the panel needs a hook
 * per report, and hooks cannot be called in a loop, so each report gets a
 * loader that reports its state upward.
 *
 * The task reused here is the app's existing report translation — its
 * `translation` field is deliberately the FAITHFUL one (kept separate from the
 * lay `interpretation` precisely so the model cannot editorialise inside it),
 * it scrubs PII before the text leaves the device, and it caches per report
 * content, so a report already translated elsewhere in the app costs nothing
 * here. Generation stays on demand — mounting a loader never spends quota.
 */
function ReportTranslationLoader({
  report,
  onState,
}: {
  report: EmrReportItem
  onState: (id: string, state: TranslationState, generate: () => Promise<void>) => void
}) {
  const { result, isGenerating, error, generate } = useReportInterpretation({
    reportId: report.id,
    reportText: report.raw,
    reportTitle: report.name,
  })

  useEffect(() => {
    onState(report.id, {
      text: result?.translation ? translationToPlainText(result.translation) : undefined,
      loading: isGenerating,
      error,
      partial: result ? result.truncated || result.coverage !== 'full' : undefined,
    }, generate)
  }, [report.id, result, isGenerating, error, generate, onState])

  return null
}

function TranslationBadge({
  state,
  labels,
}: {
  state: TranslationState
  labels: {
    translating: string
    translatedBadge: string
    untranslatedBadge: string
    translateFailed: string
    partialBadge: string
  }
}) {
  const chip = 'shrink-0 rounded-full border px-1.5 py-0.5 text-[0.625rem] leading-none'
  if (state.loading) {
    return <span className={cn(chip, 'border-border text-muted-foreground')}>{labels.translating}</span>
  }
  if (state.error) {
    return <span className={cn(chip, 'border-destructive/40 text-destructive')}>{labels.translateFailed}</span>
  }
  if (!state.text) {
    return <span className={cn(chip, 'border-border text-muted-foreground')}>{labels.untranslatedBadge}</span>
  }
  return (
    <span className={cn(chip, 'border-primary/40 text-primary')}>
      {state.partial ? labels.partialBadge : labels.translatedBadge}
    </span>
  )
}
