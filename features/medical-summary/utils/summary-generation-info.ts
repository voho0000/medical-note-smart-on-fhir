import type { MedicalSummaryResult } from "@/src/core/entities/medical-summary.entity"

export interface MedicalSummaryGenerationInfo {
  prefix?: string
  modelName: string
  generatedAtIso?: string
  generatedAtText?: string
  durationLabel?: string
  durationText?: string
  ariaLabel: string
}

export function formatGenerationDuration(durationMs: number): string | undefined {
  if (!Number.isFinite(durationMs) || durationMs < 0) return undefined
  const totalSeconds = Math.floor(durationMs / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  const twoDigits = (value: number) => value.toString().padStart(2, "0")
  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(minutes)}:${twoDigits(seconds)}`
}

export function buildSummaryGenerationInfo({
  generation,
  locale,
  labelTemplate,
  labelWithDurationTemplate,
  durationLabel,
  preGeneratedLabel,
  preGeneratedTemplate,
}: {
  generation?: MedicalSummaryResult["generation"]
  locale: string
  labelTemplate: string
  labelWithDurationTemplate: string
  durationLabel: string
  preGeneratedLabel: string
  preGeneratedTemplate: string
}): MedicalSummaryGenerationInfo | undefined {
  if (!generation) return undefined
  if (generation.source === "pre-generated") {
    return {
      prefix: preGeneratedLabel,
      modelName: generation.modelName,
      ariaLabel: preGeneratedTemplate.replace("{model}", generation.modelName),
    }
  }

  // Once the whole summary + safety batch has settled, show that completion
  // time. Legacy results (and summaries whose companion pipeline did not
  // complete successfully) retain the structured-summary timestamp.
  const generatedAt = new Date(generation.completedAt ?? generation.generatedAt)
  if (Number.isNaN(generatedAt.getTime())) return undefined

  const generatedAtText = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(generatedAt)
  const modelName = generation.modelName
  const durationText = generation.durationMs === undefined
    ? undefined
    : formatGenerationDuration(generation.durationMs)
  const ariaLabel = durationText
    ? labelWithDurationTemplate
      .replace("{model}", modelName)
      .replace("{time}", generatedAtText)
      .replace("{duration}", durationText)
    : labelTemplate
      .replace("{model}", modelName)
      .replace("{time}", generatedAtText)

  return {
    modelName,
    generatedAtIso: generatedAt.toISOString(),
    generatedAtText,
    durationLabel: durationText ? durationLabel : undefined,
    durationText,
    ariaLabel,
  }
}
