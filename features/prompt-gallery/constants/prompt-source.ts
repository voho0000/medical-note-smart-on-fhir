import type { PromptSource, SharedPrompt } from '../types/prompt.types'

/**
 * System templates are the ones the platform maintains. The production gallery
 * was seeded from the owner account (the seed script publishes under the
 * signed-in uid), so the owner uid is the default; override or extend with a
 * comma-separated NEXT_PUBLIC_SYSTEM_PROMPT_AUTHOR_IDS when the maintainer set
 * changes. The seed script's default author name is kept as a second signal.
 */
const OWNER_AUTHOR_ID = 'yNPbtqyXZ9ZwO80LENFAe0R5M0p1'
export const SYSTEM_PROMPT_AUTHOR_NAME = 'MediPrisma'
export const SYSTEM_PROMPT_AUTHOR_IDS: ReadonlySet<string> = new Set(
  (process.env.NEXT_PUBLIC_SYSTEM_PROMPT_AUTHOR_IDS ?? OWNER_AUTHOR_ID).split(',').map((id) => id.trim()).filter(Boolean),
)

export function isSystemPrompt(prompt: Pick<SharedPrompt, 'authorId' | 'authorName' | 'isAnonymous'>): boolean {
  if (prompt.authorId && SYSTEM_PROMPT_AUTHOR_IDS.has(prompt.authorId)) return true
  return !prompt.isAnonymous && prompt.authorName === SYSTEM_PROMPT_AUTHOR_NAME
}

/** Source badge relative to the current user: their own prompt wins over "system". */
export function getPromptSource(
  prompt: Pick<SharedPrompt, 'authorId' | 'authorName' | 'isAnonymous'>,
  userId?: string,
): PromptSource {
  if (userId && prompt.authorId === userId) return 'mine'
  if (isSystemPrompt(prompt)) return 'system'
  return 'shared'
}
