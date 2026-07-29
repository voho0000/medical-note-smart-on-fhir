// Grouping Helper Functions
// (audit C3 — formerly under features/clinical-summary/reports; core's
// category definitions and observation selectors need these too)
interface CodeableConcept {
  coding?: Array<{ system?: string; code?: string; display?: string }>
  text?: string
}

interface DiagnosticReportLike {
  category?: CodeableConcept | CodeableConcept[]
  code?: CodeableConcept
  imagingStudy?: Array<{ reference?: string }>
}

export type ReportGroup = 'lab' | 'imaging' | 'procedures' | 'vitals' | 'other'

// 健康存摺 SDK r8 does not provide DiagnosticReport.category or ImagingStudy.
// Its NHI order code and title are therefore the only safe classification
// signals. Keep these rules deliberately narrow: never inspect the report
// conclusion, because a non-imaging report may mention a prior X-ray/CT.
const NHI_IMAGING_ORDER_CODE = /^(?:32|33)\d{3}[A-Z]$/i
const NHI_IMAGING_ORDER_CODES = new Set([
  '18005C', // Echocardiography
  '18007C', // Color Doppler echocardiography
  '19005C', // Ultrasonography, other
  '19009C', // Abdominal ultrasonography
  '21010C', // Bladder ultrasonography
])
const IMAGING_ORDER_TITLE_PATTERNS = [
  /\bx[\s-]?ray\b/i,
  /\bradiograph(?:y|ic)?\b/i,
  /\bcomputed tomography\b/i,
  /\bct(?:\s+scan|\s+(?:chest|brain|head|neck|abdomen|pelvis|spine))\b/i,
  /\bmagnetic resonance\b/i,
  /\bmri?\b/i,
  /\bultrasound\b/i,
  /\bultrasonograph(?:y|ic)?\b/i,
  /\bsonograph(?:y|ic)?\b/i,
  /\bmammograph(?:y|ic)?\b/i,
  /\bpet(?:\s*[-/]?\s*ct|\s+scan)\b/i,
  /[XＸ]光/,
  /放射(?:線|學)|影像醫學/,
  /電腦斷層|磁振|核磁共振/,
  /超音波|超聲波/,
  /乳房攝影|核子醫學|正子造影/,
]

function collectCategoryTokens(input?: CodeableConcept | CodeableConcept[]): Set<string> {
  const concepts = Array.isArray(input) ? input : input ? [input] : []
  const tokens = new Set<string>()
  for (const concept of concepts) {
    if (concept?.text) tokens.add(concept.text.toLowerCase())
    concept?.coding?.forEach((coding: any) => {
      if (coding?.code) tokens.add(coding.code.toLowerCase())
      if (coding?.display) tokens.add(coding.display.toLowerCase())
      if (coding?.system) tokens.add(coding.system.toLowerCase())
    })
  }
  return tokens
}

export function inferGroupFromCategory(category?: CodeableConcept | CodeableConcept[]): ReportGroup {
  const concepts = Array.isArray(category) ? category : category ? [category] : []
  
  // First, check for FHIR standard codes
  for (const concept of concepts) {
    if (concept?.coding) {
      for (const coding of concept.coding) {
        const system = coding.system?.toLowerCase() || ''
        const code = coding.code?.toLowerCase() || ''
        
        // Check for observation-category system
        if (system.includes('observation-category')) {
          if (code === 'procedure') {
            return 'procedures'
          }
          if (code === 'laboratory') {
            return 'lab'
          }
          if (code === 'imaging') {
            return 'imaging'
          }
          if (code === 'vital-signs') {
            return 'vitals'
          }
        }
        
        // Check v2-0074 Diagnostic Service Section ID
        if (system.includes('v2-0074')) {
          if (code === 'lab' || code === 'hm' || code === 'ch' || code === 'mb') {
            return 'lab'
          }
          if (code === 'rad' || code === 'img' || code === 'ct' || code === 'mr' || code === 'us') {
            return 'imaging'
          }
        }
        
        // Check SNOMED CT codes
        if (system.includes('snomed')) {
          // Common SNOMED codes for imaging
          if (['363679005', '77477000', '363680008'].includes(code)) {
            return 'imaging'
          }
          // Common SNOMED codes for laboratory
          if (['15220000', '108252007'].includes(code)) {
            return 'lab'
          }
        }
        
        // Check LOINC system
        if (system.includes('loinc')) {
          const display = coding.display?.toLowerCase() || ''
          if (display.includes('radiology') || display.includes('imaging')) {
            return 'imaging'
          }
          if (display.includes('laboratory') || display.includes('lab')) {
            return 'lab'
          }
        }
      }
    }
  }
  
  // Fallback to keyword matching (case-insensitive)
  const tokens = collectCategoryTokens(category)
  const tokenArray = Array.from(tokens)
  
  if (tokenArray.some((token) => token === "procedure")) {
    return "procedures"
  }
  
  if (tokenArray.some((token) => 
    token.includes("vital") || 
    token === "vital-signs"
  )) {
    return "vitals"
  }
  
  if (tokenArray.some((token) => 
    token.includes("lab") || 
    token.includes("laboratory") || 
    token.includes("chemistry") || 
    token.includes("hematology")
  )) {
    return "lab"
  }
  
  if (tokenArray.some((token) => 
    token.includes("img") || 
    token.includes("imaging") || 
    token.includes("radiology") || 
    token.includes("ct") || 
    token.includes("mri") || 
    token.includes("x-ray") || 
    token.includes("ultrasound")
  )) {
    return "imaging"
  }
  
  return "other"
}

/**
 * Classify a DiagnosticReport using its explicit FHIR category first, then
 * linked ImagingStudy metadata, and finally narrow NHI code/title rules for
 * category-less Health Bank SDK r8 reports.
 */
export function inferGroupFromDiagnosticReport(report?: DiagnosticReportLike | null): ReportGroup {
  if (!report) return 'other'

  const categoryGroup = inferGroupFromCategory(report.category)
  if (categoryGroup !== 'other') return categoryGroup
  if ((report.imagingStudy?.length ?? 0) > 0) return 'imaging'

  const codings = report.code?.coding ?? []
  const orderCodes = codings
    .map((coding) => coding.code?.trim().toUpperCase())
    .filter((code): code is string => !!code)
  if (orderCodes.some((code) =>
    NHI_IMAGING_ORDER_CODE.test(code) || NHI_IMAGING_ORDER_CODES.has(code),
  )) {
    return 'imaging'
  }

  const orderTitle = [
    report.code?.text,
    ...codings.map((coding) => coding.display),
  ].filter((value): value is string => !!value).join(' ')
  if (IMAGING_ORDER_TITLE_PATTERNS.some((pattern) => pattern.test(orderTitle))) {
    return 'imaging'
  }

  return 'other'
}

export function inferGroupFromObservation(observation: any): ReportGroup {
  if (!observation) return "other"
  const group = inferGroupFromCategory(observation.category)
  if (group !== "other") return group
  
  const codeText = (observation.code?.text || observation.code?.coding?.[0]?.display || "").toLowerCase()
  if (codeText.includes("x-ray") || codeText.includes("ct") || codeText.includes("mri") || codeText.includes("ultrasound")) {
    return "imaging"
  }
  if (codeText.includes("lab") || codeText.includes("panel") || codeText.includes("blood")) {
    return "lab"
  }
  return "other"
}
