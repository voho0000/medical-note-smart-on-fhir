import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useObservationHistory } from '../hooks/useObservationHistory'
import { ObservationTrendChart } from './ObservationTrendChart'
import { ObservationHistoryTable } from './ObservationHistoryTable'
import type { Observation } from '../types'

interface ObservationTrendDialogProps {
  observation: Observation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ObservationTrendDialog({ observation, open, onOpenChange }: ObservationTrendDialogProps) {
  const observationCode = observation?.code?.text || observation?.code?.coding?.[0]?.display
  const history = useObservationHistory(observationCode)

  const unit = observation?.valueQuantity?.unit
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
              共 {history.length} 筆記錄
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="table" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="table">歷史記錄</TabsTrigger>
            <TabsTrigger value="chart">趨勢圖表</TabsTrigger>
          </TabsList>

          <TabsContent value="table" className="mt-4">
            <ObservationHistoryTable data={history} />
          </TabsContent>

          <TabsContent value="chart" className="mt-4">
            <div className="rounded-lg border p-4 bg-muted/20">
              <ObservationTrendChart data={history} unit={unit} />
            </div>
          </TabsContent>
        </Tabs>

        {history.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            此檢驗項目暫無歷史記錄
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
