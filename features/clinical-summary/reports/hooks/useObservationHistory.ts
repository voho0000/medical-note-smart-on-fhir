import { useMemo } from 'react'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import type { Observation } from '../types'

export interface ObservationHistoryItem {
  id: string
  date: string
  value: number | string
  unit?: string
  status?: string
  interpretation?: string
  referenceRange?: {
    low?: number
    high?: number
    text?: string
  }
  reportName?: string
  reportId?: string
}

export interface ComponentHistoryItem {
  componentName: string
  data: ObservationHistoryItem[]
  color: string
}

export interface CompositeHistoryItem {
  id: string
  date: string
  compositeValue: string
  unit?: string
  status?: string
  components: Array<{
    name: string
    value: number | string
    unit?: string
  }>
}

const COMPONENT_COLORS = [
  '#60a5fa', // blue
  '#f472b6', // pink
  '#34d399', // green
  '#fbbf24', // yellow
  '#a78bfa', // purple
  '#fb923c', // orange
]

export function useCompositeHistory(observationCode?: string, componentNames?: string[]) {
  const { observations = [] } = useClinicalData()

  return useMemo(() => {
    if (!observationCode || !componentNames || componentNames.length === 0) return []

    const compositeItems: CompositeHistoryItem[] = []

    // Find all observations with matching code that have components
    observations.forEach((obs) => {
      const obsCodeText = obs.code?.text || obs.code?.coding?.[0]?.display
      const obsCodeCode = obs.code?.coding?.[0]?.code

      if (obsCodeText === observationCode || obsCodeCode === observationCode) {
        const date = obs.effectiveDateTime || ''
        const components: CompositeHistoryItem['components'] = []
        
        // Extract component values in order
        componentNames.forEach((name) => {
          const comp = obs.component?.find((c: any) => {
            const compName = c.code?.text || c.code?.coding?.[0]?.display
            return compName === name
          })
          
          if (comp) {
            components.push({
              name,
              value: comp.valueQuantity?.value ?? comp.valueString ?? '—',
              unit: comp.valueQuantity?.unit
            })
          }
        })

        if (components.length > 0) {
          // Format composite value (e.g., "120/80" for BP)
          const values = components.map(c => 
            typeof c.value === 'number' ? Math.round(c.value) : c.value
          )
          const compositeValue = values.join('/')
          const unit = components[0]?.unit

          compositeItems.push({
            id: obs.id || `composite-${date}`,
            date,
            compositeValue,
            unit,
            status: obs.status,
            components
          })
        }
      }
    })

    // Sort by date (newest first)
    compositeItems.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA
    })

    return compositeItems
  }, [observationCode, componentNames, observations])
}

export function useComponentHistory(observationCode?: string, componentNames?: string[]) {
  const { observations = [] } = useClinicalData()

  return useMemo(() => {
    if (!observationCode || !componentNames || componentNames.length === 0) return []

    const componentHistories: ComponentHistoryItem[] = componentNames.map((name, index) => ({
      componentName: name,
      data: [],
      color: COMPONENT_COLORS[index % COMPONENT_COLORS.length]
    }))

    // Find all observations with matching code that have components
    observations.forEach((obs) => {
      const obsCodeText = obs.code?.text || obs.code?.coding?.[0]?.display
      const obsCodeCode = obs.code?.coding?.[0]?.code

      if (obsCodeText === observationCode || obsCodeCode === observationCode) {
        const date = obs.effectiveDateTime || ''
        
        // Extract component values
        obs.component?.forEach((comp: any) => {
          const compName = comp.code?.text || comp.code?.coding?.[0]?.display
          const compIndex = componentNames.findIndex(n => n === compName)
          
          if (compIndex !== -1 && comp.valueQuantity?.value !== undefined) {
            componentHistories[compIndex].data.push({
              id: `${obs.id}-${compName}-${date}`,
              date,
              value: comp.valueQuantity.value,
              unit: comp.valueQuantity.unit,
              status: obs.status,
              interpretation: comp.interpretation?.text || comp.interpretation?.coding?.[0]?.display,
              referenceRange: comp.referenceRange?.[0] ? {
                low: comp.referenceRange[0].low?.value,
                high: comp.referenceRange[0].high?.value,
                text: comp.referenceRange[0].text,
              } : undefined,
            })
          }
        })
      }
    })

    // Sort each component's data by date (newest first)
    componentHistories.forEach(ch => {
      ch.data.sort((a, b) => {
        const dateA = new Date(a.date).getTime()
        const dateB = new Date(b.date).getTime()
        return dateB - dateA
      })
    })

    return componentHistories.filter(ch => ch.data.length > 0)
  }, [observationCode, componentNames, observations])
}

export function useObservationHistory(observationCode?: string) {
  const { observations = [], diagnosticReports = [], procedures = [] } = useClinicalData()

  const history = useMemo(() => {
    if (!observationCode) return []

    const items: ObservationHistoryItem[] = []

    // Create a map of report ID to report name
    const reportMap = new Map<string, string>()
    diagnosticReports.forEach((report) => {
      if (report.id && report.code?.text) {
        reportMap.set(report.id, report.code.text)
      }
    })

    // Create a map of observation ID to report ID
    const obsToReportMap = new Map<string, string>()
    diagnosticReports.forEach((report) => {
      report.result?.forEach((ref) => {
        const obsId = ref.reference?.split('/').pop()
        if (obsId && report.id) {
          obsToReportMap.set(obsId, report.id)
        }
      })
    })

    // Find all observations with matching code
    observations.forEach((obs) => {
      const obsCodeText = obs.code?.text || obs.code?.coding?.[0]?.display
      const obsCodeCode = obs.code?.coding?.[0]?.code

      // Match by text or code
      if (obsCodeText === observationCode || obsCodeCode === observationCode) {
        const value = obs.valueQuantity?.value ?? obs.valueString ?? '—'
        const unit = obs.valueQuantity?.unit
        const date = obs.effectiveDateTime || ''

        // Get interpretation
        const interpText = obs.interpretation?.text || obs.interpretation?.coding?.[0]?.display

        // Get reference range
        const refRange = obs.referenceRange?.[0]
        const referenceRange = refRange
          ? {
              low: refRange.low?.value,
              high: refRange.high?.value,
              text: refRange.text,
            }
          : undefined

        // Get report info
        const reportId = obs.id ? obsToReportMap.get(obs.id) : undefined
        const reportName = reportId ? reportMap.get(reportId) : undefined

        items.push({
          id: obs.id || `obs-${date}`,
          date,
          value,
          unit,
          status: obs.status,
          interpretation: interpText,
          referenceRange,
          reportName,
          reportId,
        })
      }
    })

    // Find all procedures with matching code
    procedures.forEach((procedure: any) => {
      const procedureCodeText = procedure.code?.text || procedure.code?.coding?.[0]?.display
      const procedureCodeCode = procedure.code?.coding?.[0]?.code

      // Match by text or code
      if (procedureCodeText === observationCode || procedureCodeCode === observationCode) {
        const outcome = procedure.outcome?.text || procedure.outcome?.coding?.[0]?.display
        const notes = Array.isArray(procedure.note)
          ? procedure.note.map((n: any) => n?.text).filter(Boolean).join("; ")
          : undefined
        const value = outcome || notes || procedure.status || '—'
        const date = procedure.performedDateTime || procedure.performedPeriod?.start || ''

        items.push({
          id: procedure.id || `procedure-${date}`,
          date,
          value,
          status: procedure.status,
          interpretation: undefined,
          referenceRange: undefined,
          reportName: 'Procedure',
          reportId: undefined,
        })
      }
    })

    // Sort by date (newest first)
    items.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA
    })

    return items
  }, [observationCode, observations, diagnosticReports, procedures])

  return history
}
