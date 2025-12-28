"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ModelAndKeySettings } from "@/features/medical-note/components/ApiKeyField"
import { ClinicalInsightsSettings } from "@/features/clinical-insights/components/ClinicalInsightsSettings"

export function SettingsFeature() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AI Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModelAndKeySettings />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Clinical Insights Tabs</CardTitle>
        </CardHeader>
        <CardContent>
          <ClinicalInsightsSettings />
        </CardContent>
      </Card>
      <Separator />
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          Built-in models run through the PrismaCare secure proxy. Your prompts and responses are processed on our servers using the configured OpenAI account.
        </p>
        <p>
          Add a personal API key to access premium OpenAI models directly. Keys are stored locally in this browser only.
        </p>
      </div>
    </div>
  )
}

export default SettingsFeature
