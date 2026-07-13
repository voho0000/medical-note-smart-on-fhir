"use client"

import { useMemo, useRef, useState } from 'react'
import {
  Braces,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  Maximize2,
  Minimize2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MarkdownRenderer } from '@/src/shared/components/MarkdownRenderer'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useExpandedOverlay } from '@/src/shared/hooks/ui/use-expanded-overlay.hook'
import type { IpsExportFormat } from '../hooks/useIpsExport'
import type { IpsBundle } from '../utils/ips-types'
import type { ValidationResult } from '../utils/ips-lite-validator'
import { IPS_SIZE_WARN_BYTES } from '../utils/ips-constants'
import { formatByteSize, utf8ByteLength } from '../utils/ips-helpers'

type PreviewFormat = IpsExportFormat
type MarkdownView = 'rendered' | 'source'

interface IpsExportPreviewProps {
  bundle: IpsBundle
  markdown: string
  validation: ValidationResult | null
  copiedFormat: IpsExportFormat | null
  copyError: string | null
  markdownFilename: string
  /** Opt-in: keep image/* presentedForm attachments in the FHIR export. */
  includeImageAttachments: boolean
  onToggleImageAttachments: (value: boolean) => void
  onDownloadJson: () => void
  onDownloadMarkdown: () => void
  onCopyJson: () => void
  onCopyMarkdown: () => void
}

function splitFrontmatter(markdown: string): { metadata: string; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { metadata: '', body: markdown }
  return {
    metadata: match[1].trim(),
    body: markdown.slice(match[0].length).trimStart(),
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function compactPrintHtml(html: string): string {
  const root = document.createElement('div')
  root.innerHTML = html

  for (const table of Array.from(root.querySelectorAll('table'))) {
    const headers = Array.from(table.querySelectorAll('thead th'))
    const groupIndex = headers.findIndex((th) => th.textContent?.trim().toLowerCase() === 'group')
    if (groupIndex === -1) continue
    for (const row of Array.from(table.querySelectorAll('tr'))) {
      row.children.item(groupIndex)?.remove()
    }
  }

  return root.innerHTML
}

export function IpsExportPreview({
  bundle,
  markdown,
  validation,
  copiedFormat,
  copyError,
  markdownFilename,
  includeImageAttachments,
  onToggleImageAttachments,
  onDownloadJson,
  onDownloadMarkdown,
  onCopyJson,
  onCopyMarkdown,
}: IpsExportPreviewProps) {
  const { t } = useLanguage()
  const x = t.ipsExport
  const [format, setFormat] = useState<PreviewFormat>('markdown')
  const [markdownView, setMarkdownView] = useState<MarkdownView>('rendered')
  const [showChecks, setShowChecks] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const printSourceRef = useRef<HTMLDivElement>(null)
  const json = useMemo(() => JSON.stringify(bundle, null, 2), [bundle])
  const markdownParts = useMemo(() => splitFrontmatter(markdown), [markdown])
  // 匯出大小預估:以下載時的 pretty-printed JSON 序列化長度估算(UTF-8 bytes)。
  const jsonBytes = useMemo(() => utf8ByteLength(json), [json])
  const entryCount = bundle.entry.length
  useExpandedOverlay({ isExpanded: expanded, onCollapse: () => setExpanded(false) })

  const isMarkdown = format === 'markdown'
  const copied = copiedFormat === format
  const pdfFilename = markdownFilename.replace(/\.md$/i, '.pdf')

  const handleCopy = () => {
    if (isMarkdown) onCopyMarkdown()
    else onCopyJson()
  }

  const handleDownload = () => {
    if (isMarkdown) onDownloadMarkdown()
    else onDownloadJson()
  }

  const handlePrintPdf = () => {
    const html = printSourceRef.current?.innerHTML
    if (!html) return
    const printHtml = compactPrintHtml(html)
    const win = window.open('', '_blank', 'width=900,height=1200')
    if (!win) return
    win.opener = null
    win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pdfFilename)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 8mm; }
    body {
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 9px;
      line-height: 1.22;
    }
    h1 { font-size: 16px; margin: 0 0 8px; }
    h2 { font-size: 12px; margin: 10px 0 4px; border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; }
    h3 { font-size: 11px; margin: 8px 0 3px; }
    h4 { font-size: 10px; margin: 6px 0 2px; }
    p, ul, ol { margin: 4px 0; }
    table {
      width: auto;
      max-width: 100%;
      border-collapse: collapse;
      margin: 3px 0 7px;
      page-break-inside: auto;
      table-layout: auto;
    }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td {
      border-top: 1px solid #e5e7eb;
      padding: 1.5px 4px 1.5px 0;
      text-align: left;
      vertical-align: top;
    }
    th { color: #4b5563; font-weight: 600; }
    th:first-child, td:first-child {
      width: 56px;
      white-space: nowrap;
    }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
</head>
<body>
  ${printHtml}
  <script>
    window.addEventListener('load', () => {
      window.focus();
      window.print();
    });
  </script>
</body>
</html>`)
    win.document.close()
  }

  const expandButton = (isExpanded: boolean) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={() => setExpanded((v) => !v)}
          size="icon-sm"
          variant="outline"
          aria-label={isExpanded ? t.common.minimize : t.common.maximize}
          className="absolute right-2 top-2 z-10 bg-background/95 shadow-sm"
        >
          {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {isExpanded ? t.common.minimize : t.common.maximize}
      </TooltipContent>
    </Tooltip>
  )

  const previewPanel = (isExpanded: boolean) => (
    <div className={isExpanded ? 'flex h-full min-h-0 flex-col space-y-2' : 'space-y-2'}>
      <Tabs
        value={format}
        onValueChange={(v) => setFormat(v as PreviewFormat)}
        className={isExpanded ? 'flex h-full min-h-0 flex-col space-y-2' : 'space-y-2'}
      >
        <div className="shrink-0 rounded-md border bg-card px-2 py-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <TabsList className="grid h-9 w-full grid-cols-2 xl:w-64">
            <TabsTrigger value="markdown">
              <FileText className="h-4 w-4" />
              {x.formatMarkdown}
            </TabsTrigger>
            <TabsTrigger value="json">
              <Braces className="h-4 w-4" />
              {x.formatFhirJson}
            </TabsTrigger>
          </TabsList>

            {isMarkdown && (
              <div className="flex h-9 rounded-lg bg-muted/50 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={markdownView === 'rendered' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setMarkdownView('rendered')}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  {x.renderedPreview}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={markdownView === 'source' ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setMarkdownView('source')}
                >
                  <Code2 className="mr-1 h-3.5 w-3.5" />
                  {x.sourceView}
                </Button>
              </div>
            )}

            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
            {validation && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowChecks((v) => !v)}
                      aria-label={validation.ok ? x.validation.pass : x.validation.fail}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-foreground"
                    >
                      {validation.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {validation.ok ? x.validation.pass : x.validation.fail}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            <div className="flex shrink-0 gap-1.5">
              {isMarkdown && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handlePrintPdf}
                      size="icon"
                      variant="outline"
                      aria-label={x.savePdf}
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {x.savePdf}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleDownload}
                    size="icon"
                    aria-label={isMarkdown ? x.downloadMarkdown : x.downloadJson}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isMarkdown ? x.downloadMarkdown : x.downloadJson}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleCopy}
                    size="icon"
                    variant="outline"
                    aria-label={isMarkdown ? x.copyMarkdown : x.copyJson}
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {copied ? x.copied : isMarkdown ? x.copyMarkdown : x.copyJson}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Entry count + serialized-size estimate + image-attachment opt-in. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-1 pt-2 text-[0.6875rem] text-muted-foreground">
            <span>
              {x.previewStats
                .replace('{count}', String(entryCount))
                .replace('{size}', formatByteSize(jsonBytes))}
            </span>
            {jsonBytes > IPS_SIZE_WARN_BYTES && (
              <span className="font-medium text-amber-600 dark:text-amber-500">{x.sizeWarning}</span>
            )}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5">
              <Switch
                checked={includeImageAttachments}
                onCheckedChange={onToggleImageAttachments}
                className="scale-75"
                aria-label={x.includeImages}
              />
              <span>{x.includeImages}</span>
            </label>
          </div>

          {showChecks && validation && (
            <ul className="mt-2 space-y-1 border-t px-1 pt-2">
              {validation.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-xs">
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                  <span className={item.ok ? 'text-muted-foreground' : 'text-destructive'}>
                    {item.label}
                    {!item.ok && item.detail ? ` - ${item.detail}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {copyError && <p className="text-xs text-destructive">{copyError}</p>}

        <TabsContent value="markdown" className={isExpanded ? 'mt-0 flex min-h-0 flex-1 flex-col' : 'mt-0'}>
          <div className={isExpanded ? 'flex min-h-0 flex-1 flex-col space-y-2' : 'space-y-2'}>
            <div ref={printSourceRef} className="hidden">
              <MarkdownRenderer content={markdownParts.body} />
            </div>
            {markdownView === 'rendered' ? (
              <div className={`relative ${isExpanded ? 'min-h-0 flex-1' : ''}`}>
                {expandButton(isExpanded)}
                <div className={`${isExpanded ? 'h-full overflow-auto' : 'overflow-x-auto'} rounded-md border bg-background px-4 py-3 pr-12 text-sm [&_table]:w-max [&_table]:text-left [&_td]:border-t [&_td]:border-border/60 [&_td]:py-1.5 [&_td]:pr-6 [&_th]:whitespace-nowrap [&_th]:py-1.5 [&_th]:pr-6 [&_th]:font-medium [&_th]:text-muted-foreground`}>
                  <MarkdownRenderer content={markdownParts.body} />
                </div>
              </div>
            ) : (
              <div className={`relative ${isExpanded ? 'min-h-0 flex-1' : ''}`}>
                {expandButton(isExpanded)}
                <pre className={`${isExpanded ? 'h-full overflow-auto' : 'overflow-x-auto'} rounded-md border bg-muted/30 px-3 py-2 pr-12 text-[0.6875rem] leading-relaxed whitespace-pre-wrap`}>
                  {markdownParts.body}
                </pre>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="json" className={isExpanded ? 'mt-0 flex min-h-0 flex-1 flex-col' : 'mt-0'}>
          <div className={`relative ${isExpanded ? 'min-h-0 flex-1' : ''}`}>
            {expandButton(isExpanded)}
            <pre className={`${isExpanded ? 'h-full overflow-auto' : 'overflow-x-auto'} rounded-md border bg-muted/30 px-3 py-2 pr-12 text-[0.6875rem] leading-relaxed`}>
              {json}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )

  if (expanded) {
    return (
      <>
        <div className="flex h-40 items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground">
          <Maximize2 className="mr-2 h-5 w-5" />
          {x.previewExpanded}
        </div>
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4 backdrop-blur-sm sm:p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col rounded-lg border bg-background p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {previewPanel(true)}
          </div>
        </div>
      </>
    )
  }

  return previewPanel(false)
}
