"use client"

import { useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { ModelAndKeySettings } from "./components/ApiKeyField"
import { PromptTemplatesSettings } from "./components/PromptTemplatesSettings"

export function SettingsFeature() {
  const { t } = useLanguage()
  const { settingsTab, setActiveTab, activeTab } = useRightPanel()

  // Reset to 'ai' tab when manually navigating to settings (not from manage templates button)
  useEffect(() => {
    if (activeTab === 'settings' && settingsTab !== 'templates') {
      setActiveTab('settings', 'ai')
    }
  }, [activeTab])
  
  return (
    <div className="space-y-4">
      <Tabs value={settingsTab} onValueChange={(value) => setActiveTab('settings', value)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 gap-1 h-9 bg-muted/40 p-1 border border-border/50 rounded-md">
          <TabsTrigger value="ai" className="text-sm rounded-sm overflow-hidden data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">{t.settings.aiPreferences}</TabsTrigger>
          <TabsTrigger value="templates" className="text-sm rounded-sm overflow-hidden data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">{t.settings.chatTemplates}</TabsTrigger>
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
