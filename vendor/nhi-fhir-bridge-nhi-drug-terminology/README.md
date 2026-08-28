# `@nhi-fhir-bridge/nhi-drug-terminology`

Versioned, offline Taiwan NHI drug terminology for application-side
enrichment. It is intentionally not invoked by the Health Bank SDK converter.

Current snapshot: `nhi-drug-terminology-20260728`.
ATC hierarchy snapshots: `atc-level2-2026` for the existing level 2 API and
`atc-hierarchy-2026` for governed level 3-4 resolution.

- 224,553 official history rows accepted; zero rejected.
- 45,177 date-effective semantic records covering 45,175 NHI drug codes.
- 42,705 records carry a valid full ATC code; 40,963 also have an ATC display.
- All 42,705 ATC-coded records resolve to one of the 94 governed level 2
  categories in the bundled 2026 hierarchy.
- Runtime JSON is about 12 MB uncompressed and 2 MB with ordinary HTTP gzip.
  Browser apps should lazy-import the package only when medication enrichment
  is requested.
- Survey across the 14 local SDK golden fixtures: 2,827/3,017 medication
  requests resolved (93.7%); 2,754 also resolved to full ATC. Most unsupported
  rows were seven-character concentrated Chinese-medicine codes.

## Contract

- Input key: exact NHI drug code plus ISO prescription date.
- Output: official Chinese/English names, ingredient text, strength, dosage
  form, exact full ATC code and its governed ATC level 2 category.
- ATC level 2-4 English names are pinned from the WHO Collaborating Centre's
  2026 ATC Index. `nameZh` is a Bridge-maintained Taiwan clinical display
  translation, explicitly not an official WHO or TFDA translation.
- All 921 level 4 categories have a maintained display label. Familiar
  abbreviations such as `PPI`, `ACEI`, `ARB`, `SGLT2`, `GLP-1`, and `SSRI`
  remain visible when they are more useful than a long literal translation.
  The official WHO English name remains available alongside every label.
- Level 3 Chinese labels remain selective because the application timeline
  displays level 2 directly above level 4.
- No drug-name matching, regex fallback, live network request, or disease
  inference.
- A future prescription date, missing effective version, or overlapping
  semantic versions fails closed with an explicit status.
- The source `MedicationRequest` remains authoritative. Optional helpers create
  a separate FHIR R4 `MedicationKnowledge` resource and link a copy of the
  request through `supportingInformation`. A batch helper can also create
  `Provenance` pointing to the pinned official snapshot.

```ts
import {
  buildMedicationKnowledge,
  resolveNhiDrugTerminology,
} from "@nhi-fhir-bridge/nhi-drug-terminology";

const result = resolveNhiDrugTerminology("AC49322100", "2024-04-01");
if (result.status === "resolved") {
  const knowledge = buildMedicationKnowledge(result.record);
  // result.record.atcLevel2:
  // { code: "N06", nameEn: "PSYCHOANALEPTICS",
  //   nameZh: "精神興奮／抗憂鬱與失智相關用藥", ... }
}
```

`resolution.status` is one of:

- `resolved`
- `date-required`
- `unsupported-code`
- `not-found`
- `date-not-covered`
- `snapshot-out-of-range`
- `conflict`

Seven-character concentrated Chinese-medicine codes and special programme
codes are not silently treated as western-drug master entries. They return an
unresolved status unless a future separately governed terminology source is
added.

## Updating the snapshot

Download the official NHI CSV and optionally extract the TFDA ATC JSON, then:

```sh
npm run snapshot:build --workspace @nhi-fhir-bridge/nhi-drug-terminology -- \
  /path/to/A21030000I-E41001-001.csv \
  /path/to/41_5.json \
  packages/nhi-drug-terminology/data/nhi-drug-terminology-YYYYMMDD.json \
  YYYY-MM-DD
```

The builder validates the schema-relevant fields, normalizes ROC effective
dates, collapses adjacent administrative/price rows with identical clinical
semantics, and emits source/canonical SHA-256 values. Keep previous snapshots
append-only when an application has already recorded their snapshot IDs.

## Updating the ATC level 2 hierarchy

Save the 14 official ATC Index pages for `A`, `B`, `C`, `D`, `G`, `H`, `J`,
`L`, `M`, `N`, `P`, `R`, `S`, and `V` as individual HTML files. Then rebuild
the hierarchy while preserving the separately reviewed zh-TW display labels:

```sh
npm run atc-level2:build --workspace @nhi-fhir-bridge/nhi-drug-terminology -- \
  /path/to/who-level-one-pages \
  packages/nhi-drug-terminology/data/atc-level2-2026.json \
  packages/nhi-drug-terminology/data/atc-level2-2026.json \
  2026 2026-01-20 YYYY-MM-DD
```

The builder extracts only exact three-character level 2 nodes and verifies
that every anatomical group page is present. Tests pin the category count and
the SHA-256 of the official English `code|name` pairs.
