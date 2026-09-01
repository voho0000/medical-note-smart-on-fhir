import { localizeDemoOrganizationDisplay } from './demo-display'

/**
 * Return the human-readable institution name from a legacy source display.
 *
 * Newer bundles link to an Organization whose `name` is resolved at the
 * ingestion boundary. Older bundles may only carry the NHI source string in
 * `Reference.display`, for example "臺北榮總;門診;0601160016". The first
 * semicolon-delimited field is the institution name. This identity helper
 * deliberately omits care setting and code; presentation code can add the
 * setting separately without changing organization grouping keys.
 */
export function formatOrganizationDisplay(
  organization: string,
  locale: string = 'zh-TW',
): string {
  const trimmed = organization.trim()
  const [firstSegment] = trimmed.split(/\s*[;；]\s*/, 1)
  const name = firstSegment
    ?.replace(/\s*[,，]\s*\d{6,}\s*$/, '')
    .trim()

  // A code-only fallback is not a human-readable institution name. Leave the
  // label empty instead of exposing the identifier in the clinical row.
  if (!name || /^\d{6,}$/.test(name)) return ''
  return localizeDemoOrganizationDisplay(name, locale)
}

const CARE_SETTING_LABELS: Record<string, { zh: string; en: string }> = {
  outpatient: { zh: '門診', en: 'Outpatient' },
  opd: { zh: '門診', en: 'Outpatient' },
  amb: { zh: '門診', en: 'Outpatient' },
  pharmacy: { zh: '藥局', en: 'Pharmacy' },
  emergency: { zh: '急診', en: 'Emergency' },
  er: { zh: '急診', en: 'Emergency' },
  inpatient: { zh: '住院', en: 'Inpatient' },
  ipd: { zh: '住院', en: 'Inpatient' },
  imp: { zh: '住院', en: 'Inpatient' },
}

function localizedCareSetting(setting: string, locale: string): string {
  const normalized = setting.trim()
  if (!normalized || /^\d{6,}$/.test(normalized)) return ''
  const known = CARE_SETTING_LABELS[normalized.toLowerCase()]
  if (!known) return normalized
  return locale === 'en' ? known.en : known.zh
}

/** Medication-row presentation label: institution name followed by its care
 * setting, while never exposing the organization identifier. The explicit
 * setting comes from current MediCloud extensions; legacy composite displays
 * fall back to their second non-numeric segment. */
export function formatOrganizationContextDisplay(
  organization: string,
  explicitSetting?: string,
  locale: string = 'zh-TW',
): string {
  const name = formatOrganizationDisplay(organization, locale)
  if (!name) return ''

  const legacySetting = organization
    .trim()
    .split(/\s*[;；]\s*/)
    .slice(1)
    .find((segment) => segment.trim() && !/^\d{6,}$/.test(segment.trim()))
  const setting = localizedCareSetting(explicitSetting || legacySetting || '', locale)
  if (!setting || setting === name) return name
  return `${name} ${setting}`
}
