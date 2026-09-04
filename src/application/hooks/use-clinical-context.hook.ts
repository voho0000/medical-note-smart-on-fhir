// Refactored Clinical Context Hook
"use client"

import { useCallback, useMemo } from "react"
import {
  useDataSelection,
  type ConsumerProfile,
  type DataConsumer,
} from "@/src/application/providers/data-selection.provider"
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
import { useProblemTimelineContext } from "./clinical-context/useProblemTimelineContext"
import type { ClinicalData } from "./clinical-context/types"
import { dataCategoryRegistry } from "@/src/core/registry/data-category.registry"
import { listClinicalDocuments, resolveSelectedDocuments, formatDocumentsSection } from "@/src/core/utils/clinical-documents.utils"
import type { DocumentTextMode } from "@/src/core/utils/clinical-documents.utils"
import { resolveDocumentTextMode } from "@/src/core/utils/document-text-policy.utils"
import { buildPatientTextLiterals, scrubFreeText } from "@/src/shared/utils/pii-text-scrub"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { buildClinicalContextCoverageSection } from "@/src/core/utils/clinical-context-coverage.utils"
import { useNow } from "@/src/shared/hooks/use-now.hook"
import { filterAiExcludedClinicalDomains } from "@/src/core/utils/ai-clinical-domain-filter.utils"
import { buildClinicalTemporalReferenceSection } from "@/src/core/utils/clinical-temporal-reference.utils"
import { isDemoDataActive } from "@/src/application/hooks/ai-generation/ai-data-source"
import { clinicalNowMs } from "@/src/shared/constants/demo-data.constants"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useRegistryContextCache } from "./clinical-context/use-registry-context-cache"

export type UseClinicalContextReturn = {
  getClinicalContext: () => ClinicalContextSection[]
  formatClinicalContext: (sections: ClinicalContextSection[]) => string
  getFormattedClinicalContext: () => string
  getFullClinicalContext: () => string
  /** Document resource ids actually included in this consumer's AI context. */
  includedDocumentIds: string[]
}

export { ClinicalContextSection }

export interface UseClinicalContextOptions {
  /** Transient model-fit view. The saved Data Selection profile is untouched. */
  profile?: ConsumerProfile
  /** Already-scoped transient FHIR view used by model-aware record
   * prioritization. The normal query result remains untouched. */
  clinicalDataOverride?: ClinicalData | null
  /** Shared maximum for selected document bodies in this generated context. */
  documentTokenBudget?: number
  /**
   * Whether automatically selected documents are sent whole or reduced to
   * their clinically dense sections. Only a REQUEST: a manual ('custom')
   * selection and the AI-handoff consumer always win with full text. The
   * policy table lives in core/utils/document-text-policy.utils.ts.
   */
  documentTextMode?: DocumentTextMode
}

export function useClinicalContext(
  consumer?: DataConsumer,
  options: UseClinicalContextOptions = {},
): UseClinicalContextReturn {
  const ds = useDataSelection()
  // Each consumer (chat / insights / ips) reads its own profile. The main scope
  // editor targets summary/insights and mirrors chat only for stored-profile
  // compatibility; agent chat queries FHIR on demand instead of preloading it.
  const activeConsumer: DataConsumer = consumer ?? 'chat'
  const profile = options.profile ?? ds.getProfile(activeConsumer)
  const selectedData = profile.selection
  const filters = profile.filters
  const { patient } = usePatient()
  const sharedNowMs = useNow()
  const nowMs = isDemoDataActive() ? clinicalNowMs(true) : sharedNowMs
  const { locale } = useLanguage()

  const queriedClinicalData = (useClinicalData() as ClinicalData | null) ?? null
  const sourceClinicalData = options.clinicalDataOverride === undefined
    ? queriedClinicalData
    : options.clinicalDataOverride
  const clinicalData = useMemo(
    () => sourceClinicalData
      ? filterAiExcludedClinicalDomains(sourceClinicalData as any) as ClinicalData
      : null,
    [sourceClinicalData],
  )
  const temporalReferenceSection = useMemo(
    () => clinicalData
      ? buildClinicalTemporalReferenceSection(clinicalData, nowMs)
      : null,
    [clinicalData, nowMs],
  )

  // Hook-driven sections (richer formatting than registry can provide)
  const patientSection = usePatientContext(selectedData.patientInfo ?? false)
  const encountersSection = useEncountersContext(
    selectedData.encounters ?? false,
    clinicalData,
    filters.encounterTimeRange,
    {
      includeMedications: selectedData.medications ?? false,
      includeProcedures: selectedData.procedures ?? false,
      filters,
      nowMs,
    },
  )
  const medicationsSection = useMedicationsContext(
    selectedData.medications ?? false,
    clinicalData,
    filters,
    selectedData.encounters ?? false,
    nowMs,
  )
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

  // The longitudinal claims view of the same problems: one line per ICD-10
  // category with its span, encounter/inpatient counts, and where it is
  // followed. Rendered immediately after the problem list it belongs to.
  const problemTimelineSection = useProblemTimelineContext(
    selectedData.problemList ?? false,
    clinicalData,
  )

  // Registry-driven sections (extensible via dataCategoryRegistry)
  const cachedRegistryContext = useRegistryContextCache(clinicalData, nowMs, locale)

  const labReportsSection = useMemo(() => {
    if (!selectedData.labReports || !clinicalData) return null
    return cachedRegistryContext('labReports', filters)
  }, [selectedData.labReports, clinicalData, filters, cachedRegistryContext])

  const imagingReportsSection = useMemo(() => {
    if (!selectedData.imagingReports || !clinicalData) return null
    return cachedRegistryContext('imagingReports', filters)
  }, [selectedData.imagingReports, clinicalData, filters, cachedRegistryContext])

  const observationsSection = useMemo(() => {
    if (!selectedData.observations || !clinicalData) return null
    return dataCategoryRegistry.getCategoryContext('observations', clinicalData, filters)
  }, [selectedData.observations, clinicalData, filters])

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

  // Decode + HTML-strip every document ONCE per clinicalData load. This is the
  // expensive step (base64 + regex strip per discharge summary). Keeping it out
  // of the per-selection memo below means ticking a document checkbox no
  // longer re-decodes all documents, which lagged the checkbox by seconds.
  // clinicalData is the full ClinicalDataCollection at runtime (carries
  // compositions + documentReferences); the hook's local type omits them.
  const allDocuments = useMemo(
    () =>
      clinicalData && selectedData.documents
        ? listClinicalDocuments(clinicalData as unknown as Parameters<typeof listClinicalDocuments>[0])
        : [],
    [clinicalData, selectedData.documents],
  )

  const selectedDocuments = useMemo(() => {
    if (!selectedData.documents || !clinicalData) return null
    return resolveSelectedDocuments(
      allDocuments,
      profile.documentMode ?? 'deduplicatedAdmissions',
      profile.documentIds,
    )
  }, [selectedData.documents, clinicalData, allDocuments, profile.documentMode, profile.documentIds])
  const documentTextMode: DocumentTextMode = resolveDocumentTextMode(
    activeConsumer,
    profile.documentMode,
    options.documentTextMode,
  )
  const documentsSection = useMemo(
    () => formatDocumentsSection(
      selectedDocuments ?? [],
      options.documentTokenBudget,
      { documentTextMode },
    ),
    [selectedDocuments, options.documentTokenBudget, documentTextMode],
  )
  const includedDocumentIds = useMemo(
    () => (selectedDocuments ?? []).map((document) => document.id),
    [selectedDocuments],
  )
  const coverageSection = useMemo(
    () => buildClinicalContextCoverageSection(
      selectedData,
      filters,
      clinicalData as unknown as Parameters<typeof buildClinicalContextCoverageSection>[2],
      includedDocumentIds,
      nowMs,
    ),
    [selectedData, filters, clinicalData, includedDocumentIds, nowMs],
  )

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

  // SECTION ORDER — safety-critical, compact facts first; bulky free text last.
  //
  // The consumer is an LLM writing a first-visit summary, and one of them is a
  // local model with weaker long-context recall. Anything it must not miss
  // (who the patient is, when the record ends, what they react to, what is
  // wrong with them, what they take) has to be readable before the ~47k tokens
  // of discharge summaries, not buried after them. Every section's INTERNAL
  // format is unchanged; only their order here moved.
  //
  //   1 demographics · 2 temporal reference · 3 allergies · 4 problems
  //   (+ claims timeline) · 5 standing care context · 6 vitals · 7 medications
  //   & immunizations · 8 procedures & admissions · 9 labs · 10 imaging ·
  //   11 documents · 12 retrieval coverage
  const getClinicalContext = useCallback((): ClinicalContextSection[] => {
    const sections: ClinicalContextSection[] = []

    // 1-2. Who, and as of when.
    if (patientSection) sections.push(patientSection)
    if (temporalReferenceSection) sections.push(temporalReferenceSection)

    // 3. Allergies: the single most consequential fact to miss.
    if (allergiesSection) sections.push(allergiesSection)

    // 4. Active problems, then their longitudinal claims timeline.
    if (problemListSection) sections.push(problemListSection)
    if (problemTimelineSection) sections.push(problemTimelineSection)

    // 5. Standing care context that constrains any plan.
    pushRegistrySection(sections, advanceDirectivesSection)
    pushRegistrySection(sections, medicalDevicesSection)
    pushRegistrySection(sections, carePlansSection)

    // 6. Vitals — compact, and read alongside the problem list.
    sections.push(...vitalSignsSections)

    // 7. Medications (current / recently ended / historical) and immunizations.
    if (medicationsSection) sections.push(medicationsSection)
    if (immunizationsSection) sections.push(immunizationsSection)

    // 8. Procedures and the admission/visit chronology they belong to.
    if (proceduresSection) sections.push(proceduresSection)
    if (encountersSection) sections.push(encountersSection)

    // 9-10. Measurements, then imaging impressions.
    pushRegistrySection(sections, labReportsSection)
    pushRegistrySection(sections, observationsSection)
    pushRegistrySection(sections, imagingReportsSection)

    // 11. Bulk free text last.
    pushRegistrySection(sections, documentsSection)

    // 12. Retrieval/coverage metadata: it informs absence semantics without
    // interrupting the clinical narrative above.
    pushRegistrySection(sections, coverageSection)

    return sections
  }, [
    patientSection,
    temporalReferenceSection,
    allergiesSection,
    problemListSection,
    problemTimelineSection,
    advanceDirectivesSection,
    medicalDevicesSection,
    carePlansSection,
    vitalSignsSections,
    medicationsSection,
    immunizationsSection,
    proceduresSection,
    encountersSection,
    labReportsSection,
    observationsSection,
    imagingReportsSection,
    documentsSection,
    coverageSection,
    pushRegistrySection,
  ])

  const getFormattedClinicalContext = useMemo(() => {
    let formatted: string | undefined
    return () => (formatted ??= formatClinicalContext(getClinicalContext()))
  }, [getClinicalContext])

  const getFullClinicalContext = useMemo(() => {
    let masked: string | undefined
    // Outbound-only PII mask (身分證字號, labeled 病歷號/姓名 values): this
    // string goes to cloud LLMs (summary / safety / insights context) —
    // discharge-summary bodies included via 文件 selection are the main carrier.
    // Internal formatted-context consumers stay unmasked.
    return () => (masked ??= scrubFreeText(getFormattedClinicalContext(), buildPatientTextLiterals(patient)))
  }, [getFormattedClinicalContext, patient])

  return {
    getClinicalContext,
    formatClinicalContext,
    getFormattedClinicalContext,
    getFullClinicalContext,
    includedDocumentIds,
  }
}
