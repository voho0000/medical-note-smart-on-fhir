// Custom Hook: Procedure Rows Processing
import { useMemo } from 'react'
import type { Observation } from '../types'
import { getCodeableConceptText, getConceptText, formatDate } from '../utils/fhir-helpers'
import { useLanguage } from "@/src/application/providers/language.provider"

export function useProcedureRows(procedures: any[], observations: any[] = []) {
  const { t, locale } = useLanguage()
  const isZh = locale.startsWith('zh')

  return useMemo(() => {
    if (!Array.isArray(procedures)) return []

    // Filter observations with category "procedure"
    const procedureObservations = observations.filter((obs: any) => {
      if (!obs?.category) return false
      const categories = Array.isArray(obs.category) ? obs.category : [obs.category]
      return categories.some((cat: any) => {
        const coding = cat?.coding?.[0]
        return coding?.code?.toLowerCase() === 'procedure'
      })
    })

    // ── Locale-aware code/name helpers (shared across main + child) ──────────
    // A coding can carry the other language via the FHIR `_display` translation
    // extension (the bridge adds a zh-TW translation on the PCS coding). We keep
    // coding.display as the English source and read zh from the translation when
    // present — falling back to English so pre-bilingual bundles don't regress.
    const pickTranslation = (c: any, langPrefix: string): string | undefined => {
      const exts = c?._display?.extension
      if (!Array.isArray(exts)) return undefined
      for (const e of exts) {
        if (typeof e?.url !== 'string' || !e.url.includes('translation')) continue
        const sub: any[] = Array.isArray(e.extension) ? e.extension : []
        const lang = sub.find((x) => x?.url === 'lang')?.valueCode || sub.find((x) => x?.url === 'lang')?.valueString
        const content = sub.find((x) => x?.url === 'content')?.valueString
        if (typeof lang === 'string' && lang.toLowerCase().startsWith(langPrefix) && typeof content === 'string') return content
      }
      return undefined
    }
    const codeWithDisplay = (c: any, zhName?: string): string => {
      if (!c?.code) return ''
      const name = isZh
        ? (pickTranslation(c, 'zh') || zhName || c.display)
        : (c.display || pickTranslation(c, 'en') || zhName)
      return name ? `${c.code} · ${name}` : c.code
    }

    // Pull the display fields for one Procedure resource.
    const extract = (procedure: any) => {
      const performed = procedure?.performedDateTime || procedure?.performedPeriod?.start
      let performer: string | undefined
      if (Array.isArray(procedure?.performer) && procedure.performer.length > 0) {
        performer = procedure.performer
          .map((p: any) =>
            p?.actor?.display || p?.display ||
            p?.actor?.reference?.split('/').pop() || p?.reference?.split('/').pop())
          .filter(Boolean)
          .join(", ")
      }
      const outcome = getConceptText(procedure?.outcome)
      const category = getConceptText(procedure?.category)
      const location = procedure?.location?.display
      const reasonItems: string[] = Array.isArray(procedure?.reasonCode)
        ? procedure.reasonCode
            .map((rc: any) => {
              const c = Array.isArray(rc?.coding) ? rc.coding[0] : undefined
              const name = isZh ? (rc?.text || c?.display) : (c?.display || rc?.text)
              const code = c?.code
              if (code && name) return `${code} · ${name}`
              return name || code || ''
            })
            .filter(Boolean)
        : []
      const reason = reasonItems.join(", ")
      const bodySite = getConceptText(procedure?.bodySite)
      const followUp = getConceptText(procedure?.followUp)
      const notes = Array.isArray(procedure?.note)
        ? procedure.note.map((n: any) => n?.text).filter(Boolean).join("\n")
        : undefined
      const reports = Array.isArray(procedure?.report)
        ? procedure.report.map((ref: any) => ref?.display || ref?.reference).filter(Boolean)
        : []
      const coding: any[] = Array.isArray(procedure?.code?.coding) ? procedure.code.coding : []
      const nhiCoding = coding.find((c: any) => typeof c?.system === 'string' && c.system.includes('nhi-medical-order-code'))
      const pcsCoding = coding.find((c: any) => typeof c?.system === 'string' && c.system.includes('icd-10-pcs'))
      const codeText = procedure?.code?.text
      // Title = surgery name, locale-aware: zh → 繁中 (code.text), en → NHI
      // English display; falls back to whatever is present.
      const title = (isZh
        ? (codeText || nhiCoding?.display)
        : (nhiCoding?.display || codeText)
      ) || getCodeableConceptText(procedure?.code) || "Procedure"
      return { performed, performer, outcome, category, location, reason, bodySite,
        followUp, notes, reports, nhiCoding, pcsCoding, codeText, title }
    }

    // Detail rows for a procedure. `child` keeps only the procedure-specific
    // info (the codes + outcome/site/notes) since the shared context — date,
    // facility, claim diagnosis — already shows on the parent session row.
    const buildComponents = (f: ReturnType<typeof extract>, child = false): any[] => {
      const out: any[] = []
      // Status is intentionally omitted: anything that reaches 健康存摺 is
      // already "completed", so the row carries no signal (user request).
      if (!child && f.performed) out.push({ code: { text: t.procedures.performedDate }, valueString: formatDate(f.performed) })
      if (!child && f.performer) out.push({ code: { text: t.procedures.performer }, valueString: f.performer })
      if (f.nhiCoding?.code) out.push({ code: { text: t.procedures.orderCode }, valueString: codeWithDisplay(f.nhiCoding, f.codeText) })
      if (f.pcsCoding?.code) out.push({ code: { text: t.procedures.classificationCode }, valueString: codeWithDisplay(f.pcsCoding) })
      if (!child && f.category && f.category !== "—") out.push({ code: { text: t.procedures.category }, valueString: f.category })
      if (!child && f.reason && f.reason !== "—") out.push({ code: { text: t.procedures.reason }, valueString: f.reason })
      if (f.outcome && f.outcome !== "—") out.push({ code: { text: t.procedures.outcome }, valueString: f.outcome })
      if (!child && f.location) out.push({ code: { text: t.procedures.location }, valueString: f.location })
      if (f.bodySite && f.bodySite !== "—") out.push({ code: { text: t.procedures.bodySite }, valueString: f.bodySite })
      if (f.followUp && f.followUp !== "—") out.push({ code: { text: t.procedures.followUp }, valueString: f.followUp })
      if (f.reports.length > 0) out.push({ code: { text: t.procedures.reports }, valueString: f.reports.join(", ") })
      if (f.notes) out.push({ code: { text: t.procedures.notes }, valueString: f.notes })
      return out
    }

    // ── Group by Procedure.partOf (bridge ≥0.20.x) ──────────────────────────
    // Secondary procedures of one operative session reference the main via
    // partOf. We render one collapsible row per main, nesting the children's
    // detail under it; a child whose parent isn't in this dataset falls back to
    // a standalone row so nothing is dropped.
    const refId = (ref: any): string | undefined =>
      typeof ref === 'string' ? ref.split('/').pop() : undefined
    const procById = new Map<string, any>(
      procedures.filter((p: any) => p?.id).map((p: any) => [p.id, p]),
    )
    // FHIR `partOf` is a Reference[] that may mix target types (a Procedure can
    // be part of another Procedure, or e.g. an Observation/Encounter). Scan the
    // whole list and take the first entry that resolves to another Procedure in
    // this dataset — never assume partOf[0] is the procedure parent.
    const parentIdOf = (p: any): string | undefined => {
      if (!Array.isArray(p?.partOf)) return undefined
      for (const entry of p.partOf) {
        const id = entry?.reference ? refId(entry.reference) : undefined
        if (id && procById.has(id)) return id
      }
      return undefined
    }
    const childrenByParent = new Map<string, any[]>()
    for (const p of procedures) {
      const pid = parentIdOf(p)
      if (!pid) continue
      const arr = childrenByParent.get(pid) ?? []
      arr.push(p)
      childrenByParent.set(pid, arr)
    }
    // Mains = standalone procedures + session leads (+ orphan children).
    const mains = procedures.filter((p: any) => !parentIdOf(p))

    return mains.map((procedure: any) => {
      const f = extract(procedure)
      const children = childrenByParent.get(procedure?.id) ?? []

      const components: any[] = buildComponents(f, false)
      for (const child of children) {
        const cf = extract(child)
        // Sub-procedure heading (rendered as a bold divider row).
        components.push({ code: { text: cf.title }, valueString: "", _isSubHeader: true })
        components.push(...buildComponents(cf, true))
      }

      const observation: Observation = {
        resourceType: "Observation",
        id: procedure?.id ? `procedure-${procedure.id}` : `procedure-${Math.random().toString(36).slice(2, 10)}`,
        code: { text: f.title },
        valueString: "—",
        effectiveDateTime: f.performed,
        status: procedure?.status,
        category: procedure?.category,
        component: components,
        // Render the detail components as a flat list (the row header already
        // shows the surgery name + date — no redundant title/value row).
        _detailsOnly: true,
      } as Observation

      // Related procedure-category observations sharing the same encounter.
      const procEncounter = procedure?.encounter?.reference
      const relatedObservations = procedureObservations.filter((obs: any) => {
        const obsEncounter = obs?.encounter?.reference
        return obsEncounter && procEncounter && obsEncounter === procEncounter
      })

      return {
        // Prefix with `procedure:` because ReportsCard concatenates these rows
        // with DiagnosticReport-derived rows (which use the report's raw id).
        id: procedure?.id
          ? `procedure:${procedure.id}`
          : `procedure-row-${Math.random().toString(36).slice(2, 10)}`,
        title: f.title,
        meta: `Procedure • ${procedure?.status || "—"}`,
        obs: [observation, ...relatedObservations],
        group: "procedures" as const,
        effectiveDate: f.performed,
        // Number of sub-procedures grouped under this session (0 = standalone).
        relatedCount: children.length,
      }
    })
  }, [procedures, observations, t, isZh])
}
