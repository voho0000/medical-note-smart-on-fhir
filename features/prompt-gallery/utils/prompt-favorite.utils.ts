import type { PromptFavorite, SharedPrompt } from '../types/prompt.types'

/** Build the saved copy from a prompt whose full text has already been resolved. */
export function toPromptFavorite(prompt: SharedPrompt, savedAt = new Date()): PromptFavorite {
  if (prompt.body) throw new Error('Resolve the prompt content before saving a favorite')
  const { usageCount: _usage, ...snapshot } = prompt
  return { id: prompt.id, prompt: { ...snapshot, usageCount: 0 }, savedAt, sourceUpdatedAt: prompt.updatedAt }
}

/** The gallery source has been edited since this copy was saved. */
export function favoriteHasUpdate(favorite: PromptFavorite, source: Pick<SharedPrompt, 'updatedAt'> | undefined): boolean {
  return !!source && source.updatedAt.getTime() > favorite.sourceUpdatedAt.getTime()
}
