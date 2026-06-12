// Dose and Frequency Helper Functions
import type { DosageInstruction, CodeableConcept } from '@/src/shared/types/fhir.types'
import { getCodeableConceptText } from '@/src/shared/utils/fhir-helpers'

type DoseAndRate = NonNullable<DosageInstruction['doseAndRate']>[number]
type TimingRepeat = NonNullable<NonNullable<DosageInstruction['timing']>['repeat']>

function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : n
}

function normalizeFormUnit(u?: string): string {
  if (!u) return ""
  const s = u.toLowerCase().trim()
  if (["tablet", "tablets", "tab", "tabs", "錠"].includes(s)) return "tab"
  if (["capsule", "capsules", "cap", "caps"].includes(s)) return "cap"
  if (["milliliter", "milliliters", "ml", "mL"].includes(s)) return "mL"
  if (["drop", "drops", "gtt"].includes(s)) return "drop"
  if (["puff", "puffs", "actuation", "spray", "sprays"].includes(s)) return "puff"
  if (["mg","g","mcg","μg","ug"].includes(s)) return s
  return u
}

export function humanDoseAmount(doseAndRate?: DoseAndRate[], text?: string): string {
  const d = doseAndRate?.[0]
  
  if (d?.doseQuantity?.value != null) {
    const v = round1(d.doseQuantity.value!)
    const u = normalizeFormUnit(d.doseQuantity.unit || "")
    return `${v}${u ? " " + u : ""}`
  }
  
  if (d?.doseRange?.low?.value != null || d?.doseRange?.high?.value != null) {
    const lo = d.doseRange.low
    const hi = d.doseRange.high
    const unit = normalizeFormUnit(lo?.unit || hi?.unit || "")
    const left = lo?.value != null ? String(round1(lo.value)) : ""
    const right = hi?.value != null ? String(round1(hi.value)) : ""
    const core = left && right ? `${left}-${right}` : (left || right)
    if (core) return `${core}${unit ? " " + unit : ""}`
  }
  
  if (text) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(tab(?:let)?s?|cap(?:sule)?s?|mL|ml|mg|mcg|g|drop(?:s)?|puff(?:s)?)/i)
    if (m) {
      const val = m[1]
      const unit = normalizeFormUnit(m[2])
      return `${val} ${unit}`
    }
  }
  
  return ""
}

export function humanDoseFreq(rep?: TimingRepeat): string {
  if (!rep) return ""
  const freq = rep.frequency ?? 0
  const period = rep.period ?? 0
  const unitRaw = (rep.periodUnit || "").toLowerCase()

  const unit =
    unitRaw.startsWith("d") ? "day" :
    unitRaw.startsWith("h") ? "hour" :
    unitRaw.startsWith("wk") ? "week" :
    unitRaw.startsWith("mo") ? "month" :
    unitRaw

  if (unit === "day" && period === 1) {
    const map: Record<number, string> = { 1: "QD", 2: "BID", 3: "TID", 4: "QID" }
    const code = map[freq]
    if (code) return code
    if (freq > 0) return `${freq}×/day`
  }

  if (unit === "hour" && period > 0 && freq === 1) return `q${period}h`
  if (unit === "week" && period === 1 && freq === 1) return "QW"
  if (unit === "month" && period === 1 && freq === 1) return "QM"

  if (unit === "day" && period > 0 && freq > 0) return `${freq}× every ${period} day${period > 1 ? "s" : ""}`
  if (unit === "hour" && period > 0 && freq > 0) return `${freq}× q${period}h`
  if (unit === "week" && period > 0 && freq > 0) return `${freq}× every ${period} week${period > 1 ? "s" : ""}`
  if (unit === "month" && period > 0 && freq > 0) return `${freq}× every ${period} month${period > 1 ? "s" : ""}`

  return ""
}

export function buildDetail({
  doseAndRate, 
  doseText, 
  route, 
  repeat
}: {
  doseAndRate?: DoseAndRate[]
  doseText?: string
  route?: CodeableConcept
  repeat?: TimingRepeat
}): string {
  const dose = humanDoseAmount(doseAndRate, doseText)
  const r = getCodeableConceptText(route)
  const freq = humanDoseFreq(repeat)

  const parts = [
    dose ? `Dose: ${dose}` : "",
    r !== "—" ? `Route: ${r}` : "",
    freq ? `Freq: ${freq}` : "",
  ].filter(Boolean)

  return parts.join(" · ")
}
