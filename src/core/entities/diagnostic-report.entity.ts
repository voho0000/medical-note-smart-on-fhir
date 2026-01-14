// Domain Entity: Diagnostic Report
// Independent of FHIR or any specific data source format

export interface DiagnosticReportEntity {
  id: string
  code: string
  displayName: string
  category?: string[]
  status: string
  effectiveDate?: Date
  issuedDate?: Date
  
  // Report content
  conclusion?: string
  conclusionCodes?: string[]
  
  // Related observations
  observationIds?: string[]
  
  // Additional metadata
  notes?: string[]
  presentedForms?: ReportForm[]
  
  // Source tracking
  sourceSystem?: string
  sourceId?: string
}

export interface ReportForm {
  contentType: string
  title?: string
  data?: string // Base64 encoded or URL
}
