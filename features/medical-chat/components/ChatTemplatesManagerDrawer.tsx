"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { ChatTemplatesSettings } from "@/features/settings/components/ChatTemplatesSettings"

interface ChatTemplatesManagerDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTemplateId?: string
}

export function ChatTemplatesManagerDrawer({
  open,
  onOpenChange,
  initialTemplateId,
}: ChatTemplatesManagerDrawerProps) {
  const { t } = useLanguage()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b bg-muted/20 px-4 py-3 pr-10 sm:px-5">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            {t.settings.chatTemplatesManagerTitle}
          </SheetTitle>
          <SheetDescription className="text-xs">{t.settings.chatTemplatesManagerDesc}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
          <div className="p-3 sm:p-4">
            <ChatTemplatesSettings
              key={initialTemplateId ?? "chat-template-manager"}
              initialTemplateId={initialTemplateId}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
