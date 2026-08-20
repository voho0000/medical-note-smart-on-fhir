"use client"

import { useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CARD_BORDER_CLASSES,
  SUBTAB_LIST_CLASSES,
  SUBTAB_TRIGGER_CLASSES,
} from "@/src/shared/config/ui-theme.config"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { ModelAndKeySettings } from "./components/ApiKeyField"
import { DisplaySettings } from "./components/DisplaySettings"

export function SettingsFeature() {
  const { t } = useLanguage()
  const {
    settingsTab,
    setActiveTab,
    activeTab,
    settingsTarget,
    clearSettingsTarget,
  } = useRightPanel()

  // Reset to 'ai' tab when manually navigating to settings, unless the
  // navigation specified a known sub-tab. `display` was added in v0.4.0
  // for theme + about (reachable from the header overflow menu); keep
  // the allowlist in sync as sub-tabs are added.
  useEffect(() => {
    const KNOWN_SUBTABS = ['ai', 'display']
    if (activeTab === 'settings' && !KNOWN_SUBTABS.includes(settingsTab)) {
      setActiveTab('settings', 'ai')
    }
  }, [activeTab, settingsTab, setActiveTab])
  
  return (
    <div className="space-y-4">
      <Tabs value={settingsTab} onValueChange={(value) => setActiveTab('settings', value)} className="gap-0">
        <TabsList className={`${SUBTAB_LIST_CLASSES} grid w-full grid-cols-2`}>
          <TabsTrigger value="ai" className={`${SUBTAB_TRIGGER_CLASSES} overflow-hidden`}>
            <span className="truncate" title={t.settings.aiPreferences}>{t.settings.aiPreferences}</span>
          </TabsTrigger>
          <TabsTrigger value="display" className={`${SUBTAB_TRIGGER_CLASSES} overflow-hidden`}>
            <span className="truncate" title={(t.settings as any).display ?? '顯示與關於'}>{(t.settings as any).display ?? '顯示與關於'}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ai" className="mt-1 space-y-6 md:mt-4">
          <Card className={`gap-2 py-4 ${CARD_BORDER_CLASSES.settings}`}>
            <CardContent>
              <ModelAndKeySettings
                settingsTarget={settingsTarget}
                onSettingsTargetHandled={clearSettingsTarget}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="display" className="mt-1 space-y-4 md:mt-4">
          <Card className={`gap-2 py-4 ${CARD_BORDER_CLASSES.settings}`}>
            <CardContent>
              <DisplaySettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default SettingsFeature
