# NHI FHIR Bridge — Bug Report 2026-05-27 (Part 3)

**Submitter:** MediPrisma SMART app (`voho0000/medical-note-smart-on-fhir`)
**Source bundle:** `nhi-P10109XXXX-20230525-20260525.json`
**Bridge version observed:** v0.9.2

This is the third follow-up to the 2026-05-27 audit. Part 1 covered hematology LOINC mislabelling, Part 2 covered eGFR LOINC + `valueString` overloading. Part 3 broadens the audit into **blood-gas LOINC reuse, malformed reference ranges, unit irregularities, and missing data** across other resource types.

---

## TL;DR

Six more issue classes, ordered by patient-safety impact:

1. **Blood-gas LOINC `11555-0` reused for both ABE and SBE** — two clinically distinct analytes collapse into one column.
2. **eGFR with unit `"N"`** — not a UCUM unit, breaks any unit-aware display / conversion.
3. **VGH bracket notation `[lo][hi]` in `referenceRange.text`** — non-standard, ~80 records across 10+ tests.
4. **Free-text interpretations packed into `referenceRange.text`** — strings like `正常` / `異常，建議：請洽詢醫師` aren't ranges.
5. **Specimen + threshold embedded inside `referenceRange.text`** — should be structured low/high + `appliesTo`.
6. **MedicationRequest has `dispenseRequest` but ZERO `dosageInstruction`** — 758 / 758 records. Users can see "9 tablets dispensed for 3 days" but never "1 TID after meals". Clinically significant gap.
7. **Encounter is missing physician (`participant`) and structured diagnoses** in all records.

Counts come from one patient's 526 DiagnosticReports / 724 Observations / 758 MedicationRequests / 136 Encounters.

---

## Bug C1 (HIGH — patient safety) — LOINC `11555-0` reused for both ABE and SBE

LOINC `11555-0` = **"Base excess in Arterial blood by calculation"**. Bridge emits it for two clinically distinct analytes:

| `code.text` | meaning | unit | sample value |
|---|---|---|---|
| `ABE` | Actual Base Excess (whole-blood, pH-uncorrected) | mmol/L | −1.8, −1.9 |
| `SBE` | Standard Base Excess (corrected to Hb 5 g/dL, 37 °C) | mmol/L | −2.6, −1.8 |

ABE and SBE differ in normal range and clinical interpretation — collapsing them under one LOINC means the cumulative pivot table can't distinguish them. SMART app shows one value per date, the other silently disappears (overwritten by whichever row comes last).

**Correct LOINCs:**

| Analyte | LOINC |
|---|---|
| ABE (actual / non-standardised) | `1925-7` (Base excess in Blood by calculation) |
| SBE (standardised, pH 7.40 / Hb 5 g/dL) | `1927-3` (Base excess in Arterial blood adjusted to pH 7.40) |
| (panel reference) `11555-0` | "Base excess in Arterial blood by calculation" — typically aliases to either ABE or SBE depending on the gas analyser convention; **do not** use it for both |

---

## Bug C2 (HIGH — patient safety) — eGFR with unit `"N"`

```jsonc
{
  "code": { "text": "eGFR", "coding": [{ "system": "http://loinc.org", "code": "2160-0" /* wrong; see Part 2 */ }] },
  "valueQuantity": { "value": 36.3, "unit": "N", "code": "N" }
}
```

Unit `"N"` isn't a recognised UCUM symbol. Two records affected. Combined with the wrong LOINC, an eGFR of 36.3 mL/min/1.73m² (CKD stage 3b) gets pivoted into the creatinine column with a meaningless unit string.

**Expected:** `{ "value": 36.3, "unit": "mL/min/1.73m2", "system": "http://unitsofmeasure.org" }`.

---

## Bug C3 (MEDIUM — affects ~80 observations) — VGH bracket notation `[lo][hi]` in `referenceRange.text`

`referenceRange.text` is a free-text field, but bridge consistently uses a VGH-internal `[lo][hi]` convention for qualitative / categorical results:

| `code.text` | `referenceRange.text` | What it means |
|---|---|---|
| CRYPAG | `[Negative][]` | Normal = Negative |
| RPR | `[Nonreactive][]` | Normal = Nonreactive |
| Urine Bilirubin | `[Negative][]` | Normal = Negative |
| Turbidity | `[Clear][]` | Normal = Clear |
| Color | `[Yellow][]` | Normal = Yellow |
| Anti-mitochondrial Ab | `[1:20x(-)][1:20x(-)]` | Normal = titer ≤1:20 negative |
| Misc | `[N][N]`, `[NIL][]`, `[無][]`, `[無][無]` | — |

The bracket convention isn't FHIR-standard and isn't documented anywhere a downstream consumer can discover. SMART apps end up writing VGH-specific parsers (we already have one as a workaround) or simply showing the bracket string raw to clinicians.

**Expected FHIR approach for qualitative reference values:**

```jsonc
// For qualitative "Normal = Negative" results:
"referenceRange": [{
  "type": { "coding": [{
    "system": "http://terminology.hl7.org/CodeSystem/referencerange-meaning",
    "code": "normal"
  }] },
  "text": "Negative"   // plain text, no brackets
}]

// Better: use valueCodeableConcept for the result so abnormal-detection
// can be coded:
"valueCodeableConcept": {
  "coding": [{ "system": "http://snomed.info/sct", "code": "260385009", "display": "Negative" }]
}
```

---

## Bug C4 (LOW — semantically wrong but cosmetic) — Free-text **interpretations** stuffed into `referenceRange.text`

```
referenceRange.text = "正常"
referenceRange.text = "異常，建議：請洽詢醫師"
```

These strings describe the **patient's result interpretation**, not the *range* a result is compared against. Belongs in `Observation.interpretation` (CodeableConcept) or `Observation.note`, not `referenceRange`.

---

## Bug C5 (LOW — affects urine micro-albumin etc.) — Specimen + threshold embedded in `referenceRange.text`

```
referenceRange.text = "[][Random Urine＜ 1.9]"      // specimen=Random Urine, high=1.9
referenceRange.text = "[][plasma ≦0.04]"             // specimen=plasma, high=0.04
```

Both pieces of information are structured elsewhere in FHIR:

```jsonc
"referenceRange": [{
  "high": { "value": 1.9, "unit": "mg/g" },
  "appliesTo": [{ "text": "Random Urine" }]   // or coded if available
}]
```

---

## Bug C6 (MEDIUM — clinically significant gap) — Zero `dosageInstruction` across all MedicationRequests

```
hasMedicationCC:        758  ✓
hasAuthoredOn:          758  ✓
hasRequester:           758  ✓
hasDispenseRequest:     758  ✓
hasDispenseQuantity:    758  ✓
hasSupplyDuration:      708  (~93%)
hasDosageInstruction:     0  ✗  ← problem
```

NHI 健保存摺 exposes a **用法** field for every medication (e.g. `QD AC` / `BID PC` / `Q8H`). Bridge currently drops it entirely. SMART apps can show the supply quantity ("9 tablets dispensed, 3 days") but **never** the actual dosing regimen, forcing clinicians to guess.

**Expected:**

```jsonc
"dosageInstruction": [{
  "text": "1 TAB BID PC",                      // raw NHI 用法 if no further parse
  "timing": {
    "code": { "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation",
      "code": "BID"
    }] }
  },
  "doseAndRate": [{
    "doseQuantity": { "value": 1, "unit": "TAB" }
  }],
  "additionalInstruction": [{ "text": "After meals" }]   // PC parsed
}]
```

Even just emitting the raw NHI 用法 string into `dosageInstruction[0].text` would be a huge improvement over dropping it.

---

## Bug C7 (LOW — clinical context lost) — Encounter has no physician, no structured diagnoses

```
Encounter.participant:     0 / 136 records
Encounter.location:        0 / 136 records
Encounter.diagnosis:       0 / 136 records
Encounter.period.end:     10 / 136 records (only 9 of 11 inpatient!)
```

- **`participant`** is the FHIR slot for 主治醫師 / 看診醫師. NHI 健保存摺 has 看診醫師 name for IC-card data. Bridge could populate `participant[0].individual.display = "Dr. 王XX"`.
- **`diagnosis`** is the canonical link from Encounter → Condition. Bridge currently puts ICD codes into `reasonCode` (correct) but doesn't surface them through `diagnosis[]`, which is what FHIR consumers traverse for "what was this visit about."
- **`period.end`** missing on outpatient is fine (visits are points-in-time), but missing on 1 of 11 inpatient encounters means admission/discharge dates aren't fully captured.

---

## Cumulative bug list across Parts 1-3 (for triage)

| # | Severity | Class | Summary |
|---|---|---|---|
| Part 1, Bug 1 | HIGH | LOINC | Hemogram panel `24317-0` reused for MCV/MCHC/RDW/HCT |
| Part 1, Bug 2 | HIGH | LOINC | CBC differential panel `57021-8` reused for Baso/Lym/Mono |
| Part 1, Bug 3 | HIGH | LOINC | MCH `785-6` reused for MCHC |
| Part 1, Bug 4 | HIGH | LOINC | HCT `4544-3` reused for HGB |
| Part 1, Bug 5 | HIGH | LOINC | Eosinophil `711-2` reused for Eos% |
| Part 1, Bug 6 | MED  | semantic | "溶血" as 0-value Observation under analyte LOINCs |
| Part 1, Bug 7 | LOW  | format | UCUM unit casing inconsistency |
| Part 2, Bug A | HIGH | LOINC | eGFR mislabelled as creatinine `2160-0` |
| Part 2, Bug B | HIGH | semantic | `valueString` packs numeric + qualifier into one string |
| **Part 3, Bug C1** | **HIGH** | LOINC | Base excess `11555-0` reused for ABE + SBE |
| **Part 3, Bug C2** | **HIGH** | unit | eGFR with unit `"N"` |
| **Part 3, Bug C3** | **MED**  | format | VGH `[lo][hi]` bracket convention in `referenceRange.text` |
| **Part 3, Bug C4** | **LOW**  | semantic | Free-text interpretations in `referenceRange.text` |
| **Part 3, Bug C5** | **LOW**  | format | Specimen + threshold embedded in `referenceRange.text` |
| **Part 3, Bug C6** | **MED**  | missing data | 0 / 758 MedicationRequests have `dosageInstruction` |
| **Part 3, Bug C7** | **LOW**  | missing data | Encounter missing physician / diagnosis / location |

---

## Suggested high-level fixes (recap)

1. **One LOINC per analyte, sourced from the NHI canonical mapping.** Never use a panel LOINC for individual analytes. Don't re-use the wrong analyte's LOINC because the display text is similar.
2. **`valueQuantity` for numeric, `interpretation` for qualifier, `valueCodeableConcept` for categorical.** Stop packing multiple data points into `valueString`.
3. **`referenceRange.text` should be plain text describing the normal range** — not a VGH bracket convention, not a result interpretation, not a specimen+threshold composite. Use structured fields (`low` / `high` / `appliesTo` / `type`) when possible.
4. **Populate `dosageInstruction[0].text` with the NHI 用法 string** at minimum. Structured timing/dose is nice-to-have on top.
5. **Populate `Encounter.participant`** with the 看診醫師 name when available; populate `Encounter.diagnosis[].condition` linking to Condition resources for the visit's ICD codes (already in `reasonCode`).

---

**Contact:** Same SMART app team. Happy to share the offending bundle privately for direct repro.
