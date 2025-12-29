// API Key Warning Component
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

export function ApiKeyWarning() {
  return (
    <Card className="border-destructive/40 bg-destructive/5 text-destructive">
      <CardContent className="flex items-center gap-3 py-4 text-sm font-medium">
        <AlertCircle className="h-5 w-5" />
        <div>
          Add an OpenAI API key in settings to automatically generate insights. Prompts can still be edited, but responses require an API key.
        </div>
      </CardContent>
    </Card>
  )
}
