"use client"

// 帶回病歷 → 我的格式: the clinician's own template, filled from this patient.
//
// Daily use is: glance at the preview, copy. The preview IS the clipboard text
// (same string). Anything the template could not fill honestly — a missing
// value, a newest exam with no text — is listed under it in words, and an
// exam line waiting for a decision is left out of the copy until the
// clinician picks, for this patient only.

import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Check, Copy, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useOutpatientPrefs } from '@/src/application/hooks/use-outpatient-prefs.hook'
import type { EmrCustomFormat, EmrExamKind } from '@/src/application/stores/outpatient-prefs.store'
import { cn } from '@/src/shared/utils/cn.utils'
import type { LabPivot } from '@/src/shared/utils/lab-pivot.utils'
import { findPinnableLab, resolvePinnedLab } from '@/src/shared/utils/pinned-labs'
import {
  formatEmrDate,
  newEmrFormat,
  renderEmrCustomFormat,
  starterTokens,
  type EmrExamDecision,
  type EmrFormatInputs,
  type EmrStarterId,
} from '../utils/emr-custom-format'
import { resolveLatestExams } from '../utils/emr-exam-kinds'
import { describeEmrNote } from './emr-format-notes'
import { EmrFormatEditorDialog } from './EmrFormatEditorDialog'

type EditorState = { format: EmrCustomFormat; isNew: boolean } | null

export function EmrCustomFormatSection({
  pivots,
  diagnosticReports,
  copiedKey,
  onCopy,
}: {
  pivots: Record<string, LabPivot>
  diagnosticReports: any[]
  copiedKey: string
  onCopy: (text: string) => void
}) {
  const { t } = useLanguage()
  const c = t.ipsExport.emrHandoff.custom
  const prefs = useOutpatientPrefs()
  const [editor, setEditor] = useState<EditorState>(null)
  // Per patient, per visit: the owner remounts this section for each patient.
  const [decisions, setDecisions] = useState<Partial<Record<EmrExamKind, EmrExamDecision>>>({})

  const exams = useMemo(() => resolveLatestExams(diagnosticReports), [diagnosticReports])
  const inputs = useMemo<EmrFormatInputs>(() => ({
    resolveLab: (id) => resolvePinnedLab(pivots, id),
    labLabel: (id) => findPinnableLab(id)?.short ?? null,
    exams,
    examDecisions: decisions,
  }), [pivots, exams, decisions])

  const active = prefs.formats.find((format) => format.id === prefs.activeFormatId) ?? prefs.formats[0]
  const result = useMemo(() => (active ? renderEmrCustomFormat(active, inputs) : null), [active, inputs])
  const excluded = result?.lines.filter((line) => !line.included) ?? []
  const labLabel = useCallback((id: string) => findPinnableLab(id)?.short ?? id, [])
  const pinned = useMemo(() => (prefs.pinnedLabs ?? []).filter((id) => findPinnableLab(id)), [prefs.pinnedLabs])

  const startNew = (starter: EmrStarterId, label: string) => {
    setEditor({ format: newEmrFormat(starter === 'blank' ? '' : label, starterTokens(starter, pinned)), isNew: true })
  }

  const decide = (kind: EmrExamKind, decision: EmrExamDecision | undefined) => {
    setDecisions((prev) => {
      const next = { ...prev }
      if (decision) next[kind] = decision
      else delete next[kind]
      return next
    })
  }

  const editorDialog = editor ? (
    <EmrFormatEditorDialog
      initial={editor.format}
      isNew={editor.isNew}
      pinnedLabIds={pinned}
      previewInputs={inputs}
      onClose={() => setEditor(null)}
      onSave={(format) => {
        prefs.saveFormat(format)
        setEditor(null)
      }}
      onDelete={() => {
        prefs.deleteFormat(editor.format.id)
        setEditor(null)
      }}
    />
  ) : null

  if (!active) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">{c.emptyTitle}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.emptyBody}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ['lipid', c.starterLipid],
            ['pinnedPerLine', c.starterPinned],
            ['exams', c.starterExams],
            ['blank', c.starterBlank],
          ] as Array<[EmrStarterId, string]>).map(([starter, label]) => (
            <Button key={starter} type="button" variant="outline" size="sm" onClick={() => startNew(starter, label)}>
              {label}
            </Button>
          ))}
        </div>
        {editorDialog}
      </section>
    )
  }

  const copyLabel = copiedKey === 'custom'
    ? t.ipsExport.emrHandoff.copied
    : excluded.length > 0
      ? c.copyPartial.replace('{count}', String(excluded.length))
      : c.copy

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {prefs.formats.length > 1 ? (
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{c.formatLabel}</span>
            <select
              value={active.id}
              onChange={(event) => prefs.setActiveFormat(event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {prefs.formats.map((format) => (
                <option key={format.id} value={format.id}>{format.name || c.formatLabel}</option>
              ))}
            </select>
          </label>
        ) : (
          <h3 className="text-sm font-semibold">{active.name || c.formatLabel}</h3>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setEditor({ format: active, isNew: false })}>
            <Pencil className="h-3.5 w-3.5" />{c.edit}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => startNew('blank', '')}>
            <Plus className="h-3.5 w-3.5" />{c.newFormat}
          </Button>
        </div>
      </div>
      <p className="mt-1 text-[0.6875rem] text-muted-foreground">{c.patientNote}</p>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-xs font-semibold">{c.previewTitle}</h4>
          <span className="text-[0.6875rem] tabular-nums text-muted-foreground">{c.chars.replace('{chars}', String(result?.text.length ?? 0))}</span>
        </div>
        <pre data-testid="emr-custom-preview" className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
          {result?.text || c.empty}
        </pre>
      </div>

      {result && result.notes.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {result.notes.map((note, index) => {
            const pendingExam = note.type === 'examPending' ? note : null
            const undoable = note.type === 'examSkipped' || note.type === 'examUsedOlder' ? note : null
            const needsDecision = !!pendingExam
            return (
              <li
                key={index}
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-xs leading-relaxed',
                  needsDecision
                    ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100'
                    : 'border-border bg-muted/30 text-foreground',
                )}
              >
                <span className="flex items-start gap-1.5">
                  {needsDecision && <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{describeEmrNote(note, c, labLabel, active.dateStyle, active.missingText)}</span>
                </span>
                {pendingExam && (
                  <span className="flex flex-wrap gap-2 pl-5">
                    <Button type="button" size="sm" variant="outline" className="h-7 bg-card text-xs" onClick={() => decide(pendingExam.exam, 'useOlder')}>
                      {c.notes.examUseOlder.replace('{olderDate}', formatEmrDate(pendingExam.olderDate, active.dateStyle))}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => decide(pendingExam.exam, 'skip')}>
                      {c.notes.examSkip}
                    </Button>
                  </span>
                )}
                {undoable && (
                  <span className="pl-0">
                    <button type="button" className="text-primary hover:underline" onClick={() => decide(undoable.exam, undefined)}>
                      {c.notes.examUndo}
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Button
        type="button"
        className="mt-3 h-10 w-full gap-2 text-sm"
        disabled={!result?.text.trim()}
        onClick={() => result && onCopy(result.text)}
      >
        {copiedKey === 'custom' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copyLabel}
      </Button>
      {editorDialog}
    </section>
  )
}
