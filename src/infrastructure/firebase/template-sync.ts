// Chat Template Sync with Firestore
import { Timestamp, type Unsubscribe } from 'firebase/firestore'
import { createUserCollectionSync } from './user-collection-sync'

export type TemplateAudience = 'medical' | 'patient'

export interface ChatTemplate {
  id: string
  label: string
  content: string
  /** Optional "/shortcut" trigger keyword for the slash-template menu. */
  shortcut?: string
  order: number
  audience: TemplateAudience
  createdAt?: Date
  updatedAt?: Date
}

interface FirestoreChatTemplate {
  id: string
  label: string
  content: string
  shortcut?: string | null
  order: number
  audience?: TemplateAudience
  createdAt: Timestamp
  updatedAt: Timestamp
}

const templateSync = createUserCollectionSync<ChatTemplate, FirestoreChatTemplate>({
  collectionName: 'chatTemplates',
  logLabel: 'Template Sync',
  nounSingular: 'template',
  nounPlural: 'templates',
  getId: template => template.id,
  fromDoc: (id, data) => ({
    id,
    label: data.label,
    content: data.content,
    order: data.order || 0,
    audience: data.audience ?? 'medical',
    shortcut: data.shortcut ?? undefined,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  }),
  toDoc: (template, now) => ({
    id: template.id,
    label: template.label,
    content: template.content,
    order: template.order,
    audience: template.audience ?? 'medical',
    shortcut: template.shortcut ?? null,
    createdAt: template.createdAt ? Timestamp.fromDate(template.createdAt) : now,
    updatedAt: now,
  }),
  // Don't use orderBy in Firestore - sort in memory to avoid index issues
  subscribeOrdering: { mode: 'memory', compare: (a, b) => a.order - b.order },
})

/**
 * Get all chat templates for a user
 */
export async function getUserChatTemplates(userId: string): Promise<ChatTemplate[]> {
  return templateSync.getAll(userId)
}

/**
 * Save or update a chat template
 */
export async function saveChatTemplate(
  userId: string,
  template: ChatTemplate
): Promise<boolean> {
  return templateSync.save(userId, template)
}

/**
 * Delete a chat template
 */
export async function deleteChatTemplate(
  userId: string,
  templateId: string
): Promise<boolean> {
  return templateSync.remove(userId, templateId)
}

/**
 * Subscribe to real-time chat template updates
 */
export function subscribeToChatTemplates(
  userId: string,
  onUpdate: (templates: ChatTemplate[]) => void
): Unsubscribe {
  return templateSync.subscribe(userId, onUpdate)
}

/**
 * Batch save multiple chat templates (for migration)
 */
export async function batchSaveChatTemplates(
  userId: string,
  templates: ChatTemplate[]
): Promise<boolean> {
  return templateSync.batchSave(userId, templates)
}

/**
 * Replace all chat templates (delete all existing, then save new ones)
 */
export async function replaceAllChatTemplates(
  userId: string,
  templates: ChatTemplate[]
): Promise<boolean> {
  return templateSync.replaceAll(userId, templates)
}
