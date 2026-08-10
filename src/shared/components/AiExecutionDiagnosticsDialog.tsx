"use client"

import { Download, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface AiExecutionDiagnosticsPreviewRecord {
  id?: string
  feature?: string
  modelName: string
  modelId: string
  timestamp: string
  prompt: string
  inputData: unknown
  outputData: string
  hasError: boolean
  errorMessage: string | null
  status: "completed" | "error" | "aborted"
}

export interface AiExecutionDiagnosticsLabels {
  title: string
  description: string
  privacyNotice: string
  execution: string
  model: string
  modelId: string
  timestamp: string
  status: string
  prompt: string
  input: string
  output: string
  error: string
  noError: string
  completed: string
  failed: string
  aborted: string
  close: string
  downloadAll: string
  downloadThis: string
}

interface AiExecutionDiagnosticsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  records: AiExecutionDiagnosticsPreviewRecord[]
  labels: AiExecutionDiagnosticsLabels
  onDownloadAll: () => void
  onDownloadRecord: (index: number) => void
}

function prettyValue(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function statusLabel(
  status: AiExecutionDiagnosticsPreviewRecord["status"],
  labels: AiExecutionDiagnosticsLabels,
) {
  if (status === "completed") return labels.completed
  if (status === "aborted") return labels.aborted
  return labels.failed
}

function statusClass(status: AiExecutionDiagnosticsPreviewRecord["status"]) {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
  }
  if (status === "aborted") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
  }
  return "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200"
}

function DataSection({ label, value }: { label: string; value: unknown }) {
  return (
    <section className="min-w-0 space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      <pre className="max-h-64 w-full min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/35 p-3 font-mono text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">
        {prettyValue(value)}
      </pre>
    </section>
  )
}

export function AiExecutionDiagnosticsDialog({
  open,
  onOpenChange,
  records,
  labels,
  onDownloadAll,
  onDownloadRecord,
}: AiExecutionDiagnosticsDialogProps) {
  const defaultOpen = records.length > 0 ? [`execution-${records.length - 1}`] : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="ai-diagnostics-preview-dialog"
        className="!flex h-[min(90vh,56rem)] !w-[min(96vw,70rem)] !max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 sm:px-6 sm:py-5">
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{labels.privacyNotice}</span>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 min-w-0 flex-1 px-4 sm:px-6">
          <Accordion type="multiple" defaultValue={defaultOpen} className="min-w-0 py-2">
            {records.map((record, index) => {
              const value = `execution-${index}`
              return (
                <AccordionItem key={record.id ?? value} value={value}>
                  <AccordionTrigger className="gap-3 py-3 hover:no-underline">
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {labels.execution} {index + 1}
                      </span>
                      <span className="truncate text-muted-foreground">{record.modelName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${statusClass(record.status)}`}>
                        {statusLabel(record.status, labels)}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="min-w-0 space-y-4">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onDownloadRecord(index)}
                        data-testid={`ai-diagnostics-download-record-${index}`}
                        className="gap-2"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {labels.downloadThis}
                      </Button>
                    </div>
                    <dl className="grid gap-2 rounded-md border bg-card p-3 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">{labels.model}</dt>
                        <dd className="font-medium">{record.modelName}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{labels.modelId}</dt>
                        <dd className="break-all font-mono">{record.modelId}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{labels.timestamp}</dt>
                        <dd className="font-mono">{record.timestamp}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{labels.status}</dt>
                        <dd>{statusLabel(record.status, labels)}</dd>
                      </div>
                    </dl>
                    <DataSection label={labels.prompt} value={record.prompt} />
                    <DataSection label={labels.input} value={record.inputData} />
                    <DataSection label={labels.output} value={record.outputData} />
                    <DataSection
                      label={labels.error}
                      value={record.hasError ? record.errorMessage || labels.failed : labels.noError}
                    />
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </ScrollArea>

        <DialogFooter className="shrink-0 border-t bg-muted/20 px-4 py-3 sm:px-6 sm:py-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">{labels.close}</Button>
          </DialogClose>
          <Button
            type="button"
            onClick={onDownloadAll}
            disabled={records.length === 0}
            data-testid="ai-diagnostics-download"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {labels.downloadAll}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
