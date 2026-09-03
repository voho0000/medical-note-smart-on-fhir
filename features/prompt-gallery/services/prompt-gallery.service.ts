import {
  collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, deleteField,
  query, where, orderBy, limit, startAfter, increment, Timestamp,
  type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import {
  isTemplateTextReference, readTemplateText, removeTemplateText,
  splitTemplateText, writeTemplateText,
} from '@/src/application/composition.template-text'
import { getPromptSpecialtyFilterValues, PROMPT_SPECIALTY_GROUPS } from '../constants/prompt-specialties'
import { normalizePromptTypes, type SharedPrompt, type PromptGalleryFilter, type PromptGallerySort } from '../types/prompt.types'
import { coerceInsightLanguagePolicy, coerceInsightOutputFormat } from '@/src/shared/constants/clinical-insights.constants'

const COLLECTION_NAME = 'sharedPrompts'
const PAGE_SIZE = 100
const categories = ['soap', 'admission', 'discharge', 'safety', 'summary', 'progress', 'consult', 'procedure', 'other']
const specialties = new Set<string>(PROMPT_SPECIALTY_GROUPS.flatMap(group => [...group.specialties]))
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')

function dateValue(value: unknown): Date {
  if (value === undefined) return new Date(0)
  const date = (value as { toDate?: () => Date } | null)?.toDate?.()
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid template date')
  return date
}

/** Isolate malformed legacy/public documents instead of failing the entire gallery. */
function convertToSharedPrompt(id: string, data: Record<string, unknown>): SharedPrompt | null {
  try {
    if (typeof data.title !== 'string' || !data.title.trim() || typeof data.prompt !== 'string') return null
    for (const field of ['description', 'authorId', 'authorName'] as const) {
      if (data[field] !== undefined && typeof data[field] !== 'string') return null
    }
    for (const field of ['specialty', 'audience', 'tags'] as const) {
      if (data[field] !== undefined && !stringList(data[field])) return null
    }
    if (data.body !== undefined && !isTemplateTextReference(data.body)) return null
    const audience = data.audience as string[] | undefined
    return {
      id, title: data.title, prompt: data.prompt,
      description: data.description as string | undefined,
      types: normalizePromptTypes(id, data.types),
      category: (categories.includes(data.category as string) ? data.category : 'other') as SharedPrompt['category'],
      specialty: (data.specialty ?? []) as SharedPrompt['specialty'],
      audience: audience?.length ? audience.filter(value => value === 'medical' || value === 'patient') as SharedPrompt['audience'] : ['medical'],
      tags: (data.tags ?? []) as string[],
      outputFormat: data.outputFormat === undefined ? undefined : coerceInsightOutputFormat(data.outputFormat),
      languagePolicy: data.languagePolicy === undefined ? undefined : coerceInsightLanguagePolicy(data.languagePolicy),
      createdAt: dateValue(data.createdAt), updatedAt: dateValue(data.updatedAt),
      authorId: data.authorId as string | undefined,
      authorName: data.isAnonymous === true ? undefined : data.authorName as string | undefined,
      isAnonymous: data.isAnonymous === true,
      usageCount: Number.isSafeInteger(data.usageCount) && (data.usageCount as number) >= 0 ? data.usageCount as number : 0,
      ...(data.body ? { body: data.body as SharedPrompt['body'] } : {}),
    }
  } catch { return null }
}

export async function loadSharedPromptContent(prompt: SharedPrompt): Promise<SharedPrompt> {
  if (!prompt.body) return prompt
  try {
    const text = await readTemplateText(prompt.body)
    const { body: _body, ...metadata } = prompt
    return { ...metadata, prompt: text }
  } catch (error) {
    // A gallery card may still point at a version the author just replaced.
    // Reload the current pointer once rather than retrying an obsolete body.
    if (!db) throw error
    const snapshot = await getDoc(doc(db, COLLECTION_NAME, prompt.id))
    const latest = snapshot.exists() ? convertToSharedPrompt(prompt.id, snapshot.data()) : null
    if (!latest || latest.body?.id === prompt.body.id) throw error
    if (!latest.body) return latest
    const { body, ...metadata } = latest
    return { ...metadata, prompt: await readTemplateText(body) }
  }
}

async function fetchPrompts(filter: PromptGalleryFilter = {}, sort?: PromptGallerySort, userId?: string): Promise<SharedPrompt[]> {
  if (!db) return []
  const constraints: QueryConstraint[] = []
  if (userId) constraints.push(where('authorId', '==', userId))
  if (filter.type && filter.type !== 'summary') constraints.push(where('types', 'array-contains', filter.type))
  if (filter.category) constraints.push(where('category', '==', filter.category))
  const selectedSpecialties = filter.specialty ? getPromptSpecialtyFilterValues(filter.specialty) : undefined
  if (filter.specialty && (!filter.type || filter.type === 'summary')) {
    constraints.push(selectedSpecialties!.length === 1
      ? where('specialty', 'array-contains', filter.specialty)
      : where('specialty', 'array-contains-any', selectedSpecialties))
  }
  // Stable cursor ordering also includes legacy records missing usageCount.
  // Filter and sort the complete set, never just the first page.
  constraints.push(orderBy('createdAt', 'desc'))
  const prompts: SharedPrompt[] = []
  let cursor: QueryDocumentSnapshot | undefined
  do {
    const page = await getDocs(query(collection(db, COLLECTION_NAME), ...constraints,
      ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE)))
    for (const record of page.docs) {
      const prompt = convertToSharedPrompt(record.id, record.data())
      if (!prompt || (filter.type && !prompt.types.includes(filter.type))
        || (filter.category && prompt.category !== filter.category)
        || (selectedSpecialties && !prompt.specialty.some(value => selectedSpecialties.includes(value)))
        || (filter.audience && !prompt.audience.includes(filter.audience))
        || (filter.tags?.length && !filter.tags.some(tag => prompt.tags.includes(tag)))) continue
      const search = filter.searchQuery?.trim().toLocaleLowerCase()
      if (search) {
        const fields = [prompt.title, prompt.description, prompt.authorName, ...prompt.tags, prompt.prompt]
        if (!fields.some(value => value?.toLocaleLowerCase().includes(search))) {
          if (!prompt.body) continue
          try {
            if (!(await loadSharedPromptContent(prompt)).prompt.toLocaleLowerCase().includes(search)) continue
          } catch { continue } // An incomplete record must not hide healthy results.
        }
      }
      prompts.push(prompt)
    }
    cursor = page.docs.length === PAGE_SIZE ? page.docs[page.docs.length - 1] : undefined
  } while (cursor)
  const direction = sort?.direction === 'asc' ? 1 : -1
  return prompts.sort((a, b) => direction * (sort?.field === 'usageCount'
    ? (a.usageCount ?? 0) - (b.usageCount ?? 0)
    : sort?.field === 'title' ? a.title.localeCompare(b.title)
    : sort?.field === 'updatedAt' ? a.updatedAt.getTime() - b.updatedAt.getTime()
    : a.createdAt.getTime() - b.createdAt.getTime()))
}

export const getSharedPrompts = (filter?: PromptGalleryFilter, sort?: PromptGallerySort) => fetchPrompts(filter, sort)
export const getMySharedPrompts = (userId: string, filter?: PromptGalleryFilter, sort?: PromptGallerySort) => fetchPrompts(filter, sort, userId)

export async function getSharedPrompt(id: string): Promise<SharedPrompt | null> {
  if (!db) return null
  const snapshot = await getDoc(doc(db, COLLECTION_NAME, id))
  const prompt = snapshot.exists() ? convertToSharedPrompt(id, snapshot.data()) : null
  return prompt ? loadSharedPromptContent(prompt) : null
}

type NewPrompt = Omit<SharedPrompt, 'id' | 'createdAt' | 'updatedAt' | 'body'>
function validatePrompt(prompt: NewPrompt) {
  if (typeof prompt.title !== 'string' || !prompt.title.trim() || prompt.title.length > 100
    || typeof prompt.prompt !== 'string' || !prompt.prompt.trim()
    || !stringList(prompt.types) || !prompt.types.length || !prompt.types.every(type => ['chat', 'summary'].includes(type))
    || !categories.includes(prompt.category)
    || !stringList(prompt.specialty) || !prompt.specialty.every(value => specialties.has(value))
    || !stringList(prompt.audience) || !prompt.audience.length || !prompt.audience.every(value => ['medical', 'patient'].includes(value))
    || !stringList(prompt.tags) || prompt.tags.length > 8 || !prompt.tags.every(tag => tag.length <= 24)
    || (prompt.description !== undefined && (typeof prompt.description !== 'string' || prompt.description.length > 180))
    || (prompt.authorName !== undefined && (typeof prompt.authorName !== 'string' || prompt.authorName.length > 100))
    || (prompt.outputFormat !== undefined && !['plain-text', 'markdown', 'html'].includes(prompt.outputFormat))
    || (prompt.languagePolicy !== undefined && !['interface-language', 'follow-template'].includes(prompt.languagePolicy))
    || typeof prompt.authorId !== 'string' || !prompt.authorId) throw new Error('Invalid template data')
}

export async function createSharedPrompt(prompt: NewPrompt): Promise<string> {
  if (!db) throw new Error('Database unavailable')
  validatePrompt(prompt)
  const now = Timestamp.now()
  const data = Object.fromEntries(Object.entries({ ...prompt, usageCount: 0, createdAt: now, updatedAt: now,
    authorName: prompt.isAnonymous ? undefined : prompt.authorName }).filter(([, value]) => value !== undefined))
  if (splitTemplateText(prompt.prompt).length === 1) return (await addDoc(collection(db, COLLECTION_NAME), data)).id
  const ref = doc(collection(db, COLLECTION_NAME))
  const body = await writeTemplateText(prompt.prompt, prompt.authorId!, ref.id)
  try {
    await setDoc(ref, { ...data, prompt: prompt.prompt.slice(0, 180), body })
    return ref.id
  } catch (error) {
    await removeTemplateText(body.id).catch(() => {})
    throw error
  }
}

export async function deleteSharedPrompt(id: string): Promise<void> {
  if (!db) throw new Error('Database unavailable')
  const ref = doc(db, COLLECTION_NAME, id)
  const body = (await getDoc(ref)).data()?.body
  await deleteDoc(ref)
  if (isTemplateTextReference(body)) await removeTemplateText(body.id).catch(() => {})
}

export async function updateSharedPrompt(id: string, updates: Partial<NewPrompt>): Promise<void> {
  if (!db) throw new Error('Database unavailable')
  const allowed = ['title', 'description', 'prompt', 'types', 'category', 'specialty', 'audience', 'tags', 'isAnonymous', 'authorName', 'outputFormat', 'languagePolicy']
  if (Object.keys(updates).some(key => !allowed.includes(key))) throw new Error('Cannot change template ownership or usage')
  const ref = doc(db, COLLECTION_NAME, id)
  const snapshot = await getDoc(ref)
  const current = snapshot.exists() ? convertToSharedPrompt(id, snapshot.data()) : null
  if (!current) throw new Error('Template unavailable')
  const full = await loadSharedPromptContent(current)
  const next = { ...full, ...updates }
  validatePrompt(next)
  const { id: _id, body: _body, ...data } = next
  const body = splitTemplateText(next.prompt).length > 1 ? await writeTemplateText(next.prompt, next.authorId!, id) : undefined
  try {
    // Keep system fields untouched even if a usage increment lands concurrently.
    const payload = Object.fromEntries(allowed.filter(key => key in data).map(key => [key, data[key as keyof typeof data]]).filter(([, value]) => value !== undefined))
    await updateDoc(ref, { ...payload, prompt: body ? next.prompt.slice(0, 180) : next.prompt,
      body: body ?? deleteField(), authorName: next.isAnonymous ? deleteField() : next.authorName ?? deleteField(), updatedAt: Timestamp.now() })
  } catch (error) {
    if (body) await removeTemplateText(body.id).catch(() => {})
    throw error
  }
  if (current.body) await removeTemplateText(current.body.id).catch(() => {})
}

export async function incrementPromptUsage(id: string): Promise<void> {
  if (!db) return
  await updateDoc(doc(db, COLLECTION_NAME, id), { usageCount: increment(1) })
}
