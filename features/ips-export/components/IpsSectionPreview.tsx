"use client"

import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { Badge } from '@/components/ui/badge'
import type { IpsCompositionSection } from '../utils/ips-types'

/**
 * Renders a single IPS section: title, LOINC code, entry count, and the
 * generated XHTML narrative (sanitized with DOMPurify before injection).
 */
export function IpsSectionPreview({ section }: { section: IpsCompositionSection }) {
  const count = section.entry?.length ?? 0
  const loinc = section.code?.coding?.[0]?.code
  const safeHtml = useMemo(() => DOMPurify.sanitize(section.text?.div ?? ''), [section.text?.div])

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{section.title}</div>
          {loinc && <div className="text-[11px] text-muted-foreground">LOINC {loinc}</div>}
        </div>
        <Badge variant="secondary" className="shrink-0">
          {count}
        </Badge>
      </div>
      <div
        className="ips-narrative overflow-x-auto px-3 py-2 text-xs [&_p]:text-muted-foreground [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:border-border/50 [&_td]:py-1 [&_td]:pr-3 [&_th]:py-1 [&_th]:pr-3 [&_th]:font-medium [&_th]:text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </div>
  )
}
