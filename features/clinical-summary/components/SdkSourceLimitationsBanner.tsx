'use client'

import { DatabaseZap } from 'lucide-react'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { sdkPreservesDistinctSameDayLabResults } from '@/src/shared/utils/sdk-converter-version.utils'

export function SdkSourceLimitationsBanner() {
  const { locale } = useLanguage()
  const { sourceMetadata, isLoading } = useClinicalData()
  if (isLoading || sourceMetadata?.source !== 'health-bank-sdk-json') return null

  const isZh = locale === 'zh-TW'
  const merged = sourceMetadata.labDuplicateMerge.mergedCount
  const conflicts = sourceMetadata.labDuplicateMerge.conflictingValueGroupCount
  const inferred = sourceMetadata.unitInference.inferredCount
  const unresolved = sourceMetadata.unitInference.unresolvedCount
  const preservesDistinctLabs = sdkPreservesDistinctSameDayLabResults(
    sourceMetadata.converterVersion,
  )

  return (
    <details className="mb-1 shrink-0 rounded-md border border-sky-300/70 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-100">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        <DatabaseZap className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {isZh
            ? '健康存摺 SDK JSON 已在此瀏覽器轉成 FHIR'
            : 'Health Bank SDK JSON was converted to FHIR in this browser'}
        </span>
      </summary>
      <div className="mt-2 space-y-1 border-t border-current/15 pt-2 leading-relaxed">
        <p>
          {isZh
            ? '原始 JSON 未上傳或保存；僅加密保存轉換後的 FHIR 與這份不含檢驗值的摘要。'
            : 'The original JSON was neither uploaded nor stored; only the converted FHIR and this value-free summary are encrypted at rest.'}
        </p>
        <p>
          {preservesDistinctLabs
            ? isZh
              ? `經來源情境、結果與檢驗身分確認為相同的重複表示，合併 ${merged} 筆${conflicts > 0 ? `；另有 ${conflicts} 組同日不同數值，已全部保留` : ''}。`
              : `${merged} evidence-qualified duplicate laboratory representation row(s) merged${conflicts > 0 ? `; all results were preserved in ${conflicts} same-day group(s) with distinct values` : ''}.`
            : isZh
              ? `這份資料由舊版轉換器 ${sourceMetadata.converterVersion} 產生，曾合併 ${merged} 筆同日檢驗；其中 ${conflicts} 組不同數值可能只保留一筆。請重新匯入原始 SDK JSON，以 0.1.3 或更新版本完整保留。`
              : `This data was produced by legacy converter ${sourceMetadata.converterVersion}, which merged ${merged} same-day laboratory row(s); ${conflicts} distinct-value group(s) may have retained only one result. Re-import the original SDK JSON with version 0.1.3 or later.`}
        </p>
        <p>
          {isZh
            ? `檢驗單位由 ${sourceMetadata.unitInference.policyVersion} 推估 ${inferred} 筆；${unresolved} 筆無法安全判定，維持無單位。`
            : `${inferred} lab unit(s) inferred by ${sourceMetadata.unitInference.policyVersion}; ${unresolved} unresolved result(s) remain unitless.`}
        </p>
        <p>
          {isZh
            ? '來源限制：SDK 未提供可穩定映射的結構化姓名、出生日期、性別或年齡欄位；但影像／病理報告全文可能包含這些個人資料。轉換器不會由報告文字推測 Patient 人口學欄位。SDK 也未提供用藥劑量、檢驗原始單位／異常旗標與完整報告分類；門診與急診無法區分。'
            : 'Source limits: the SDK provides no reliably mappable structured name, birth date, sex, or age fields, but full-text imaging/pathology reports may contain this personal information. The converter does not infer Patient demographics from report text. Medication dosage, original lab units/abnormal flags, complete report classification, and outpatient-versus-emergency status are also unavailable.'}
        </p>
      </div>
    </details>
  )
}
