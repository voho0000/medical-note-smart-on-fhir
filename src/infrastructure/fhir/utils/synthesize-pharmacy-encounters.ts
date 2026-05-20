// Pharmacy-refill Encounter synthesis
//
// NHI 健保存摺 surfaces pharmacy-only dispenses as separate "藥局" rows
// alongside clinic encounters. Our bridge (NHI-FHIR-Bridge) faithfully
// transports each dispense as a MedicationRequest but does NOT emit an
// Encounter resource for pure pharmacy events — those MedicationRequests
// land with `encounter: null` and `requester.display` pointing to the
// pharmacy.
//
// Downstream (visit-history view, AI context, etc.) filters medications by
// `encounter.reference`, so orphan pharmacy refills would either:
//   (a) be silently merged into an unrelated same-day clinic visit by a
//       date-only fallback heuristic (wrong — different provider), or
//   (b) disappear entirely from the visit-history view.
//
// Both outcomes are clinically misleading. This util fixes the model:
//   1. Group orphan MedicationRequests (no encounter.reference) by
//      (authoredOn date, requester.display).
//   2. Mint a synthetic Encounter per group with a recognisable `type.text
//      = "藥局"` marker so useVisitHistory can route it to the 'pharmacy'
//      visit type.
//   3. Attach each orphan med to its newly minted synthetic encounter.
//
// FHIR R4 compliance notes:
//   - Encounter.class uses 'AMB' (ambulatory) from
//     http://terminology.hl7.org/CodeSystem/v3-ActCode — closest standard
//     code; pharmacy dispenses aren't a first-class Encounter class in
//     FHIR R4.
//   - Encounter.type[0].text carries the human label "藥局"; coding is
//     omitted because no widely-adopted code system covers pharmacy-only
//     dispense as an encounter type.
//   - status: 'finished' — the dispense is a completed event.
//   - id prefix `synthetic-pharmacy-` makes synthesised encounters easy to
//     identify and exclude from any future server round-trip.

interface SynthesisInput {
  encounters: any[]
  medications: any[]
}

interface SynthesisOutput {
  encounters: any[]
  medications: any[]
}

function toDateStr(s?: string): string | null {
  return s ? s.slice(0, 10) : null
}

/**
 * Returns a new (encounters, medications) pair where each medication that
 * had no resolvable encounter is grouped + attached to a synthesised
 * "藥局" encounter. Existing resources are not mutated.
 */
export function synthesizePharmacyEncounters({ encounters, medications }: SynthesisInput): SynthesisOutput {
  if (!Array.isArray(medications) || medications.length === 0) {
    return { encounters: encounters ?? [], medications: medications ?? [] }
  }

  // Group orphan meds by (date, requester display).
  type OrphanGroup = { date: string; requester: string; meds: any[] }
  const orphanGroups = new Map<string, OrphanGroup>()
  const passthrough: any[] = []

  for (const med of medications) {
    if (med?.encounter?.reference) {
      passthrough.push(med)
      continue
    }
    const date = toDateStr(med?.authoredOn || med?.effectiveDateTime)
    const requester = med?.requester?.display?.trim() || ''
    if (!date || !requester) {
      // No way to group safely — keep as-is (won't show in visit history,
      // but will still surface in the standalone medication list).
      passthrough.push(med)
      continue
    }
    const key = `${date}|${requester}`
    const existing = orphanGroups.get(key)
    if (existing) {
      existing.meds.push(med)
    } else {
      orphanGroups.set(key, { date, requester, meds: [med] })
    }
  }

  if (orphanGroups.size === 0) {
    return { encounters: encounters ?? [], medications: passthrough }
  }

  const syntheticEncounters: any[] = []
  const attachedMeds: any[] = [...passthrough]
  let idx = 0

  for (const group of orphanGroups.values()) {
    const synthId = `synthetic-pharmacy-${idx++}-${group.date.replace(/-/g, '')}`
    syntheticEncounters.push({
      resourceType: 'Encounter',
      id: synthId,
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      type: [{ text: '藥局' }],
      serviceProvider: { display: group.requester },
      period: { start: `${group.date}T00:00:00+08:00` },
    })
    for (const med of group.meds) {
      attachedMeds.push({
        ...med,
        encounter: { reference: `Encounter/${synthId}` },
      })
    }
  }

  return {
    encounters: [...(encounters ?? []), ...syntheticEncounters],
    medications: attachedMeds,
  }
}
