"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FileText, FileCode } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { ClinicalNote } from "../hooks/useClinicalNotes"

interface NoteItemProps {
  note: ClinicalNote
}

export function NoteItem({ note }: NoteItemProps) {
  const { locale } = useLanguage()
  const [isExpanded, setIsExpanded] = useState(false)

  const formatDate = (dateString?: string) => {
    if (!dateString) return ''
    try {
      return new Date(dateString).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  const hasContent = note.content || (note.sections && note.sections.length > 0)

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
        className={`w-full px-4 py-3 text-left ${hasContent ? 'hover:bg-muted/50' : ''} transition-colors`}
        disabled={!hasContent}
      >
        <div className="flex items-start gap-3">
          {hasContent && (
            <div className="mt-0.5">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {note.type === 'document' ? (
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                ) : (
                  <FileCode className="h-4 w-4 text-purple-600 shrink-0" />
                )}
                <span className="font-medium text-sm truncate">{note.title}</span>
              </div>
              {note.date && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDate(note.date)}
                </span>
              )}
            </div>
            
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {note.category && (
                <span className="px-2 py-0.5 rounded-full bg-muted">
                  {note.category}
                </span>
              )}
              {note.author && (
                <span>{note.author}</span>
              )}
            </div>

            {note.description && !isExpanded && (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                {note.description}
              </p>
            )}
          </div>
        </div>
      </button>

      {isExpanded && hasContent && (
        <div className="px-4 pb-4 border-t mt-2 pt-3">
          {note.content && (
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm bg-muted/50 p-3 rounded">
                {note.content}
              </pre>
            </div>
          )}

          {note.sections && note.sections.length > 0 && (
            <div className="space-y-3">
              {note.sections.map((section, index) => (
                <div key={index} className="border-l-2 border-primary/20 pl-3">
                  {section.title && (
                    <h4 className="font-medium text-sm mb-1">{section.title}</h4>
                  )}
                  {section.content && (
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {section.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
