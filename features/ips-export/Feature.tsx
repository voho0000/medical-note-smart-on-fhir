"use client"

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileOutput, Loader2 } from 'lucide-react'
import { CARD_BORDER_CLASSES } from '@/src/shared/config/ui-theme.config'
import { InfoHint } from '@/src/shared/components/InfoHint'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useIpsBundle } from './hooks/useIpsBundle'
import { useIpsExport } from './hooks/useIpsExport'
import { useInferredProblems } from './hooks/useInferredProblems'
import { inferredToCondition } from './utils/inference-engine'
import { buildIpsMarkdown } from './utils/ips-markdown'
import { IpsInferenceControls } from './components/IpsInferenceControls'
import { IpsDataScopePanel } from './components/IpsDataScopePanel'
import { IpsExportPreview } from './components/IpsExportPreview'
import { InferredProblemsReview } from './components/InferredProblemsReview'

export default function IpsExportFeature() {
  const { t } = useLanguage()
  const x = t.ipsExport
  const {
    downloadJson,
    downloadMarkdown,
    copyJson,
    copyMarkdown,
    copiedFormat,
    copyError,
    markdownFilename,
  } = useIpsExport()

  // Phase 2.2b — async LLM problem-list inference runs as a side-channel. Only
  // the user-CONFIRMED suggestions are turned into synthetic conditions and
  // merged into the bundle; nothing reaches the export without a checkbox click.
  const [llmEnabled, setLlmEnabled] = useState(false)
  const inferred = useInferredProblems()
  const confirmedConditions = useMemo(
    () => inferred.confirmed.map(inferredToCondition),
    [inferred.confirmed],
  )

  const { bundle, curatedData, patient, labels, validation, isLoading, error, hasPatient, resourceCount } =
    useIpsBundle(confirmedConditions)

  const markdown = useMemo(
    () => (curatedData ? buildIpsMarkdown({ patient, data: curatedData, labels }) : ''),
    [curatedData, patient, labels],
  )

  // Loading clinical data
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {x.loading}
      </div>
    )
  }

  // Clinical data failed to load
  if (error) {
    return (
      <Card className={`gap-2 py-4 border-destructive ${CARD_BORDER_CLASSES.clinical}`}>
        <CardContent className="text-sm">
          <div className="mb-1 font-medium text-destructive">{x.errorTitle}</div>
          <div className="text-muted-foreground">{error.message}</div>
        </CardContent>
      </Card>
    )
  }

  // No patient / no data loaded yet
  if (!hasPatient || !bundle) {
    return (
      <Card className={`gap-2 py-4 ${CARD_BORDER_CLASSES.clinical}`}>
        <CardContent className="py-4 text-center text-sm text-muted-foreground">
          <FileOutput className="mx-auto mb-2 h-6 w-6 opacity-60" />
          {x.noData}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FileOutput className="h-5 w-5 text-emerald-600" />
        <h2 className="text-base font-semibold">{x.title}</h2>
        <InfoHint side="right" contentClassName="max-w-sm">
          {x.help}
        </InfoHint>
        <span className="text-xs text-muted-foreground">
          {x.resourceCountLabel.replace('{count}', String(resourceCount))}
        </span>
      </div>

      <Tabs defaultValue="scope" className="space-y-3">
        <TabsList className="grid h-9 w-full grid-cols-2">
          <TabsTrigger value="scope">{x.scopeTab}</TabsTrigger>
          <TabsTrigger value="preview">{x.previewTab}</TabsTrigger>
        </TabsList>

        <TabsContent value="scope" className="space-y-3">
          <IpsInferenceControls
            llmEnabled={llmEnabled}
            onToggleLlm={setLlmEnabled}
            llmAvailable={inferred.available}
          />

          {llmEnabled && (
            <InferredProblemsReview
              status={inferred.status}
              problems={inferred.problems}
              confirmedIds={inferred.confirmedIds}
              confirmedCount={inferred.confirmedCount}
              available={inferred.available}
              error={inferred.error}
              onRun={inferred.run}
              onToggle={inferred.toggleConfirm}
            />
          )}

          <IpsDataScopePanel bundle={bundle} />
        </TabsContent>

        <TabsContent value="preview">
          <IpsExportPreview
            bundle={bundle}
            markdown={markdown}
            validation={validation}
            copiedFormat={copiedFormat}
            copyError={copyError}
            markdownFilename={markdownFilename}
            onDownloadJson={() => downloadJson(bundle)}
            onDownloadMarkdown={() => downloadMarkdown(markdown)}
            onCopyJson={() => copyJson(bundle)}
            onCopyMarkdown={() => copyMarkdown(markdown)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
