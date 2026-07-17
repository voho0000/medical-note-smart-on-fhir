import type {
  PromptGalleryFilter,
  PromptGallerySort,
  SharedPrompt,
} from '@/features/prompt-gallery/types/prompt.types'

const disabledError = () => new Error(
  'Shared Prompt Gallery is disabled by the onprem deployment profile',
)

export async function getSharedPrompts(
  _filter?: PromptGalleryFilter,
  _sort?: PromptGallerySort,
): Promise<SharedPrompt[]> {
  return []
}

export async function getSharedPrompt(_id: string): Promise<SharedPrompt | null> {
  return null
}

export async function createSharedPrompt(
  _prompt: Omit<SharedPrompt, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  throw disabledError()
}

export async function deleteSharedPrompt(_id: string): Promise<void> {
  throw disabledError()
}

export async function updateSharedPrompt(
  _id: string,
  _updates: Partial<Omit<SharedPrompt, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  throw disabledError()
}

export async function incrementPromptUsage(_id: string): Promise<void> {}

export async function getMySharedPrompts(
  _userId: string,
  _filter?: PromptGalleryFilter,
  _sort?: PromptGallerySort,
): Promise<SharedPrompt[]> {
  return []
}
