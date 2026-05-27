# NHI FHIR Bridge — Bug Report 2026-05-27 (Part 2)

**Submitter:** MediPrisma SMART app (`voho0000/medical-note-smart-on-fhir`)
**Source bundle:** `nhi-P10109XXXX-20230525-20260525.json` (135 Encounters, ~516 Observations)
**Bridge version observed:** v0.9.2

This is a follow-up to the 2026-05-27 report. Two additional bug classes surfaced when extending the audit beyond hematology into chemistry analytes.

---

## TL;DR

1. **eGFR observations are tagged with the creatinine LOINC `2160-0`** in some records — same patient, same bundle, the OTHER eGFR records use the correct `33914-3`. SMART apps that pivot by LOINC put the eGFR value (e.g. 33) into the creatinine column. Patient appears to have CREA = 33 mg/dL (instant fatal-looking value) when in reality their eGFR is 33 mL/min/1.73m² (CKD stage 3, the actual creatinine is around 1.94 mg/dL).

2. **`valueString` packs two distinct data points into one string** for several Observations (eGFR, UACR, urine glucose, albumin, AMA titer), and drops `valueQuantity` entirely. Any downstream consumer doing math on the value — trend chart, abnormal-flag derivation, AI tool reasoning — silently breaks because the numeric is hidden inside a string like `"33 (stage3:30-59)"`.

Both are **patient-safety issues** — users misread the displayed lab value.

---

## Bug A (HIGH — patient safety) — eGFR mislabelled with creatinine LOINC `2160-0`

LOINC `2160-0` = **"Creatinine [Mass/volume] in Serum or Plasma"** — bridge uses it for eGFR records whose `code.text = "Estimated GFR"`. Records whose `code.text = "eGFR"` get the correct LOINC `33914-3`. Inconsistent within the SAME bundle.

### Evidence

```jsonc
// WRONG — 4 records like this
{
  "code": {
    "text": "Estimated GFR",
    "coding": [
      { "system": "http://loinc.org",
        "code": "2160-0",
        "display": "Creatinine [Mass/volume] in Serum or Plasma" }
    ]
  },
  "valueString": "33 (stage3:30-59)"
}

// CORRECT — 2 records like this in the same bundle
{
  "code": {
    "text": "eGFR",
    "coding": [
      { "system": "http://loinc.org",
        "code": "33914-3",
        "display": "Glomerular filtration rate ... MDRD ..." }
    ]
  },
  "valueQuantity": { "value": 45.4, "unit": "mL/min/1.73m2" }
}
```

### Symptom in our app

User saw `CREA = 33 mg/dL` (stage3:30-59) in our cumulative lab pivot table on multiple dates. Real creatinine values for the same patient are around 1.6–1.94 mg/dL. The 33s were eGFR values misrouted by the wrong LOINC.

### Correct LOINC reference for eGFR

| Formula | LOINC |
|---|---|
| MDRD | `33914-3` |
| CKD-EPI 2009 (non-Black) | `62238-1` |
| CKD-EPI 2009 (Black) | `88293-6` |
| CKD-EPI 2021 (race-free, recommended) | `98979-8` |

`2160-0` is serum creatinine — **never** an eGFR formula.

### Suggested fix

Bridge should drive LOINC selection from the **NHI medical-order code**, not from `code.text` heuristics. NHI publishes the canonical NHI→LOINC mapping; any text variation ("eGFR" vs "Estimated GFR" vs "估算腎絲球過濾率") should land on the same LOINC because the NHI code is identical.

---

## Bug B (HIGH — semantic data loss) — `valueString` packs numeric + qualifier into one string

Multiple Observations stuff two data points into one `valueString` and **never set `valueQuantity`**, so consumers doing numeric work can't recover the number without string parsing (which is brittle and locale-dependent).

### Observed patterns

| `code.text` | LOINC | `valueString` | What's actually in there |
|---|---|---|---|
| `Estimated GFR` | `2160-0` (also wrong; see Bug A) | `"33 (stage3:30-59)"` | numeric **33** + CKD stage **G3a** |
| `UACR(半定量)` | `14959-1` | `"1+ (80)"` | dipstick grade **1+** + quantitative **80** mg/g |
| `Glucose` (Urine) | `5792-7` | `"4+ (2000)"` | dipstick grade **4+** + quantitative **2000** mg/dL |
| `Albumin` | (varies) | `"2.3(  36.1%)"` | absolute albumin **2.3 g/dL** + albumin **fraction 36.1%** |
| `Anti-mitochondrial Ab (AMA)*` | `16124-0` | `"1:20(-)"` | titer **1:20** + qualitative **negative** |

### Impact on consumers

- **Trend charts / pivot tables** can't plot a numeric series; the entire column is hidden or shown as text-only.
- **Abnormal-flag derivation** (value vs referenceRange) is impossible without parsing.
- **AI tool reasoning** sees a string and doesn't know whether the patient's glucose is 4+ severity or 2000 mg/dL severe (they're correlated but not interchangeable).
- **Cross-institution merges** fail because string formats differ ("33 (stage3)" vs "33 stage3" vs "stage 3, 33").

### Suggested FHIR-conformant fixes (pick whichever maps best per analyte)

```jsonc
// Pattern 1 — valueQuantity + interpretation (best for eGFR)
{
  "code": { "coding": [{ "system": "http://loinc.org", "code": "33914-3" }] },
  "valueQuantity": { "value": 33, "unit": "mL/min/1.73m2",
                     "system": "http://unitsofmeasure.org" },
  "interpretation": [{
    "coding": [{
      "system": "http://hl7.org/fhir/sid/icd-10",  // or KDIGO code system
      "code": "G3a",
      "display": "CKD stage 3a"
    }]
  }]
}

// Pattern 2 — valueQuantity + component for the semi-quantitative grade
//            (best for urine dipstick + UACR)
{
  "code": { "coding": [{ "system": "http://loinc.org", "code": "5792-7" }] },
  "valueQuantity": { "value": 2000, "unit": "mg/dL" },
  "component": [{
    "code":  { "text": "Dipstick grade" },
    "valueCodeableConcept": { "text": "4+" }
  }]
}

// Pattern 3 — split into separate Observations
//            (best when the two values are clinically independent, like
//             absolute albumin g/dL vs albumin fraction %)
{ "code": "...Albumin...",          "valueQuantity": { "value": 2.3,  "unit": "g/dL" } }
{ "code": "...Albumin fraction...", "valueQuantity": { "value": 36.1, "unit": "%"   } }

// Pattern 4 — valueQuantity (titer) + valueCodeableConcept on component
//            (titers — preserve both the dilution and the qualitative call)
{
  "code": { "coding": [{ "system": "http://loinc.org", "code": "16124-0" }] },
  "valueRatio": { "numerator":   { "value": 1 },
                  "denominator": { "value": 20 } },
  "interpretation": [{
    "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                 "code": "NEG", "display": "Negative" }]
  }]
}
```

---

## How we found these (reproducible)

```javascript
// Scan the bundle for Observations whose code.text mentions an analyte
// different from what the LOINC's official display says — see prior report
// for the helper. The new findings came from extending the analyte token
// list beyond hematology to renal/liver/lipid/glucose.

// Also scan for valueString values that start with a digit (anti-pattern —
// suggests the bridge should have set valueQuantity).
obs.filter(o => !o.valueQuantity && o.valueString && /^[\d.-]/.test(o.valueString.trim()))
```

---

## Regression test additions

```
eGFR (any text variant: "eGFR" / "Estimated GFR" / "估算腎絲球過濾率")
  → LOINC must be one of 33914-3, 62238-1, 88293-6, 98979-8
  → NEVER 2160-0 (that's serum creatinine)
  → numeric value in valueQuantity, not valueString
  → CKD stage in interpretation, not concatenated into the value

Urine dipstick + semi-quantitative (UACR, glucose, etc.)
  → quantitative value in valueQuantity
  → dipstick grade in a component or interpretation

Composite albumin "2.3(36.1%)"
  → split into two Observations: albumin g/dL + albumin fraction %

Titer + qualitative ("1:20(-)")
  → titer in valueRatio
  → qualitative call in interpretation (NEG / POS)
```

---

**Contact:** Same SMART app team — happy to share the offending bundle privately.
