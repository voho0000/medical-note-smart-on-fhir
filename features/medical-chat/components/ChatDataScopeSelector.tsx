"use client"

import { BookOpenCheck, Database, ShieldCheck, Sparkles } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { ChatDataScope } from "@/src/core/entities/chat-message.entity"

interface ChatDataScopeSelectorProps {
  value: ChatDataScope
  onChange: (value: ChatDataScope) => void
  hasPatient: boolean
  literatureAvailable: boolean
  frontierModel: boolean
  disabled?: boolean
}

export function ChatDataScopeSelector({
  value,
  onChange,
  hasPatient,
  literatureAvailable,
  frontierModel,
  disabled = false,
}: ChatDataScopeSelectorProps) {
  const { t } = useLanguage()
  const chat = t.chat as typeof t.chat & {
    dataScopeLabel: string
    dataScopeAuto: string
    dataScopeAutoDescription: string
    dataScopeGeneral: string
    dataScopeNoPatientOption: string
    dataScopePatient: string
    dataScopePatientLiterature: string
    dataScopeGeneralDescription: string
    dataScopePatientDescription: string
    dataScopePatientLiteratureDescription: string
    dataScopeNoPatient: string
    dataScopeLiteratureUnavailable: string
  }
  const descriptions: Record<ChatDataScope, string> = {
    auto: chat.dataScopeAutoDescription,
    general: chat.dataScopeGeneralDescription,
    patient: hasPatient
      ? chat.dataScopePatientDescription
      : chat.dataScopeNoPatient,
    'patient-literature': literatureAvailable
      ? chat.dataScopePatientLiteratureDescription
      : chat.dataScopeLiteratureUnavailable,
  }

  return (
    <div
      data-testid="chat-data-scope-control"
      className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/25 px-2 py-1.5"
    >
      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="shrink-0 text-xs font-medium text-foreground">
        {chat.dataScopeLabel}
      </span>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as ChatDataScope)}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          data-testid="chat-data-scope-trigger"
          aria-label={chat.dataScopeLabel}
          className="min-w-0 max-w-[13rem] flex-1 bg-background px-2 text-xs sm:flex-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" className="min-w-[17rem]">
          {frontierModel && (
            <SelectItem value="auto">
              <Sparkles className="h-4 w-4" />
              {chat.dataScopeAuto}
            </SelectItem>
          )}
          <SelectItem value="general">
            <ShieldCheck className="h-4 w-4" />
            {frontierModel ? chat.dataScopeNoPatientOption : chat.dataScopeGeneral}
          </SelectItem>
          {!frontierModel && (
            <>
              <SelectItem value="patient" disabled={!hasPatient}>
                <Database className="h-4 w-4" />
                {chat.dataScopePatient}
              </SelectItem>
              <SelectItem
                value="patient-literature"
                disabled={!hasPatient || !literatureAvailable}
              >
                <BookOpenCheck className="h-4 w-4" />
                {chat.dataScopePatientLiterature}
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
      <span className="hidden min-w-0 flex-1 truncate text-[0.68rem] text-muted-foreground lg:block">
        {descriptions[value]}
      </span>
    </div>
  )
}
