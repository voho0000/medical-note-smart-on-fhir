// Refactored Clinical Context Hook
"use client"

import { useCallback, useMemo } from "react"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import { formatClinicalContext } from "./clinical-context/formatters"
import { usePatientContext } from "./clinical-context/usePatientContext"
import { useConditionsContext } from "./clinical-context/useConditionsContext"
import { useMedicationsContext } from "./clinical-context/useMedicationsContext"
import { useEncountersContext } from "./clinical-context/useEncountersContext"
import { useAllergiesContext } from "./clinical-context/useAllergiesContext"
import { useProceduresContext } from "./clinical-context/useProceduresContext"
import { useVitalSignsContext } from "./clinical-context/useVitalSignsContext"
import { useImmunizationsContext } from "./clinical-context/useImmunizationsContext"
import { useProblemListContext } from "./clinical-context/useProblemListContext"
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

  // Hook-driven sections (richer formatting than registry can provide)
  const patientSection = usePatientContext(selectedData.patientInfo ?? false)
  const encountersSection = useEncountersContext(selectedData.encounters ?? false, clinicalData)
  const conditionsSection = useConditionsContext(selectedData.conditions ?? false, clinicalData, filters)
  const medicationsSection = useMedicationsContext(selectedData.medications ?? false, clinicalData, filters)
  const allergiesSection = useAllergiesContext(selectedData.allergies ?? false, clinicalData)
  const proceduresSection = useProceduresContext(selectedData.procedures ?? false, clinicalData, filters)
  const vitalSignsSections = useVitalSignsContext(
    selectedData.vitalSigns ?? false,
    clinicalData,
    filters
  )
  const immunizationsSection = useImmunizationsContext(
    selectedData.immunizations ?? false,
    clinicalData,
    filters
  )

  const problemListSection = useProblemListContext(
    selectedData.problemList ?? false,
    clinicalData,
    filters
  )

  // Registry-driven sections (extensible via dataCategoryRegistry)

  const labReportsSection = useMemo(() => {
    if (!selectedData.labReports || !clinicalData) return null
    return dataCategoryRegistry.getCategoryContext('labReports', clinicalData, filters)
  }, [selectedData.labReports, clinicalData, filters])

  const imagingReportsSection = useMemo(() => {
    if (!selectedData.imagingReports || !clinicalData) return null
    return dataCategoryRegistry.getCategoryContext('imagingReports', clinicalData, filters)
  }, [selectedData.imagingReports, clinicalData, filters])

  const orphanObservationsSection = useMemo(() => {
    if (!selectedData.observations || !clinicalData) return null
    return dataCategoryRegistry.getCategoryContext('observations', clinicalData, filters)
  }, [selectedData.observations, clinicalData, filters])

  const pushRegistrySection = useCallback(
    (
      sections: ClinicalContextSection[],
      section: ClinicalContextSection | ClinicalContextSection[] | null
    ) => {
      if (!section) return
      if (Array.isArray(section)) sections.push(...section)
      else sections.push(section)
    },
    []
  )

  const getClinicalContext = useCallback((): ClinicalContextSection[] => {
    const sections: ClinicalContextSection[] = []

    // Patient group
    if (patientSection) sections.push(patientSection)
    sections.push(...vitalSignsSections)
    if (problemListSection) sections.push(problemListSection)

    // Visit group
    if (encountersSection) sections.push(encountersSection)
    if (conditionsSection) sections.push(conditionsSection)

    // Reports group
    pushRegistrySection(sections, labReportsSection)
    pushRegistrySection(sections, imagingReportsSection)
    if (proceduresSection) sections.push(proceduresSection)
    pushRegistrySection(sections, orphanObservationsSection)

    // Medication group
    if (medicationsSection) sections.push(medicationsSection)
    if (allergiesSection) sections.push(allergiesSection)
    if (immunizationsSection) sections.push(immunizationsSection)

    return sections
  }, [
    patientSection,
    vitalSignsSections,
    problemListSection,
    encountersSection,
    conditionsSection,
    labReportsSection,
    imagingReportsSection,
    proceduresSection,
    orphanObservationsSection,
    medicationsSection,
    allergiesSection,
    immunizationsSection,
    pushRegistrySection,
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
