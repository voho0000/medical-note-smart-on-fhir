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
        <TabsList className="grid w-full grid-cols-3 gap-1 h-9 bg-muted/40 p-1 border border-border/50 rounded-md">
          <TabsTrigger value="ai" className="text-sm rounded-sm overflow-hidden data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">{t.settings.aiPreferences}</TabsTrigger>
          <TabsTrigger value="templates" className="text-sm rounded-sm overflow-hidden data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">{t.settings.promptTemplates}</TabsTrigger>
          <TabsTrigger value="insights" className="text-sm rounded-sm overflow-hidden data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">{t.settings.clinicalInsightsTabs}</TabsTrigger>
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
