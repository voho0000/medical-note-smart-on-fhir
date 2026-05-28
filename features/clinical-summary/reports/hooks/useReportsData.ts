// Custom Hook: Reports Data Processing
import { useMemo } from 'react'
import type { DiagnosticReport, Observation, Row } from '../types'
import { getCodeableConceptText, getConceptText } from '../utils/fhir-helpers'
import { inferGroupFromCategory } from '../utils/grouping-helpers'
import { getAnalyteLabel } from '@/src/shared/utils/lab-normalize'

function derivePerDrTitle(dr: DiagnosticReport): string {
  const text = (getCodeableConceptText(dr.code) || '').trim()
  if (text && text !== '—') return text
  // Fallback for DRs with no human-readable code.text — surface the raw
  // coding entry instead of "Unnamed Report" so downstream renderers
  // still get an identifying label.
  const orderCode = (dr.code as any)?.coding?.[0]?.code as string | undefined
  if (orderCode) return orderCode.replace(/_/g, ' ')
  return text || 'Unnamed Report'
}

function deriveGroupTitle(text: string): string {
  return text || 'Unnamed Report'
}

// Lab DRs carry performer on the linked Observations (bridge convention);
// imaging DRs typically have no linked Observations and put performer on the
// DiagnosticReport itself. Fall through both before giving up.
function getDrInstitution(dr: any): string | undefined {
  return dr?._observations?.[0]?.performer?.[0]?.display
    || dr?.performer?.[0]?.display
    || undefined
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
      const inst = (getDrInstitution(dr) || '').trim()
      const key = `${text}|${date}|${inst}`
      if (!groups.has(key)) {
        groups.set(key, [])
        groupOrder.push(key)
      }
      groups.get(key)!.push(dr)
    })

    // Pre-pass: collect obs IDs claimed by multi-obs groups so that single-obs
    // DRs whose observation already appears inside a panel can be suppressed.
    // This prevents a rogue single-obs DR (e.g. "Uric Acid" referencing a urine
    // pH observation that is also listed inside a "尿生化検查" 7-obs panel) from
    // creating a duplicate standalone row.
    const obsInMultiGroup = new Set<string>()
    for (const key of groupOrder) {
      const grp = groups.get(key)!
      const totalObs = grp.reduce((n, dr) => {
        const o: any[] = Array.isArray((dr as any)._observations) ? (dr as any)._observations : []
        return n + o.length
      }, 0)
      if (totalObs > 1) {
        for (const dr of grp) {
          const o: any[] = Array.isArray((dr as any)._observations) ? (dr as any)._observations : []
          o.forEach((obs: any) => { if (obs?.id) obsInMultiGroup.add(obs.id) })
        }
      }
    }

    for (const key of groupOrder) {
      const grp = groups.get(key)!
      const head = grp[0]
      const isMulti = grp.length > 1

      // Skip single-obs DR rows whose observation is already shown inside a panel
      const groupObsIds = grp.flatMap(dr => {
        const o: any[] = Array.isArray((dr as any)._observations) ? (dr as any)._observations : []
        return o.map((obs: any) => obs?.id).filter(Boolean) as string[]
      })
      if (groupObsIds.length === 1 && obsInMultiGroup.has(groupObsIds[0])) {
        groupObsIds.forEach(id => seen.add(id))
        continue
      }

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
        // test name so the accordion children are distinguishable — but only
        // when the DR's own title differs from the group title. When all DRs
        // share the same name (e.g. same panel split across multiple DRs), the
        // individual observation names are already the right labels. We clone
        // the obs (don't mutate the upstream resource).
        const drTitle = derivePerDrTitle(dr)
        const perTitle = (isMulti && drTitle !== groupText) ? drTitle : null
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

      // NOTE: Do NOT add UI dedup here even when bridge double-emits the same
      // measurement (e.g. 長庚嘉義 emitting both '鈉' + 'Na' for one source
      // row — see bridge report 2026-05-29). Masking it on the app side
      // would hide the bridge bug from the user and from future audits.
      // See memory/feedback_no_masking_bridge_bugs.md for the standing rule.

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

      // For a single-obs DR with no summary text, the observation's own code is
      // more reliable than the DR title — bridge data sometimes assigns wrong DR
      // codes (e.g. "Uric Acid" title for a urine pH observation). Use
      // getAnalyteLabel so recognised analytes show the canonical English short
      // code (Na / K / BUN / …) matching the cumulative-report header instead
      // of whichever Chinese / English variant the source hospital sent.
      // Multi-obs DRs keep their panel title (groupText) which is correct as-is.
      const singleObsTitle = (allObs.length === 1 && summaryParts.length === 0)
        ? getAnalyteLabel(allObs[0] as any).trim()
        : null
      const displayTitle = (singleObsTitle && singleObsTitle !== groupText)
        ? singleObsTitle
        : groupText

      const category = Array.isArray(head.category)
        ? head.category.map((c: any) => getCodeableConceptText(c)).filter(Boolean).join(', ')
        : getCodeableConceptText(head.category)
      const institution = getDrInstitution(head)
      const rawDate = head.issued || head.effectiveDateTime

      rows.push({
        id: head.id || Math.random().toString(36),
        title: deriveGroupTitle(displayTitle),
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
