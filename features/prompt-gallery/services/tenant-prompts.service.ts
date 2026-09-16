/**
 * Department templates: tenantPrompts/{promptId}
 *
 * Same document shape as a public shared prompt plus `tenantId`. Readable by
 * active members of that tenant only; owner/builder members publish and
 * retire (firestore.rules). Content is stored inline, never as a large body.
 */
import {
  addDoc, collection, deleteDoc, doc, getDocs, increment, limit, orderBy, query, runTransaction, Timestamp, updateDoc, where,
} from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import { splitTemplateText } from '@/src/application/composition.template-text'
import { coerceTemplateVersion, type SharedPrompt } from '../types/prompt.types'
import { convertToSharedPrompt, validatePrompt, type NewPrompt } from './prompt-gallery.service'

const COLLECTION_NAME = 'tenantPrompts'
const MAX_TENANT_PROMPTS = 500

export type NewTenantPrompt = NewPrompt & { tenantId: string }

export async function getTenantPrompts(tenantId: string): Promise<SharedPrompt[]> {
  if (!db || !tenantId) return []
  // The where() clause is what lets the security rule prove membership for a list query.
  const snapshot = await getDocs(query(
    collection(db, COLLECTION_NAME), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'), limit(MAX_TENANT_PROMPTS),
  ))
  return snapshot.docs
    .map((record) => convertToSharedPrompt(record.id, record.data()))
    .filter((prompt): prompt is SharedPrompt => !!prompt && prompt.tenantId === tenantId)
}

export async function createTenantPrompt(prompt: NewTenantPrompt): Promise<string> {
  if (!db) throw new Error('Database unavailable')
  if (typeof prompt.tenantId !== 'string' || !prompt.tenantId) throw new Error('Invalid template data')
  validatePrompt(prompt)
  if (splitTemplateText(prompt.prompt).length > 1) throw new Error('Template too long for a department template')
  const now = Timestamp.now()
  const data = Object.fromEntries(Object.entries({
    ...prompt, version: 1, usageCount: 0, createdAt: now, updatedAt: now,
    authorName: prompt.isAnonymous ? undefined : prompt.authorName,
  }).filter(([, value]) => value !== undefined))
  return (await addDoc(collection(db, COLLECTION_NAME), data)).id
}

export async function deleteTenantPrompt(id: string): Promise<void> {
  if (!db) throw new Error('Database unavailable')
  await deleteDoc(doc(db, COLLECTION_NAME, id))
}

export async function updateTenantPrompt(id: string, updates: Partial<NewPrompt>): Promise<void> {
  if (!db) throw new Error('Database unavailable')
  const allowed = ['title', 'description', 'prompt', 'types', 'category', 'specialty', 'audience', 'tags', 'isAnonymous', 'authorName', 'outputFormat', 'languagePolicy', 'exampleOutput']
  if (Object.keys(updates).some(key => !allowed.includes(key))) throw new Error('Cannot change template ownership or usage')
  const ref = doc(db, COLLECTION_NAME, id)
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.exists() ? convertToSharedPrompt(id, snapshot.data()) : null
    if (!current) throw new Error('Template unavailable')
    const next = { ...current, ...updates }
    validatePrompt(next)
    if (splitTemplateText(next.prompt).length > 1) throw new Error('Template too long for a department template')
    const materialChanged = next.prompt !== current.prompt || next.outputFormat !== current.outputFormat
      || next.languagePolicy !== current.languagePolicy
    const payload = Object.fromEntries(allowed.filter(key => key in updates)
      .map(key => [key, updates[key as keyof typeof updates]]).filter(([, value]) => value !== undefined))
    transaction.update(ref, { ...payload, version: coerceTemplateVersion(current.version) + (materialChanged ? 1 : 0), updatedAt: Timestamp.now() })
  })
}

export async function incrementTenantPromptUsage(id: string): Promise<void> {
  if (!db) return
  await updateDoc(doc(db, COLLECTION_NAME, id), { usageCount: increment(1) })
}
