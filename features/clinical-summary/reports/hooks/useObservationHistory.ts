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

export function useObservationHistory(observationCode?: string) {
  const { observations = [], diagnosticReports = [] } = useClinicalData()

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

    // Sort by date (newest first)
    items.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA
    })

    return items
  }, [observationCode, observations, diagnosticReports])

  return history
}
