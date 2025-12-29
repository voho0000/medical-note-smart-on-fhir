"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { ModelAndKeySettings } from "./components/ApiKeyField"
import { ClinicalInsightsSettings } from "./components/ClinicalInsightsSettings"
import { PromptTemplatesSettings } from "./components/PromptTemplatesSettings"

export function SettingsFeature() {
  const { t } = useLanguage()
  
  return (
    <div className="space-y-4">
      <Tabs defaultValue="ai" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ai">{t.settings.aiPreferences}</TabsTrigger>
          <TabsTrigger value="templates">{t.settings.promptTemplates}</TabsTrigger>
          <TabsTrigger value="insights">{t.settings.clinicalInsightsTabs}</TabsTrigger>
        </TabsList>
        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <ModelAndKeySettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <PromptTemplatesSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="insights" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <ClinicalInsightsSettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Separator />
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          {t.settings.builtInModelsNote}
        </p>
        <p>
          {t.settings.personalKeyNote}
        </p>
      </div>
    </div>
  )
}

export default SettingsFeature
