// Diagnostic Reports Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import { isWithinTimeRange } from "@/src/shared/utils/date.utils"
import type { ClinicalData, DiagnosticReport, Observation } from "./types"

export function useReportsContext(
  includeReports: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters
): { section: ClinicalContextSection | null; observationIdsInReports: Set<string> } {
  return useMemo(() => {
    const observationIdsInReports = new Set<string>()

    if (!includeReports || !clinicalData?.diagnosticReports?.length) {
      return { section: null, observationIdsInReports }
    }

    const filteredReports = clinicalData.diagnosticReports.filter((report) =>
      isWithinTimeRange(report.effectiveDateTime, filters?.reportTimeRange ?? "1m")
    )

    if (filteredReports.length === 0) {
      return {
        section: { title: "Diagnostic Reports", items: ["No reports found within the selected time range."] },
        observationIdsInReports
      }
    }

    // Build reportId -> observations[] map
    const reportObservations = new Map<string, Observation[]>()
    filteredReports.forEach((report) => {
      const observations: Observation[] = []
      report.result?.forEach((result) => {
        const id = result.reference?.split("/").pop()
        if (!id) return
        observationIdsInReports.add(id)
        const obs = clinicalData.observations?.find((o) => o.id === id)
        if (obs) observations.push(obs)
      })
      if (report.id) reportObservations.set(report.id, observations)
    })

    // Get latest per panel name if requested
    const reportsByPanel = new Map<string, DiagnosticReport>()
    const sortedReports = [...filteredReports].sort((a, b) => 
      (b.effectiveDateTime || "").localeCompare(a.effectiveDateTime || "")
    )

    sortedReports.forEach((report) => {
      const panelName = report.code?.text
      if (!panelName) return
      if (!reportsByPanel.has(panelName)) {
        reportsByPanel.set(panelName, report)
      }
    })

    const latestReports = filters?.labReportVersion === "latest" 
      ? Array.from(reportsByPanel.values()) 
      : sortedReports

    // Format items
    const items: string[] = []
    latestReports.forEach((report) => {
      const observations = (report.id ? reportObservations.get(report.id) : undefined) ?? []
      const observationTexts = observations
        .map((obs) => {
          const value = obs.valueQuantity?.value ?? obs.valueString
          const unit = obs.valueQuantity?.unit ? ` ${obs.valueQuantity.unit}` : ""
          return value !== undefined && value !== null 
            ? `${obs.code?.text || "Test"}: ${value}${unit}` 
            : null
        })
        .filter(Boolean) as string[]

      const datePart = report.effectiveDateTime
        ? ` (${new Date(report.effectiveDateTime).toLocaleDateString()})`
        : ""

      if (observationTexts.length) {
        items.push(`${report.code?.text}${datePart}`)
        observationTexts.forEach((t) => items.push(`  • ${t}`))
      } else if (report.conclusion) {
        items.push(`${report.code?.text || "Report"}: ${report.conclusion}${datePart}`)
      }
    })

    if (items.length === 0) return { section: null, observationIdsInReports }

    return {
      section: {
        title: `Diagnostic Reports${filters?.labReportVersion === "latest" ? " (Latest Versions Only)" : ""}`,
        items
      },
      observationIdsInReports
    }
  }, [includeReports, clinicalData, filters])
}
