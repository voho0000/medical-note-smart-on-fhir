/**
 * Prompt favorites: users/{uid}/promptFavorites/{promptId}
 *
 * A favorite stores a copy of the prompt, not a reference. The gallery source
 * may be edited or deleted later; the user's saved copy keeps working, and a
 * newer source is only signalled (favoriteHasUpdate), never applied silently.
 */
import { Timestamp } from 'firebase/firestore'
import { createUserCollectionSync } from '@/src/application/composition.user-collection-sync'
import { coerceInsightLanguagePolicy, coerceInsightOutputFormat } from '@/src/shared/constants/clinical-insights.constants'
import { normalizePromptTypes, PROMPT_CATEGORIES, type PromptFavorite, type SharedPrompt } from '../types/prompt.types'

interface FirestorePromptFavorite {
  /** Newest first for the generic user-collection ordering. */
  order: number
  savedAt: Timestamp
  sourceUpdatedAt: Timestamp
  sourceCreatedAt: Timestamp
  title: string
  description: string | null
  prompt: string
  types: string[]
  category: string
  specialty: string[]
  audience: string[]
  tags: string[]
  outputFormat: string | null
  languagePolicy: string | null
  exampleOutput: string | null
  authorId: string | null
  authorName: string | null
  isAnonymous: boolean
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const dateOf = (value: unknown, fallback: Date): Date => {
  const date = (value as { toDate?: () => Date } | null)?.toDate?.()
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : fallback
}

const favoritesSync = createUserCollectionSync<PromptFavorite, FirestorePromptFavorite>({
  collectionName: 'promptFavorites',
  largeTextField: 'prompt',
  logLabel: 'Prompt Favorites',
  nounSingular: 'favorite',
  nounPlural: 'favorites',
  getId: favorite => favorite.id,
  fromDoc: (id, data) => {
    const savedAt = dateOf(data.savedAt, new Date(0))
    const sourceUpdatedAt = dateOf(data.sourceUpdatedAt, savedAt)
    const audience = stringList(data.audience).filter(value => value === 'medical' || value === 'patient') as SharedPrompt['audience']
    return {
      id,
      savedAt,
      sourceUpdatedAt,
      prompt: {
        id,
        title: typeof data.title === 'string' ? data.title : '',
        description: typeof data.description === 'string' ? data.description : undefined,
        prompt: typeof data.prompt === 'string' ? data.prompt : '',
        types: normalizePromptTypes(id, data.types),
        category: (PROMPT_CATEGORIES as readonly string[]).includes(data.category) ? data.category as SharedPrompt['category'] : 'other',
        specialty: stringList(data.specialty) as SharedPrompt['specialty'],
        audience: audience.length ? audience : ['medical'],
        tags: stringList(data.tags),
        outputFormat: data.outputFormat == null ? undefined : coerceInsightOutputFormat(data.outputFormat),
        languagePolicy: data.languagePolicy == null ? undefined : coerceInsightLanguagePolicy(data.languagePolicy),
        exampleOutput: typeof data.exampleOutput === 'string' && data.exampleOutput ? data.exampleOutput : undefined,
        createdAt: dateOf(data.sourceCreatedAt, sourceUpdatedAt),
        updatedAt: sourceUpdatedAt,
        authorId: typeof data.authorId === 'string' ? data.authorId : undefined,
        authorName: data.isAnonymous === true ? undefined : typeof data.authorName === 'string' ? data.authorName : undefined,
        isAnonymous: data.isAnonymous === true,
        usageCount: 0,
      },
    }
  },
  toDoc: (favorite) => ({
    order: -favorite.savedAt.getTime(),
    savedAt: Timestamp.fromDate(favorite.savedAt),
    sourceUpdatedAt: Timestamp.fromDate(favorite.sourceUpdatedAt),
    sourceCreatedAt: Timestamp.fromDate(favorite.prompt.createdAt),
    title: favorite.prompt.title,
    description: favorite.prompt.description ?? null,
    prompt: favorite.prompt.prompt,
    types: favorite.prompt.types,
    category: favorite.prompt.category,
    specialty: favorite.prompt.specialty,
    audience: favorite.prompt.audience,
    tags: favorite.prompt.tags,
    outputFormat: favorite.prompt.outputFormat ?? null,
    languagePolicy: favorite.prompt.languagePolicy ?? null,
    exampleOutput: favorite.prompt.exampleOutput ?? null,
    authorId: favorite.prompt.authorId ?? null,
    authorName: favorite.prompt.isAnonymous ? null : favorite.prompt.authorName ?? null,
    isAnonymous: favorite.prompt.isAnonymous === true,
  }),
  subscribeOrdering: { mode: 'memory', compare: (a, b) => b.savedAt.getTime() - a.savedAt.getTime() },
})

export { favoriteHasUpdate, toPromptFavorite } from '../utils/prompt-favorite.utils'

export const getPromptFavorites = (userId: string) => favoritesSync.getAll(userId)
export const savePromptFavorite = (userId: string, favorite: PromptFavorite) => favoritesSync.save(userId, favorite)
export const removePromptFavorite = (userId: string, promptId: string) => favoritesSync.remove(userId, promptId)
export const subscribePromptFavorites = (userId: string, onUpdate: (favorites: PromptFavorite[]) => void) =>
  favoritesSync.subscribe(userId, onUpdate)
