// Clinical Context Formatters
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"

export function formatClinicalContext(sections: ClinicalContextSection[]): string {
  if (!sections || sections.length === 0) return "No clinical data available."

  return sections
    .filter((section) => section?.items?.length > 0)
    .map((section) => {
      const title = section.title || "Untitled"
      const items = section.items.map((item) => `- ${item}`).join("\n")
      return `${title}:\n${items}`
    })
    .filter(Boolean)
    .join("\n\n")
}

export function mapAndFilter<T>(
  items: T[] | undefined,
  mapper: (item: T) => string | undefined | null,
): string[] {
  if (!items) return []
  return items.map(mapper).filter((x): x is string => Boolean(x))
}
