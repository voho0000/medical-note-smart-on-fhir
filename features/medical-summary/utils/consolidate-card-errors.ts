import { MEDICAL_SUMMARY_CARD_IDS } from "@/src/core/entities/medical-summary.entity"
import type { GenerationErrorItem } from "../components/GenerationErrorBanner"

/** Consolidate only when every standard card has the same displayed error. */
export function consolidateCardErrors(
  failedCards: GenerationErrorItem[],
  summaryLabel: string,
): GenerationErrorItem[] {
  if (
    failedCards.length === MEDICAL_SUMMARY_CARD_IDS.length &&
    new Set(failedCards.map((item) => item.message)).size === 1
  ) {
    return [{ label: summaryLabel, message: failedCards[0].message }]
  }
  return failedCards
}
