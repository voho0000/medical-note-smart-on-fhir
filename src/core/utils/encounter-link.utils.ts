// Visit-linked vs orphan clinical resources (medications, procedures, …).
//
// A resource is "visit-linked" when its `encounter` reference resolves to an
// Encounter present in the data — i.e. it happened during a recorded OPD /
// inpatient visit, so it belongs under that visit in the encounter-centric
// view. "Orphan" resources carry no resolvable encounter link — e.g. 藥局領藥
// (pharmacy pickups) that never appear in a visit record.
//
// Used to split a resource type between the two AI-context views so the same
// item isn't listed twice: visit-linked → under each visit (Visits & Treatment
// History); orphan → the resource's own section.

interface EncounterLinked {
  encounter?: { reference?: string }
}
interface EncLike {
  id?: string
}

function encounterRefId(item: EncounterLinked): string | undefined {
  const r = item.encounter?.reference
  if (!r) return undefined
  return r.includes('/') ? r.split('/').pop() : r
}

/** Set of Encounter ids present in the data (empty entries dropped). */
export function encounterIdSet(encounters: EncLike[] | undefined): Set<string> {
  return new Set((encounters ?? []).map((e) => e.id).filter((x): x is string => !!x))
}

/** True when the item points at an Encounter that exists in `ids`. */
export function isEncounterLinked(item: EncounterLinked, ids: Set<string>): boolean {
  const id = encounterRefId(item)
  return id !== undefined && ids.has(id)
}

/**
 * Split items into those linked to a known visit and the orphans. An item whose
 * `encounter` reference is missing OR dangling (points at an Encounter not in
 * the data) is treated as orphan.
 */
export function partitionByEncounterLink<T extends EncounterLinked>(
  items: T[],
  encounters: EncLike[] | undefined,
): { linked: T[]; orphan: T[] } {
  const ids = encounterIdSet(encounters)
  const linked: T[] = []
  const orphan: T[] = []
  for (const it of items) {
    if (isEncounterLinked(it, ids)) linked.push(it)
    else orphan.push(it)
  }
  return { linked, orphan }
}
