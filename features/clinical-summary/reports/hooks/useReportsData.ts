// Custom Hook: Reports Data Processing
import { useMemo } from 'react'
import type { DiagnosticReport, Observation, Row } from '../types'
import { getCodeableConceptText, getConceptText } from '../utils/fhir-helpers'
import { inferGroupFromCategory } from '../utils/grouping-helpers'

// VGH bridge sends every AST DiagnosticReport with the same generic
// code.text/display ("ORDINARY CULTURE-A testcode") — the actual antibiotic
// lives in coding[0].code (AST_Flomoxef etc.). Treat that specific string as
// a known placeholder so we (a) clean it up in group titles and (b) derive a
// per-DR label from the order code for the merged accordion children.
const KNOWN_PLACEHOLDER_TITLES = new Set(['ORDINARY CULTURE-A testcode'])

function derivePerDrTitle(dr: DiagnosticReport): string {
  const text = (getCodeableConceptText(dr.code) || '').trim()
  if (text && !KNOWN_PLACEHOLDER_TITLES.has(text) && text !== '—') return text
  const orderCode = (dr.code as any)?.coding?.[0]?.code as string | undefined
  if (orderCode) return orderCode.replace(/_/g, ' ')
  return text || 'Unnamed Report'
}

function deriveGroupTitle(text: string): string {
  if (text === 'ORDINARY CULTURE-A testcode') return 'ORDINARY CULTURE-A'
  return text || 'Unnamed Report'
}

export function useReportsData(diagnosticReports: any[]) {
  return useMemo(() => {
    const rows: Row[] = []
    const seen = new Set() as Set<string>

    // Group DRs sharing (code.text, calendar date, institution) so bridge-
    // emitted multi-DR bundles (each antibiotic = one DR) collapse into one
    // accordion row. Unique-title DRs end up as single-member groups —
    // identical behaviour to per-DR processing.
    const groups = new Map<string, DiagnosticReport[]>()
    const groupOrder: string[] = []
    ;(diagnosticReports as DiagnosticReport[]).forEach((dr) => {
      if (!dr) return
      const text = (getCodeableConceptText(dr.code) || '').trim()
      const date = ((dr.effectiveDateTime || dr.issued || '') as string).slice(0, 10)
      const inst = (((dr as any)._observations?.[0]?.performer?.[0]?.display) || '').trim()
      const key = `${text}|${date}|${inst}`
      if (!groups.has(key)) {
        groups.set(key, [])
        groupOrder.push(key)
      }
      groups.get(key)!.push(dr)
    })

    for (const key of groupOrder) {
      const grp = groups.get(key)!
      const head = grp[0]
      const isMulti = grp.length > 1

      const groupText = (getCodeableConceptText(head.code) || '').trim()
      const summaryParts: string[] = []
      const attachments: string[] = []
      const allObs: Observation[] = []

      for (const dr of grp) {
        const obs = Array.isArray((dr as any)._observations)
          ? (dr as any)._observations.filter((o: any): o is Observation => !!o)
          : []
        obs.forEach((o: Observation) => {
          if (o?.id) seen.add(o.id)
        })

        // In a multi-DR group, relabel each obs with its parent DR's specific
        // test name so the accordion children are distinguishable. We clone
        // the obs (don't mutate the upstream resource).
        const perTitle = isMulti ? derivePerDrTitle(dr) : null
        for (const o of obs) {
          if (perTitle) {
            allObs.push({
              ...o,
              code: { ...(o.code || {}), text: perTitle },
            } as Observation)
          } else {
            allObs.push(o)
          }
        }

        const conclusionText = dr.conclusion?.trim()
        const conclusionCodes = getConceptText(dr.conclusionCode)
        const notes = Array.isArray(dr.note)
          ? dr.note.map((n: any) => n?.text).filter(Boolean) as string[]
          : []
        if (conclusionText) summaryParts.push(`Conclusion: ${conclusionText}`)
        if (conclusionCodes && conclusionCodes !== '—') summaryParts.push(`Conclusion Codes: ${conclusionCodes}`)
        if (notes.length > 0) summaryParts.push(notes.join('\n'))

        if (Array.isArray(dr.presentedForm)) {
          for (const form of dr.presentedForm) {
            const t = form?.title || form?.contentType
            if (t) attachments.push(t)
          }
        }
      }

      if (allObs.length === 0 && summaryParts.length === 0 && attachments.length === 0) continue

      const summaryComponents: any[] = []
      if (attachments.length > 0) {
        summaryComponents.push({
          code: { text: 'Attachments' },
          valueString: attachments.join(', '),
        })
      }

      const obsWithSummary: Observation[] = [...allObs]
      if (summaryParts.length > 0 || attachments.length > 0) {
        const summaryObservation: Observation = {
          resourceType: 'Observation',
          id: head.id ? `dr-summary-${head.id}` : `dr-summary-${Math.random().toString(36).slice(2, 10)}`,
          code: { text: 'Report Summary' },
          valueString: summaryParts.join('\n\n') || 'Supporting documents available',
          effectiveDateTime: head.effectiveDateTime || head.issued,
          status: head.status,
          component: summaryComponents,
        }
        obsWithSummary.unshift(summaryObservation)
      }

      const category = Array.isArray(head.category)
        ? head.category.map((c: any) => getCodeableConceptText(c)).filter(Boolean).join(', ')
        : getCodeableConceptText(head.category)
      const institution = (head as any)._observations?.[0]?.performer?.[0]?.display
      const rawDate = head.issued || head.effectiveDateTime

      rows.push({
        id: head.id || Math.random().toString(36),
        title: deriveGroupTitle(groupText),
        meta: `${category || 'Laboratory'} • ${head.status || '—'}`,
        obs: obsWithSummary,
        group: inferGroupFromCategory(head.category),
        institution,
        effectiveDate: rawDate,
      })
    }

    return { reportRows: rows, seenIds: seen }
  }, [diagnosticReports])
}
