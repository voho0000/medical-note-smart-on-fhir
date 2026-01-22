"use client"

import { useState } from "react"
import { Bug } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { FeedbackDialog } from "./FeedbackDialog"
import { useLanguage } from "@/src/application/providers/language.provider"

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useLanguage()

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() => setIsOpen(true)}
              aria-label={t.feedback?.title || "問題回報"}
            >
              <Bug className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{t.feedback?.title || "問題回報"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <FeedbackDialog open={isOpen} onOpenChange={setIsOpen} />
    </>
  )
}
