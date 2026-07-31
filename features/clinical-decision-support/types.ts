import type { AkiAssessment } from './risk-stratification/aki'

export type CdssLocale = 'zh-TW' | 'en'
export type CdssPriority = 'high' | 'medium' | 'routine'
export type CdssStatus = 'actionable' | 'needs-data' | 'review' | 'no-action'
export type CdssRecommendationKind = 'care-guidance' | 'risk-stratification'
export type CdssDomain =
  | 'diagnosis'
  | 'monitoring'
  | 'medication'
  | 'target'
  | 'complication'
  | 'safety'
  | 'care-gap'
export type CdssKnowledgeSourceId =
  | 'ada-2026'
  | 'taiwan-t2dm-2022'
  | 'taiwan-nhi-diabetes'
  | 'kdigo-ckd-2024'
  | 'kdigo-anemia-2026'
  | 'taiwan-ckd-2025'
  | 'taiwan-hypertension-2022'
  | 'aha-acc-hypertension-2025'
  | 'taiwan-lipid-2022'
  | 'aha-acc-dyslipidemia-2026'
  | 'ukka-hyperkalemia-2023'
  | 'acc-aha-af-2023'
export type CdssKnowledgeSourceKind = 'guideline' | 'coverage'
export type CdssMedicationClassId =
  | 'insulin'
  | 'sulfonylurea'
  | 'sglt2-inhibitor'
  | 'arni'
  | 'hf-evidence-based-beta-blocker'
  | 'loop-diuretic'
  | 'statin'
  | 'ezetimibe'
  | 'pcsk9-inhibitor'
  | 'bempedoic-acid'
  | 'fibrate'
  | 'prescription-omega-3'
  | 'ace-inhibitor-or-arb'
  | 'calcium-channel-blocker'
  | 'thiazide-or-thiazide-like-diuretic'
  | 'beta-blocker'
  | 'nonselective-beta-blocker'
  | 'mineralocorticoid-receptor-antagonist'
  | 'lactulose'
  | 'rifaximin'
  | 'finerenone'
export type CdssMedicationClassState =
  | 'confirmed-current'
  | 'active-order-unconfirmed'
  | 'on-hold'
  | 'historical-record-current-status-unknown'
  | 'not-found'
  | 'uncertain'
export type CdssMedicationAllergyState =
  | 'documented'
  | 'not-found'
export type CdssFreshnessState = 'current' | 'due' | 'overdue' | 'missing'
export type CdssScreeningId =
  | 'retinal-exam'
  | 'neuropathy-exam'
  | 'foot-exam'
  | 'influenza-vaccine'
  | 'covid-vaccine'
  | 'pneumococcal-vaccine'
export type CdssSourceAssessmentStatus =
  | 'recommended'
  | 'consider'
  | 'covered'
  | 'not-covered'
  | 'needs-data'
  | 'no-special-rule'
  | 'not-applicable'
export type DcsiDomainId =
  | 'ophthalmic'
  | 'nephropathy'
  | 'neuropathy'
  | 'cerebrovascular'
  | 'cardiovascular'
  | 'peripheral-vascular'
  | 'metabolic'

export interface CdssDcsiDomainContext {
  score: 0 | 1 | 2
  factKeys: readonly string[]
  basis:
    | 'governed-code'
    | 'governed-lab'
    | 'governed-procedure'
    | 'governed-code-and-lab'
    | 'governed-code-and-procedure'
    | 'clinician-reviewed'
  ruleVersion?: string
  observationWindowDays?: number
  diabetesAttribution?: 'explicit' | 'not-established' | 'clinician-reviewed'
}

export interface CdssCoding {
  system?: string
  code?: string
  display?: string
}

export interface CdssFactSource {
  resourceType:
    | 'Patient'
    | 'Condition'
    | 'Encounter'
    | 'Observation'
    | 'MedicationRequest'
    | 'MedicationStatement'
    | 'AllergyIntolerance'
    | 'Procedure'
    | 'Immunization'
    | 'CarePlan'
  resourceId: string
  date?: string
  status?: string
  value?: number | string
  unit?: string
  coding?: readonly CdssCoding[]
  facility?: string
  sourceSystem?: string
}

export interface CdssFact {
  zh: string
  en: string
  numericValue?: number
  unit?: string
  date?: string
  sources?: readonly CdssFactSource[]
}

export interface CdssUacrReading {
  kind: 'quantitative' | 'semiquantitative' | 'nonquantitative'
  date?: string
  displayValue?: string
  numericValueMgG?: number
  lowerBoundMgG?: number
  zh: string
  en: string
  source?: CdssFactSource
}

export interface CdssFreshnessContext {
  factKey: string
  date?: string
  ageDays?: number
  intervalDays: number
  state: CdssFreshnessState
}

export interface CdssScreeningContext {
  id: CdssScreeningId
  state: CdssFreshnessState
  date?: string
  ageDays?: number
  intervalDays: number
  result?: string
  factKey?: string
  highRisk?: boolean
}

export interface CdssPatientProfile {
  id: string
  profileVersion?: 'dm-cdss-profile-v1' | 'multi-disease-cdss-profile-v2'
  /** ISO timestamp used to interpret laboratory recency reproducibly. */
  evaluatedAt?: string
  /** Governed demographics used by reusable clinical equations. */
  demographics?: {
    sex?: 'male' | 'female' | 'other' | 'unknown'
  }
  /** Clinician-reviewed geriatric context. The adapter leaves this absent
   * unless governed data can establish it; age alone never implies frailty. */
  olderAdultContext?: {
    healthStatus?: 'healthy' | 'complex-intermediate' | 'very-complex-poor-health'
    adlImpairmentCount?: number
    iadlImpairmentCount?: number
    cognitiveStatus?: 'intact' | 'mild-to-moderate-impairment' | 'moderate-to-severe-impairment'
    frailtyStatus?: 'not-frail' | 'prefrail' | 'frail'
    sourceFactKeys?: readonly string[]
  }
  eligibleDiseasePackIds?: readonly string[]
  diseasePackEligibility?: Readonly<Record<string, {
    basis:
      | 'condition'
      | 'encounter_diagnosis'
      | 'hba1c_diagnostic_range'
      | 'care_plan'
      | 'chronic_labs'
      | 'ldl_severe_range'
      | 'triglyceride_severe_range'
    resourceType: 'Condition' | 'Encounter' | 'Observation' | 'CarePlan'
    resourceId?: string
    codingSystem: string
    code: string
  }>>
  facts: Readonly<Record<string, CdssFact>>
  medicationContexts?: Readonly<Record<string, {
    sourceResourceType: 'MedicationRequest' | 'MedicationStatement'
    status?: string
    useState: 'confirmed_current' | 'active_order_unconfirmed' | 'not_current' | 'unknown'
  }>>
  medicationClassContexts?: Partial<Readonly<Record<CdssMedicationClassId, {
    state: CdssMedicationClassState
    medicationNames: readonly string[]
    factKey: string
    lastPrescriptionDate?: string
    dataWindowStartDate?: string
    dataWindowEndDate?: string
    allergyState?: CdssMedicationAllergyState
    allergyNames?: readonly string[]
    allergyFactKey?: string
  }>>>
  observationContexts?: Readonly<Record<string, {
    useState: 'quantitative_comparable' | 'not_quantitative_comparable'
    readings?: readonly CdssUacrReading[]
    latestReading?: CdssUacrReading
    latestQuantitativeReading?: CdssUacrReading
  }>>
  freshnessContexts?: Readonly<Record<string, CdssFreshnessContext>>
  screeningContexts?: Partial<Readonly<Record<CdssScreeningId, CdssScreeningContext>>>
  coverageContexts?: {
    taiwanNhiSglt2?: {
      product: 'dapagliflozin'
      prescriptionDate?: string
      /** Explicitly confirmed start date; absent when the available history is left-censored. */
      confirmedTreatmentStartDate?: string
      /** Earliest visible prescription in the available data window; never treated as the true start date. */
      earliestObservedPrescriptionDate?: string
      dailyUnits?: number
      claimIndicationCodes: readonly string[]
      claimIndicationTexts: readonly string[]
      indicationRoute: 'ckd' | 't2dm' | 'heart-failure' | 'unknown'
      ckdCareProgramTitle?: string
    }
  }
  /**
   * Creatinine-only AKI signal derived from governed FHIR Observations.
   * Urine output, dialysis, etiology, and the clinical diagnosis remain outside
   * this automated context and must be verified in the complete chart.
   */
  akiAssessment?: AkiAssessment<CdssFactSource>
  dcsiDomainContexts?: Partial<Readonly<Record<DcsiDomainId, CdssDcsiDomainContext>>>
}

export interface GuidelineCitedStatement {
  label: string
  /** Original-language wording reproduced from the cited source. */
  text: string
}

export interface GuidelineReference {
  id: string
  title: string
  publisher: string
  version: string
  url: string
  /** The URL itself opens the exact recommendation even when no PDF page is available. */
  directLink?: boolean
  recommendationId?: string
  evidenceGrade?: string
  page?: number
  printedPage?: string
  locator?: string
  summary: string
  /** Original-language wording for only the statements cited by this decision card. */
  citedStatements?: readonly GuidelineCitedStatement[]
}

export interface CdssKnowledgePackMetadata {
  id: CdssKnowledgeSourceId
  kind: CdssKnowledgeSourceKind
  label: string
  version: string
  effectiveFrom: string
}

export interface CdssSourceAssessment {
  sourceId: CdssKnowledgeSourceId
  sourceKind: CdssKnowledgeSourceKind
  sourceLabel: string
  version: string
  effectiveFrom: string
  status: CdssSourceAssessmentStatus
  summary: string
  verifiedData?: readonly string[]
  missingData?: readonly string[]
  references: readonly GuidelineReference[]
}

export interface ClinicalEvidence {
  label: string
  value: string
  factKeys: readonly string[]
  sources?: readonly CdssFactSource[]
}

export interface CdssRecommendation {
  id: string
  kind?: CdssRecommendationKind
  domain: CdssDomain
  priority: CdssPriority
  status: CdssStatus
  overviewEvidenceFactKey?: string
  title: string
  recommendation: string
  rationale: string
  /** Hide generic narrative when the overview, evidence, and next actions already carry the decision. */
  hideNarrative?: boolean
  patientEvidence: readonly ClinicalEvidence[]
  missingData?: readonly string[]
  nextActions: readonly string[]
  guidelineReferences: readonly GuidelineReference[]
  sourceAssessments?: readonly CdssSourceAssessment[]
  safetyBoundary: string
  /** Optional structured detail rendered by a specialized, pluggable module. */
  dcsi?: DcsiSummary
}

export interface CdssAutomatedCheck {
  id: string
  label: string
  value: string
  factKeys?: readonly string[]
  sources?: readonly CdssFactSource[]
  /** Preserve the completed module so the UI can keep it in the main module list. */
  recommendation?: CdssRecommendation
  /** Position in the pack's sorted module list before completed modules are separated. */
  displayOrder?: number
}

export interface CdssClinicalHandoff {
  kind: 'nephrology-consult'
  title: string
  summary: string
  copyLabel: string
  copiedLabel: string
  copyText: string
  safetyNote: string
}

export interface DcsiDomainAssessment {
  id: DcsiDomainId
  label: string
  maxScore: 1 | 2
  scoreCriteria: readonly {
    score: 1 | 2
    summary: string
  }[]
  score: 0 | 1 | 2 | null
  evidence: readonly ClinicalEvidence[]
  state: 'assessed' | 'not-evaluable'
}

export interface DcsiSummary {
  method: 'updated-dcsi-icd10'
  minimumScore: number
  maximumScore: 13
  assessedDomainCount: number
  totalDomainCount: 7
  isComplete: boolean
  headline: string
  interpretation: string
  domains: readonly DcsiDomainAssessment[]
  limitations: readonly string[]
  evidenceReferences: readonly GuidelineReference[]
}

export interface CdssResult {
  title: string
  summary: string
  packId: string
  packVersion: string
  knowledgePacks?: readonly CdssKnowledgePackMetadata[]
  recommendations: readonly CdssRecommendation[]
  automatedChecks?: readonly CdssAutomatedCheck[]
  clinicalHandoff?: CdssClinicalHandoff
  notEvaluated: readonly string[]
  disclaimer: string
}

export interface CdssClinicalModule {
  id: string
  enabled: boolean
  build(input: {
    profile: CdssPatientProfile
    locale: CdssLocale
  }): CdssRecommendation | undefined
}

export interface CdssKnowledgePack {
  metadata(locale: CdssLocale): CdssKnowledgePackMetadata
  enabled: boolean
  assess(input: {
    profile: CdssPatientProfile
    recommendation: CdssRecommendation
    locale: CdssLocale
  }): CdssSourceAssessment
}

export interface ClinicalGuidelinePack {
  id: string
  diseaseCode: string
  version: string
  enabled: boolean
  label: { zh: string; en: string }
  applies(profile: CdssPatientProfile): boolean
  build(input: { profile: CdssPatientProfile; locale: CdssLocale }): CdssResult
}
