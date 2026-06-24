// Refactored Clinical Context Hook
"use client"

import { useCallback, useMemo } from "react"
import { useDataSelection, type DataConsumer } from "@/src/application/providers/data-selection.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import { formatClinicalContext } from "./clinical-context/formatters"
import { usePatientContext } from "./clinical-context/usePatientContext"
import { useMedicationsContext } from "./clinical-context/useMedicationsContext"
import { useEncountersContext } from "./clinical-context/useEncountersContext"
import { useAllergiesContext } from "./clinical-context/useAllergiesContext"
import { useProceduresContext } from "./clinical-context/useProceduresContext"
import { useVitalSignsContext } from "./clinical-context/useVitalSignsContext"
import { useImmunizationsContext } from "./clinical-context/useImmunizationsContext"
import { useProblemListContext } from "./clinical-context/useProblemListContext"
import type { ClinicalData } from "./clinical-context/types"
import { dataCategoryRegistry } from "@/src/core/registry/data-category.registry"
import { listClinicalDocuments, resolveSelectedDocuments, formatDocumentsSection } from "@/src/core/utils/clinical-documents.utils"

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

export function useClinicalContext(consumer?: DataConsumer): UseClinicalContextReturn {
  const ds = useDataSelection()
  // Each consumer (chat / insights / ips) reads its own profile. The data-selection
  // panel drives chat + insights together, so the preview (no consumer given)
  // follows the 對話 base.
  const activeConsumer: DataConsumer = consumer ?? 'chat'
  const profile = ds.getProfile(activeConsumer)
  const selectedData = profile.selection
  const filters = profile.filters
  const supplementaryNotes = profile.supplementaryNotes
  const editedClinicalContext = profile.editedClinicalContext
  const { setNotesFor, setEditedContextFor } = ds
  const setSupplementaryNotes = useCallback(
    (notes: string) => setNotesFor(activeConsumer, notes),
    [setNotesFor, activeConsumer],
  )
  const setEditedClinicalContext = useCallback(
    (context: string | null) => setEditedContextFor(activeConsumer, context),
    [setEditedContextFor, activeConsumer],
  )

  const clinicalData = (useClinicalData() as ClinicalData | null) ?? null

  // Hook-driven sections (richer formatting than registry can provide)
  const patientSection = usePatientContext(selectedData.patientInfo ?? false)
  const encountersSection = useEncountersContext(selectedData.encounters ?? false, clinicalData, filters.encounterTimeRange)
  const medicationsSection = useMedicationsContext(selectedData.medications ?? false, clinicalData, filters, selectedData.encounters ?? false)
  const allergiesSection = useAllergiesContext(selectedData.allergies ?? false, clinicalData)
  const proceduresSection = useProceduresContext(selectedData.procedures ?? false, clinicalData, filters, selectedData.encounters ?? false)
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

  const advanceDirectivesSection = useMemo(() => {
    if (!selectedData.advanceDirectives || !clinicalData) return null
    return dataCategoryRegistry.getCategoryContext('advanceDirectives', clinicalData, filters)
  }, [selectedData.advanceDirectives, clinicalData, filters])

  const medicalDevicesSection = useMemo(() => {
    if (!selectedData.medicalDevices || !clinicalData) return null
    return dataCategoryRegistry.getCategoryContext('medicalDevices', clinicalData, filters)
  }, [selectedData.medicalDevices, clinicalData, filters])

  const carePlansSection = useMemo(() => {
    if (!selectedData.carePlans || !clinicalData) return null
    return dataCategoryRegistry.getCategoryContext('carePlans', clinicalData, filters)
  }, [selectedData.carePlans, clinicalData, filters])

  const documentsSection = useMemo(() => {
    if (!selectedData.documents || !clinicalData) return null
    const docs = resolveSelectedDocuments(
      // clinicalData is the full ClinicalDataCollection at runtime (carries
      // compositions + documentReferences); the hook's local type omits them.
      listClinicalDocuments(clinicalData as unknown as Parameters<typeof listClinicalDocuments>[0]),
      profile.documentMode,
      profile.documentIds,
    )
    return formatDocumentsSection(docs)
  }, [selectedData.documents, clinicalData, profile.documentMode, profile.documentIds])

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
    pushRegistrySection(sections, advanceDirectivesSection)
    pushRegistrySection(sections, medicalDevicesSection)
    pushRegistrySection(sections, carePlansSection)

    // Visit group
    if (encountersSection) sections.push(encountersSection)

    // Reports group
    pushRegistrySection(sections, labReportsSection)
    pushRegistrySection(sections, imagingReportsSection)
    if (proceduresSection) sections.push(proceduresSection)

    // Medication group
    if (medicationsSection) sections.push(medicationsSection)
    if (allergiesSection) sections.push(allergiesSection)
    if (immunizationsSection) sections.push(immunizationsSection)

    // Documents group
    pushRegistrySection(sections, documentsSection)

    return sections
  }, [
    patientSection,
    vitalSignsSections,
    problemListSection,
    advanceDirectivesSection,
    medicalDevicesSection,
    carePlansSection,
    encountersSection,
    labReportsSection,
    imagingReportsSection,
    proceduresSection,
    medicationsSection,
    allergiesSection,
    immunizationsSection,
    documentsSection,
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
