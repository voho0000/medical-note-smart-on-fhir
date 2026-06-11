// CompositionRenderer
// Pure presentational component for ONE FHIR Composition. Renders a header
// (title / date / author / custodian) and a collapsible list of sections,
// each section's `text.div` sanitized through DOMPurify before injection.
//
// Reusable: today it lives inside DocumentSummaryCard (patient tab). When
// the bridge starts shipping discharge summaries the same component can be
// dropped into a Visits-tab discharge-summary view alongside its Encounter.
"use client"

import { FileText } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import type { CompositionEntity } from '@/src/core/entities/clinical-data.entity'
import { sanitizeNarrative, hasNarrativeContent } from '../utils/sanitize-narrative'
import { SECTION_LOINC, getSectionCode } from '../utils/loinc-document-types'

interface CompositionRendererProps {
  composition: CompositionEntity
  /** When true, the first renderable section is expanded by default. Used
   *  by DocumentSummaryCard when the list has exactly one Composition. */
  defaultExpandFirst?: boolean
  /** i18n lookup: returns the localized label for a section LOINC i18n key,
   *  or null if the key isn't translated. Passed in so the renderer stays
   *  free of i18n provider coupling. */
  resolveSectionLabel: (i18nKey: string) => string | null
  /** Labels for the metadata strip. */
  labels: {
    documentDate: string
    author: string
    custodian: string
    noSections: string
  }
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  // Trim time portion if present; FHIR dates are ISO-8601.
  return iso.slice(0, 10)
}

function getAuthorNames(comp: CompositionEntity): string {
  const authors = Array.isArray(comp.author) ? comp.author : []
  return authors
    .map((a) => a?.display?.trim())
    .filter((s): s is string => !!s)
    .join(', ')
}

function getSectionTitle(
  section: any,
  resolveSectionLabel: (i18nKey: string) => string | null,
): string {
  // 1. Try the LOINC code → i18n mapping.
  const code = getSectionCode(section)
  if (code && SECTION_LOINC[code]) {
    const label = resolveSectionLabel(SECTION_LOINC[code])
    if (label) return label
  }
  // 2. Fall back to the source-provided section.title.
  if (section?.title?.trim()) return section.title.trim()
  // 3. Last resort: section.code.text.
  const codeText = section?.code?.text?.trim()
  if (codeText) return codeText
  return '—'
}

export function CompositionRenderer({
  composition,
  defaultExpandFirst = false,
  resolveSectionLabel,
  labels,
}: CompositionRendererProps) {
  const sections = Array.isArray(composition.section) ? composition.section : []
  // Only render sections whose narrative actually has content. (Structured-only
  // sections with no .text are already represented in the other cards.)
  const renderableSections = sections.filter((s) => hasNarrativeContent(s?.text?.div))

  const documentDate = formatDate(composition.date)
  const authorNames = getAuthorNames(composition)
  // The IPS spec calls this `custodian`, but R4 Composition stores it on the
  // top-level `custodian` field which our entity doesn't expose. Authors are
  // a reasonable proxy for now; revisit if/when CompositionEntity adds it.

  // Multi-open accordion: opening one section doesn't collapse the others, so
  // the reader can keep e.g. Problem List + Medications visible side-by-side
  // while reviewing an IPS document. defaultValue therefore takes an array;
  // defaultExpandFirst pre-opens just the first section.
  const defaultValue: string[] =
    defaultExpandFirst && renderableSections.length > 0 ? ['section-0'] : []

  return (
    <div className="space-y-2">
      {/* Metadata strip */}
      {(documentDate || authorNames) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {documentDate && (
            <span>
              <span className="font-medium">{labels.documentDate}：</span>
              {documentDate}
            </span>
          )}
          {authorNames && (
            <span>
              <span className="font-medium">{labels.author}：</span>
              {authorNames}
            </span>
          )}
        </div>
      )}

      {/* Sections */}
      {renderableSections.length === 0 ? (
        <div className="text-xs italic text-muted-foreground">{labels.noSections}</div>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={defaultValue}
          className="space-y-1.5"
        >
          {renderableSections.map((section, idx) => {
            const title = getSectionTitle(section, resolveSectionLabel)
            const sanitized = sanitizeNarrative(section?.text?.div)
            return (
              <AccordionItem
                key={idx}
                value={`section-${idx}`}
                className="rounded-md border border-border/60 bg-background"
              >
                {/* Default AccordionTrigger ships its own chevron with the
                    correct `[&[data-state=open]>svg]:rotate-180` rotation —
                    use it as-is so the open/closed state is unambiguous. */}
                <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate font-medium">{title}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  {/* Sanitized FHIR Narrative XHTML. `prose` gives the embedded
                      tables/lists/headings sensible defaults. */}
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_th]:font-medium"
                    // eslint-disable-next-line react/no-danger -- sanitized via DOMPurify with FHIR Narrative whitelist
                    dangerouslySetInnerHTML={{ __html: sanitized }}
                  />
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </div>
  )
}
