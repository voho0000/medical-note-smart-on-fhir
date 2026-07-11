"use client"

import { useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TAB_ACTIVE_CLASSES, CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { ModelAndKeySettings } from "./components/ApiKeyField"
import { ChatTemplatesSettings } from "./components/ChatTemplatesSettings"
import { DisplaySettings } from "./components/DisplaySettings"

export function SettingsFeature() {
  const { t } = useLanguage()
  const { settingsTab, setActiveTab, activeTab } = useRightPanel()

  // Reset to 'ai' tab when manually navigating to settings, unless the
  // navigation specified a known sub-tab. `display` was added in v0.4.0
  // for theme + about (reachable from the header overflow menu); keep
  // the allowlist in sync as sub-tabs are added.
  useEffect(() => {
    const KNOWN_SUBTABS = ['ai', 'templates', 'display']
    if (activeTab === 'settings' && !KNOWN_SUBTABS.includes(settingsTab)) {
      setActiveTab('settings', 'ai')
    }
  }, [activeTab, settingsTab, setActiveTab])
  
  return (
    <div className="space-y-4">
      <Tabs value={settingsTab} onValueChange={(value) => setActiveTab('settings', value)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 gap-1 h-9 bg-muted/40 p-1 border border-border/50 rounded-md">
          <TabsTrigger value="ai" className={`text-sm rounded-sm overflow-hidden ${TAB_ACTIVE_CLASSES.settings} min-w-0`}>
            <span className="truncate" title={t.settings.aiPreferences}>{t.settings.aiPreferences}</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className={`text-sm rounded-sm overflow-hidden ${TAB_ACTIVE_CLASSES.settings} min-w-0`}>
            <span className="truncate" title={t.settings.chatTemplates}>{t.settings.chatTemplates}</span>
          </TabsTrigger>
          <TabsTrigger value="display" className={`text-sm rounded-sm overflow-hidden ${TAB_ACTIVE_CLASSES.settings} min-w-0`}>
            <span className="truncate" title={(t.settings as any).display ?? '顯示與關於'}>{(t.settings as any).display ?? '顯示與關於'}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ai" className="space-y-6">
          <Card className={`gap-2 py-4 ${CARD_BORDER_CLASSES.settings}`}>
            <CardContent>
              <ModelAndKeySettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="templates" className="space-y-4">
          <Card className={`gap-2 py-4 ${CARD_BORDER_CLASSES.settings}`}>
            <CardContent>
              <ChatTemplatesSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="display" className="space-y-4">
          <Card className={`gap-2 py-4 ${CARD_BORDER_CLASSES.settings}`}>
            <CardContent>
              <DisplaySettings />
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
