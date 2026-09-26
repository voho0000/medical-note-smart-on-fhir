/**
 * Atrial-fibrillation anticoagulation and rate cards on the heart-failure page.
 *
 * A patient with both conditions is seen in the HF clinic, and the HF
 * specification's decision points DP-14 (AF anticoagulation) and DP-28 (AF rate)
 * belong to that visit. The AF pack already writes those cards; this file only
 * decides which of them the HF page carries, and when. Every word on a merged
 * card is the AF pack's: the one host addition is the 「AF」 source tag in front
 * of the module name, so a reader knows which pack wrote it.
 *
 * When to merge: the AF pack writes its anticoagulation cards only once AF is
 * established — a documented AF/flutter diagnosis the clinician has not
 * switched off, or a clinician's confirmation (its follow-up mode). Before
 * that it writes diagnosis and screening cards alone. So 「the AF result holds
 * `af-anticoagulation-concordance`」 is the pack's own answer to 「does this
 * patient have AF」, and the host adds no rule of its own.
 *
 * `antithrombotic-coordination` is written by both packs under the same id; the
 * HF page keeps its own card and never adds the AF copy. Any AF id the HF
 * result already carries is skipped the same way, so no card appears twice.
 *
 * An AF build that throws, or an AF pack that is not available, leaves the HF
 * result exactly as it was: the HF page must never fail because of a second
 * pack.
 */
import type { CdssRecommendation, CdssResult } from '../types'

export const AF_PACK_ID = 'atrial-fibrillation-cdss'

/** The AF card the pack writes only once AF is established. */
export const AF_ESTABLISHED_MARKER_ID = 'af-anticoagulation-concordance'

/**
 * The AF cards the HF page carries, in the order they are read: stroke risk
 * (whether to anticoagulate), the anticoagulation decision itself, the choice
 * of agent, the DOAC dose, then rate control with its LVEF safety check.
 */
export const AF_MERGED_MODULE_IDS: readonly string[] = [
  'af-documented-cha2ds2-vasc',
  'af-anticoagulation-concordance',
  'af-anticoagulant-selection-safety',
  'af-doac-renal-dose-check',
  'af-rate-control-and-lvef-safety',
]

/** Sorts merged AF cards after every HF card that carries a module order. */
const AF_MODULE_ORDER_OFFSET = 1000

export function isMergedAfModule(id: string): boolean {
  return AF_MERGED_MODULE_IDS.includes(id)
}

/** 「AF 抗凝適應症」; a module name that already says AF is left alone. */
export function afSourceModuleName(moduleName: string | undefined, fallback: string): string {
  const name = (moduleName ?? fallback).trim()
  return /(^|[^A-Za-z])AF([^A-Za-z]|$)/.test(name) ? name : `AF ${name}`
}

function tagged(recommendation: CdssRecommendation, index: number): CdssRecommendation {
  return {
    ...recommendation,
    moduleName: afSourceModuleName(recommendation.moduleName, recommendation.id),
    moduleOrder: AF_MODULE_ORDER_OFFSET + (recommendation.moduleOrder ?? index),
  }
}

/**
 * The HF result, plus the AF anticoagulation and rate cards when the AF pack
 * says the patient has AF. `buildAf` returns `undefined` when the AF pack is
 * not available; anything it throws is swallowed and the HF result returned.
 */
export function mergeAfIntoHeartFailure(
  hfResult: CdssResult,
  buildAf: () => CdssResult | undefined | null,
): CdssResult {
  let afResult: CdssResult | undefined | null
  try {
    afResult = buildAf()
  } catch {
    return hfResult
  }
  if (!afResult || afResult.packId !== AF_PACK_ID) return hfResult
  const afCards = afResult.recommendations
  if (!afCards.some((item) => item.id === AF_ESTABLISHED_MARKER_ID)) return hfResult

  const hfIds = new Set([
    ...hfResult.recommendations.map((item) => item.id),
    ...(hfResult.automatedChecks ?? [])
      .map((check) => check.recommendation?.id)
      .filter((id): id is string => Boolean(id)),
  ])
  const additions = AF_MERGED_MODULE_IDS
    .filter((id) => !hfIds.has(id))
    .flatMap((id) => afCards.filter((item) => item.id === id).slice(0, 1))
    .map(tagged)
  if (additions.length === 0) return hfResult
  return { ...hfResult, recommendations: [...hfResult.recommendations, ...additions] }
}
