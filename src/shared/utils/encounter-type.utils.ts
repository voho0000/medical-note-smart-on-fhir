// Bridge v0.9.2 Encounter.type lookup helpers.
//
// Bridge v0.9.2 split Encounter.type into TWO CodeableConcepts, each
// self-describing its dimension via coding.system:
//
//   type: [
//     { text: "門診", coding: [{ system: ENCOUNTER_KIND_SYSTEM,    code: "outpatient", ... }] },
//     { text: "IC卡資料", coding: [{ system: ENCOUNTER_CHANNEL_SYSTEM, code: "ic-card",   ... }] }
//   ]
//
// FHIR R4 doesn't guarantee Encounter.type ordering (it's 0..*), so SMART
// apps must look entries up by coding.system rather than by array index.
// Bundles from bridge v0.9.1 and earlier collapsed both dimensions into a
// single text-only entry — callers should fall back to that path when the
// system lookup returns nothing. See bridge integration doc 2026-05-27.

export const ENCOUNTER_KIND_SYSTEM =
  'https://nhi-fhir-bridge.github.io/CodeSystem/encounter-kind'

export const ENCOUNTER_CHANNEL_SYSTEM =
  'https://nhi-fhir-bridge.github.io/CodeSystem/encounter-channel'

/**
 * Find the Encounter.type entry tagged with a specific coding.system.
 * Returns undefined for pre-v0.9.2 bundles (single-entry, no coding) so
 * the caller can fall back to the legacy field-strip logic.
 */
export function findEncounterTypeBySystem(encounter: any, system: string): any | undefined {
  return encounter?.type?.find((entry: any) =>
    entry?.coding?.some((coding: any) => coding?.system === system)
  )
}

/** Convenience: kind text ("門診" / "住院" / "急診" / "藥局") if v0.9.2 emits it. */
export function getEncounterKindText(encounter: any): string | undefined {
  const entry = findEncounterTypeBySystem(encounter, ENCOUNTER_KIND_SYSTEM)
  return entry?.text || entry?.coding?.[0]?.display
}

/** Convenience: channel text ("IC卡資料" / "申報資料") if v0.9.2 emits it. */
export function getEncounterChannelText(encounter: any): string | undefined {
  const entry = findEncounterTypeBySystem(encounter, ENCOUNTER_CHANNEL_SYSTEM)
  return entry?.text || entry?.coding?.[0]?.display
}
