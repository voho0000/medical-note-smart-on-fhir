"use client"

// 編輯我的固定檢驗 — pick analytes one by one, order them, remove any.
//
// Categories are only a way to find things: ticking ALT never adds AST, and a
// quick-add pack adds individual pins the clinician can then remove singly.
// A search the catalog cannot answer is said out loud ("not recognised
// automatically yet"); the clinician may keep a reminder row for it, but no
// match rule is ever built from what they typed.

import { useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import {
  findPinnableLab,
  getPinnableLabCatalog,
  isPinnedLabReminder,
  makePinnedLabReminder,
  pinnedLabReminderLabel,
  searchPinnableLabs,
  type PinnableLab,
} from '@/src/shared/utils/pinned-labs'

const PACKS: Array<{ key: 'packCardio' | 'packNephro' | 'packMetabolic'; ids: string[] }> = [
  {
    key: 'packCardio',
    ids: ['chem:CREA', 'chem:EGFR(M)', 'chem:K', 'chem:ALT', 'glucose:GLUCOSE-AC', 'glucose:HBA1C', 'lipid:LDL', 'lipid:HDL', 'lipid:TG', 'chem:NT-PROBNP'],
  },
  {
    key: 'packNephro',
    ids: ['chem:BUN', 'chem:CREA', 'chem:EGFR(M)', 'chem:NA', 'chem:K', 'chem:CA', 'chem:IP', 'chem:UA', 'chem:ALB', 'cbc:HB'],
  },
  {
    key: 'packMetabolic',
    ids: ['glucose:GLUCOSE-AC', 'glucose:HBA1C', 'chem:CREA', 'chem:EGFR(M)', 'lipid:LDL', 'lipid:HDL', 'lipid:TG', 'chem:ALT'],
  },
]

/** Categories shown when browsing without a search, in reading order. The
 *  rest are reachable by search. */
const BROWSE_CATEGORIES = ['chem', 'lipid', 'glucose', 'cbc', 'coag', 'endocrine', 'urine']

export function PinnedLabsEditorDialog({
  open,
  onOpenChange,
  initialIds,
  systemDefaultIds,
  storageScope,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialIds: string[]
  systemDefaultIds: string[]
  storageScope: 'account' | 'browser'
  onSave: (ids: string[]) => void
}) {
  const { t, locale } = useLanguage()
  const s = t.overview.myLabs.editor
  const categoryLabels = (t.reports as any).cumulativeCategories as Record<string, string>
  // The owner mounts this only while it is open, so each opening starts from
  // what is saved rather than from an abandoned draft.
  const [selected, setSelected] = useState<string[]>(initialIds)
  const [query, setQuery] = useState('')

  const catalog = getPinnableLabCatalog()
  const trimmed = query.trim()
  const results = useMemo(() => (trimmed ? searchPinnableLabs(trimmed, catalog) : []), [trimmed, catalog])
  const groups = useMemo(
    () => BROWSE_CATEGORIES.map((id) => ({ id, items: catalog.filter((entry) => entry.categoryId === id) }))
      .filter((group) => group.items.length > 0),
    [catalog],
  )

  const nameOf = (entry: PinnableLab) => (locale === 'zh-TW' ? entry.nameZh : entry.nameEn)
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const move = (index: number, delta: number) => setSelected((prev) => {
    const target = index + delta
    if (target < 0 || target >= prev.length) return prev
    const next = [...prev]
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
  const addPack = (ids: string[]) => setSelected((prev) => [
    ...prev,
    ...ids.filter((id) => !prev.includes(id) && findPinnableLab(id)),
  ])
  const reminderId = trimmed ? makePinnedLabReminder(trimmed) : ''

  const item = (entry: PinnableLab, showCategory: boolean) => {
    const on = selected.includes(entry.id)
    const name = nameOf(entry)
    return (
      <button
        key={entry.id}
        type="button"
        aria-pressed={on}
        onClick={() => toggle(entry.id)}
        className={cn(
          'flex min-h-10 items-center gap-2 rounded-md border px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          on ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-muted/60',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
            on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50',
          )}
        >
          {on && <Check className="h-3 w-3" />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-semibold">{entry.short}</span>
          <span className="truncate text-[0.6875rem] text-muted-foreground">
            {[showCategory ? categoryLabels[entry.categoryId] : null, name && name !== entry.short ? name : null].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-3 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-base">{s.title}</DialogTitle>
          <DialogDescription className="text-xs">{s.description}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[minmax(0,1fr)_20rem] md:overflow-hidden">
          <div className="flex flex-col gap-2.5 md:min-h-0">
            <label className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold text-foreground">{s.searchLabel}</span>
              <span className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-2 focus-within:ring-2 focus-within:ring-primary/50">
                <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={s.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.6875rem] text-muted-foreground">{s.quickAdd}</span>
              {PACKS.map((pack) => (
                <button
                  key={pack.key}
                  type="button"
                  onClick={() => addPack(pack.ids)}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  ＋ {s[pack.key]}
                </button>
              ))}
            </div>

            <div className="pr-1 md:min-h-0 md:flex-1 md:overflow-y-auto">
              {trimmed ? (
                results.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[0.6875rem] text-muted-foreground">
                      {s.resultsCount.replace('{count}', String(results.length))}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {results.map((entry) => item(entry, true))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                      {s.unsupportedTitle.replace('{query}', trimmed)}
                    </p>
                    <p className="text-xs leading-relaxed">{s.unsupportedBody}</p>
                    <button
                      type="button"
                      disabled={selected.includes(reminderId)}
                      onClick={() => setSelected((prev) => (prev.includes(reminderId) ? prev : [...prev, reminderId]))}
                      className="flex w-full flex-col items-start gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left text-foreground hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <span className="text-sm font-semibold">＋ {s.addReminder}</span>
                      <span className="text-[0.6875rem] text-muted-foreground">{s.addReminderHint.replace('{query}', trimmed)}</span>
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  {groups.map((group) => (
                    <section key={group.id} className="space-y-1.5">
                      <h3 className="text-[0.6875rem] font-semibold text-muted-foreground">{categoryLabels[group.id] ?? group.id}</h3>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {group.items.map((entry) => item(entry, false))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="order-first flex flex-col gap-2 border-b border-border pb-3 md:order-none md:min-h-0 md:border-b-0 md:border-l md:pb-0 md:pl-4">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold">{s.selectedTitle.replace('{count}', String(selected.length))}</h3>
              <span className="text-[0.6875rem] text-muted-foreground">{s.selectedHint}</span>
            </div>
            <ol className="space-y-1 md:min-h-0 md:flex-1 md:overflow-y-auto">
              {selected.length === 0 && (
                <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  {s.selectedEmpty}
                </li>
              )}
              {selected.map((id, index) => {
                const entry = findPinnableLab(id)
                const reminder = isPinnedLabReminder(id)
                const label = reminder ? pinnedLabReminderLabel(id) : entry?.short ?? id
                const note = reminder
                  ? t.overview.myLabs.reminderRow
                  : entry ? categoryLabels[entry.categoryId] : t.overview.myLabs.reminderBadge
                return (
                  <li key={id} className="flex min-h-9 items-center gap-1.5 rounded-md border border-border/70 bg-card py-0.5 pl-2 pr-0.5">
                    <span className="w-5 shrink-0 text-right text-[0.6875rem] tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs font-semibold">{label}</span>
                      <span className="truncate text-[0.6875rem] text-muted-foreground">{note}</span>
                    </span>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={s.moveUp.replace('{name}', label)} disabled={index === 0} onClick={() => move(index, -1)}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={s.moveDown.replace('{name}', label)} disabled={index === selected.length - 1} onClick={() => move(index, 1)}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={s.remove.replace('{name}', label)} onClick={() => toggle(id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                )
              })}
            </ol>
            <div className="flex gap-3 text-xs">
              <button type="button" className="text-primary hover:underline disabled:opacity-50" disabled={selected.length === 0} onClick={() => setSelected([])}>
                {s.clear}
              </button>
              <button type="button" className="text-primary hover:underline" onClick={() => setSelected(systemDefaultIds)}>
                {s.resetDefault}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-[0.6875rem] text-muted-foreground">
            {storageScope === 'account' ? s.storageAccount : s.storageBrowser}
          </p>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.common.cancel}</Button>
          <Button type="button" onClick={() => { onSave(selected); onOpenChange(false) }}>{t.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
