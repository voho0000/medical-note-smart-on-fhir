import { useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  SUBTAB_LIST_CLASSES,
  SUBTAB_TRIGGER_CLASSES,
} from '@/src/shared/config/ui-theme.config'
import {
  useComponentHistory,
  useCompositeHistory,
  useObservationHistory,
  useReportHistory,
} from '../hooks/useObservationHistory'
import { ObservationTrendChart } from './ObservationTrendChart'
import { MultiLineTrendChart } from './MultiLineTrendChart'
import { ObservationHistoryTable } from './ObservationHistoryTable'
import { CompositeHistoryTable } from './CompositeHistoryTable'
import { ReportHistoryList } from './ReportHistoryList'
import type { Observation } from '../types'
import {
  bpComponentAbbr,
  getAnalyteDisplayForMode,
  getOriginalAnalyteDisplayForObs,
} from '@/src/shared/utils/lab-normalize'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useReportNameMode } from '../context/report-name-mode.context'
import { isInferredObservationUnit } from '@/src/shared/utils/observation-provenance.utils'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { categorizeObservation } from '@/src/shared/utils/lab-categories'
import { getLabPivotTestIdentity } from '@/src/shared/utils/lab-pivot.utils'
import {
  buildLabTrendSeries,
  UNCATEGORIZED_LAB_TREND_CATEGORY,
} from '@/src/shared/utils/lab-trend.utils'
import { CumulativeLabTrendDetail } from './CumulativeLabTrendDetail'

interface ObservationTrendDetailProps {
  observation: Observation | null
  reportTitle?: string
  reportLookupTitle?: string
}

/**
 * Longitudinal observation content for the shared right pane.
 *
 * Numeric scalar results use the audited cumulative trend surface. Narrative
 * and qualitative results retain their history without presenting a fake
 * chart. Composite observations keep their exact table and multi-line view.
 */
export function ObservationTrendDetail({
  observation,
  reportTitle,
  reportLookupTitle,
}: ObservationTrendDetailProps) {
  const { audience } = useAudience()
  const { locale } = useLanguage()
  const nameMode = useReportNameMode()
  const { observations = [] } = useClinicalData()
  const observationCode = observation?.code?.text || observation?.code?.coding?.[0]?.display
  const displayName = observation
    ? getAnalyteDisplayForMode(observation, audience, locale, nameMode)
    : ''
  const isReportSummary = observation?.code?.text === 'Report Summary' && !!reportTitle
  const reportHistory = useReportHistory(
    isReportSummary ? (reportLookupTitle || reportTitle) : undefined,
  )
  const hasComponents = !!observation?.component?.length

  const { componentNames, componentDisplayNames } = useMemo(() => {
    if (!hasComponents) {
      return { componentNames: [] as string[], componentDisplayNames: [] as string[] }
    }
    const components = (observation?.component ?? []).filter(
      (component: any) => component.code?.text || component.code?.coding?.[0]?.display,
    )
    const sorted = [...components].sort((a: any, b: any) => {
      const aName = (a.code?.text || a.code?.coding?.[0]?.display || '').toLowerCase()
      const bName = (b.code?.text || b.code?.coding?.[0]?.display || '').toLowerCase()
      if (aName.includes('systolic') && bName.includes('diastolic')) return -1
      if (aName.includes('diastolic') && bName.includes('systolic')) return 1
      return 0
    })
    return {
      componentNames: sorted.map(
        (component: any) => (component.code?.text || component.code?.coding?.[0]?.display) as string,
      ),
      componentDisplayNames: sorted.map((component: any) => (
        nameMode === 'original'
          ? getOriginalAnalyteDisplayForObs(component)
          : bpComponentAbbr(component)
            ?? ((component.code?.text || component.code?.coding?.[0]?.display) as string)
      )),
    }
  }, [hasComponents, nameMode, observation])

  const componentDisplayMap = useMemo(() => {
    const map: Record<string, string> = {}
    componentNames.forEach((raw, index) => {
      map[raw] = componentDisplayNames[index]
    })
    return map
  }, [componentDisplayNames, componentNames])

  const history = useObservationHistory(
    isReportSummary ? undefined : observationCode,
    isReportSummary ? undefined : observation,
  )
  const componentHistory = useComponentHistory(
    isReportSummary ? undefined : observationCode,
    componentNames,
  )
  const compositeHistory = useCompositeHistory(
    isReportSummary ? undefined : observationCode,
    componentNames,
  )
  const unit = observation?.valueQuantity?.unit
    || (hasComponents ? observation?.component?.[0]?.valueQuantity?.unit : undefined)
  const unitInferred = isInferredObservationUnit(observation)
  const referenceRange = observation?.referenceRange?.[0]

  const unifiedTrendSeries = useMemo(() => {
    if (!observation || hasComponents) return null
    const category = categorizeObservation(observation)
    const identity = getLabPivotTestIdentity(observation, category?.id, nameMode)
    const observationAlreadyLoaded = observations.some((candidate: any) => (
      candidate === observation
      || (!!observation.id && candidate?.id === observation.id)
    ))
    const trendSources = observationAlreadyLoaded
      ? observations
      : [...observations, observation]
    const series = buildLabTrendSeries(trendSources, {
      categoryId: category?.id ?? UNCATEGORIZED_LAB_TREND_CATEGORY,
      mapKey: identity.mapKey,
      testKey: identity.testKey,
      displayName: displayName || identity.displayName,
      nameMode,
    })
    return series.points.length > 0 ? series : null
  }, [displayName, hasComponents, nameMode, observation, observations])

  if (!observation) {
    return <div className="py-8 text-center text-sm text-muted-foreground">無可顯示的資料</div>
  }

  if (isReportSummary) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          {locale.startsWith('zh') ? `共 ${reportHistory.length} 筆記錄` : `${reportHistory.length} records`}
        </div>
        <ReportHistoryList data={reportHistory} />
      </div>
    )
  }

  if (unifiedTrendSeries) {
    return <CumulativeLabTrendDetail series={unifiedTrendSeries} />
  }

  if (!hasComponents && !observation.valueQuantity) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          {locale.startsWith('zh') ? `共 ${history.length} 筆記錄` : `${history.length} records`}
        </div>
        <ObservationHistoryTable data={history} />
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-1 text-sm text-muted-foreground">
        {unit && (
          <div>
            {locale.startsWith('zh') ? '單位' : 'Unit'}: {unit}
            {unitInferred && (
              <span className="ml-1 text-sky-700 dark:text-sky-300">
                ({locale.startsWith('zh') ? '推估單位' : 'inferred'})
              </span>
            )}
          </div>
        )}
        {referenceRange && (
          <div>
            {locale.startsWith('zh') ? '參考範圍' : 'Reference range'}:{' '}
            {referenceRange.low?.value !== undefined && referenceRange.high?.value !== undefined
              ? `${referenceRange.low.value} - ${referenceRange.high.value} ${unit || ''}`
              : referenceRange.text || '—'}
          </div>
        )}
        <div>
          {locale.startsWith('zh') ? '共' : ''}{' '}
          {componentHistory[0]?.data.length || history.length}{' '}
          {locale.startsWith('zh') ? '筆記錄' : 'records'}
          {componentDisplayNames.length > 0 && (
            <span className="ml-2">({componentDisplayNames.join(', ')})</span>
          )}
        </div>
      </div>

      <Tabs defaultValue="table" className="w-full gap-0">
        <TabsList className={`${SUBTAB_LIST_CLASSES} grid w-full grid-cols-2`}>
          <TabsTrigger value="table" className={SUBTAB_TRIGGER_CLASSES}>
            {locale.startsWith('zh') ? '歷史紀錄' : 'History'}
          </TabsTrigger>
          <TabsTrigger value="chart" className={SUBTAB_TRIGGER_CLASSES}>
            {locale.startsWith('zh') ? '趨勢圖表' : 'Trend chart'}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="mt-3">
          {compositeHistory.length > 0 ? (
            <CompositeHistoryTable
              data={compositeHistory}
              componentNames={componentDisplayNames}
            />
          ) : (
            <ObservationHistoryTable data={history} />
          )}
        </TabsContent>
        <TabsContent value="chart" className="mt-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            {componentHistory.length > 0 ? (
              <MultiLineTrendChart
                componentData={componentHistory}
                unit={unit}
                displayNames={componentDisplayMap}
              />
            ) : (
              <ObservationTrendChart data={history} unit={unit} />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
