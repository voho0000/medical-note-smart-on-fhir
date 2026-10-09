import { FHIR_SYSTEM_FRAGMENTS } from '@/src/shared/constants/fhir-systems.constants'

// NHI 醫令 codes arrive under more than one system URI. NHI-FHIR-Bridge (健保
// 存摺) writes `…/CodeSystem/nhi-medical-order-code`; the 雲端病歷 (MediCloud)
// bridge rewrites the same code to TW Core's `…/medical-service-payment-tw`;
// older cached bundles use `urn:oid:nhi.lab.code` or `…/nhi-lab-code`. Every
// reader of the order code goes through this one list so a new bridge system
// cannot again be recognised in one place and silently ignored in another.
export const NHI_ORDER_SYSTEM_FRAGMENTS = [
  FHIR_SYSTEM_FRAGMENTS.NHI_MEDICAL_ORDER_CODE,
  'medical-service-payment-tw',
  'nhi-lab-code',
  'nhi.lab.code',
] as const

/** True when `system` is an NHI 醫令 code system, whichever bridge wrote it. */
export function isNhiOrderCodeSystem(system: unknown): boolean {
  if (typeof system !== 'string') return false
  const normalized = system.trim().toLowerCase()
  return NHI_ORDER_SYSTEM_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

/** The first coding (with a code) whose system is an NHI 醫令 code system. */
export function findNhiOrderCoding<T extends { system?: unknown; code?: unknown }>(
  codings: readonly T[] | null | undefined,
): T | undefined {
  if (!Array.isArray(codings)) return undefined
  return codings.find((c) => isNhiOrderCodeSystem(c?.system) && typeof c?.code === 'string' && !!c.code.trim())
}

/** The observation's NHI 醫令 code (trimmed, upper case), whichever bridge wrote it. */
export function nhiOrderCode(obs: any): string | null {
  const coding = findNhiOrderCoding<any>(obs?.code?.coding)
  return coding ? String(coding.code).trim().toUpperCase() : null
}
