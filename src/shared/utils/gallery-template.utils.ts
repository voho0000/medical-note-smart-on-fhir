import { sha1 } from "js-sha1"

/** Gallery IDs are scoped to either the public collection or a tenant. */
export function gallerySourceKey(prompt: { id: string; tenantId?: string }): string {
  return JSON.stringify([prompt.tenantId ?? null, prompt.id])
}

/** Preserve edits on known imports; recognize older imports by exact content. */
export function findGalleryTemplate<T extends { sourcePromptKey?: string }>(
  items: T[], sourcePromptKey: string, matchesLegacy: (item: T) => boolean,
): T | undefined {
  return items.find(item => item.sourcePromptKey === sourcePromptKey)
    ?? items.find(item => !item.sourcePromptKey && matchesLegacy(item))
}

/** Change detection only; never used for security or to identify different sources. */
export function galleryFingerprint(value: { title: string; content: string; outputFormat?: string; languagePolicy?: string }): string {
  return sha1(JSON.stringify([value.title, value.content, value.outputFormat ?? null, value.languagePolicy ?? null]))
}
