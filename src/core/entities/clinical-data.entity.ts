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
  clinicalStatus?: string
  verificationStatus?: string
  recordedDate?: string
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
  }>
  period?: {
    start?: string
    end?: string
  }
  reasonCode?: Array<{
    text?: string
  }>
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
}
