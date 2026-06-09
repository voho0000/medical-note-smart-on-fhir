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
  /**
   * Originating FHIR resource type. 'MedicationRequest' = 醫師處方/健保開立紀錄
   * (bridge default); 'MedicationStatement' = 病人目前服用中的藥物清單 (IPS
   * default). Drives the source hint shown in MedListCard; not part of the
   * raw FHIR shape, hence the underscore prefix.
   */
  _sourceResourceType?: 'MedicationRequest' | 'MedicationStatement'
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
  // Bridge v0.14.0+ inlines imaging (健保存摺 X-ray / ECG …) as base64 in
  // `data` (JPEG, ~2-3 MB each). `data` carries NO `data:<mime>;base64,` prefix.
  // Never eager-decode (a multi-image bundle can exceed 100 MB); UI decodes to a
  // Blob URL only on demand. On the local-bundle import path the base64 is moved
  // to an off-heap IndexedDB Blob and `data` is replaced by `_imageRef` (the Blob
  // key) — see LocalBundleService.extractAndStoreImages.
  presentedForm?: Array<{ title?: string; contentType?: string; data?: string; size?: number; _imageRef?: string }>
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
  // Bridge populates each entry with the diagnosis in BOTH `text` (zh-TW
  // — usually "<ICD> 中文") and `coding[].display` (en); the documents card
  // picks one based on UI locale to surface the primary diagnosis line.
  reasonCode?: Array<{
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
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

/**
 * FHIR R4 Consent — advance directives / 預立醫療決定.
 *
 * IPS "Advance Directives" section. 健保存摺 surfaces 安寧緩和醫療意願
 * (palliative/DNR), 器官捐贈意願 (organ donation) and 病人自主權利法
 * 預立醫療決定 (AD per Patient Right to Autonomy Act). Bridge work to emit
 * these is in progress — these fields follow the standard R4 shape and will
 * be locked against real bridge samples once they land.
 */
export interface ConsentEntity {
  id: string
  status?: string
  scope?: {
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
  dateTime?: string
  /**
   * Consent.provision — `type` is 'deny' | 'permit'. A deny provision
   * (e.g. DNR / refuse CPR) is the clinically load-bearing case and is
   * surfaced with an amber accent in the UI.
   */
  provision?: {
    type?: string
    period?: {
      start?: string
      end?: string
    }
  }
  sourceAttachment?: {
    contentType?: string
    title?: string
    url?: string
  }
  organization?: Array<{
    display?: string
    reference?: string
  }>
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

/**
 * FHIR R4 Device — implants / durable medical equipment.
 *
 * IPS "Medical Devices" section. 健保存摺 surfaces 植入物 (implants such as
 * 心臟節律器, 人工關節, 支架). Implant date is typically carried on a related
 * Procedure rather than the Device itself, so the card joins on date when
 * available. Field shape follows standard R4 pending bridge samples.
 */
export interface DeviceEntity {
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
  manufacturer?: string
  modelNumber?: string
  serialNumber?: string
  udiCarrier?: Array<{
    deviceIdentifier?: string
    carrierHRF?: string
  }>
  deviceName?: Array<{
    name?: string
    type?: string
  }>
  manufactureDate?: string
  expirationDate?: string
  owner?: {
    display?: string
    reference?: string
  }
  note?: Array<{ text?: string }>
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

/**
 * FHIR R4 CarePlan — plan of care / 照護計畫.
 *
 * IPS "Plan of Care" section. 健保存摺 surfaces 個案管理照護計畫 such as
 * 糖尿病共同照護, 居家醫療整合照護. Status drives the badge (進行中 / 已完成
 * / 已取消). `activity` holds the discrete plan items; `addresses` links the
 * conditions the plan targets. Field shape follows standard R4 pending bridge
 * samples.
 */
export interface CarePlanEntity {
  id: string
  status?: string
  intent?: string
  category?: Array<{
    text?: string
    coding?: Array<{
      code?: string
      display?: string
      system?: string
    }>
  }>
  title?: string
  description?: string
  period?: {
    start?: string
    end?: string
  }
  created?: string
  addresses?: Array<{
    display?: string
    reference?: string
  }>
  activity?: Array<{
    detail?: {
      kind?: string
      code?: {
        text?: string
        coding?: Array<{
          code?: string
          display?: string
        }>
      }
      status?: string
      description?: string
      scheduledString?: string
    }
    outcomeCodeableConcept?: Array<{
      text?: string
      coding?: Array<{
        code?: string
        display?: string
      }>
    }>
  }>
  note?: Array<{ text?: string }>
  author?: {
    display?: string
    reference?: string
  }
  // Multi-hospital support
  sourceSystem?: string
  sourceId?: string
}

/**
 * The full set of clinical resources loaded for one patient.
 *
 * OBSERVATION SUPERSET INVARIANT — read before adding any feature that lists
 * observations:
 *   `observations` is the COMPLETE set of every Observation for the patient.
 *   `vitalSigns` and each DiagnosticReport's members (referenced via
 *   `report.result[].reference` and/or re-attached as `report._observations`)
 *   are NOT independent collections — they are SUBSETS of `observations`,
 *   re-listed by the same resource id. This is standard FHIR behaviour
 *   (`Observation?patient=X` must return report members and vitals too), so it
 *   holds for both data sources (SMART repository and local-bundle import).
 *
 * Consequence: iterating `observations` directly will double-count anything
 * already shown inside a report or in the vitals section. To list "standalone"
 * observations, do NOT hand-roll the dedup — use the shared selectors in
 * `src/core/utils/observation-selectors.ts`, which are the single source of
 * truth for "is this a report member?" and "is this a vital?". Re-deriving
 * those rules per-feature is exactly what produced duplicate / mislabeled rows.
 */
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
  consents: ConsentEntity[]
  devices: DeviceEntity[]
  carePlans: CarePlanEntity[]
}
