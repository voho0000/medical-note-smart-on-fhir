import { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TAB_ACTIVE_CLASSES } from "@/src/shared/config/ui-theme.config"
import { useObservationHistory, useComponentHistory, useCompositeHistory, useReportHistory } from '../hooks/useObservationHistory'
import { ObservationTrendChart } from './ObservationTrendChart'
import { MultiLineTrendChart } from './MultiLineTrendChart'
import { ObservationHistoryTable } from './ObservationHistoryTable'
import { CompositeHistoryTable } from './CompositeHistoryTable'
import { ReportHistoryList } from './ReportHistoryList'
import type { Observation } from '../types'
import { getAnalyteDisplayForObs, bpComponentAbbr } from '@/src/shared/utils/lab-normalize'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'

interface ObservationTrendDialogProps {
  observation: Observation | null
  /** Display title shown in the dialog header — supplied when invoked from a
   *  text-based DiagnosticReport row whose firstObs is a synthetic "Report
   *  Summary". May be audience/language-enhanced (e.g. "心電圖 (ECG)"). */
  reportTitle?: string
  /** Raw bridge title (DiagnosticReport.code.text) used as the history lookup
   *  key. useReportHistory matches this EXACTLY against DR.code.text, so it must
   *  be the un-enhanced value — falls back to reportTitle when not supplied. */
  reportLookupTitle?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ObservationTrendDialog({ observation, reportTitle, reportLookupTitle, open, onOpenChange }: ObservationTrendDialogProps) {
  const { audience } = useAudience()
  const { locale } = useLanguage()
  // History queries match against canonical via canonicalTestKeyFromString
  // internally — pass the raw bridge text here so cross-institution name
  // variants still collapse correctly. The dialog *title* below is audience-
  // aware (canonical short code for medical, long-form translation for
  // patient) so search and display can disagree without breaking either.
  const observationCode = observation?.code?.text || observation?.code?.coding?.[0]?.display
  const dialogTitle = observation ? getAnalyteDisplayForObs(observation, audience, locale) : ''
  const isReportSummary = observation?.code?.text === 'Report Summary' && !!reportTitle

  // Text-based DiagnosticReport history (imaging, ECG, pathology) — chronological
  // list of conclusion text instead of numeric trend. Look up by the RAW bridge
  // title (reportLookupTitle): the display `reportTitle` may carry an appended
  // abbreviation ("心電圖 (ECG)") that no longer matches DiagnosticReport.code.text.
  const reportHistory = useReportHistory(isReportSummary ? (reportLookupTitle || reportTitle) : undefined)

  // Check if observation has components (like Blood Pressure with SBP/DBP).
  // componentNames stays RAW — it's the lookup key the history hooks match
  // against component.code.text. componentDisplayNames is the audience-aware
  // render label (e.g. "SBP"/"DBP"), kept in the same order so callers can zip
  // the two together. Display vs lookup stay separate (see getAnalyteLabel).
  const hasComponents = observation?.component && observation.component.length > 0
  const { componentNames, componentDisplayNames } = useMemo(() => {
    if (!hasComponents) return { componentNames: [] as string[], componentDisplayNames: [] as string[] }
    const comps = (observation.component ?? []).filter(
      (comp: any) => comp.code?.text || comp.code?.coding?.[0]?.display
    )
    // Sort so Systolic comes before Diastolic for Blood Pressure
    const sorted = [...comps].sort((a: any, b: any) => {
      const aLower = (a.code?.text || a.code?.coding?.[0]?.display || '').toLowerCase()
      const bLower = (b.code?.text || b.code?.coding?.[0]?.display || '').toLowerCase()
      if (aLower.includes('systolic') && bLower.includes('diastolic')) return -1
      if (aLower.includes('diastolic') && bLower.includes('systolic')) return 1
      return 0
    })
    return {
      componentNames: sorted.map(
        (comp: any) => (comp.code?.text || comp.code?.coding?.[0]?.display) as string
      ),
      componentDisplayNames: sorted.map(
        (comp: any) => bpComponentAbbr(comp) ?? ((comp.code?.text || comp.code?.coding?.[0]?.display) as string)
      ),
    }
  }, [observation, hasComponents])

  // raw component name → display label, for the chart (whose dataKey must stay
  // raw to match the series data, while the legend/tooltip show the label).
  const componentDisplayMap = useMemo(() => {
    const map: Record<string, string> = {}
    componentNames.forEach((raw, i) => { map[raw] = componentDisplayNames[i] })
    return map
  }, [componentNames, componentDisplayNames])
  
  const history = useObservationHistory(isReportSummary ? undefined : observationCode)
  const componentHistory = useComponentHistory(isReportSummary ? undefined : observationCode, componentNames)
  const compositeHistory = useCompositeHistory(isReportSummary ? undefined : observationCode, componentNames)

  const unit = observation?.valueQuantity?.unit ||
    (hasComponents ? observation?.component?.[0]?.valueQuantity?.unit : undefined)
  const referenceRange = observation?.referenceRange?.[0]

  // Text-based report (imaging / ECG / pathology) — chronological list of conclusions
  if (isReportSummary) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {reportTitle}
            </DialogTitle>
            <div className="text-sm text-muted-foreground">
              共 {reportHistory.length} 筆記錄
            </div>
          </DialogHeader>
          <div className="mt-4">
            <ReportHistoryList data={reportHistory} />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {dialogTitle || observationCode || '檢驗項目'}
          </DialogTitle>
          <div className="space-y-1 text-sm text-muted-foreground">
            {unit && <div>單位: {unit}</div>}
            {referenceRange && (
              <div>
                參考範圍: {' '}
                {referenceRange.low?.value !== undefined && referenceRange.high?.value !== undefined ? (
                  `${referenceRange.low.value} - ${referenceRange.high.value} ${unit || ''}`
                ) : referenceRange.text ? (
                  referenceRange.text
                ) : (
                  '—'
                )}
              </div>
            )}
            <div>
              共 {hasComponents && componentHistory.length > 0 
                ? componentHistory[0]?.data.length || 0 
                : history.length} 筆記錄
              {hasComponents && componentDisplayNames.length > 0 && (
                <span className="ml-2">({componentDisplayNames.join(', ')})</span>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="table" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="table" className={TAB_ACTIVE_CLASSES.clinical}>歷史記錄</TabsTrigger>
            <TabsTrigger value="chart" className={TAB_ACTIVE_CLASSES.clinical}>趨勢圖表</TabsTrigger>
          </TabsList>

          <TabsContent value="table" className="mt-4">
            {hasComponents && compositeHistory.length > 0 ? (
              <CompositeHistoryTable data={compositeHistory} componentNames={componentDisplayNames} />
            ) : (
              <ObservationHistoryTable data={history} />
            )}
          </TabsContent>

          <TabsContent value="chart" className="mt-4">
            <div className="rounded-lg border p-4 bg-muted/20">
              {hasComponents && componentHistory.length > 0 ? (
                <MultiLineTrendChart componentData={componentHistory} unit={unit} displayNames={componentDisplayMap} />
              ) : (
                <ObservationTrendChart data={history} unit={unit} />
              )}
            </div>
          </TabsContent>
        </Tabs>

        {history.length === 0 && componentHistory.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            此檢驗項目暫無歷史記錄
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
