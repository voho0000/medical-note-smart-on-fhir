// Shared i18n strings for the document-summary feature.
//
// Extracted so both the standalone DocumentSummaryCard AND the visit-history
// card (which surfaces a discharge summary inline on the linked inpatient
// visit) build the exact same `strings` object and resolveSectionLabel from a
// single source of truth — avoiding drift between the two call sites.
import { useMemo } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'

export interface DocSummaryStrings {
  title: string
  noData: string
  documentDate: string
  author: string
  custodian: string
  noSections: string
  tooltip: string
  ipsBadge: string
  ipsBadgeTooltip: string
  dischargeBadge: string
  dischargeBadgeTooltip: string
  /** Generic badge for a linked document that is NOT a discharge summary
   *  (e.g. a TW-PAS 事前審查申請病摘, an outpatient note). */
  documentBadge: string
  documentBadgeTooltip: string
  htmlBodyHeader: string
  htmlNoContent: string
  htmlExternalUrl: string
  primaryDiagnosisTooltip: string
  openInDialog: string
  docTypes: Record<string, string>
  sections: Record<string, string>
}

export const FALLBACK_DOC_STRINGS: DocSummaryStrings = {
  title: '文件摘要',
  noData: '目前尚無文件資料。匯入 IPS（國際病人摘要）或當健保存摺載入出院病摘後，文件內容將顯示於此。',
  documentDate: '文件日期',
  author: '作者',
  custodian: '機構',
  noSections: '本份文件未提供可顯示的敘事內容。',
  tooltip: '此處顯示匯入文件原始的人類可讀敘事內容（如 IPS 國際病人摘要、出院病摘）。當中的結構化資料已分別呈現在上方各卡片，本卡片保留原始敘事供對照或摘要參考。',
  ipsBadge: 'IPS',
  ipsBadgeTooltip: '此份文件依 IPS（國際病人摘要）規範產出。',
  dischargeBadge: '出院病摘',
  dischargeBadgeTooltip: '此份為 LOINC 18842-5 出院病摘。',
  documentBadge: '病摘',
  documentBadgeTooltip: '此就診有連結的文件（如事前審查申請病摘、門診病摘），展開可閱讀全文。',
  htmlBodyHeader: '文件內容',
  htmlNoContent: '本份文件無可顯示的內容。',
  htmlExternalUrl: '開啟外部文件',
  primaryDiagnosisTooltip: '此 ICD-10 碼為醫療院所申報健保時提供的住院主診斷（健保署彙整後同步至健康存摺）。並非醫師直接撰寫的診斷敘述，詳細病情請展開文件內容。',
  openInDialog: '彈出全文檢視',
  docTypes: {},
  sections: {},
}

/** Merge the active-locale `documentSummary` i18n block over the fallbacks.
 *  The i18n bundle may be a partial rollout, so we always merge. */
export function useDocumentSummaryStrings(): DocSummaryStrings {
  const { t } = useLanguage()
  return useMemo<DocSummaryStrings>(() => {
    const src = (t as any).documentSummary as Partial<DocSummaryStrings> | undefined
    return {
      ...FALLBACK_DOC_STRINGS,
      ...(src ?? {}),
      docTypes: { ...FALLBACK_DOC_STRINGS.docTypes, ...(src?.docTypes ?? {}) },
      sections: { ...FALLBACK_DOC_STRINGS.sections, ...(src?.sections ?? {}) },
    }
  }, [t])
}

/** Section-label resolver bound to a strings object. */
export function makeResolveSectionLabel(strings: DocSummaryStrings) {
  return (i18nKey: string): string | null => strings.sections[i18nKey] ?? null
}
