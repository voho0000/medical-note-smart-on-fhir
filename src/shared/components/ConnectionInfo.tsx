"use client"

import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useFhirContext } from "@/src/application/hooks/chat/use-fhir-context.hook"
import { useLanguage } from "@/src/application/providers/language.provider"

export function ConnectionInfo() {
  const { patientId, patientName, fhirServerUrl } = useFhirContext()
  const { t } = useLanguage()

  if (!fhirServerUrl && !patientId) {
    return null
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9"
            aria-label={t.connectionInfo?.title || "連線資訊"}
          >
            <Info className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <div className="space-y-2 text-xs">
            {fhirServerUrl && (
              <div>
                <span className="font-semibold">{t.connectionInfo?.fhirServer || "FHIR 伺服器"}:</span>
                <div className="text-muted-foreground break-all mt-0.5">{fhirServerUrl}</div>
              </div>
            )}
            {patientId && (
              <div>
                <span className="font-semibold">{t.connectionInfo?.patientId || "患者 ID"}:</span>
                <div className="text-muted-foreground mt-0.5">{patientId}</div>
              </div>
            )}
            {patientName && (
              <div>
                <span className="font-semibold">{t.connectionInfo?.patientName || "患者姓名"}:</span>
                <div className="text-muted-foreground mt-0.5">{patientName}</div>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
