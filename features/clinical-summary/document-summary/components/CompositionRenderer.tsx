// CompositionRenderer
// Pure presentational component for ONE FHIR Composition. Renders a header
// (title / date / author / custodian) and each section's `text.div` sanitized
// through DOMPurify before injection. Adult preventive-care documents use a
// continuous report layout; other Composition types keep the section accordion.
//
// Reusable: today it lives inside DocumentSummaryCard (patient tab). When
// the bridge starts shipping discharge summaries the same component can be
// dropped into a Visits-tab discharge-summary view alongside its Encounter.
"use client"

import { useEffect, useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { CompositionEntity } from '@/src/core/entities/clinical-data.entity'
import { sanitizeNarrative, hasNarrativeContent } from '../utils/sanitize-narrative'
import {
  SECTION_LOINC,
  getSectionCode,
  isPreventiveMedicineComposition,
} from '../utils/loinc-document-types'

interface CompositionRendererProps {
  composition: CompositionEntity
  /** When true, the first renderable section is expanded by default. Used
   *  by DocumentSummaryCard when the list has exactly one Composition. */
  defaultExpandFirst?: boolean
  /** Navigation sequence that should open the cited document's sections. */
  forceExpandKey?: number
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
    fullDocument: string
    expandFullDocument: string
    collapseFullDocument: string
    sectionCount: string
  }
}

const PREVENTIVE_NARRATIVE_CLASSNAME =
  'prose prose-sm dark:prose-invert max-w-none break-words [&_col:first-child]:w-[36%] [&_ol]:my-1 [&_p]:my-1 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_table]:my-1 [&_table]:w-full [&_table]:table-fixed [&_table]:text-xs [&_td]:px-1 [&_td]:py-0.5 [&_td]:align-top [&_td]:break-words [&_th]:px-1 [&_th]:py-0.5 [&_th]:font-medium [&_th]:break-words [&_ul]:my-1'

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
  preferSourceTitle = false,
): string {
  // Continuous documents are authored as a report by Bridge, so retain their
  // exact chapter headings (e.g. 一般檢查、血壓、血脂肪) when supplied.
  if (preferSourceTitle && section?.title?.trim()) return section.title.trim()
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
  forceExpandKey,
  resolveSectionLabel,
  labels,
}: CompositionRendererProps) {
  const sections = Array.isArray(composition.section) ? composition.section : []
  // Only render sections whose narrative actually has content. (Structured-only
  // sections with no .text are already represented in the other cards.)
  const renderableSections = sections.filter((s) => hasNarrativeContent(s?.text?.div))
  const continuousDocument = isPreventiveMedicineComposition(composition)
  const compositionNarrative = continuousDocument && hasNarrativeContent(composition.text?.div)
    ? sanitizeNarrative(composition.text?.div)
    : ''

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
  const [openSections, setOpenSections] = useState(defaultValue)
  // Adult preventive care remains a continuous report, but ONE document-level
  // toggle lets readers reclaim space without turning every chapter back into
  // its own collapsible card. The requested default is still fully expanded.
  const [continuousOpen, setContinuousOpen] = useState(true)
  const allSectionValuesKey = renderableSections.map((_, index) => `section-${index}`).join('|')

  useEffect(() => {
    if (forceExpandKey === undefined || !allSectionValuesKey) return
    const timer = window.setTimeout(() => setOpenSections(allSectionValuesKey.split('|')), 0)
    return () => window.clearTimeout(timer)
  }, [allSectionValuesKey, forceExpandKey])

  useEffect(() => {
    if (!continuousDocument || forceExpandKey === undefined) return
    const timer = window.setTimeout(() => setContinuousOpen(true), 0)
    return () => window.clearTimeout(timer)
  }, [continuousDocument, forceExpandKey])

  return (
    <div className="space-y-2">
      {/* Metadata strip */}
      {(documentDate || authorNames) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.6875rem] text-muted-foreground">
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
      {continuousDocument && (compositionNarrative || renderableSections.length > 0) ? (
        <Collapsible
          open={continuousOpen}
          onOpenChange={setContinuousOpen}
          data-continuous-composition="true"
          data-composition-layout="preventive-care"
          className="@container overflow-hidden rounded-md border border-border/60 bg-background"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={continuousOpen ? labels.collapseFullDocument : labels.expandFullDocument}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 font-medium">{labels.fullDocument}</span>
              <span className="text-[0.6875rem] font-normal text-muted-foreground">
                {labels.sectionCount.replace('{count}', String(renderableSections.length))}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {continuousOpen ? labels.collapseFullDocument : labels.expandFullDocument}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${continuousOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <article data-continuous-composition-body="true" className="border-t border-border/60">
              {/* Bridge is the narrative authority for this document. Render
                  the supplied XHTML directly (after the shared XSS sanitizer),
                  first Composition.text and then section.text in source order.
                  We do not rebuild any of this report from Observations. */}
              {compositionNarrative && (
                <div
                  data-composition-narrative="true"
                  className={`${PREVENTIVE_NARRATIVE_CLASSNAME} px-3 py-2 text-xs leading-normal [&_p]:!my-0.5 [&_p]:!leading-normal`}
                  dangerouslySetInnerHTML={{ __html: compositionNarrative }}
                />
              )}
              {renderableSections.length > 0 && (
                /* Adult preventive-care reports contain many compact tables.
                   Treat them as chapters in one report rather than a vertical
                   stack of cards: a container query uses two columns only when
                   this document itself is wide enough, regardless of viewport. */
                <div
                  data-preventive-section-grid="true"
                  className={`grid grid-cols-1 gap-px bg-border/60 @min-[52rem]:grid-cols-2 ${compositionNarrative ? 'border-t border-border/60' : ''}`}
                >
                  {renderableSections.map((section, idx) => {
                    const title = getSectionTitle(section, resolveSectionLabel, true)
                    const sanitized = sanitizeNarrative(section?.text?.div)
                    return (
                      <section
                        key={idx}
                        data-composition-section={idx}
                        className="min-w-0 bg-background px-3 py-2.5"
                      >
                        <h3 className="mb-1.5 text-sm font-semibold text-foreground">{title}</h3>
                        <div
                          className={PREVENTIVE_NARRATIVE_CLASSNAME}
                          dangerouslySetInnerHTML={{ __html: sanitized }}
                        />
                      </section>
                    )
                  })}
                </div>
              )}
            </article>
          </CollapsibleContent>
        </Collapsible>
      ) : renderableSections.length === 0 ? (
        <div className="text-xs italic text-muted-foreground">{labels.noSections}</div>
      ) : (
        <Accordion
          type="multiple"
          value={openSections}
          onValueChange={setOpenSections}
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
