// Grouping Helper Functions
import type { CodeableConcept, ReportGroup } from '../types'

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
        
        // Check for observation-category system (procedure category)
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
