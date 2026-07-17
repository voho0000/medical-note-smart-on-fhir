import { CLOUD_SMART_CONFIG } from '@/src/shared/config/cloud-smart.config'

export interface SmartIssuerPolicyOptions {
  configuredIssuers?: string
  defaultTrustedOrigins?: readonly string[]
}

function normalizedOrigins(values: readonly string[]): Set<string> {
  const origins = new Set<string>()
  for (const value of values) {
    try {
      origins.add(new URL(value.trim()).origin)
    } catch {
      // Invalid configured entries never widen trust.
    }
  }
  return origins
}

export function isTrustedSmartIssuer(
  issuer: string,
  options: SmartIssuerPolicyOptions = {},
): boolean {
  const configured = (options.configuredIssuers
    ?? process.env.NEXT_PUBLIC_SMART_ALLOWED_ISS
    ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const trusted = normalizedOrigins([
    ...(options.defaultTrustedOrigins ?? CLOUD_SMART_CONFIG.trustedIssuerOrigins),
    ...configured,
  ])

  try {
    const url = new URL(issuer)
    if (trusted.has(url.origin)) return true
    // An explicit http://localhost entry intentionally covers any dev port.
    return (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      && trusted.has(`${url.protocol}//${url.hostname}`)
    )
  } catch {
    return false
  }
}
