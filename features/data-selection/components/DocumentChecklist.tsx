"use client"

// Per-document picker for the 文件 category. Default mode keeps the latest
// discharge summary per institution + first ICD; ticking any document switches
// to a custom set. Ticks represent the saved selection, while a separate label
// identifies selected documents excluded by the model's fitted context.
import { useMemo } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useDataSelection, type DataConsumer } from "@/src/application/providers/data-selection.provider"
import {
  listClinicalDocuments,
  resolveSelectedDocuments,
  type DocumentMode,
} from "@/src/core/utils/clinical-documents.utils"
import type { ClinicalDataCollection } from "@/src/core/entities/clinical-data.entity"
import { formatOrganizationDisplay } from "@/src/shared/utils/organization-display"

interface DocumentChecklistProps {
  clinicalData: ClinicalDataCollection
  consumer?: DataConsumer
  /** Exact document ids in the settled model-fit view, not the saved picks. */
  includedDocumentIds?: string[]
  scopePending?: boolean
}

export function DocumentChecklist({
  clinicalData,
  consumer = 'insights',
  includedDocumentIds,
  scopePending = false,
}: DocumentChecklistProps) {
  const { t, locale } = useLanguage()
  const dataSelection = useDataSelection()
  const profile = dataSelection.getProfile(consumer)
  const savedDocumentMode = consumer === 'insights' ? dataSelection.documentMode : profile.documentMode
  const savedDocumentIds = consumer === 'insights' ? dataSelection.documentIds : profile.documentIds
  const setDocumentMode = (mode: DocumentMode) => consumer === 'insights'
    ? dataSelection.setDocumentMode(mode)
    : dataSelection.setDocumentModeFor(consumer, mode)
  const setDocumentIds = (ids: string[]) => consumer === 'insights'
    ? dataSelection.setDocumentIds(ids)
    : dataSelection.setDocumentIdsFor(consumer, ids)
  const ds = t.dataSelection as unknown as Record<string, string>
  const documentMode = savedDocumentMode
  const documentIds = savedDocumentIds
  const includedIds = useMemo(() => includedDocumentIds === undefined ? null : new Set(includedDocumentIds), [includedDocumentIds])

  const docs = useMemo(() => listClinicalDocuments(clinicalData), [clinicalData])
  const selectedIds = useMemo(
    () => new Set(resolveSelectedDocuments(docs, documentMode, documentIds).map((d) => d.id)),
    [docs, documentMode, documentIds],
  )

  if (docs.length === 0) {
    return <p className="text-[0.6875rem] text-muted-foreground">{ds.documentsEmpty ?? '此病人無文件'}</p>
  }

  const toggle = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDocumentMode('custom')
    setDocumentIds([...next])
  }

  const MODES: Array<{ id: DocumentMode; label: string }> = [
    { id: 'deduplicatedAdmissions', label: ds.docModeDeduplicatedAdmissions ?? '自動' },
    { id: 'latestAdmission', label: ds.docModeLatestAdmission ?? '最近一次住院' },
    { id: 'recentAdmissions', label: ds.docModeRecentAdmissions ?? '最近三次住院' },
    { id: 'all', label: ds.docModeAll ?? '全部' },
    { id: 'custom', label: ds.docModeCustom ?? '自選' },
  ]

  return (
    <div className="space-y-2">
      <div className="inline-flex flex-wrap rounded-md border bg-muted/40 p-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setDocumentMode(m.id)}
            className={`rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-colors ${
              documentMode === m.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {ds.docModeDeduplicatedAdmissionsHint
          ?? '自動：每個機構＋第一個 ICD 只選最新一份；其他選項設定你希望納入的文件。'}
      </p>
      {includedIds && <p className="text-xs text-muted-foreground">
        {documentMode === 'custom'
          ? ds.docManualSelectionScopeHint
          : ds.docSelectionScopeHint ?? '勾選代表你的選擇；實際納入範圍仍受模型容量限制。未納入的文件會另行標示，不會取消你的勾選。'}
      </p>}
      <div className="space-y-0.5">
        {docs.map((d) => {
          const checked = selectedIds.has(d.id)
          const date = d.date ? new Date(d.date).toLocaleDateString(locale) : ''
          const organization = d.organization
            ? formatOrganizationDisplay(d.organization, locale)
            : ''
          const metadata = [date, organization].filter(Boolean)
          const repeatsDischargeTitle = d.isDischargeSummary
            && /(?:出院病摘|discharge\s+summary)/i.test(d.title)
          const primaryIcdDescription = locale === 'en'
            ? (d.primaryIcdDescriptionEn || d.primaryIcdDescription)
            : (d.primaryIcdDescription || d.primaryIcdDescriptionEn)
          return (
            <label
              key={d.id}
              className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-muted/40"
            >
              <input
                type="checkbox"
                data-document-id={d.id}
                checked={checked}
                onChange={() => toggle(d.id)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={`truncate ${checked ? '' : 'text-muted-foreground'}`}>{d.title}</span>
                  {d.isDischargeSummary && !repeatsDischargeTitle && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[0.625rem] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      {ds.dischargeBadge ?? '出院病摘'}
                    </span>
                  )}
                </span>
                {metadata.length > 0 && (
                  <span className="block text-xs text-muted-foreground">{metadata.join(' · ')}</span>
                )}
                {d.primaryIcdCode && (
                  <span className="block text-xs text-muted-foreground">
                    ICD <span className="font-semibold text-foreground">{d.primaryIcdCode}</span>
                    {primaryIcdDescription ? ` ${primaryIcdDescription}` : ''}
                  </span>
                )}
                {checked && includedIds && !scopePending && !includedIds.has(d.id) && (
                  <span className="block text-xs text-amber-700 dark:text-amber-300">
                    {ds.docExcludedFromScope ?? '已選取；未納入本次模型範圍'}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
