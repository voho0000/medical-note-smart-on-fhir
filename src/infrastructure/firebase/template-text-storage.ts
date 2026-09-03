import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, type DocumentReference } from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'

// Transport sizes, not a limit on a user's prompt. Each immutable version can
// contain any number of chunks; publishing changes only the parent pointer.
export const TEXT_CHUNK_BYTES = 200_000
const CHUNKS_PER_COMMIT = 20

export interface TemplateTextReference {
  id: string
  chunks: number
  length: number
}

export function splitTemplateText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  let offset = 0
  let bytes = 0
  for (const character of text) {
    const point = character.codePointAt(0)!
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
    if (bytes + size > TEXT_CHUNK_BYTES) {
      chunks.push(text.slice(start, offset))
      start = offset
      bytes = 0
    }
    bytes += size
    offset += character.length
  }
  chunks.push(text.slice(start))
  return chunks
}

export function isTemplateTextReference(value: unknown): value is TemplateTextReference {
  if (!value || typeof value !== 'object') return false
  const ref = value as Record<string, unknown>
  return typeof ref.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(ref.id)
    && Number.isSafeInteger(ref.chunks) && (ref.chunks as number) > 0
    && Number.isSafeInteger(ref.length) && (ref.length as number) >= 0
}

function bodyRef(id: string): DocumentReference {
  if (!db) throw new Error('Database unavailable')
  return doc(db, 'templateBodies', id)
}

export async function writeTemplateText(
  text: string,
  ownerId: string,
  sharedPromptId?: string,
  privateParent?: { collectionName: string; itemId: string },
): Promise<TemplateTextReference> {
  if (!db) throw new Error('Database unavailable')
  const chunks = splitTemplateText(text)
  const ref = doc(collection(db, 'templateBodies'))
  await setDoc(ref, {
    ownerId, scope: sharedPromptId ? 'shared' : 'private',
    ...(sharedPromptId ? { promptId: sharedPromptId } : {}),
    ...(!sharedPromptId ? privateParent : {}),
    chunks: chunks.length, length: text.length, ready: false,
  })
  try {
    for (let offset = 0; offset < chunks.length; offset += CHUNKS_PER_COMMIT) {
      const batch = writeBatch(db)
      chunks.slice(offset, offset + CHUNKS_PER_COMMIT).forEach((text, index) => {
        batch.set(doc(ref, 'chunks', String(offset + index)), { index: offset + index, text })
      })
      await batch.commit()
    }
    await updateDoc(ref, { ready: true })
    return { id: ref.id, chunks: chunks.length, length: text.length }
  } catch (error) {
    await removeTemplateText(ref.id).catch(() => {})
    throw error
  }
}

export async function readTemplateText(reference: TemplateTextReference): Promise<string> {
  if (!isTemplateTextReference(reference)) throw new Error('Invalid template content reference')
  const ref = bodyRef(reference.id)
  const manifest = (await getDoc(ref)).data()
  if (!manifest?.ready || manifest.chunks !== reference.chunks || manifest.length !== reference.length) {
    throw new Error('Template content is incomplete')
  }
  const parts: string[] = []
  // Bounded parallel reads, with no cap on the number of chunks.
  for (let offset = 0; offset < reference.chunks; offset += CHUNKS_PER_COMMIT) {
    const count = Math.min(CHUNKS_PER_COMMIT, reference.chunks - offset)
    const documents = await Promise.all(Array.from({ length: count }, (_, i) => getDoc(doc(ref, 'chunks', String(offset + i)))))
    documents.forEach((snapshot, i) => {
      const chunk = snapshot.data()
      if (chunk?.index !== offset + i || typeof chunk.text !== 'string') throw new Error('Template content is incomplete')
      parts.push(chunk.text)
    })
  }
  const text = parts.join('')
  if (text.length !== reference.length) throw new Error('Template content is incomplete')
  return text
}

// Delete chunks first so their owner remains available to security rules.
// Call only after removing/replacing the public pointer.
export async function removeTemplateText(id: string): Promise<void> {
  if (!db) return
  const ref = bodyRef(id)
  const chunks = await getDocs(collection(ref, 'chunks'))
  for (let offset = 0; offset < chunks.docs.length; offset += CHUNKS_PER_COMMIT) {
    const batch = writeBatch(db)
    chunks.docs.slice(offset, offset + CHUNKS_PER_COMMIT).forEach(chunk => batch.delete(chunk.ref))
    await batch.commit()
  }
  await deleteDoc(ref)
}
