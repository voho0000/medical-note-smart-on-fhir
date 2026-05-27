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
import { ClinicalInsightsSettings } from "./components/ClinicalInsightsSettings"
import { DisplaySettings } from "./components/DisplaySettings"

export function SettingsFeature() {
  const { t } = useLanguage()
  const { settingsTab, setActiveTab, activeTab } = useRightPanel()

  // Reset to 'ai' tab when manually navigating to settings, unless the
  // navigation specified a known sub-tab. `display` was added in v0.4.0
  // for theme + about (reachable from the header overflow menu); keep
  // the allowlist in sync as sub-tabs are added.
  useEffect(() => {
    const KNOWN_SUBTABS = ['ai', 'templates', 'insights', 'display']
    if (activeTab === 'settings' && !KNOWN_SUBTABS.includes(settingsTab)) {
      setActiveTab('settings', 'ai')
    }
  }, [activeTab])
  
  return (
    <div className="space-y-4">
      <Tabs value={settingsTab} onValueChange={(value) => setActiveTab('settings', value)} className="space-y-4">
        {/* 2 cols on mobile, 4 cols on tablet+. Trying to cram 4 settings
            sub-tabs into one row on a 375px phone clips the labels even
            with truncate; wrapping to 2x2 reads better. */}
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 h-auto sm:h-9 bg-muted/40 p-1 border border-border/50 rounded-md">
          <TabsTrigger value="ai" className={`text-sm rounded-sm overflow-hidden ${TAB_ACTIVE_CLASSES.settings} min-w-0`}>
            <span className="truncate" title={t.settings.aiPreferences}>{t.settings.aiPreferences}</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className={`text-sm rounded-sm overflow-hidden ${TAB_ACTIVE_CLASSES.settings} min-w-0`}>
            <span className="truncate" title={t.settings.chatTemplates}>{t.settings.chatTemplates}</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className={`text-sm rounded-sm overflow-hidden ${TAB_ACTIVE_CLASSES.settings} min-w-0`}>
            <span className="truncate" title={t.settings.clinicalInsightsTabs}>{t.settings.clinicalInsightsTabs}</span>
          </TabsTrigger>
          <TabsTrigger value="display" className={`text-sm rounded-sm overflow-hidden ${TAB_ACTIVE_CLASSES.settings} min-w-0`}>
            <span className="truncate" title={(t.settings as any).display ?? '顯示與關於'}>{(t.settings as any).display ?? '顯示與關於'}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ai" className="space-y-6">
          <Card className={CARD_BORDER_CLASSES.settings}>
            <CardContent className="pt-6">
              <ModelAndKeySettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="templates" className="space-y-4">
          <Card className={CARD_BORDER_CLASSES.settings}>
            <CardContent className="pt-6">
              <ChatTemplatesSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="insights" className="space-y-4">
          <Card className={CARD_BORDER_CLASSES.settings}>
            <CardContent className="pt-6">
              <ClinicalInsightsSettings />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="display" className="space-y-4">
          <Card className={CARD_BORDER_CLASSES.settings}>
            <CardContent className="pt-6">
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
