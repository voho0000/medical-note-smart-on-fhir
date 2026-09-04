# Medcloud 2 → FHIR bridge: bundle shape

What `medcloud2-FHIR-bridge` actually emits, characterised from its synthetic
golden (`tests/golden/synthetic-core.bundle.json`), `packages/fhir-mapper`, and
`extension/src/pipeline.ts`. This is the contract
`scripts/generate-medcloud-shaped-stress-bundle.cjs` reproduces, so a volume
fixture stresses the *real* import path rather than an invented one. No real or
de-identified patient data was read: the bridge's `data/` tree was never opened.

## Bundle envelope

- `resourceType: Bundle`, `type: "collection"`, `id` = 32 lowercase hex,
  `timestamp` = generation instant, `meta.source = "https://medcloud2.nhi.gov.tw/"`.
- `meta.tag`, in order: two `.../CodeSystem/data-class` tags
  (`clinical-reference`, then `complete-for-requested-modules`), one
  `.../CodeSystem/source-module` tag per requested module, then one
  `.../CodeSystem/module-completeness` tag per module coded
  `<module>-complete` / `-empty` / `-partial` / `-failed` with display
  `"IMUE0060 complete"`.
- Every `.../CodeSystem/...` above is under `https://cloud-wildcatch.invalid/fhir`.
- `fullUrl` is always `https://cloud-wildcatch.invalid/fhir/<Type>/<id>`; entries
  carry only `fullUrl` + `resource` (no `request`, no `search`, no `total`).
- Entry order: Patient, Organizations, then clinical resources by page type
  (`encounters`, `observations`, `medications`, `diagnostic_reports`,
  `procedures`, `document_references`, `service_requests`), then **all
  Provenance grouped at the end**.
- Ids are `sha1(parts.join('|')).slice(0, 32)`; the Patient id is the exception,
  `mc-` + 32 hex of the patient context hash.

## Modules (ten, all requested in one run)

| Module | dataset scope | resources |
| --- | --- | --- |
| IMUE0060 | `/imu/api/imue0060/imue0060s02/get-data` | Observation + lab DiagnosticReport |
| IMUE0008 | `/imu/api/imue0008/imue0008s02/get-data` | MedicationRequest, derived Encounter |
| IMUE0130 | `/imu/api/imue0130/imue0130s02/get-data` | imaging / pathology DiagnosticReport |
| IMUE0030 | `/imu/api/imue0030/imue0030s02/get-data` | dental Procedure + Encounter |
| IMUE0010 | `/imu/api/imue0010/imue0010s02/get-data` | ServiceRequest + Encounter |
| IMUE0070 | `/imu/api/imue0070/imue0070s02/get-data` | inpatient Encounter + DocumentReference |
| IMUE0080 | `/imu/api/imue0080/imue0080s02/get-data` | rehabilitation Procedure + Encounter |
| IMUE0120 | `/imu/api/imue0120/imue0120s01/pres-med-day` | Basic (remaining-days summary) |
| IMUE0140 | `/imu/api/imue0140/imue0140s01/hpa-data` | Composition 75484-6 + Observation |
| IMUE0150 | `/imu/api/imue0150/imue0150s01/hpa-data` | cancer-screening Observation |

## Applied to every clinical resource

`meta.source` forced to the MediCloud URL; `meta.tag` gains
`source-module` (lowercase, e.g. `imue0060`), `adapter-version`, and
`data-class: clinical-reference`. `status` is forced to `"unknown"` on
Observation, DiagnosticReport and MedicationRequest. `DiagnosticReport.issued`
is deleted. Day-precision dates (`YYYY-MM-DD`) for `effectiveDateTime`,
`authoredOn`, `performedDateTime`.

## Per type

- **Patient** — `mc-<32 hex>` id; masked `.../IdentifierSystem/masked-tw-national-id`
  identifier, anonymous `name[0].text`, `gender`, `birthDate`. Never decorated,
  never gets a Provenance.
- **Organization** — `.../sid/medcloud-provider` identifier, `name` only, no tags,
  no Provenance. Displays elsewhere are back-filled with `reference`.
- **Encounter** — `class` is a single Coding on `v3-ActCode` (`AMB` / `IMP` /
  `EMER`); `status` `finished`, or `unknown` for an IMP with no end.
  `type[].text` carries 門診 / 住院 / 急診 with a
  `.../CodeSystem/encounter-kind` coding, plus an `encounter-channel` coding.
  `serviceType` for dental/TCM only; otherwise `{ text: <department> }`.
  `period` is plain `YYYY-MM-DD`. `serviceProvider` = display + Organization
  reference. `reasonCode[]` codes on `http://hl7.org/fhir/sid/icd-10-cm` with a
  dot-normalised code and Chinese `.text`. No `identifier`, no `diagnosis`.
- **Observation (lab)** — `category` `laboratory`; `code.coding` is LOINC first
  (only when provable), then the NHI order code on
  `medical-service-payment-tw`, then the HIS-local code on
  `.../upstream-local/CodeSystem/his-local-lab`; `code.text` is usually Chinese.
  `referenceRange[].text` is always present (the raw range string);
  `interpretation` uses `v3-ObservationInterpretation` (`H`/`L`/`N`/`A`/`AA`).
  `specimen` is a **display-only Reference** — the bridge never emits a Specimen
  resource. Extension `.../medcloud-source-report-instance-time` (valueString).
- **DiagnosticReport (lab)** — `category` `v2-0074` `LAB`, `result[]` refs, no
  `conclusion`, no `presentedForm`, optional `basedOn` → ServiceRequest.
- **DiagnosticReport (imaging, IMUE0130)** — `category` `v2-0074` `RAD` / `PAT`
  / `EC` … with a Chinese `category[0].text`; the whole narrative lives in
  `conclusion`; `identifier` on `.../IdentifierSystem/medcloud-imaging-case`;
  `presentedForm` only as `{contentType: "text/html", url, title}` for a trusted
  NHI viewer link (no image bytes are ever downloaded).
- **ServiceRequest (IMUE0010)** — `status: unknown`, `intent: order`,
  `category[0].text` one of 檢驗醫囑 / 影像檢查醫囑 / 檢查醫囑, code on
  `.../CodeSystem/medcloud-local-medical-order`, `occurrenceDateTime`,
  `quantityQuantity`.
- **MedicationRequest** — `status: "unknown"`, `intent: "order"`,
  `reportedBoolean: true`; `medicationCodeableConcept` on
  `medication-nhi-tw` (+ ATC7 on `http://www.whocc.no/atc`); `authoredOn` day
  precision; `requester` = `"<hospital>;<setting>"` + Organization reference;
  `dispenseRequest.quantity` is a bare `{value}` and
  `dispenseRequest.expectedSupplyDuration` is
  `{value, unit: "days", system: "http://unitsofmeasure.org", code: "d"}`;
  `dosageInstruction[0].text` (often `給藥總量 X，給藥日數 N 天`);
  `reasonCode[]` ICD-10-CM. Extensions, in order:
  `medcloud-source-medication-end-date` (valueString),
  `medcloud-atc-level-3/5/7`, `medcloud-source-drug-class`,
  `medcloud-source-facility` (valueReference), `medcloud-source-setting`,
  `medcloud-single-prescription-remaining-days`
  (`valueQuantity` in UCUM `d`), `medcloud-drug-ingredient`,
  `medcloud-related-medication-remaining-summary` → `Basic/<id>`.
  `expectedSupplyDuration` + `authoredOn` is the **only** currency evidence the
  app has, because `status` is always `unknown`
  (`isMedicationCurrentlyInUse`, `src/core/utils/clinical-context-selection.utils.ts`).
- **Basic (IMUE0120)** — `code` on `.../CodeSystem/medcloud-basic-resource-type`
  = `medication-remaining-summary`, `identifier` on
  `.../IdentifierSystem/medcloud-drug-group`, one complex extension
  `medcloud-medication-remaining-summary` whose nested `url`s are bare names.
- **Procedure** — `status` `completed` (IMUE0030 with a parseable date) else
  `unknown`; `performedPeriod` or `performedDateTime`; `performer[].actor`
  (note the nesting, unlike Observation/DiagnosticReport).
- **DocumentReference (IMUE0070 出院病摘)** — *not* a Composition.
  `type` LOINC `18842-5` with `text: "出院病摘"`, US-Core `clinical-note`
  category, `identifier` on `.../nhi-inpatient-row`, `custodian`, and
  `content[0].attachment` = `{contentType: "text/html", language: "zh-TW",
  data: <base64 UTF-8 HTML>, title: "出院病摘 — <院所> <start>~<end>", size, hash}`.
  `context.encounter[0]` + `context.period`. `DocumentReference.date` is deleted,
  so the app reads `context.period.start` as the document date.
- **Composition (IMUE0140)** — LOINC `75484-6` 成人預防保健結果, `language: "zh-TW"`,
  document-level `text.div`, and exactly nine sections coded on
  `https://nhi-fhir-bridge.github.io/CodeSystem/adult-preventive-section`:
  `general-examination`, `blood-pressure`, `blood-lipids`, `blood-glucose`,
  `renal-function`, `uric-acid`, `urinalysis`, `metabolic-syndrome`,
  `liver-function` — each with an HTML table `text.div` and `entry[]` refs.
- **Provenance** — **one per clinical resource** (Patient / Organization get
  none). `target[]`, `recorded` = bundle timestamp, `activity` `CREATE` with
  text `Transform IMUE0060 reference data to FHIR R4`,
  `agent[0].who.display = "雲端懷爾抓抓"`, `entity[0]` on
  `.../sid/source-capture-artifact`, and four `meta.tag`s (`source-module`,
  `adapter-version`, `source-dataset-scope` with the API path as display,
  `source-captured-at`).

Never emitted: AllergyIntolerance, Condition, Immunization, CarePlan, Specimen,
ImagingStudy, Media, Practitioner, Device, Coverage. The only `text.div` in the
bundle is on Composition.

## What `LocalBundleService.parse` needs (repo A)

`src/infrastructure/fhir/services/local-bundle.service.ts:1215`. It
canonicalises ids/references first, then requires **exactly one Patient** that
`PatientMapper.toDomain` accepts — otherwise it returns `null`. Everything else
is `byType()` filtering, so unknown types are simply dropped (Provenance is
ignored, which is why per-resource Provenance costs tokens but adds no context).
Encounters are indexed by `period.start` and by `period.start|serviceProvider.display`
so medications attach to a same-day visit. Discharge grouping for
`deduplicatedAdmissions` is `serviceProvider (reference || display, NFKC,
lowercased)` + the **first ICD** of `extractEncounterIcds(encounter)`
(`src/core/utils/clinical-documents.utils.ts:65`) — both halves must exist or
the document stays distinct.

## Deviation notes for the synthetic fixture

- The golden's MedicationRequest carries `groupIdentifier` on
  `https://nhi-fhir-bridge.github.io/IdentifierSystem/medication-semantic-group`;
  the current mapper source does not emit it. The fixture keeps it, matching the
  golden.
- Per-resource Provenance is ~400 estimated tokens of pretty-printed JSON, so a
  bridge-shaped chart reaches 1M tokens with far fewer clinical resources than a
  flat synthetic bundle. Resource counts in this fixture are chosen with that
  tax in mind.
