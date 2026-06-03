// Custom Hook: Reports Data Processing
import { useMemo } from 'react'
import type { DiagnosticReport, Observation, Row } from '../types'
import { getCodeableConceptText, getConceptText } from '../utils/fhir-helpers'
import { inferGroupFromCategory } from '../utils/grouping-helpers'
import { getAnalyteLabel, getAnalyteCanonicalKey, getAnalyteDisplayLabel, CANONICAL_DISPLAY } from '@/src/shared/utils/lab-normalize'
import {
  compareTestsByPreferred,
  CANONICAL_TO_CATEGORY,
  type LabCategory,
} from '@/src/shared/utils/lab-categories'
import { getOrderNameDisplay, NHI_ORDER_CODE_TO_ZH, NHI_ORDER_CODE_TO_EN } from '@/src/shared/utils/nhi-order-names'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'

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
  const { audience } = useAudience()
  const { locale } = useLanguage()
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

    // (Previously: obsInMultiGroup suppression removed 2026-05-29.) Bridge
    // sometimes references the same Observation in BOTH a multi-obs panel
    // (e.g. "尿生化檢查" with 7 obs) AND a standalone single-obs DR — this
    // is a bridge bug (duplicate cross-reference). We previously suppressed
    // the standalone duplicate; that masked the bug. Now we let both
    // appear so the user sees the bridge-side double-reference and can
    // file/track a fix. See memory/feedback_no_masking_bridge_bugs.md.

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

      // Sort obs by the dominant category's preferredOrder so panel rows
      // render in clinical reading order (e.g. urinalysis panel: physical →
      // chemistry → microscopy → ratio; CBC: counts → differential →
      // indices) instead of whatever arbitrary order bridge emits.
      // Single-obs DRs short-circuit (nothing to sort). Mixed-category DRs
      // (rare) fall back to alphabetical ordering inside compareTestsByPreferred.
      //
      // We resolve each obs's canonical analyte key via getAnalyteLabel (the
      // same path the row label uses) and look the category up from
      // CANONICAL_TO_CATEGORY. categorizeObservation is intentionally NOT used
      // here — its allowlist is English short codes + LOINC only, so bridges
      // that send Chinese display text with NHI codes ("白血球計數" / NHI
      // 08002C, no LOINC) would categorise as null and skip the sort even
      // though the rows still render as canonical WBC/RBC/… via the Chinese
      // aliases in TEST_ALIASES.
      // Use the raw UPPERCASE canonical key for the category/sort lookups
      // below — getAnalyteLabel returns the mixed-case DISPLAY form ('HbA1c'),
      // which only matched after the defensive .toUpperCase() on line 156.
      // Non-canonical rows (cultures, free-text) resolve to null → keep the
      // medical label so they still sort/compare sensibly.
      const labels: string[] = allObs.length > 1
        ? allObs.map(o => getAnalyteCanonicalKey(o as any) ?? getAnalyteLabel(o as any))
        : []
      if (allObs.length > 1) {
        const catCounts: Record<string, number> = {}
        const catMap: Record<string, LabCategory> = {}
        for (const label of labels) {
          const cat = CANONICAL_TO_CATEGORY.get(label.trim().toUpperCase())
          if (cat) {
            catCounts[cat.id] = (catCounts[cat.id] || 0) + 1
            catMap[cat.id] = cat
          }
        }
        const dominantId = Object.entries(catCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0]
        const dominantCat = dominantId ? catMap[dominantId] : null
        if (dominantCat) {
          const cmp = compareTestsByPreferred(dominantCat)
          const indexed = allObs.map((o, i) => ({ o, label: labels[i] }))
          indexed.sort((a, b) => cmp(a.label, b.label))
          allObs.length = 0
          for (const { o } of indexed) allObs.push(o)
        }
      }

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

      // Canonical DR title selection:
      //   1. Single-obs DR — use the obs's canonical analyte label. Bridge
      //      occasionally assigns wrong DR codes (e.g. "Uric Acid" title for
      //      a urine pH observation), and the obs's own code is more reliable.
      //   2. Multi-obs DR where ALL observations canonicalise to the same
      //      analyte — use that canonical label. This catches bridge's
      //      double-emission cases (long庚嘉義 sending 鈉 + Na for one source
      //      Na row, see bridge report 2026-05-29) without masking the bug
      //      itself: the duplicate observation rows and "N 項" counter still
      //      render below, so clinicians still see the bridge issue.
      //   3. Multi-analyte panel — keep bridge's panel name (e.g. "CBC",
      //      "白血球分類計數") because the analytes inside vary.
      const obsForTitle = summaryParts.length === 0 ? allObs : []
      // Dedup on canonical key so audience switching doesn't change which
      // groups collapse to a shared-analyte title. Only the rendered string
      // varies by audience — sort and grouping logic stay canonical.
      const canonicalSet = new Set(
        obsForTitle.map((o) => getAnalyteLabel(o as any).trim()).filter(Boolean)
      )
      const sharedCanonical = canonicalSet.size === 1
        ? [...canonicalSet][0]
        : null
      // getAnalyteLabel returns the mixed-case DISPLAY form (HbA1c, IgG, …) for
      // analytes that carry a CANONICAL_DISPLAY override, and those strings are
      // NOT members of CANONICAL_KEYS (which holds the uppercase keys HBA1C /
      // IGG). Resolve the raw uppercase KEY separately so the audience/language
      // lay-name path fires for them too (HbA1c → 糖化血色素 (HbA1c)). Returns
      // null for non-canonical obs, which keep the getAnalyteLabel fallback.
      const keySet = new Set(
        obsForTitle
          .map((o) => getAnalyteCanonicalKey(o as any))
          .filter((k): k is string => Boolean(k))
      )
      const sharedKey = keySet.size === 1 ? [...keySet][0] : null
      const sharedCanonicalTitle = sharedKey
        ? getAnalyteDisplayLabel(sharedKey, audience, locale)
        : sharedCanonical
      // Multi-analyte panels / cultures / serology / imaging have no shared
      // canonical analyte, so their title falls back to the bridge's Chinese
      // NHI 醫令名 (groupText). For these, swap in a curated English name keyed
      // by the stable order code when audience=medical or the UI is English.
      // DISPLAY ONLY — grouping/dedup above still key off the Chinese groupText.
      const orderCode = (head.code as any)?.coding?.[0]?.code as string | undefined
      const panelTitle = getOrderNameDisplay(orderCode, groupText, audience, locale)
      // Patient + zh-TW: the official 健保醫令中文名 (sourced from
      // NHI_ORDER_CODE_TO_ZH) takes priority over our short lay name so each row
      // matches the patient's 健康存摺 exactly (09025C → 血清麩胺酸苯醋酸轉氨基脢,
      // not 麩草轉胺脢). For single-analyte orders we append the canonical English
      // short code for quick recognition (… (AST)), unless the official name
      // already carries a parenthetical qualifier (avoids double parens).
      const officialZh = (audience === 'patient' && locale === 'zh-TW' && orderCode)
        ? NHI_ORDER_CODE_TO_ZH[orderCode]
        : undefined
      let displayTitle: string
      if (officialZh) {
        // Prefer the analyte-level canonical short code (AST, NA, …). Serology /
        // immunology orders (ANA, IgG, AMA …) often don't resolve to a canonical
        // analyte because the bridge sends bare Chinese order text with no LOINC,
        // so fall back to the abbreviation baked into the curated order-code
        // English name, e.g. 12056B → "Anti-mitochondrial antibody (AMA)" → AMA.
        let abbr = sharedKey
          ? (CANONICAL_DISPLAY[sharedKey] || sharedKey)
          : null
        if (!abbr && orderCode) {
          const en = NHI_ORDER_CODE_TO_EN[orderCode]
          const m = en ? en.match(/\(([^()]+)\)\s*$/) : null
          if (m) abbr = m[1]
        }
        const canAppend = !!abbr
          && !officialZh.includes('(') && !officialZh.includes('（')
          && !officialZh.includes(abbr)
        displayTitle = canAppend ? `${officialZh} (${abbr})` : officialZh
      } else {
        displayTitle = (sharedCanonicalTitle && sharedCanonicalTitle !== groupText)
          ? sharedCanonicalTitle
          : panelTitle
      }

      const category = Array.isArray(head.category)
        ? head.category.map((c: any) => getCodeableConceptText(c)).filter(Boolean).join(', ')
        : getCodeableConceptText(head.category)
      const institution = getDrInstitution(head)
      const rawDate = head.issued || head.effectiveDateTime

      rows.push({
        id: head.id || Math.random().toString(36),
        title: deriveGroupTitle(displayTitle),
        // Raw bridge title (pre-display-enhancement) for history lookups —
        // useReportHistory matches this exactly against DiagnosticReport.code.text,
        // which `title` (e.g. "心電圖 (ECG)") no longer equals once an abbreviation
        // or translation is appended. Falls back to displayTitle when groupText is
        // empty so the lookup key is never blank.
        rawTitle: groupText || deriveGroupTitle(displayTitle),
        meta: `${category || 'Laboratory'} • ${head.status || '—'}`,
        obs: obsWithSummary,
        group: inferGroupFromCategory(head.category),
        institution,
        effectiveDate: rawDate,
      })
    }

    return { reportRows: rows, seenIds: seen }
  }, [diagnosticReports, audience, locale])
}
