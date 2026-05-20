// Shared client-side filter helpers for FHIR query tools.
// Both live (`fhir-tools.ts`) and local-bundle (`local-fhir-tools.ts`)
// tools must apply identical filtering so the LLM sees consistent
// behaviour regardless of data source.

export function isWithinDateRange(
  date: string | undefined,
  dateFrom?: string,
  dateTo?: string,
): boolean {
  if (!date) return false
  if (dateFrom && date < dateFrom) return false
  if (dateTo && date > dateTo + 'T23:59:59') return false
  return true
}

export function matchCategoryCoding(categories: any, target: string | undefined): boolean {
  if (!target) return true
  if (!Array.isArray(categories)) return false
  return categories.some((c: any) =>
    Array.isArray(c?.coding) &&
    c.coding.some((cc: any) => cc?.code === target)
  )
}

export function matchClinicalStatus(clinicalStatus: any, target: string | undefined): boolean {
  if (!target) return true
  const code =
    typeof clinicalStatus === 'string'
      ? clinicalStatus
      : clinicalStatus?.coding?.[0]?.code || clinicalStatus?.text
  return String(code || '').toLowerCase() === target.toLowerCase()
}

export function matchStatus(status: string | undefined, target: string | undefined): boolean {
  if (!target) return true
  return String(status || '').toLowerCase() === target.toLowerCase()
}

export function isChronicByCourseOfTherapy(courseOfTherapyType: any): boolean {
  const coding = courseOfTherapyType?.coding
  if (!Array.isArray(coding)) return false
  return coding.some((c: any) => c?.code === 'continuous')
}

export function matchChronic(courseOfTherapyType: any, chronic: boolean | undefined): boolean {
  if (chronic === undefined) return true
  const isChronic = isChronicByCourseOfTherapy(courseOfTherapyType)
  return chronic ? isChronic : !isChronic
}

export function matchEncounterClass(encounterClass: any, target: string | undefined): boolean {
  if (!target) return true
  const codes = [
    encounterClass?.code,
    encounterClass?.coding?.[0]?.code,
  ].filter(Boolean).map(String)
  return codes.some((c) => c.toLowerCase() === target.toLowerCase())
}

export function matchDiagnosticReportCategory(category: any, target: string | undefined): boolean {
  if (!target) return true
  if (!Array.isArray(category)) return false
  return category.some((c: any) =>
    Array.isArray(c?.coding) &&
    c.coding.some((cc: any) => String(cc?.code || '').toLowerCase() === target.toLowerCase())
  )
}

export function matchAllergyType(type: string | undefined, target: string | undefined): boolean {
  if (!target) return true
  return String(type || '').toLowerCase() === target.toLowerCase()
}
