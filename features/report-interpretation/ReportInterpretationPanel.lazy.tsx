// Lazy entry point for the 「AI 翻譯解讀」 panel.
//
// The panel itself is on-demand by design (it never auto-runs), but every
// report row and document card imported it statically — which pulled the
// markdown renderer and the interpretation schema's validation library into
// the initial bundle for every user, including the ones who never press the
// button. Hosts import this module instead, so those graphs are fetched on
// first use.
'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const ReportInterpretationPanel = dynamic(
  () => import('./ReportInterpretationPanel').then((m) => m.ReportInterpretationPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      </div>
    ),
  },
)
