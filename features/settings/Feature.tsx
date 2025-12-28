"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ModelAndKeySettings } from "@/features/medical-note/components/ApiKeyField"
import { ClinicalInsightsSettings } from "@/features/clinical-insights/components/ClinicalInsightsSettings"
import { PromptTemplatesSettings } from "@/features/medical-chat/components/PromptTemplatesSettings"

export function SettingsFeature() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <Tabs defaultValue="ai" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ai">AI Preferences</TabsTrigger>
              <TabsTrigger value="templates">Prompt Templates</TabsTrigger>
              <TabsTrigger value="insights">Clinical Insights Tabs</TabsTrigger>
            </TabsList>
            <TabsContent value="ai" className="space-y-6">
              <ModelAndKeySettings />
            </TabsContent>
            <TabsContent value="templates" className="space-y-4">
              <PromptTemplatesSettings />
            </TabsContent>
            <TabsContent value="insights" className="space-y-4">
              <ClinicalInsightsSettings />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <Separator />
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          Built-in models run through a Firebase Functions proxy. Your prompts and responses are processed using the configured OpenAI account.
        </p>
        <p>
          Add a personal API key to access premium OpenAI models directly. Keys are stored locally in this browser only.
        </p>
      </div>
    </div>
  )
}

export default SettingsFeature
