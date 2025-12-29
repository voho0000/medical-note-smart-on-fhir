// API Key Warning Component
import { Card, CardContent } from "@/components/ui/card"
import { useLanguage } from "@/src/application/providers/language.provider"
import { AlertCircle } from "lucide-react"

export function ApiKeyWarning() {
  const { t } = useLanguage()
  
  return (
    <Card className="border-destructive/40 bg-destructive/5 text-destructive">
      <CardContent className="flex items-center gap-3 py-4 text-sm font-medium">
        <AlertCircle className="h-5 w-5" />
        <div>
          {t.clinicalInsights.apiKeyWarning}
        </div>
      </CardContent>
    </Card>
  )
}
