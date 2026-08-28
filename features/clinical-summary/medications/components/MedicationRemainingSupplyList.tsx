import { useId, useMemo } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import type { MedicationRemainingSummaryEntity } from '@/src/core/entities/clinical-data.entity'
import { useNow } from '@/src/shared/hooks/use-now.hook'
import { cn } from '@/src/shared/utils/cn.utils'
import { isSnapshotFromToday } from '../utils/remaining-supply'

interface MedicationRemainingSupplyListProps {
  summaries: MedicationRemainingSummaryEntity[]
  onViewRelated?: (
    summary: MedicationRemainingSummaryEntity,
    targetReference: string,
  ) => void
}

function displayFhirDate(value: string | undefined, locale: string): string {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const [, year, month, day] = match
  return locale.startsWith('zh')
    ? `${year}/${Number(month)}/${Number(day)}`
    : `${Number(month)}/${Number(day)}/${year}`
}

function displayCaptureDate(value: string | undefined, locale: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function MedicationRemainingSupplyList({
  summaries,
  onViewRelated,
}: MedicationRemainingSupplyListProps) {
  const headingId = useId()
  const { t, locale } = useLanguage()
  const mt = t.medications as any
  const nowMs = useNow()
  const uniqueSummaries = useMemo(
    () => [...new Map(summaries.map((summary) => [summary.id, summary])).values()],
    [summaries],
  )

  if (uniqueSummaries.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="space-y-0.5">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {mt.remainingSupplyTitle ?? '藥品餘藥日數'} ({uniqueSummaries.length})
        </h3>
        <p className="text-xs leading-snug text-muted-foreground">
          {mt.remainingSupplyDescription
            ?? '依健保雲端病歷近 90 日同成分同劑型領藥紀錄彙整，不代表單筆處方剩餘量或實際服藥情形。'}
        </p>
      </div>

      <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/80 bg-muted/40 dark:bg-muted/30">
        {uniqueSummaries.map((summary) => {
          const isCurrent = isSnapshotFromToday(summary.calculatedAt, nowMs)
          const targetReference = summary.anchorMedicationRequestReference
            || summary.relatedMedicationRequestReferences[0]
          const relatedCount = summary.relatedMedicationRequestReferences.length
          const groupName = summary.groupName || mt.remainingSupplyUnknown || '未提供'
          const atc5Name = summary.atc5Name || mt.remainingSupplyUnknown || '未提供'
          const endDate = displayFhirDate(
            summary.sameIngredientDosageFormEndDate,
            locale,
          )
          const capturedAt = displayCaptureDate(summary.calculatedAt, locale)

          return (
            <li key={summary.id} className="space-y-1.5 px-3 py-2.5">
              <div className="grid min-w-0 gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1.35fr)_minmax(7rem,0.65fr)_minmax(7.5rem,0.65fr)]">
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-semibold" title={atc5Name}>
                    {atc5Name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground" title={groupName}>
                    {groupName}
                  </p>
                </div>

                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-xs md:block">
                  <dt className="text-muted-foreground">
                    {mt.sameIngredientEndDate ?? '同成分用藥結束日期'}
                  </dt>
                  <dd className="text-right font-medium tabular-nums md:text-left">
                    {endDate || mt.remainingSupplyUnknown || '未提供'}
                  </dd>
                </dl>

                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 text-xs md:block">
                  <dt className="text-muted-foreground">
                    {mt.adherenceRemainingDays ?? '遵醫囑應餘用藥日數'}
                  </dt>
                  <dd className="text-right font-semibold tabular-nums md:text-left">
                    {summary.adherenceExpectedRemainingDays === undefined
                      ? (mt.remainingSupplyUnknown ?? '未提供')
                      : `${summary.adherenceExpectedRemainingDays} ${locale.startsWith('zh') ? '天' : 'days'}`}
                  </dd>
                </dl>
              </div>

              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                <p className={cn(
                  'min-w-0 text-muted-foreground',
                  !isCurrent && 'text-amber-700 dark:text-amber-300',
                )}>
                  {mt.remainingSupplyCapturedAt ?? '資料擷取時間'}：
                  {capturedAt || mt.captureDateUnknown || '日期未提供'}
                  {!isCurrent
                    ? ` · ${mt.remainingSupplyStale ?? '擷取時資料，非今日即時值'}`
                    : ''}
                </p>

                {targetReference && relatedCount > 0 && onViewRelated && (
                  <button
                    type="button"
                    onClick={() => onViewRelated(summary, targetReference)}
                    className="min-h-8 shrink-0 rounded-md px-2 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    {(mt.relatedMedications ?? '查看相關用藥（{count}）')
                      .replace('{count}', String(relatedCount))}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
