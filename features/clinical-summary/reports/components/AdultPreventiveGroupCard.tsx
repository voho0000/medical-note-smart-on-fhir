"use client"

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import type { Row } from '../types'
import { isSystolicDiastolicBloodPressureRow } from '../utils/blood-pressure-panel'
import { formatDate } from '../utils/fhir-helpers'
import { ReportInstitutionLabel } from './ReportInstitutionLabel'
import { ReportRow } from './ReportRow'
import { ReportTypeBadge } from './ReportTypeBadge'

interface AdultPreventiveGroupCardProps {
  row: Row
  defaultOpen: string[]
  query?: string
  showTypeBadge?: boolean
}

const EMPTY_MEMBERS: Row[] = []

export function AdultPreventiveGroupCard({ row, defaultOpen, query, showTypeBadge }: AdultPreventiveGroupCardProps) {
  const { t } = useLanguage()
  const reports = t.reports as typeof t.reports & {
    adultPreventiveGroup?: {
      itemCount: string
      expand: string
      collapse: string
    }
  }
  const labels = reports.adultPreventiveGroup ?? {
    itemCount: '{n} items',
    expand: 'Expand adult health exam',
    collapse: 'Collapse adult health exam',
  }
  const title = reports.sourcePrograms?.adultPreventive ?? 'Adult health exam'
  const members = row.groupedRows ?? EMPTY_MEMBERS
  const autoOpen = !!query?.trim() || members.some((member) => defaultOpen.includes(member.id))
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const open = manualOpen ?? autoOpen
  const defaultExpandedMemberIds = useMemo(
    () => [
      ...new Set([
        ...defaultOpen,
        ...members.filter(isSystolicDiastolicBloodPressureRow).map((member) => member.id),
      ]),
    ],
    [defaultOpen, members],
  )
  const itemCount = labels.itemCount.replace('{n}', String(members.length))
  const date = formatDate(row.effectiveDate)

  return (
    <div className="pb-1" data-adult-preventive-kind="group">
      <div className="overflow-hidden rounded-md border border-border/90 bg-muted/40">
        <button
          type="button"
          onClick={() => setManualOpen(!open)}
          aria-expanded={open}
          aria-label={open ? labels.collapse : labels.expand}
          className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
            aria-hidden
          />
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 @min-[36rem]:grid-cols-[minmax(9rem,1fr)_minmax(0,1fr)_auto_auto] @min-[36rem]:items-center">
            <span className="flex min-w-0 items-center gap-1.5">
              {showTypeBadge && <ReportTypeBadge group="lab" />}
              <span className="min-w-0 truncate font-semibold text-foreground" title={title}>{title}</span>
            </span>
            {row.institution && (
              <ReportInstitutionLabel
                institution={row.institution}
                stopPropagation={false}
                className="col-span-2 row-start-2 min-w-0 max-w-[12rem] @min-[36rem]:col-span-1 @min-[36rem]:col-start-2 @min-[36rem]:row-start-1"
              />
            )}
            {date && (
              <time
                className="col-start-1 row-start-3 shrink-0 tabular-nums text-xs text-muted-foreground @min-[36rem]:col-start-3 @min-[36rem]:row-start-1"
                dateTime={row.effectiveDate}
              >
                {date}
              </time>
            )}
            <span className="col-start-2 row-start-1 shrink-0 justify-self-end text-xs text-muted-foreground @min-[36rem]:col-start-4">
              {itemCount}
            </span>
          </div>
        </button>

        {open && (
          <div className="space-y-0 border-t border-border/60 px-1.5 py-1.5">
            {members.map((member) => (
              <ReportRow
                key={member.id}
                row={member}
                defaultOpen={defaultExpandedMemberIds}
                query={query}
                hideMeta
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
