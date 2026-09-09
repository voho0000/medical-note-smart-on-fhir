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
