// Core Domain Entities: Clinical Data

export interface ConditionEntity {
  id: string
  code?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  category?: Array<{
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }>
  clinicalStatus?: string
  verificationStatus?: string
  recordedDate?: string
  onsetDateTime?: string
  encounter?: {
    reference?: string
  }
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

export interface MedicationEntity {
  id: string
  medicationCodeableConcept?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  status?: string
  intent?: string
  authoredOn?: string
  dosageInstruction?: Array<{
    text?: string
    route?: {
      text?: string
    }
    timing?: {
      repeat?: {
        frequency?: number
        period?: number
        periodUnit?: string
      }
    }
    doseAndRate?: Array<{
      doseQuantity?: {
        value?: number
        unit?: string
      }
    }>
  }>
  encounter?: {
    reference?: string
  }
  dispenseRequest?: any
  /**
   * FHIR R4 MedicationRequest.courseOfTherapyType — distinguishes acute vs
   * continuous (chronic refill) therapy. NHI-FHIR-Bridge v0.6.10+ populates
   * this with coding[].code === 'continuous' for 慢性處方箋. Absent for acute.
   */
  courseOfTherapyType?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  /**
   * FHIR R4 MedicationRequest.category — drug class / therapeutic group.
   * Bridge v0.6.10+ sends Chinese in `text` (e.g. "降血壓藥") and English
   * in `coding[].display` (e.g. "HYPOTENSIVE AGENTS").
   */
  category?: Array<{
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }>
  /**
   * FHIR R4 MedicationRequest.requester — prescribing clinic / dispensing
   * pharmacy. The bridge writes the institution short name into
   * `requester.display` (e.g. "益安大藥局").
   */
  requester?: {
    display?: string
    reference?: string
  }
  /**
   * FHIR R4 MedicationRequest.reasonCode — billing ICD-10 attached to the
   * prescription. NOT a confirmed clinical diagnosis (see billingIcdTooltip).
   */
  reasonCode?: Array<{
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }>
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

export interface AllergyEntity {
  id: string
  code?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  clinicalStatus?: string
  verificationStatus?: string
  criticality?: string
  reaction?: Array<{
    manifestation?: Array<{
      text?: string
    }>
    severity?: string
  }>
  recordedDate?: string
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

export interface ObservationEntity {
  id?: string
  resourceType?: string
  code?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  valueQuantity?: {
    value?: number
    unit?: string
  }
  valueString?: string
  valueCodeableConcept?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  interpretation?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  referenceRange?: Array<{
    low?: {
      value?: number
      unit?: string
    }
    high?: {
      value?: number
      unit?: string
    }
    text?: string
  }>
  component?: Array<{
    code?: {
      text?: string
      coding?: Array<{
        code?: string
        display?: string
        system?: string
      }>
    }
    valueQuantity?: {
      value?: number
      unit?: string
    }
    valueString?: string
    interpretation?: {
      text?: string
      coding?: Array<{
        code?: string
        display?: string
      }>
    }
    referenceRange?: Array<{
      low?: {
        value?: number
        unit?: string
      }
      high?: {
        value?: number
        unit?: string
      }
      text?: string
    }>
  }>
  hasMember?: Array<{
    reference?: string
  }>
  effectiveDateTime?: string
  status?: string
  category?: Array<{
    coding?: Array<{
      code?: string
      system?: string
      display?: string
    }>
    text?: string
  }>
  encounter?: {
    reference?: string
  }
  performer?: Array<{ display?: string; reference?: string }>
  // Specimen routing signal (set by NHI-FHIR-Bridge based on the NHI 醫令碼).
  // categorizeObservation uses this as the authoritative blood vs urine
  // boundary; missing this field caused blood-typing / antibody / antigen
  // tests to mis-route to urinalysis via Pass 6 qualitative fallback.
  specimen?: {
    display?: string
    reference?: string
  }
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

export interface DiagnosticReportEntity {
  id: string
  code?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
    }>
  }
  result?: Array<{
    reference?: string
  }>
  conclusion?: string
  effectiveDateTime?: string
  _observations?: ObservationEntity[]
  status?: string
  issued?: string
  category?: any
  conclusionCode?: any
  note?: Array<{ text?: string }>
  presentedForm?: Array<{ title?: string; contentType?: string }>
  encounter?: {
    reference?: string
  }
  performer?: Array<{ display?: string; reference?: string }>
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

export interface ProcedureEntity {
  id: string
  code?: {
    text?: string
    coding?: Array<{
      display?: string
    }>
  }
  status?: string
  performedDateTime?: string
  performedPeriod?: {
    start?: string
    end?: string
  }
  encounter?: {
    reference?: string
  }
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

export interface EncounterEntity {
  id: string
  status?: string
  class?: {
    code?: string
    display?: string
  }
  type?: Array<{
    text?: string
    coding?: Array<{ code?: string; display?: string; system?: string }>
  }>
  serviceType?: { coding?: Array<{ display?: string }> }
  period?: {
    start?: string
    end?: string
  }
  reasonCode?: Array<{
    text?: string
  }>
  reasonReference?: Array<{ display?: string }>
  diagnosis?: Array<{
    rank?: number
    condition?: { display?: string }
  }>
  participant?: Array<{
    individual?: { display?: string }
    actor?: { display?: string }
  }>
  location?: Array<{
    location?: { display?: string }
  }>
  serviceProvider?: { display?: string }
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

export interface DocumentReferenceEntity {
  id: string
  status?: string
  type?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  category?: Array<{
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }>
  subject?: {
    reference?: string
  }
  date?: string
  author?: Array<{
    display?: string
    reference?: string
  }>
  description?: string
  content?: Array<{
    attachment?: {
      contentType?: string
      data?: string
      url?: string
      title?: string
      size?: number
    }
  }>
  context?: {
    encounter?: Array<{
      reference?: string
    }>
    period?: {
      start?: string
      end?: string
    }
  }
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

export interface CompositionEntity {
  id: string
  status?: string
  type?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  category?: Array<{
    text?: string
    coding?: Array<{
      code?: string
      display?: string
    }>
  }>
  subject?: {
    reference?: string
  }
  encounter?: {
    reference?: string
  }
  date?: string
  author?: Array<{
    display?: string
    reference?: string
  }>
  title?: string
  section?: Array<{
    title?: string
    code?: {
      text?: string
      coding?: Array<{
        code?: string
        display?: string
      }>
    }
    text?: {
      status?: string
      div?: string
    }
    entry?: Array<{
      reference?: string
    }>
  }>
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

/**
 * FHIR R4 Immunization — vaccination records.
 *
 * Bridge v0.7.x+ ships these alongside MedicationRequest so therapeutic
 * vaccine prescriptions (e.g. tetanus shot for a wound, billed via NHI)
 * stay in the medication list, while genuine preventive-care vaccinations
 * from 疾病管制署 (CDC) surface here.
 */
export interface ImmunizationEntity {
  id: string
  status?: string
  vaccineCode?: {
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }
  occurrenceDateTime?: string
  performer?: Array<{
    actor?: {
      display?: string
      reference?: string
    }
  }>
  note?: Array<{ text?: string }>
  manufacturer?: { display?: string }
  lotNumber?: string
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

export interface ClinicalDataCollection {
  conditions: ConditionEntity[]
  medications: MedicationEntity[]
  allergies: AllergyEntity[]
  observations: ObservationEntity[]
  vitalSigns: ObservationEntity[]
  diagnosticReports: DiagnosticReportEntity[]
  procedures: ProcedureEntity[]
  encounters: EncounterEntity[]
  documentReferences: DocumentReferenceEntity[]
  compositions: CompositionEntity[]
  immunizations: ImmunizationEntity[]
}
