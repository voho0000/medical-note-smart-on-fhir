"use client"

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useLanguage } from '@/src/application/providers/language.provider'
import { findGalleryTemplate, galleryFingerprint } from '@/src/shared/utils/gallery-template.utils'

export type GalleryImportItem = {
  id: string; title: string; content: string; sourcePromptKey?: string; sourcePromptFingerprint?: string; sourcePromptVersion?: number
  outputFormat?: string; languagePolicy?: string
}
export type GalleryImportValue = Omit<GalleryImportItem, 'id'>
type Options = {
  scope: string
  inline?: boolean
  items: GalleryImportItem[]
  add: (value: GalleryImportValue) => string | null
  update: (id: string, value: GalleryImportValue) => void
  save: () => unknown
  select?: (id: string) => void
  insert?: (content: string) => void
}

/** One import policy for chat and summary. A local edit alone never triggers a modal. */
export function useGalleryImport(options: Options) {
  const { locale } = useLanguage()
  const zh = locale !== 'en'
  const labels = zh ? {
    identicalTitle: '你已經有這份範本', acknowledge: '知道了',
    identical: '已找到名稱、內容與輸出設定完全相同的範本，這次未重複帶入，也不會更動目前的輸入內容。',
    reused: '已在你的範本中，沿用既有範本', added: '已加入範本', copied: '已另存副本', updated: '已更新範本',
    copy: '另存副本', suffix: '（副本）', keep: '保留我的版本', update: '更新這份範本',
    changed: '來源範本有新內容', unknown: '來源與你的範本內容不同',
    description: '更新會取代這份範本的名稱、提示內容與來源提供的輸出設定。你可以保留自己的版本，或將來源另存副本。',
    mine: '我的版本', source: '來源版本', full: '範本數量已超過上限，請先刪除不用的範本再帶入。', missing: '這份範本已不存在，請重新帶入。',
  } : {
    identicalTitle: 'You already have this template', acknowledge: 'Got it',
    identical: 'A template with the same title, content and output settings is already saved. Nothing was imported and your current input is unchanged.',
    reused: 'Already in your templates; using your saved version', added: 'Template added', copied: 'Copy added', updated: 'Template updated',
    copy: 'Save a copy', suffix: ' (copy)', keep: 'Keep my version', update: 'Update this template',
    changed: 'The source template has changed', unknown: 'The source differs from your template',
    description: 'Updating replaces this template’s title, prompt and source output settings. Keep your version or save the source as a separate copy.',
    mine: 'My version', source: 'Source version', full: 'Template limit exceeded. Remove an unused template before importing.', missing: 'This template no longer exists. Please import it again.',
  }
  const importsThisTick = useRef(new Set<string>())
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const keepButton = useRef<HTMLButtonElement>(null)
  const latest = useRef(options)
  useEffect(() => { latest.current = options }, [options])
  const [pending, setPending] = useState<{ value: GalleryImportValue; id: string; scope: string; known: boolean; onImported?: () => void } | null>(null)
  const [notice, setNotice] = useState<{ message: string; value: GalleryImportValue; scope: string; copyable: boolean } | null>(null)
  const [error, setError] = useState('')
  const [identicalScope, setIdenticalScope] = useState<string | null>(null)
  const livePending = pending?.scope === options.scope ? pending : null
  const existing = livePending ? options.items.find(item => item.id === livePending.id) : undefined
  const toastIds = useRef(new Set<string | number>())
  useEffect(() => {
    // An account/role switch invalidates decisions and delayed toast actions.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(null)
    setIdenticalScope(null)
    setNotice(null)
    setError('')
    const ids = toastIds.current
    return () => { ids.forEach(id => toast.dismiss(id)); ids.clear() }
  }, [options.scope])
  const feedback = (message: string, value: GalleryImportValue, scope: string, copyable = true) => {
    if (latest.current.inline) { setNotice({ message, value, scope, copyable }); return }
    if (!copyable) { toast.success(message); return }
    toastIds.current.add(toast(message, { id: `gallery-import:${scope}:${value.sourcePromptKey}`, duration: 8000, action: { label: labels.copy, onClick: () => copy(value, scope) } }))
  }
  const activate = (id: string, content: string) => {
    latest.current.select?.(id)
    latest.current.insert?.(content)
  }
  const copy = (value: GalleryImportValue, scope: string, insert = false, onImported?: () => void) => {
    if (!active.current || latest.current.scope !== scope) return
    const id = latest.current.add({ ...value, title: value.title + labels.suffix, sourcePromptKey: undefined, sourcePromptFingerprint: undefined, sourcePromptVersion: undefined })
    if (!id) { setError(labels.full); toast.error(labels.full); return }
    void latest.current.save()
    latest.current.select?.(id)
    if (insert) latest.current.insert?.(value.content)
    onImported?.()
    feedback(labels.copied, value, scope, false)
    setPending(null)
  }
  const importPrompt = (input: GalleryImportValue, onImported?: () => void) => {
    setError('')
    const o = latest.current
    const value = { ...input, sourcePromptFingerprint: galleryFingerprint(input) }
    const importKey = JSON.stringify([o.scope, value.sourcePromptFingerprint])
    if (importsThisTick.current.has(importKey)
      || o.items.some(item => galleryFingerprint(item) === value.sourcePromptFingerprint)) {
      setIdenticalScope(o.scope)
      return
    }
    const item = findGalleryTemplate(o.items, value.sourcePromptKey!, candidate => galleryFingerprint(candidate) === value.sourcePromptFingerprint)
    if (item) {
      const changed = galleryFingerprint(item) !== value.sourcePromptFingerprint
        && (!item.sourcePromptFingerprint || item.sourcePromptFingerprint !== value.sourcePromptFingerprint)
      if (changed) { setPending({ value, id: item.id, scope: o.scope, known: !!item.sourcePromptFingerprint, onImported }); return }
    }
    const id = o.add(value) // Provider also protects against same-tick repeated clicks.
    if (!id) { setError(labels.full); toast.error(labels.full); return }
    importsThisTick.current.add(importKey)
    queueMicrotask(() => importsThisTick.current.delete(importKey))
    void o.save()
    activate(id, item?.content ?? value.content)
    onImported?.()
    feedback(item ? labels.reused : labels.added, value, o.scope)
  }
  const choose = (update: boolean) => {
    if (!livePending) return
    const item = latest.current.items.find(item => item.id === livePending.id)
    if (!item) { toast.error(labels.missing); setPending(null); return }
    latest.current.update(item.id, update ? livePending.value : { ...item, sourcePromptFingerprint: livePending.value.sourcePromptFingerprint, sourcePromptVersion: livePending.value.sourcePromptVersion })
    void latest.current.save()
    activate(item.id, update ? livePending.value.content : item.content)
    livePending.onImported?.()
    feedback(update ? labels.updated : labels.reused, livePending.value, livePending.scope)
    setPending(null)
  }
  const dialog = (
    <>
    <Dialog open={identicalScope === options.scope} onOpenChange={open => { if (!open) setIdenticalScope(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.identicalTitle}</DialogTitle>
          <DialogDescription>{labels.identical}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="min-h-11" onClick={() => setIdenticalScope(null)}>{labels.acknowledge}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!livePending} onOpenChange={open => { if (!open) setPending(null) }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" onOpenAutoFocus={event => {
        event.preventDefault()
        keepButton.current?.focus()
      }}>
        <DialogHeader>
          <DialogTitle>{livePending?.known ? labels.changed : labels.unknown}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {[[labels.mine, existing], [labels.source, livePending?.value]].map(([label, item]) => {
            const version = item as GalleryImportValue | undefined
            return <section key={label as string} className="min-w-0 space-y-2">
              <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                <span>{label as string}</span>
                {version?.sourcePromptVersion && <span className="text-xs font-normal tabular-nums text-muted-foreground">V{version.sourcePromptVersion}</span>}
              </h3>
              <p className="break-words text-sm">{version?.title}</p>
              {version?.outputFormat && <p className="text-xs text-muted-foreground">{version.outputFormat === 'plain-text' ? (zh ? '純文字' : 'Plain text') : version.outputFormat === 'markdown' ? 'Markdown' : version.outputFormat} · {version.languagePolicy === 'interface-language' ? (zh ? '依介面語言' : 'Interface language') : (zh ? '依範本語言' : 'Template language')}</p>}
              <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-md border p-3 font-sans text-sm">{version?.content}</pre>
            </section>
          })}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button ref={keepButton} variant="outline" className="min-h-11" onClick={() => choose(false)}>{labels.keep}</Button>
          <Button variant="outline" className="min-h-11" onClick={() => livePending && copy(livePending.value, livePending.scope, true, livePending.onImported)}>{labels.copy}</Button>
          <Button className="min-h-11" onClick={() => choose(true)}>{labels.update}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
  const noticeView = notice?.scope === options.scope && options.inline ? (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
      <span>{error || notice.message}</span>
      {notice.copyable && <Button variant="outline" size="sm" className="min-h-11" onClick={() => copy(notice.value, notice.scope)}>{labels.copy}</Button>}
    </div>
  ) : null
  return { importPrompt, dialog, notice: noticeView }
}
