# Hospital ingredients in CDSS

The live CDSS feature passes hospital medication records through
`utils/hospital-medication-profile.ts` before the released FHIR adapter. The
same exact recorded-name catalogue used in the medication pane supplies an
ingredient-only `HostMedication.drugTerminology` input. No official-master
source/snapshot, NHI drug code, ATC code, product identity, strength-to-dose
conversion, or grouping is manufactured. Existing official NHI terminology
takes priority. Unresolved or contradictory aliases remain unresolved.

This is a CDSS-only copy: imported FHIR, the medication list, and its original
status and dosage remain intact. Each derived fact cites the original resource
type/id, date, coding, and status. Mapping origin, catalogue version, and the
verified alias reference are retained. The extra profile evidence contains
minimal fact citations, never duplicate raw resources. Integration does not
send, log, or persist a new
patient-data payload automatically.

## Use-state policy

The policy is scoped to the VGH generic/product coding systems, including
unresolved names; it does not change national-cloud prescription interpretation.

| Hospital source record | CDSS interpretation |
| --- | --- |
| Active MedicationStatement, not future-dated | Confirmed current use |
| Active/unknown/missing-status MedicationRequest | Order recorded; actual use unconfirmed |
| Above record with expired dispensing validity | Historical order; actual use unconfirmed |
| On hold | On hold |
| Stopped, completed, not taken | Not current |
| Cancelled or entered in error | Excluded from class findings and reconciliation |
| Future active statement | Unconfirmed; cannot establish current use |

FHIR `dispenseRequest.validityPeriod` describes when a prescription may be
dispensed, not when the patient takes it. Neither that window nor a recent
expected supply promotes an EHR order to confirmed use. See the
[FHIR R4 definition](https://hl7.org/fhir/R4/medicationrequest-definitions.html#MedicationRequest.dispenseRequest.validityPeriod).

The released cloud adapter treats active orders and recently completed supplies
as taken. Unconfirmed and ended EHR records therefore use a non-current status
on the internal copy only. The host restores emitted citation and prescribing-timeline statuses and
adds explicit class uncertainty, rather than exporting that internal status.
A confirmed same-class national-cloud prescription or medication statement
continues to establish current use.

## Care-pack compatibility

The current care packs also assume the cloud's two-state model. At evaluation
time `utils/hospital-medication-review.ts` preserves unknown source evidence in
affected medication decisions and evidence-table rows. Such decisions require
reconciliation rather than declaring therapy absent or exposure confirmed.
Known actionable safety findings keep their status and priority when a second
drug is unconfirmed. The adapted result is the one rendered and used by companion care-pack views;
Chinese and English evaluations use the same policy. A pending module also
retires its derived start/titrate visit decision, so the decision map reads the
reconciliation status rather than an action calculated from unconfirmed use. No route, care-pack, or
clinical surface is hidden or disabled.

An unresolved ingredient in an active/unconfirmed hospital record also prevents
negative class findings: otherwise unmatched classes become uncertain, while
known confirmed-current and held classes remain intact.

A shared reconciliation panel names the pending source records and ingredient
provenance across CDSS layouts. Confirming actual use currently requires a
source MedicationStatement/current-medication update; this change does not
invent a new clinician-confirmation control or assume a historical prescription
was stopped. Ingredients outside existing care-pack classes are retained as
evidence but do not acquire new clinical rules.

Validation uses fictional records: ingredient classification, source provenance,
unchanged dosage units, historical active orders, validity windows, negative
statuses, same-class confirmed evidence, unknown aliases, live feature wiring,
real care-pack output, and browser import/re-import and responsive checks.
