// Custom Hook: Group Medications
import { useMemo } from 'react'
import type { MedicationRow } from '../types'

export interface MedicationGroup {
  name: string
  activeMedications: MedicationRow[]
  inactiveMedications: MedicationRow[]
}

/** Pure grouping logic — exported for direct unit testing (the hook is just
 *  a useMemo wrapper). */
export function groupMedications(medications: MedicationRow[]) {
  const activeRaw: MedicationRow[] = []
  const inactiveByName = new Map<string, MedicationRow[]>()

  medications.forEach((med) => {
    if (med.isInactive) {
      const existing = inactiveByName.get(med.title) || []
      existing.push(med)
      inactiveByName.set(med.title, existing)
    } else {
      activeRaw.push(med)
    }
  })

  // ── Collapse duplicate-looking actives into real therapies ──────────────
  // 健保存摺 can carry several ACTIVE MedicationRequests that are really ONE
  // ongoing therapy:
  //   • 慢箋 early refill — the SAME clinic's next fill starts before the
  //     current one ends (eye drops 6/10→7/8 AND 7/1→7/29).
  //   • Pharmacy dispensing — a 社區藥局 RELEASES a 慢箋 the clinic
  //     prescribed. The 藥局 didn't prescribe anything; it's the same Rx being
  //     picked up (便通樂: 嘉恩醫院門診 + 康健藥局釋出).
  // The ONLY genuine duplicate-therapy / 重複用藥 signal is the same drug
  // prescribed by TWO DIFFERENT CLINICS — that stays as separate rows.
  //
  // So: group by drug, treat pharmacies as dispensers (not prescribers), and
  // emit ONE row per distinct PRESCRIBING clinic (folding in that clinic's
  // renewals + any pharmacy dispensing). A drug seen only at a pharmacy (its
  // prescribing visit is older/inactive) still shows — the dispensing is its
  // only active record.
  const isPharmacy = (inst?: string): boolean => /藥局|藥房/.test(inst ?? '')
  // endDate / startedOn are DISPLAY-formatted ("2026/7/8", non-zero-padded),
  // so lexicographic compare mis-orders them ("7/29" < "7/8") — parse to ms.
  const coverageTs = (m: MedicationRow): number => {
    const v = m.endDate || m.startedOn
    const ms = v ? new Date(v).getTime() : NaN
    return Number.isNaN(ms) ? -Infinity : ms
  }
  // Representative fill = furthest future coverage (its 剩X天 answers "how long
  // am I covered?"); on a tie prefer a prescriber over a pharmacy so the row
  // names the clinic.
  const representative = (fills: MedicationRow[]): MedicationRow =>
    [...fills].sort((a, b) => {
      const c = coverageTs(b) - coverageTs(a)
      if (c !== 0) return c
      return (isPharmacy(a.pharmacy) ? 1 : 0) - (isPharmacy(b.pharmacy) ? 1 : 0)
    })[0]

  const byDrug = new Map<string, MedicationRow[]>()
  for (const m of activeRaw) {
    const arr = byDrug.get(m.title)
    if (arr) arr.push(m)
    else byDrug.set(m.title, [m])
  }
  const emittedDrugs = new Set<string>()
  const active: MedicationRow[] = []
  for (const m of activeRaw) {
    if (emittedDrugs.has(m.title)) continue
    emittedDrugs.add(m.title)
    const fills = byDrug.get(m.title)!
    const prescriberFills = fills.filter((f) => !isPharmacy(f.pharmacy))
    const prescribers = [...new Set(prescriberFills.map((f) => (f.pharmacy ?? '').trim()))]

    if (prescribers.length <= 1) {
      // One therapy: a single clinic (± its renewals) + any pharmacy pickup,
      // or pharmacy-only. overlapCount flags the 已續領 chip ONLY for a genuine
      // same-clinic early refill — a pharmacy pickup is normal 領藥, merged
      // silently.
      active.push({ ...representative(fills), overlapCount: Math.max(0, prescriberFills.length - 1) })
    } else {
      // Two+ clinics prescribed the same drug → real 重複用藥: one row per
      // clinic (each with its own renewals). Pharmacy pickups dispense one of
      // these, so they don't add rows.
      for (const name of prescribers) {
        const own = prescriberFills.filter((f) => (f.pharmacy ?? '').trim() === name)
        active.push({ ...representative(own), overlapCount: own.length - 1 })
      }
    }
  }

  // Sort inactive medications by date (newest first) within each group
  inactiveByName.forEach((meds) => {
    meds.sort((a, b) => {
      const dateA = a.startedOn || ''
      const dateB = b.startedOn || ''
      return dateB.localeCompare(dateA)
    })
  })

  return {
    activeMedications: active,
    inactiveMedicationGroups: Array.from(inactiveByName.entries()).map(([name, meds]) => ({
      name,
      count: meds.length,
      medications: meds
    }))
  }
}

export function useGroupedMedications(medications: MedicationRow[]) {
  return useMemo(() => groupMedications(medications), [medications])
}
