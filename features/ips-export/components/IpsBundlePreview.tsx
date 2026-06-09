"use client"

import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/src/application/providers/language.provider'
import { IpsSectionPreview } from './IpsSectionPreview'
import type { IpsBundle, IpsCompositionSection } from '../utils/ips-types'
import type { ValidationResult } from '../utils/ips-lite-validator'

interface IpsBundlePreviewProps {
  bundle: IpsBundle
  validation: ValidationResult | null
}

export function IpsBundlePreview({ bundle, validation }: IpsBundlePreviewProps) {
  const { t } = useLanguage()
  const x = t.ipsExport
  const [showJson, setShowJson] = useState(false)
  const [showChecks, setShowChecks] = useState(false)

  const composition = bundle.entry?.[0]?.resource
  const sections = ((composition?.section as IpsCompositionSection[] | undefined) ?? [])
  const json = useMemo(() => JSON.stringify(bundle, null, 2), [bundle])

  return (
    <div className="space-y-3">
      {/* Validation summary */}
      {validation && (
        <div className="rounded-md border">
          <button
            type="button"
            onClick={() => setShowChecks((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <div className="flex items-center gap-2">
              {validation.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {validation.ok ? x.validation.pass : x.validation.fail}
              </span>
            </div>
            {showChecks ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {showChecks && (
            <ul className="space-y-1 border-t px-3 py-2">
              {validation.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-xs">
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                  <span className={item.ok ? 'text-muted-foreground' : 'text-destructive'}>
                    {item.label}
                    {!item.ok && item.detail ? ` — ${item.detail}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-2">
        {sections.map((section, i) => (
          <IpsSectionPreview key={`${section.code?.coding?.[0]?.code ?? 'sec'}-${i}`} section={section} />
        ))}
      </div>

      {/* Raw JSON disclosure */}
      <div className="rounded-md border">
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <span className="text-sm font-medium">{x.rawJson}</span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{bundle.entry?.length ?? 0}</Badge>
            {showJson ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
        {showJson && (
          <pre className="max-h-80 overflow-auto border-t bg-muted/30 px-3 py-2 text-[11px] leading-relaxed">
            {json}
          </pre>
        )}
      </div>
    </div>
  )
}
