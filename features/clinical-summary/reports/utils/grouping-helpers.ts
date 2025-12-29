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
  const tokens = collectCategoryTokens(category)
  const tokenArray = Array.from(tokens)
  
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
