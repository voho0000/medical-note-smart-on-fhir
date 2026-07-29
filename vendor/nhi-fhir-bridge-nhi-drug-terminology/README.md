# `@nhi-fhir-bridge/nhi-drug-terminology`

Versioned, offline Taiwan NHI drug terminology for application-side
enrichment. It is intentionally not invoked by the Health Bank SDK converter.

Current snapshot: `nhi-drug-terminology-20260728`.

- 224,553 official history rows accepted; zero rejected.
- 45,177 date-effective semantic records covering 45,175 NHI drug codes.
- 42,705 records carry a valid full ATC code; 40,963 also have an ATC display.
- Runtime JSON is about 12 MB uncompressed and 2 MB with ordinary HTTP gzip.
  Browser apps should lazy-import the package only when medication enrichment
  is requested.
- Survey across the 14 local SDK golden fixtures: 2,827/3,017 medication
  requests resolved (93.7%); 2,754 also resolved to full ATC. Most unsupported
  rows were seven-character concentrated Chinese-medicine codes.

## Contract

- Input key: exact NHI drug code plus ISO prescription date.
- Output: official Chinese/English names, ingredient text, strength, dosage
  form, exact full ATC code and available ATC display.
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
