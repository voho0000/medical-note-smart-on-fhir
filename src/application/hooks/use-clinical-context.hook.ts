// Refactored Clinical Context Hook
"use client"

import { useCallback, useMemo } from "react"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import { formatClinicalContext } from "./clinical-context/formatters"
import { formatNumberSmart } from "@/features/clinical-summary/reports/utils/number-format.utils"
import { usePatientContext } from "./clinical-context/usePatientContext"
import { useConditionsContext } from "./clinical-context/useConditionsContext"
import { useMedicationsContext } from "./clinical-context/useMedicationsContext"
import { useAllergiesContext } from "./clinical-context/useAllergiesContext"
import { useReportsContext } from "./clinical-context/useReportsContext"
import { useProceduresContext } from "./clinical-context/useProceduresContext"
import { useVitalSignsContext } from "./clinical-context/useVitalSignsContext"
import type { ClinicalData } from "./clinical-context/types"
import { dataCategoryRegistry } from "@/src/core/registry/data-category.registry"

export type UseClinicalContextReturn = {
  getClinicalContext: () => ClinicalContextSection[]
  formatClinicalContext: (sections: ClinicalContextSection[]) => string
  getFormattedClinicalContext: () => string
  supplementaryNotes: string
  setSupplementaryNotes: (notes: string) => void
  getFullClinicalContext: () => string
  editedClinicalContext: string | null
  setEditedClinicalContext: (context: string | null) => void
  resetClinicalContextToDefault: () => void
}

export { ClinicalContextSection }

export function useClinicalContext(): UseClinicalContextReturn {
  const {
    selectedData,
    filters,
    supplementaryNotes,
    setSupplementaryNotes,
    editedClinicalContext,
    setEditedClinicalContext,
  } = useDataSelection()

  const clinicalData = (useClinicalData() as ClinicalData | null) ?? null

  // Use individual context hooks
  const patientSection = usePatientContext(selectedData.patientInfo ?? false)
  const conditionsSection = useConditionsContext(selectedData.conditions ?? false, clinicalData, filters)
  const medicationsSection = useMedicationsContext(selectedData.medications ?? false, clinicalData, filters)
  const allergiesSection = useAllergiesContext(selectedData.allergies ?? false, clinicalData)
  
  // Use registry system for lab and imaging reports (includes standalone observations)
  const labReportsSection = useMemo(() => {
    if (!selectedData.labReports || !clinicalData) return null
    return dataCategoryRegistry.getCategoryContext('labReports', clinicalData, filters)
  }, [selectedData.labReports, clinicalData, filters])
  
  const imagingReportsSection = useMemo(() => {
    if (!selectedData.imagingReports || !clinicalData) return null
    return dataCategoryRegistry.getCategoryContext('imagingReports', clinicalData, filters)
  }, [selectedData.imagingReports, clinicalData, filters])
  
  // Legacy diagnosticReports support removed - now using labReports category instead
  // const { section: legacyReportsSection, observationIdsInReports } = useReportsContext(
  //   selectedData.diagnosticReports ?? false,
  //   clinicalData,
  //   filters
  // )
  const legacyReportsSection = null
  const observationIdsInReports = new Set<string>()
  
  const proceduresSection = useProceduresContext(selectedData.procedures ?? false, clinicalData, filters)
  const vitalSignsSections = useVitalSignsContext(
    selectedData.observations ?? false,
    clinicalData,
    filters
  )

  // Additional observations (standalone, excluding vitals, lab observations, and those in reports)
  const additionalObservationsSection = useMemo((): ClinicalContextSection | null => {
    if (!selectedData.observations || !clinicalData?.observations?.length) return null

    const { inferGroupFromObservation } = require("@/features/clinical-summary/reports/utils/grouping-helpers")
    
    const vitalIds = new Set<string | undefined>([
      ...(clinicalData.vitalSigns ?? []).map((v) => v.id),
    ])

    const standalone = clinicalData.observations.filter(
      (obs) => {
        // Exclude vitals
        if (vitalIds.has(obs.id)) return false
        // Exclude observations in reports
        if (observationIdsInReports.has(String(obs.id))) return false
        // Exclude lab observations (now handled by lab-reports.category)
        if (inferGroupFromObservation(obs) === 'lab') return false
        // Exclude imaging observations (handled by imaging-reports.category)
        if (inferGroupFromObservation(obs) === 'imaging') return false
        return true
      }
    )

    if (standalone.length === 0) return null

    const filtered = standalone.filter((obs) => {
      const { isWithinTimeRange } = require("@/src/shared/utils/date.utils")
      return isWithinTimeRange(obs.effectiveDateTime, filters?.vitalSignsTimeRange ?? "all")
    })

    if (filtered.length === 0) return null

    const latestByCode = new Map()
    filtered.forEach((obs) => {
      const code = obs.code?.text || "Unknown"
      const existing = latestByCode.get(code)
      if (!existing || (obs.effectiveDateTime || "") > (existing.effectiveDateTime || "")) {
        latestByCode.set(code, obs)
      }
    })

    const items = Array.from(latestByCode.values())
      .map((obs) => {
        const value = obs.valueQuantity?.value ?? obs.valueString
        const unit = obs.valueQuantity?.unit ? ` ${obs.valueQuantity.unit}` : ""
        const formattedValue = typeof value === 'number' ? formatNumberSmart(value) : value
        return value !== undefined && value !== null 
          ? `${obs.code?.text || "Observation"}: ${formattedValue}${unit}` 
          : null
      })
      .filter(Boolean) as string[]

    if (items.length === 0) return null

    return { title: "Additional Observations", items }
  }, [selectedData.observations, clinicalData, observationIdsInReports, filters])

  // Combine all sections
  const getClinicalContext = useCallback((): ClinicalContextSection[] => {
    const sections: ClinicalContextSection[] = []

    if (patientSection) sections.push(patientSection)
    if (conditionsSection) sections.push(conditionsSection)
    if (medicationsSection) sections.push(medicationsSection)
    if (allergiesSection) sections.push(allergiesSection)
    
    // Add lab reports section (includes standalone lab observations)
    if (labReportsSection) {
      if (Array.isArray(labReportsSection)) {
        sections.push(...labReportsSection)
      } else {
        sections.push(labReportsSection)
      }
    }
    
    // Add imaging reports section (includes standalone imaging observations)
    if (imagingReportsSection) {
      if (Array.isArray(imagingReportsSection)) {
        sections.push(...imagingReportsSection)
      } else {
        sections.push(imagingReportsSection)
      }
    }
    
    // Add legacy reports section if needed
    if (legacyReportsSection) sections.push(legacyReportsSection)
    
    if (proceduresSection) sections.push(proceduresSection)
    sections.push(...vitalSignsSections)
    if (additionalObservationsSection) sections.push(additionalObservationsSection)

    return sections
  }, [
    patientSection,
    conditionsSection,
    medicationsSection,
    allergiesSection,
    labReportsSection,
    imagingReportsSection,
    legacyReportsSection,
    proceduresSection,
    vitalSignsSections,
    additionalObservationsSection,
  ])

  const getFormattedClinicalContext = useCallback(
    (): string => formatClinicalContext(getClinicalContext()),
    [getClinicalContext]
  )

  const getFullClinicalContext = useCallback((): string => {
    const baseContext = editedClinicalContext ?? formatClinicalContext(getClinicalContext())
    if (supplementaryNotes.trim()) {
      return `${baseContext}\n\n## Supplementary Notes\n${supplementaryNotes}`
    }
    return baseContext
  }, [editedClinicalContext, getClinicalContext, supplementaryNotes])

  const resetClinicalContextToDefault = useCallback(() => {
    setEditedClinicalContext(null)
  }, [setEditedClinicalContext])

  return {
    getClinicalContext,
    formatClinicalContext,
    getFormattedClinicalContext,
    supplementaryNotes,
    setSupplementaryNotes,
    getFullClinicalContext,
    editedClinicalContext,
    setEditedClinicalContext,
    resetClinicalContextToDefault,
  }
}
