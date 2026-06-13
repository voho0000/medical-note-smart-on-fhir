// Display + Connection + Feedback + About settings.
//
// Matches the visual rhythm of the other Settings tabs (AI Preferences,
// Chat Templates, Clinical Insights):
//   - Outer container: space-y-6 between major sections
//   - Each section:    space-y-3 (small uppercase Label + content space-y-2)
//   - Default sm buttons, no shrunk h-7 custom sizes
//
// Stays in lock-step with ApiKeyField.tsx so the four tabs feel like one
// surface rather than four different designers.
'use client'

import { useState } from 'react'
import { Moon, Sun, ExternalLink, Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useTheme } from '@/src/application/providers/theme.provider'
import { useFontSize, type FontSize } from '@/src/application/providers/font-size.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAppVersion } from '@/src/shared/hooks/use-app-version.hook'
import { useFhirContext, LOCAL_BUNDLE_FHIR_URL } from '@/src/application/hooks/chat/use-fhir-context.hook'
import { FeedbackDialog } from '@/features/feedback/components/FeedbackDialog'

const REPO = 'voho0000/medical-note-smart-on-fhir'

const FONT_SIZE_OPTIONS: Array<{ value: FontSize; labelKey: string; fallback: string; preview: string }> = [
  { value: 'xs', labelKey: 'fontSizeXSmall', fallback: '特小', preview: 'text-[10px]' },
  { value: 'sm', labelKey: 'fontSizeSmall', fallback: '小', preview: 'text-xs' },
  { value: 'base', labelKey: 'fontSizeNormal', fallback: '標準', preview: 'text-sm' },
  { value: 'lg', labelKey: 'fontSizeLarge', fallback: '大', preview: 'text-base' },
  { value: 'xl', labelKey: 'fontSizeXLarge', fallback: '特大', preview: 'text-lg' },
]

export function DisplaySettings() {
  const { theme, setTheme } = useTheme()
  const { fontSize, setFontSize } = useFontSize()
  const { t } = useLanguage()
  const version = useAppVersion()
  const { patientId, patientName, fhirServerUrl } = useFhirContext()
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const hasConnectionInfo = !!(fhirServerUrl || patientId)
  const isLocalBundle = fhirServerUrl === LOCAL_BUNDLE_FHIR_URL
  const fhirServerDisplay = isLocalBundle
    ? ((t.connectionInfo as any)?.localBundle ?? '本地匯入 FHIR Bundle')
    : fhirServerUrl

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground">
          {(t.settings as any).theme ?? '主題'}
        </Label>
        <div className="flex gap-2">
          <Button
            variant={theme === 'light' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('light')}
            className="gap-2"
          >
            <Sun className="h-4 w-4" />
            {(t.settings as any).themeLight ?? '亮色'}
          </Button>
          <Button
            variant={theme === 'dark' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('dark')}
            className="gap-2"
          >
            <Moon className="h-4 w-4" />
            {(t.settings as any).themeDark ?? '暗色'}
          </Button>
        </div>
      </div>

      {/* Font size — scales the whole UI proportionally */}
      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground">
          {(t.settings as any).fontSize ?? '字體大小'}
        </Label>
        <div className="flex gap-2">
          {FONT_SIZE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={fontSize === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFontSize(opt.value)}
              // h-11 (44px) for a comfortable touch target — size="sm" alone is 32px,
              // and these 5 buttons sit in a tight row on phones.
              className="h-11 flex-1 gap-1 px-2"
            >
              <span className={opt.preview}>A</span>
              {(t.settings as any)[opt.labelKey] ?? opt.fallback}
            </Button>
          ))}
        </div>
      </div>

      {/* Connection info — only shown when bundle / SMART context is loaded */}
      {hasConnectionInfo && (
        <div className="space-y-3">
          <Label className="text-xs uppercase text-muted-foreground">
            {t.connectionInfo?.title ?? '連線資訊'}
          </Label>
          <div className="space-y-2 text-xs">
            {fhirServerUrl && (
              <div>
                <div className="text-muted-foreground">{t.connectionInfo?.fhirServer ?? 'FHIR 伺服器'}</div>
                <div className="mt-0.5 break-all">{fhirServerDisplay}</div>
              </div>
            )}
            {patientId && (
              <div>
                <div className="text-muted-foreground">{t.connectionInfo?.patientId ?? '患者 ID'}</div>
                <div className="mt-0.5 font-mono break-all">{patientId}</div>
              </div>
            )}
            {patientName && (
              <div>
                <div className="text-muted-foreground">{t.connectionInfo?.patientName ?? '患者姓名'}</div>
                <div className="mt-0.5">{patientName}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedback */}
      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground">
          {t.feedback?.title ?? '問題回報'}
        </Label>
        <Button variant="outline" size="sm" onClick={() => setFeedbackOpen(true)} className="gap-2">
          <Bug className="h-4 w-4" />
          {(t.settings as any).openFeedback ?? '開啟回報表單'}
        </Button>
      </div>

      {/* About */}
      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground">
          {(t.settings as any).about ?? '關於'}
        </Label>
        <div className="space-y-2">
          {version && (
            <div className="text-xs text-muted-foreground">
              MediPrisma <span className="font-mono">v{version}</span>
            </div>
          )}
          {/* Just two links — "所有版本" already lists the current release
              at the top, so a separate "本版更新內容" button was redundant.
              "隱私政策" jumps to the markdown file on GitHub (rendered
              there) so we don't have to keep the in-app /privacy route
              in sync — single source of truth in the repo. */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild className="gap-2">
              <a
                href={`https://github.com/${REPO}/releases`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {(t.settings as any).allReleases ?? '所有版本'}
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild className="gap-2">
              <a
                href={`https://github.com/${REPO}/blob/master/PRIVACY_POLICY.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {(t.settings as any).privacyPolicy ?? '隱私政策'}
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  )
}
