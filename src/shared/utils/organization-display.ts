/**
 * Remove a source-system institution code appended as the final delimited
 * segment while preserving the original FHIR value for matching and audit.
 *
 * Example: "臺北榮總;門診;0601160016" -> "臺北榮總;門診"
 */
export function formatOrganizationDisplay(organization: string): string {
  const withoutTrailingCode = organization.replace(/\s*[;；,，]\s*\d{6,}\s*$/, '').trim()
  return withoutTrailingCode || organization.trim()
}
