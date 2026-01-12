import { useMemo } from 'react'
import type { DocumentReferenceEntity, CompositionEntity } from '@/src/core/entities/clinical-data.entity'

export interface ClinicalNote {
  id: string
  type: 'document' | 'composition'
  title: string
  category?: string
  date?: string
  author?: string
  description?: string
  content?: string
  sections?: Array<{
    title?: string
    content?: string
  }>
  encounterRef?: string
}

export function useClinicalNotes(
  documentReferences: DocumentReferenceEntity[],
  compositions: CompositionEntity[]
) {
  return useMemo(() => {
    const notes: ClinicalNote[] = []

    documentReferences.forEach((doc) => {
      const categoryText = doc.category?.[0]?.text || doc.category?.[0]?.coding?.[0]?.display
      const typeText = doc.type?.text || doc.type?.coding?.[0]?.display
      const encounterRef = doc.context?.encounter?.[0]?.reference

      notes.push({
        id: doc.id,
        type: 'document',
        title: doc.description || typeText || 'Document',
        category: categoryText,
        date: doc.date || doc.context?.period?.start,
        author: doc.author?.[0]?.display,
        description: doc.description,
        content: doc.content?.[0]?.attachment?.data 
          ? atob(doc.content[0].attachment.data) 
          : undefined,
        encounterRef
      })
    })

    compositions.forEach((comp) => {
      const categoryText = comp.category?.[0]?.text || comp.category?.[0]?.coding?.[0]?.display
      const encounterRef = comp.encounter?.reference

      const sections = comp.section?.map((section) => ({
        title: section.title,
        content: section.text?.div
          ? section.text.div.replace(/<[^>]*>/g, '')
          : undefined
      }))

      notes.push({
        id: comp.id,
        type: 'composition',
        title: comp.title || 'Clinical Note',
        category: categoryText,
        date: comp.date,
        author: comp.author?.[0]?.display,
        sections,
        encounterRef
      })
    })

    return notes.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0
      const dateB = b.date ? new Date(b.date).getTime() : 0
      return dateB - dateA
    })
  }, [documentReferences, compositions])
}
