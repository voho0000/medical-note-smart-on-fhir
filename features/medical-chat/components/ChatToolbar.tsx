"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/src/application/providers/language.provider"
import { Plus, Trash2, FileText } from "lucide-react"

interface Template {
  id: string
  label: string
  content: string
}

interface ChatToolbarProps {
  onInsertContext: () => void
  onInsertAsr: () => void
  onClearAsr: () => void
  onResetChat: () => void
  onInsertTemplate: () => void
  hasAsrText: boolean
  hasChatMessages: boolean
  templates: Template[]
  selectedTemplateId?: string
  onTemplateChange: (id: string) => void
  hasTemplateContent: boolean
}

export function ChatToolbar({
  onInsertContext,
  onInsertAsr,
  onClearAsr,
  onResetChat,
  onInsertTemplate,
  hasAsrText,
  hasChatMessages,
  templates,
  selectedTemplateId,
  onTemplateChange,
  hasTemplateContent,
}: ChatToolbarProps) {
  const { t } = useLanguage()
  
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <div className="flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
        <Button variant="ghost" size="sm" onClick={onInsertContext} className="h-7 gap-1 px-1.5 text-xs">
          <Plus className="h-3 w-3" />
          {t.chat.insertContext}
        </Button>
        <Button variant="ghost" size="sm" onClick={onInsertAsr} disabled={!hasAsrText} className="h-7 gap-1 px-1.5 text-xs">
          <Plus className="h-3 w-3" />
          {t.chat.insertAsr}
        </Button>
      </div>
      {templates.length > 0 ? (
        <div className="flex items-center gap-0.5 rounded-md border bg-primary/5 p-0.5">
          <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
            <SelectTrigger className="h-7 max-w-[180px] gap-1 border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-primary/10">
              <FileText className="h-3 w-3 shrink-0" />
              <SelectValue placeholder={t.chat.insertTemplate} className="truncate" />
            </SelectTrigger>
            <SelectContent align="start" className="w-[200px] text-xs">
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onInsertTemplate}
            disabled={!hasTemplateContent}
            className="h-7 gap-1 px-1.5 text-xs hover:bg-primary/10"
          >
            <Plus className="h-3 w-3" />
            {t.chat.insertTemplate}
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-0.5 rounded-md border border-destructive/20 bg-destructive/5 p-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAsr}
          disabled={!hasAsrText}
          className="h-7 gap-1 px-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
          {t.chat.clearAsr}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetChat}
          disabled={!hasChatMessages}
          className="h-7 gap-1 px-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
          {t.chat.resetChat}
        </Button>
      </div>
    </div>
  )
}
