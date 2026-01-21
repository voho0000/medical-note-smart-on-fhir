import { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TAB_ACTIVE_CLASSES } from "@/src/shared/config/ui-theme.config"
import { useObservationHistory, useComponentHistory, useCompositeHistory } from '../hooks/useObservationHistory'
import { ObservationTrendChart } from './ObservationTrendChart'
import { MultiLineTrendChart } from './MultiLineTrendChart'
import { ObservationHistoryTable } from './ObservationHistoryTable'
import { CompositeHistoryTable } from './CompositeHistoryTable'
import type { Observation } from '../types'

interface ObservationTrendDialogProps {
  observation: Observation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ObservationTrendDialog({ observation, open, onOpenChange }: ObservationTrendDialogProps) {
  const observationCode = observation?.code?.text || observation?.code?.coding?.[0]?.display
  
  // Check if observation has components (like Blood Pressure with SBP/DBP)
  const hasComponents = observation?.component && observation.component.length > 0
  const componentNames = useMemo(() => {
    if (!hasComponents) return []
    const names = observation.component
      ?.map((comp: any) => comp.code?.text || comp.code?.coding?.[0]?.display)
      .filter(Boolean) as string[]
    
    // Sort so Systolic comes before Diastolic for Blood Pressure
    return names.sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      if (aLower.includes('systolic') && bLower.includes('diastolic')) return -1
      if (aLower.includes('diastolic') && bLower.includes('systolic')) return 1
      return 0
    })
  }, [observation, hasComponents])
  
  const history = useObservationHistory(observationCode)
  const componentHistory = useComponentHistory(observationCode, componentNames)
  const compositeHistory = useCompositeHistory(observationCode, componentNames)

  const unit = observation?.valueQuantity?.unit || 
    (hasComponents ? observation?.component?.[0]?.valueQuantity?.unit : undefined)
  const referenceRange = observation?.referenceRange?.[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {observationCode || '檢驗項目'}
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
              {hasComponents && componentNames.length > 0 && (
                <span className="ml-2">({componentNames.join(', ')})</span>
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
              <CompositeHistoryTable data={compositeHistory} componentNames={componentNames} />
            ) : (
              <ObservationHistoryTable data={history} />
            )}
          </TabsContent>

          <TabsContent value="chart" className="mt-4">
            <div className="rounded-lg border p-4 bg-muted/20">
              {hasComponents && componentHistory.length > 0 ? (
                <MultiLineTrendChart componentData={componentHistory} unit={unit} />
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
