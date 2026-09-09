/**
 * The structured-question contract, declared here because the pilot overlay
 * cannot deliver it from the package.
 *
 * The HMC preview builds `@voho0000/personalized-care` by overlaying the
 * pilot's compiled modules onto the published package, keeping the published
 * copy of its cross-disease entry points — `index.*`, `types.*`, `registry.*`,
 * `clinical-module-catalog.*`, `clinical-modules/evidence-tables.*`,
 * `guideline-packs/bundled.*` and `knowledge-packs/registry.*` — so the other
 * disease packs the app still ships keep working. The same list is applied by
 * `sync-packs.ps1` locally and by `deploy-hmc-preview.yml` in CI.
 *
 * The consequence is exact: an overlaid module's **behaviour** reaches the app,
 * but a **type or export the pilot added** does not, because the declarations
 * come from the published baseline. `heart-failure-pack.js` is overlaid and
 * emits `physicianInputRequests` on its recommendations; the baseline
 * `types.d.ts` has never heard of the field.
 *
 * So the host declares the shape it reads and the term ids it writes, and
 * validates what actually arrives. The precedent is `apply-clinic-vitals.ts`,
 * which names the congestion term ids (`pitting-edema`, `orthopnea`, …) the
 * same way. What stays with the pack is what matters clinically: every label
 * on screen is the pack's own wording, carried inside the recommendation.
 *
 * **Delete this file** when `@voho0000/personalized-care` is published with
 * `CdssPhysicianInputRequest` in its types, and import from the package.
 */
import type { CdssRecommendation } from './types'

/** Mirrors `CdssPhysicianInputRequestKind` in the pack. */
export type PhysicianInputRequestKind =
  /** DP-00: whether this clinician suspects heart failure at all. */
  | 'hf-suspicion'
  /** DP-00: which HF symptoms and signs were seen in the room. */
  | 'hf-symptoms'
  | 'lvef-phenotype'
  | 'hfpef-diagnosis-confirmation'

export interface PhysicianInputOption {
  id: string
  label: string
  /** Set where the choice invites a value, such as an LVEF and its study date. */
  valueLabel?: string
}

export interface PhysicianInputRequest {
  kind: PhysicianInputRequestKind
  label: string
  options?: readonly PhysicianInputOption[]
  /** `multiple` renders checkboxes; anything else is one exclusive answer. */
  selection?: 'single' | 'multiple'
}

/**
 * The canonical term each DP-01 answer is written as.
 *
 * These are wire identifiers, not clinical wording: the pack matches on them
 * to read what the physician answered. They must stay identical to
 * `PHYSICIAN_LVEF_PHENOTYPE_TERMS` in the pack's `clinical-modules/
 * hfpef-diagnosis.ts`, which `phenotype-gate-wiring.test.tsx` holds by writing
 * an answer with the copy below and running the real pack over it.
 */
export const PHYSICIAN_LVEF_PHENOTYPE_TERMS = {
  reduced: 'lvef-known-reduced',
  preserved: 'lvef-known-preserved',
  unknown: 'lvef-unknown',
} as const

/**
 * The canonical term each DP-00 answer is written as, matching
 * `PHYSICIAN_HF_SUSPICION_TERMS` in the pack.
 *
 * `undefined` — no fact at all — is what the pack reads as 「還沒問」, which is
 * never 「不懷疑」, so the host writes a term only once someone has answered.
 */
export const PHYSICIAN_HF_SUSPICION_TERMS = {
  suspected: 'hf-suspected',
  'not-suspected': 'hf-not-suspected',
} as const

/** Mirrors `CdssCriterionSummary` in the pack. */
export interface CriterionSummary {
  id: string
  label: string
  state: 'met' | 'refuted' | 'undetermined'
  detail?: string
}

/**
 * Mirrors `CdssDiagnosticSummary`.
 *
 * Deliberately not a probability. ESC 2026 §5.2.2 (PDF p.25) advises a
 * pragmatic approach and cautions that more complicated scoring systems should
 * be interpreted with caution; what it states under Table 10 is that the
 * probability rises with the number of parameters met. The pack counts, and
 * this host displays that count where it can be seen.
 */
/**
 * A published score the pack computed, beside the guideline's own reading.
 *
 * `isFloor` is the field that matters clinically: it says the record could not
 * supply every parameter, so the total can only be an underestimate. The low
 * bands are the ones that would talk a clinician out of a diagnosis, so a floor
 * is never shown as a bare number.
 */
export interface DiagnosticScore {
  name: string
  source: string
  value: number
  maximum: number
  bandLabel: string
  isFloor: boolean
  unmeasured?: readonly string[]
  components?: readonly { label: string; detail: string }[]
}

export interface DiagnosticSummary {
  verdict: string
  basis: string
  criteria: readonly CriterionSummary[]
  supportingParameterCount?: number
  confirmedByClinician?: boolean
  score?: DiagnosticScore
}

function toScore(value: unknown): DiagnosticScore | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || typeof record.source !== 'string') return undefined
  if (typeof record.value !== 'number' || typeof record.maximum !== 'number') return undefined
  if (typeof record.bandLabel !== 'string') return undefined
  const strings = (input: unknown): readonly string[] | undefined => (
    Array.isArray(input) && input.every((item) => typeof item === 'string')
      ? (input as string[])
      : undefined
  )
  const components = Array.isArray(record.components)
    ? record.components
      .filter((item): item is { label: string; detail: string } => (
        Boolean(item)
        && typeof item === 'object'
        && typeof (item as Record<string, unknown>).label === 'string'
        && typeof (item as Record<string, unknown>).detail === 'string'
      ))
    : undefined
  const unmeasured = strings(record.unmeasured)
  return {
    name: record.name,
    source: record.source,
    value: record.value,
    maximum: record.maximum,
    bandLabel: record.bandLabel,
    isFloor: record.isFloor === true,
    ...(unmeasured && unmeasured.length > 0 ? { unmeasured } : {}),
    ...(components && components.length > 0 ? { components } : {}),
  }
}

function toCriterion(value: unknown): CriterionSummary | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const state = record.state
  if (typeof record.id !== 'string' || typeof record.label !== 'string') return undefined
  if (state !== 'met' && state !== 'refuted' && state !== 'undetermined') return undefined
  return {
    id: record.id,
    label: record.label,
    state,
    ...(typeof record.detail === 'string' ? { detail: record.detail } : {}),
  }
}

/**
 * The criterion-by-criterion reading a recommendation carries, if any.
 *
 * Validated rather than cast, for the same reason as the input requests: on the
 * published package the field is simply absent.
 */
export function diagnosticSummaryOf(
  recommendation: CdssRecommendation,
): DiagnosticSummary | undefined {
  const raw = (recommendation as { diagnosticSummary?: unknown }).diagnosticSummary
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  if (typeof record.verdict !== 'string' || typeof record.basis !== 'string') return undefined
  const criteria = Array.isArray(record.criteria)
    ? record.criteria.map(toCriterion).filter((item): item is CriterionSummary => Boolean(item))
    : []
  return {
    verdict: record.verdict,
    basis: record.basis,
    criteria,
    ...(typeof record.supportingParameterCount === 'number'
      ? { supportingParameterCount: record.supportingParameterCount }
      : {}),
    ...(record.confirmedByClinician === true ? { confirmedByClinician: true } : {}),
    ...(toScore(record.score) ? { score: toScore(record.score) } : {}),
  }
}

const REQUEST_KINDS: readonly PhysicianInputRequestKind[] = [
  'hf-suspicion',
  'hf-symptoms',
  'lvef-phenotype',
  'hfpef-diagnosis-confirmation',
]

function isRequestKind(value: unknown): value is PhysicianInputRequestKind {
  return REQUEST_KINDS.some((kind) => kind === value)
}

function toOption(value: unknown): PhysicianInputOption | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.label !== 'string') return undefined
  return {
    id: record.id,
    label: record.label,
    ...(typeof record.valueLabel === 'string' ? { valueLabel: record.valueLabel } : {}),
  }
}

/**
 * The structured questions a recommendation carries, if any.
 *
 * Validating rather than casting: the app runs against the published package
 * on `master` and against the pilot overlay on `app-hmc`, and on the published
 * one this field is simply absent. An unrecognised `kind` is dropped so a pack
 * newer than this host renders nothing rather than an empty control.
 */
export function physicianInputRequestsOf(
  recommendation: CdssRecommendation,
): readonly PhysicianInputRequest[] {
  const raw = (recommendation as { physicianInputRequests?: unknown }).physicianInputRequests
  if (!Array.isArray(raw)) return []
  const requests: PhysicianInputRequest[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (!isRequestKind(record.kind) || typeof record.label !== 'string') continue
    const options = Array.isArray(record.options)
      ? record.options.map(toOption).filter((option): option is PhysicianInputOption => Boolean(option))
      : undefined
    requests.push({
      kind: record.kind,
      label: record.label,
      ...(options && options.length > 0 ? { options } : {}),
      ...(record.selection === 'multiple' || record.selection === 'single'
        ? { selection: record.selection }
        : {}),
    })
  }
  return requests
}
