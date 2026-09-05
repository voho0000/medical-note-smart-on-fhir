import { CircleArrowRight, CircleHelp, FileSearch, ShieldCheck } from 'lucide-react'
import type { CdssStatus } from '../types'

/**
 * The four module states, styled the same wherever a card, a row, or a tile
 * shows one. Shared by the module list and the heart-failure board so the
 * badge a clinician learns on one surface is the badge they meet on the other.
 */
export const statusStyle: Record<CdssStatus, string> = {
  actionable: 'bg-slate-100 text-slate-800 hover:bg-slate-100 dark:bg-secondary dark:text-secondary-foreground dark:hover:bg-secondary',
  'needs-data': 'bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200',
  review: 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-200',
  'no-action': 'bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200',
}

export function StatusIcon({ status }: { status: CdssStatus }) {
  if (status === 'actionable') return <CircleArrowRight className="mr-1 h-3.5 w-3.5" />
  if (status === 'needs-data') return <FileSearch className="mr-1 h-3.5 w-3.5" />
  if (status === 'no-action') return <ShieldCheck className="mr-1 h-3.5 w-3.5" />
  return <CircleHelp className="mr-1 h-3.5 w-3.5" />
}

export function statusLabel(status: CdssStatus, isEnglish: boolean): string {
  switch (status) {
    case 'actionable': return isEnglish ? 'Actionable now' : '可立即處理'
    case 'needs-data': return isEnglish ? 'Data needed' : '需先補資料'
    case 'review': return isEnglish ? 'Clinical review' : '需臨床確認'
    case 'no-action': return isEnglish ? 'No action needed' : '目前無需處理'
  }
}
