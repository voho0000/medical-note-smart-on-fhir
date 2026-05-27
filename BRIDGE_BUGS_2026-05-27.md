# NHI FHIR Bridge — Bug Report 2026-05-27

**Submitter:** MediPrisma SMART app (`voho0000/medical-note-smart-on-fhir`)
**Source bundle:** `nhi-P10109XXXX-20230525-20260525.json` (135 Encounters, ~516 Observations)
**Bridge version observed:** v0.9.2 (per Encounter.type contract)

---

## TL;DR

Two classes of bug spanning hematology + chemistry observations:

1. **LOINC mislabelled** — bridge emits Observation resources whose `code.coding[loinc]` disagrees with the `code.text` and the NHI medical-order-code display. The NHI code + Chinese display are correct in every sample we audited; the LOINC is wrong for several CBC analytes, eGFR, and a few categorical sample-quality flags. SMART apps that trust LOINC as the primary identifier (the FHIR-idiomatic choice) end up putting MCV values in the RBC column, eGFR values in the creatinine column, etc.

2. **`valueString` overloading** — bridge packs two distinct data points (numeric value + dipstick grade, or numeric value + CKD-stage interpretation) into one `valueString`, and drops the numeric `valueQuantity` entirely. Any consumer that does math on the value (trend chart, abnormal-flag derivation, AI tools) silently breaks.

**Patient-safety impact:** users see eGFR `33 mL/min/1.73m2` (CKD stage 3) rendered as `CREA = 33 mg/dL` — a fatal-looking creatinine value. Similar issues with MCV in the RBC column.

---

## Bug 1 (HIGH — patient safety) — Hemogram panel LOINC `24317-0` reused for multiple distinct analytes

LOINC `24317-0` = **"Hemogram and platelets WO differential panel - Blood"** — this is a *panel* code, never meant to identify an individual analyte. Bridge attaches it to separate Observation resources for unrelated CBC analytes:

| `code.text` | NHI display | unit | sample value | count in bundle |
|---|---|---|---|---|
| MCHC | MCHC | gHb/dL | 31.3 | 12 |
| MCV | MCV | fL | 96 | 12 |
| RDW | RDW | % | 13.4 | 11 |
| 血球比容值測定 | (HCT) | % | — | 7 |
| Hct(血球容積比) | (HCT) | ％ | — | 1 |

**Symptom in our app:** SMART app's pivot table grouped all of these under whichever analyte LOINC `24317-0` aliases to (RBC in our case), so MCV values like `95.2 fL` and `87.8 fL` displayed in the RBC column, where the normal range is 4-6 M/uL.

**Expected:** Each analyte should carry its own LOINC:

| Analyte | Correct LOINC |
|---|---|
| RBC | `789-8` (Erythrocytes [#/volume] in Blood by Automated count) |
| WBC | `6690-2` (Leukocytes [#/volume] in Blood by Automated count) |
| HGB | `718-7` (Hemoglobin [Mass/volume] in Blood) |
| HCT | `4544-3` (Hematocrit [Volume Fraction] of Blood by Automated count) |
| MCV | `787-2` (Erythrocyte mean corpuscular volume) |
| MCH | `785-6` (Erythrocyte mean corpuscular hemoglobin) |
| MCHC | `786-4` (Erythrocyte mean corpuscular hemoglobin concentration) |
| RDW | `788-0` (Erythrocyte distribution width [Ratio] by Automated count) |
| PLT | `777-3` (Platelets [#/volume] in Blood by Automated count) |

If for some reason the source data is genuinely a panel, then emit ONE Observation with `code` = panel LOINC and use `component[]` for each member analyte. **Don't emit per-analyte Observations tagged with the panel LOINC.**

---

## Bug 2 (HIGH — patient safety) — Leukocyte panel LOINC `57021-8` reused for differential cells

LOINC `57021-8` = **"CBC W Auto Differential panel - Blood"** — also a panel code. Bridge attaches it to differential-cell Observations:

| `code.text` | unit | count |
|---|---|---|
| Basophil | % | 12 |
| Lymphocyte | % | 12 |
| Monocyte | % | 12 |

**Expected per-analyte LOINCs:**

| Analyte | Correct LOINC |
|---|---|
| Neutrophils % | `770-8` (Neutrophils/100 leukocytes in Blood by Automated count) |
| Lymphocytes % | `736-9` (Lymphocytes/100 leukocytes in Blood by Automated count) |
| Monocytes % | `5905-5` (Monocytes/100 leukocytes in Blood by Automated count) |
| Eosinophils % | `713-8` (Eosinophils/100 leukocytes in Blood by Automated count) |
| Basophils % | `706-2` (Basophils/100 leukocytes in Blood by Automated count) |

---

## Bug 3 (HIGH — patient safety) — MCH LOINC `785-6` reused for MCHC observations

| `code.text` | unit |
|---|---|
| MCHC 平均紅血球血色素濃度 | g/dL |
| MCH(平均紅血球血色素) | pg |
| MCHC | gHb/dL |

LOINC `785-6` is MCH only. MCHC must use `786-4`.

---

## Bug 4 (HIGH — patient safety) — HCT LOINC `4544-3` reused for HGB

| `code.text` | unit | sample |
|---|---|---|
| HGB | g/dL | (3 records) |

`4544-3` is Hematocrit. HGB must use `718-7`.

---

## Bug 5 (HIGH — patient safety) — Eosinophil LOINC `711-2` reused for Eosinophils%

| `code.text` | unit |
|---|---|
| Eosinophils(嗜酸性白血球) | ％ |

LOINC `711-2` = "Eosinophils [#/volume] in Blood" (absolute count). The `%` unit and the differential context indicate this should be `713-8` (Eosinophils/100 leukocytes).

---

## Bug 5b (HIGH — patient safety) — Creatinine LOINC `2160-0` reused for eGFR

| `code.text` | LOINC | LOINC display | unit | valueString |
|---|---|---|---|---|
| `Estimated GFR` | `2160-0` | **Creatinine** [Mass/volume] in Serum or Plasma | (none) | `"33 (stage3:30-59)"` |
| `eGFR` | `33914-3` | Glomerular filtration rate (MDRD) | mL/min/1.73m2 | (numeric 45.4) |

Same patient, same bundle: bridge sometimes labels eGFR with the correct LOINC `33914-3`, sometimes with the **creatinine** LOINC `2160-0`. With the latter, the value gets pivoted into the creatinine column — the user saw `CREA = 33 mg/dL` (a fatal-looking value when real creatinine range is ~0.6-1.3) which was actually eGFR 33 mL/min/1.73m2 (CKD stage 3).

**Correct LOINCs for eGFR:**

| Formula | LOINC |
|---|---|
| MDRD | `33914-3` (Glomerular filtration rate [Volume Rate/Area] in Serum or Plasma by Creatinine-based formula (MDRD)/1.73 sq M) |
| CKD-EPI 2021 (race-free) | `98979-8` |
| CKD-EPI 2009 (non-Black) | `62238-1` |
| CKD-EPI 2009 (Black) | `88293-6` |

Pick whichever formula NHI surfaces; **never use `2160-0`** (that's serum creatinine).

---

## Bug 6a (HIGH — semantic data loss) — `valueString` packs numeric value + qualifier together

Multiple Observations stuff two data points into one `valueString`, dropping the numeric `valueQuantity` entirely. Any downstream consumer doing math on the value (trend chart, abnormal-flag derivation, AI tool) is broken.

| `code.text` | LOINC | `valueString` | What's actually in there |
|---|---|---|---|
| Estimated GFR | `2160-0` (wrong; should be `33914-3`) | `"33 (stage3:30-59)"` | numeric 33 + CKD-stage interpretation |
| UACR(半定量) | `14959-1` | `"1+ (80)"` | dipstick grade `1+` + quantitative 80 mg/g |
| Glucose (Urine) | `5792-7` | `"4+ (2000)"` | dipstick grade `4+` + quantitative 2000 mg/dL |
| Albumin | `1751-7` (or similar) | `"2.3(  36.1%)"` | absolute 2.3 g/dL + albumin fraction 36.1% |
| Anti-mitochondrial Ab | `16124-0` | `"1:20(-)"` | titer 1:20 + negative result |

**Expected FHIR pattern** (any of):

```jsonc
// Option A — separate Observations
{ code: ..., valueQuantity: { value: 33, unit: "mL/min/1.73m2" } }
{ code: ..., interpretation: { coding: [{ system: "...", code: "G3a", display: "CKD stage 3a" }] } }

// Option B — value + interpretation on one Observation
{
  code: { coding: [{ system: "loinc", code: "33914-3" }] },
  valueQuantity: { value: 33, unit: "mL/min/1.73m2" },
  interpretation: [{ coding: [{ code: "G3a", display: "stage 3a" }] }]
}

// Option C — quantitative parent + semi-quantitative component
{
  code: ...,
  valueQuantity: { value: 80, unit: "mg/g" },
  component: [{ code: { text: "Dipstick" }, valueString: "1+" }]
}
```

---

## Bug 6 (MEDIUM) — Sample-quality flags emitted as Observations under analyte LOINCs

## Bug 6 (MEDIUM) — Sample-quality flags emitted as Observations under analyte LOINCs

Bridge emits Observations whose `code.text="溶血"` (hemolysis — a *quality flag* on the sample, not a measurement) tagged with analyte LOINCs:

| LOINC | LOINC display | sample value |
|---|---|---|
| `2093-3` | Cholesterol | `0 NIL` |
| `3094-0` | Urea nitrogen | `0 NIL` |
| `3084-1` | Urate | `0 NIL` |

**Problem:** Downstream consumers (UI tables, AI tools) see "Cholesterol = 0 NIL" and treat it as a measurement. Patient appears to have a critically low cholesterol when in reality the sample was rejected for hemolysis.

**Expected:** Use the FHIR `DataAbsentReason` extension (`http://hl7.org/fhir/StructureDefinition/data-absent-reason` with value `error` or `not-collected`) rather than a zero `valueQuantity`. Better still, emit a separate `Observation.note` or a `Specimen` resource carrying the rejection reason.

---

## Bug 7 (LOW — cosmetic but breaks string-equality joins) — Unit casing inconsistency

Same canonical unit shipped with different casing within the same bundle:

| Canonical | Variants seen |
|---|---|
| mg/dL | `mg/dL` / `mg/dl` |
| g/dL | `g/dL` / `g/dl` |
| fL | `fL` / `fl` |
| uIU/mL | `uIU/mL` / `uIU/ml` |
| gm/dL | `gm/dl` / `gm/dL` |

UCUM is case-sensitive (`mg/dl` is technically invalid; the `l` for litre is `L` after the 1979 redefinition). Recommend normalising to the UCUM canonical form (always uppercase `L`) before emit.

---

## How we found this

1. User reported "RBC column shows value 95.2 on 2025-12-09" in our cumulative lab pivot.
2. Inspected the specific Observation in the bundle — `code.text = "MCV 平均紅血球容積"`, `value = 95.2 fL`, but `code.coding[0]` was LOINC `789-8` (Erythrocytes = RBC).
3. Ran a bundle-wide scan grouping observations by LOINC code to enumerate all `(LOINC, distinct text)` pairs where the text mentions a hematology analyte different from the LOINC's official display. Surfaced bugs 1-5 above.
4. Separately scanned for `code.text = "溶血"` and unit-casing variants for bugs 6-7.

---

## Suggested bridge-side fix

Maintain an explicit `NHI_order_code → LOINC` lookup table sourced from the official NHI–LOINC mapping (NHI 健保署的標準對照表), and emit `code.coding` from that table. Avoid heuristics that match LOINCs from `code.text` content — the text varies too much across hospitals to be a reliable key.

For panel-vs-component cases, either:
- (A) Emit one Observation with the panel LOINC and `component[]` for each analyte, OR
- (B) Emit separate Observations each with the correct per-analyte LOINC.

Whichever choice, don't mix them.

---

## Regression test cases we'd love bridge CI to cover

```
NHI 08011C series (CBC) → each analyte must carry its OWN LOINC, not the panel
  MCV   → 787-2   (NOT 789-8 / 24317-0)
  MCH   → 785-6
  MCHC  → 786-4   (NOT 785-6 / 24317-0 / 789-8)
  RDW   → 788-0   (NOT 24317-0)
  HCT   → 4544-3  (NOT 24317-0)
  HGB   → 718-7   (NOT 4544-3)

CBC differential percentages — must NOT carry the panel LOINC 57021-8
  Basophils %   → 706-2
  Lymphocytes % → 736-9
  Monocytes %   → 5905-5
  Eosinophils % → 713-8  (NOT 711-2, which is the absolute count LOINC)

Renal chemistry
  eGFR (any formula) → 33914-3 / 62238-1 / 88293-6 / 98979-8  (NOT 2160-0)
  Creatinine → 2160-0 (only the actual creatinine value)

Mixed value+qualifier strings → split into structured fields
  eGFR "33 (stage3:30-59)" → valueQuantity {33, mL/min/1.73m2}
                              + interpretation {code: "G3a"}
  UACR "1+ (80)"           → valueQuantity {80, mg/g}
                              + component {dipstick: "1+"}
  Albumin "2.3(  36.1%)"   → two separate Observations
                              (albumin g/dL + albumin fraction %)

Lipid
  Cholesterol → 2093-3 (when value present)
  「溶血」 quality flag → DataAbsentReason extension, NOT a 0-value Observation

UCUM units → always emit canonical form (uppercase "L" in mg/dL, g/dL, fL, etc.)
```

---

**Contact:** SMART app developer (MediPrisma) — happy to share the offending bundle file privately for direct repro.
