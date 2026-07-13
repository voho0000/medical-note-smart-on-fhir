import type { Audience } from '@/src/application/providers/audience.provider'
import type { Locale } from '@/src/shared/i18n/i18n.config'

/**
 * Content-bound slot identity. A summary can be reused only when the patient,
 * audience, locale, model and selected clinical input are all identical.
 */
export function patientAiSlotKey(input: {
  patientId: string
  audience: Audience
  locale: Locale
  modelId: string
  inputSignature: string
}): string {
  if (!input.patientId || !input.inputSignature) return ''
  return [
    input.patientId,
    input.audience,
    input.locale,
    input.modelId,
    `ctx-${input.inputSignature}`,
  ].join('::')
}
