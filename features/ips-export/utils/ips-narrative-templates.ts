// Per-section XHTML narrative (Composition.section.text.div) generators.
//
// IPS narratives are human-readable, language-neutral interchange artifacts.
// We keep table HEADERS in English (portable) and fill CELLS with the data's
// own display text (which may be Chinese from 健保存摺). All dynamic content is
// HTML-escaped. The div is wrapped in the required XHTML namespace.

import type {
  AllergyEntity,
  CarePlanEntity,
  ConditionEntity,
  ConsentEntity,
  DeviceEntity,
  DiagnosticReportEntity,
  ImmunizationEntity,
  MedicationEntity,
  ObservationEntity,
  ProcedureEntity,
} from '@/src/core/entities/clinical-data.entity'
import { conceptLabel, conceptLabelEn, escapeHtml, formatDate, resultLabel } from './ips-helpers'

const XHTML_NS = 'http://www.w3.org/1999/xhtml'

function wrap(inner: string): string {
  return `<div xmlns="${XHTML_NS}">${inner}</div>`
}

/** Narrative for an empty (or unavailable) section. */
export function emptyNarrative(message: string): string {
  return wrap(`<p>${escapeHtml(message)}</p>`)
}

function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return ''
  const thead = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`
  const tbody = `<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`
  return wrap(`<table>${thead}${tbody}</table>`)
}

function dash(v: string): string {
  return v && v.trim() ? v : '-'
}

function quantityText(q?: { value?: number; unit?: string }): string {
  if (q?.value == null) return ''
  return `${q.value}${q.unit ? ' ' + q.unit : ''}`
}

/** Value text for a single Observation.component (quantity or string). */
function componentValueText(c: NonNullable<ObservationEntity['component']>[number]): string {
  const q = quantityText(c.valueQuantity)
  if (q) return q
  if (c.valueString) return c.valueString
  return ''
}

/**
 * Total value extractor for an Observation — covers every value channel the
 * `ObservationEntity` model can carry, in priority order. This is the single
 * place that answers "what does this observation read as?", so neither a new
 * bundle nor a new section needs its own value-branching:
 *   1. valueQuantity            — most labs ("121 mg/dL")
 *   2. valueString              — free-text result ("Normal")
 *   3. valueCodeableConcept     — coded result (blood type, Positive/Negative)
 *   4. component[]              — multi-component, no top-level value[x]
 *                                 (e.g. blood pressure "Systolic 120 mmHg; …")
 *   5. hasMember[]              — panel-as-observation grouping; children render
 *                                 as their own rows, so surface a count not a dash
 *   6. nothing usable          — "-" (dataAbsentReason / empty)
 */
function observationValueText(o: ObservationEntity): string {
  const q = quantityText(o.valueQuantity)
  if (q) return q
  if (o.valueString) return o.valueString
  const vcc = conceptLabel(o.valueCodeableConcept)
  if (vcc) return vcc
  if (o.component?.length) {
    const parts = o.component
      .map((c) => {
        const val = componentValueText(c)
        if (!val) return ''
        const label = resultLabel(c.code)
        return label ? `${label} ${val}` : val
      })
      .filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  if (o.hasMember?.length) return `${o.hasMember.length} result(s)`
  return '-'
}

export function narrativeAllergies(allergies: AllergyEntity[]): string {
  const rows = allergies.map((a) => {
    const manifestations = (a.reaction ?? [])
      .flatMap((r) => (r.manifestation ?? []).map((m) => m.text || ''))
      .filter(Boolean)
      .join(', ')
    return [
      dash(conceptLabel(a.code)),
      dash(a.clinicalStatus || ''),
      dash(a.criticality || ''),
      dash(manifestations),
      dash(formatDate(a.recordedDate)),
    ]
  })
  return table(['Allergen', 'Status', 'Criticality', 'Reaction', 'Recorded'], rows)
}

export function narrativeMedications(medications: MedicationEntity[]): string {
  const rows = medications.map((m) => {
    const dosage = (m.dosageInstruction ?? []).map((d) => d.text || '').filter(Boolean).join('; ')
    return [
      // Prefer the English coding[].display (bridge canonical); fall back to
      // text so non-bridge sources are carried over faithfully.
      dash(conceptLabelEn(m.medicationCodeableConcept)),
      dash(m.status || ''),
      dash(dosage),
      dash(formatDate(m.authoredOn)),
    ]
  })
  return table(['Medication', 'Status', 'Dosage', 'Date'], rows)
}

export function narrativeProblemList(conditions: ConditionEntity[]): string {
  const rows = conditions.map((c) => [
    // Billing-ICD descriptions carry the English label in coding[].display.
    dash(conceptLabelEn(c.code)),
    dash(c.clinicalStatus || ''),
    dash(formatDate(c.onsetDateTime) || formatDate(c.recordedDate)),
  ])
  return table(['Problem', 'Status', 'Onset / Recorded'], rows)
}

export function narrativeImmunizations(immunizations: ImmunizationEntity[]): string {
  const rows = immunizations.map((im) => [
    dash(conceptLabel(im.vaccineCode)),
    dash(im.status || ''),
    dash(formatDate(im.occurrenceDateTime)),
  ])
  return table(['Vaccine', 'Status', 'Date'], rows)
}

export function narrativeProcedures(procedures: ProcedureEntity[]): string {
  const rows = procedures.map((p) => [
    dash(conceptLabel(p.code)),
    dash(p.status || ''),
    dash(formatDate(p.performedDateTime) || formatDate(p.performedPeriod?.start)),
  ])
  return table(['Procedure', 'Status', 'Date'], rows)
}

export function narrativeVitalSigns(vitals: ObservationEntity[]): string {
  const rows = vitals.map((o) => [
    dash(resultLabel(o.code)),
    dash(observationValueText(o)),
    dash(formatDate(o.effectiveDateTime)),
  ])
  return table(['Vital Sign', 'Value', 'Date'], rows)
}

/** Joined label for DiagnosticReport.conclusionCode (CodeableConcept | array). */
function conclusionCodeText(raw: unknown): string {
  if (!raw) return ''
  const list = Array.isArray(raw) ? raw : [raw]
  return list
    .map((cc) => conceptLabel(cc as { text?: string; coding?: Array<{ display?: string; code?: string }> }))
    .filter(Boolean)
    .join('; ')
}

/** Short, language-neutral indicator for report attachments (never inlined). */
function attachmentText(forms: DiagnosticReportEntity['presentedForm']): string {
  if (!forms?.length) return ''
  const labels = forms.map((f) => f.title || f.contentType).filter(Boolean)
  return labels.length ? `Attachment: ${labels.join(', ')}` : `Attachment (${forms.length})`
}

/**
 * Diagnostic Results narrative.
 *
 * A DiagnosticReport's presentable content is the ADDITIVE UNION of independent
 * channels — any combination of them may be present, and none suppresses
 * another. We emit a row for every channel that exists and fall back to a single
 * "-" row only when the report is genuinely empty. New bundles exercise
 * different *combinations* of these finite channels, not new channels, so this
 * never needs per-dataset branching:
 *   • conclusion        (free-text summary)
 *   • conclusionCode    (coded conclusion)
 *   • _observations[]   (member analyte values, via the total observationValueText)
 *   • presentedForm[]   (attachment indicator — base64 images are never inlined)
 *   • note[]            (supplementary notes)
 */
export function narrativeResults(
  diagnosticReports: DiagnosticReportEntity[],
  labObservations: ObservationEntity[],
): string {
  const rows: string[][] = []
  for (const o of labObservations) {
    rows.push([
      dash(resultLabel(o.code)),
      dash(observationValueText(o)),
      dash(formatDate(o.effectiveDateTime)),
    ])
  }
  for (const dr of diagnosticReports) {
    const reportLabel = dash(resultLabel(dr.code))
    const reportDate = dash(formatDate(dr.effectiveDateTime))
    let emitted = false

    const conclusion = dr.conclusion?.trim()
    if (conclusion) {
      rows.push([reportLabel, conclusion, reportDate])
      emitted = true
    }

    const codeText = conclusionCodeText(dr.conclusionCode)
    if (codeText) {
      rows.push([reportLabel, codeText, reportDate])
      emitted = true
    }

    for (const o of dr._observations ?? []) {
      rows.push([
        dash(resultLabel(o.code) || resultLabel(dr.code)),
        dash(observationValueText(o)),
        dash(formatDate(o.effectiveDateTime) || formatDate(dr.effectiveDateTime)),
      ])
      emitted = true
    }

    const attachment = attachmentText(dr.presentedForm)
    if (attachment) {
      rows.push([reportLabel, attachment, reportDate])
      emitted = true
    }

    const noteText = (dr.note ?? []).map((n) => n.text?.trim()).filter(Boolean).join('; ')
    if (noteText) {
      rows.push([reportLabel, noteText, reportDate])
      emitted = true
    }

    if (!emitted) {
      // Genuinely empty report (ordered but no result yet, no text, no media).
      rows.push([reportLabel, '-', reportDate])
    }
  }
  return table(['Result', 'Value / Conclusion', 'Date'], rows)
}

export function narrativeDevices(devices: DeviceEntity[]): string {
  const rows = devices.map((d) => [
    dash(conceptLabel(d.type) || d.deviceName?.find((n) => n.name)?.name || ''),
    dash(d.manufacturer || ''),
    dash(formatDate(d.manufactureDate)),
  ])
  return table(['Device', 'Manufacturer', 'Date'], rows)
}

export function narrativeCarePlans(carePlans: CarePlanEntity[]): string {
  const rows = carePlans.map((cp) => [
    dash(cp.title || cp.description || ''),
    dash(cp.status || ''),
    dash(formatDate(cp.period?.start) || formatDate(cp.created)),
  ])
  return table(['Plan', 'Status', 'Date'], rows)
}

export function narrativeAdvanceDirectives(consents: ConsentEntity[]): string {
  const rows = consents.map((c) => [
    dash(conceptLabel(c.scope) || conceptLabel(c.category?.[0]) || 'Advance directive'),
    dash(c.provision?.type || ''),
    dash(c.status || ''),
    dash(formatDate(c.dateTime)),
  ])
  return table(['Directive', 'Provision', 'Status', 'Date'], rows)
}
