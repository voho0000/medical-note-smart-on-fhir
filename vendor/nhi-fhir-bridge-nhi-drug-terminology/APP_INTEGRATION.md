# MediPrisma integration

This directory is an exact vendored copy of
`@nhi-fhir-bridge/nhi-drug-terminology` 0.2.0, except for this integration
note.

- Snapshot: `nhi-drug-terminology-20260728`
- ATC hierarchy snapshot: `atc-level2-2026` (94 level 2 categories)
- Vendored JSON SHA-256:
  `769e383643ee2d0a5b61357355656f01d67a174451357acd25e63c02b9deeb24`
- The snapshot contains official terminology only and no patient data.
- The App imports the module dynamically only after finding an exact TW Core
  NHI drug code and a valid `MedicationRequest.authoredOn` date.
- Source MedicationRequest fields remain authoritative and unchanged.
- Enrichment is persisted as standard FHIR R4 MedicationKnowledge and
  Provenance resources.
- The App groups medications by the governed three-character ATC category.
  It does not derive category names by slicing the full code.

When updating the package, copy `src/`, `data/`, `package.json`, `README.md`,
and `NOTICE.md` from the Bridge package together. Do not replace only the JSON:
the snapshot schema, resolver, FHIR helpers, and manifest are one versioned
unit. Re-run the App terminology tests and both static-export builds after
every update.
