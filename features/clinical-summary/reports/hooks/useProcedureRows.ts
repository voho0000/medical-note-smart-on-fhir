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

    return procedures.map((procedure: any) => {
      const performed = procedure?.performedDateTime || procedure?.performedPeriod?.start
      // Extract performer with better fallback logic
      let performer: string | undefined
      if (Array.isArray(procedure?.performer) && procedure.performer.length > 0) {
        performer = procedure.performer
          .map((p: any) => {
            // Try different FHIR formats
            return p?.actor?.display || 
                   p?.display || 
                   p?.actor?.reference?.split('/').pop() ||
                   p?.reference?.split('/').pop()
          })
          .filter(Boolean)
          .join(", ")
      }
      const outcome = getConceptText(procedure?.outcome)
      const category = getConceptText(procedure?.category)
      const location = procedure?.location?.display
      // Indication / diagnosis (bridge ≥0.18.15: bilingual ICD-10-CM reasonCode).
      // Follow the UI locale — zh shows the 繁中 name (text), en the English
      // (coding.display) — and prefix with the ICD-10-CM code to match the
      // code rows. Falls back to whichever language is present.
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

      // NHI medical-order code (the actual surgery, bridge ≥0.18.14) and the
      // ICD-10-PCS classification, pulled out of code.coding by system.
      const coding: any[] = Array.isArray(procedure?.code?.coding) ? procedure.code.coding : []
      const nhiCoding = coding.find((c: any) => typeof c?.system === 'string' && c.system.includes('nhi-medical-order-code'))
      const pcsCoding = coding.find((c: any) => typeof c?.system === 'string' && c.system.includes('icd-10-pcs'))
      // Follow the UI locale. The NHI order's 繁中名 is on code.text; a coding
      // can also carry the other language via the FHIR `_display` translation
      // extension (the bridge adds a zh-TW translation on the PCS coding). We
      // keep coding.display as the English source and read zh from the
      // translation when present — falling back to English if it isn't, so
      // pre-bilingual bundles don't regress.
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

      // Row title = the surgery name, locale-aware: zh shows the 繁中 name
      // (code.text), en the NHI order's English display. Falls back to whatever
      // is present so a single-language bundle never renders blank.
      const title = (isZh
        ? (procedure?.code?.text || nhiCoding?.display)
        : (nhiCoding?.display || procedure?.code?.text)
      ) || getCodeableConceptText(procedure?.code) || "Procedure"

      const components: any[] = []
      // Status is intentionally omitted: anything that reaches 健康存摺 is
      // already "completed", so the row carries no signal (user request).
      if (performed) {
        components.push({ code: { text: t.procedures.performedDate }, valueString: formatDate(performed) })
      }
      if (performer) {
        components.push({ code: { text: t.procedures.performer }, valueString: performer })
      }
      if (nhiCoding?.code) {
        // The NHI order's 繁中名 is the procedure's code.text.
        components.push({ code: { text: t.procedures.orderCode }, valueString: codeWithDisplay(nhiCoding, procedure?.code?.text) })
      }
      if (pcsCoding?.code) {
        components.push({ code: { text: t.procedures.classificationCode }, valueString: codeWithDisplay(pcsCoding) })
      }
      if (category && category !== "—") {
        components.push({ code: { text: t.procedures.category }, valueString: category })
      }
      if (reason && reason !== "—") {
        components.push({ code: { text: t.procedures.reason }, valueString: reason })
      }
      if (outcome && outcome !== "—") {
        components.push({ code: { text: t.procedures.outcome }, valueString: outcome })
      }
      if (location) {
        components.push({ code: { text: t.procedures.location }, valueString: location })
      }
      if (bodySite && bodySite !== "—") {
        components.push({ code: { text: t.procedures.bodySite }, valueString: bodySite })
      }
      if (followUp && followUp !== "—") {
        components.push({ code: { text: t.procedures.followUp }, valueString: followUp })
      }
      if (reports.length > 0) {
        components.push({ code: { text: t.procedures.reports }, valueString: reports.join(", ") })
      }
      if (notes) {
        components.push({ code: { text: t.procedures.notes }, valueString: notes })
      }

      const observation: Observation = {
        resourceType: "Observation",
        id: procedure?.id ? `procedure-${procedure.id}` : `procedure-${Math.random().toString(36).slice(2, 10)}`,
        code: { text: title },
        valueString: "—",
        effectiveDateTime: performed,
        status: procedure?.status,
        category: procedure?.category,
        component: components,
        // Render the detail components as a flat list (the row header already
        // shows the surgery name + date — no redundant title/value row).
        _detailsOnly: true,
      } as Observation

      // Find related observations with category "procedure" that share the same encounter
      const procEncounter = procedure?.encounter?.reference
      const relatedObservations = procedureObservations.filter((obs: any) => {
        const obsEncounter = obs?.encounter?.reference
        return obsEncounter && procEncounter && obsEncounter === procEncounter
      })

      return {
        // Prefix with `procedure:` because ReportsCard concatenates these rows
        // with DiagnosticReport-derived rows (which use the report's raw id).
        // FHIR ids are unique per resource type, so DiagnosticReport/1 and
        // Procedure/1 happily coexist — but as React siblings they collided
        // (key=`1`). Type prefix mirrors `orphan:${k}` used elsewhere in the
        // same merged list.
        id: procedure?.id
          ? `procedure:${procedure.id}`
          : `procedure-row-${Math.random().toString(36).slice(2, 10)}`,
        title,
        meta: `Procedure • ${procedure?.status || "—"}`,
        obs: [observation, ...relatedObservations],
        group: "procedures" as const,
        effectiveDate: performed,
      }
    })
  }, [procedures, observations, t, isZh])
}
