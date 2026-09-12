# HFpEF calculators

Added to the cardiac medical-calculator catalogue: `h2fpef` and `hfa-peff`.

## Sources and reference-site checks (2026-09-11/12)

- Reddy et al., Circulation 2018;138:861–870, DOI: 10.1161/CIRCULATIONAHA.118.034646.
- MDCalc: https://www.mdcalc.com/calc/10105/h2fpef-score-for-heart-failure-with-preserved-ejection-fraction
- Pieske et al., EHJ 2019;40:3297–3317, DOI: 10.1093/eurheartj/ehz641; full consensus republished as DOI: 10.1002/ejhf.1741.
- Appcardio: https://appcardio.com/hfa-peff-score-calculator/

Only synthetic values were entered into external reference calculators.

| Reference | Synthetic input | Observed output |
| --- | --- | --- |
| MDCalc | Age 65, BMI 32, E/e′ 12, PASP 40, no AF | 73.7% |
| MDCalc | Same, AF present | 93.9% |
| Appcardio | SR; E 80; septal e′ 8; lateral e′ 12; TR 2.5; GLS 18; LAVI 28; LVMI 90; RWT 0.4; wall 10; NT-proBNP 100 | 0 / 6 |
| Appcardio | Same, E 90, LAVI 34, NT-proBNP 220 | 3 / 6 (1 + 1 + 1) |
| Appcardio | Same, E 160, LAVI 45, NT-proBNP 800 | 6 / 6 (2 + 2 + 2) |

H₂FPEF uses only the six-item weighted 0–9 score. The continuous model and its result row were removed at the owner’s request. The MDCalc percentages above are historical reference checks, not current calculator outputs. Missing items show a known subtotal and possible total range; missing values are not scored as confirmed negatives.

Appcardio has no age or sex inputs. This implementation follows the original consensus's age ≥75 e′ thresholds and sex-specific LVMI thresholds. It does not attempt to reproduce reference-site omissions. The published E/e′ minor band “9–14” is implemented as 9 ≤ E/e′ <15 for decimal inputs. Missing criteria produce a conservative lower–upper range, not a complete score or low-probability claim. A domain is resolved if its maximum of 2 has already been established, or all measurements required to exclude higher points are present; a single confirmed natriuretic assay resolves that domain.

Claude Opus 5 independently audited both specifications on 2026-09-12. It confirmed the H₂FPEF weights, strict boundaries and interpretation bands. For HFA-PEFF it identified that the AF NT-proBNP minor band begins at 365 pg/mL rather than 375 pg/mL; this was cross-checked against published reproductions of the 2019 consensus and corrected with boundary tests at 364.9, 365, 660 and 660.1 pg/mL.

## Data extraction

Reuses `classifyReport`, `reportNarrative`, and `extractEchoMeasurements` from personalized-care-fhir. Confirmed these exports are present at the repository's declared 1.4.2 release (`46f7e32`); no dependency bump is needed.

The calculator extension adds tissue velocities, LVMI, RWT, GLS and wall thickness. It accepts report conclusions, embedded text attachments and linked Observation text/quantity/components. All echo inputs come from one latest dated, non-cancelled report; missing fields are never patched with an older report. Unsupported report formats remain blank and may be entered manually. It does not OCR image/PDF reports or infer LAVI from LA diameter or LVMI from unindexed mass.

An explicit average E/e′ or E divided by the mean of septal/lateral e′ is used for HFA-PEFF. A unilateral E/e′ is not relabelled as an average. cm/s is normalized to m/s for TR. End-diastolic dimensions with explicit cm/mm units allow RWT = 2×LVPWd/LVIDd and maximum wall thickness = max(IVSd,LVPWd). Source date, institution and DiagnosticReport navigation remain attached. Threshold-sensitive input precision is retained.

BMI accepts a recorded BMI or derives from same-day height/weight with known units. Natriuretic assays are separately identified and accept pg/mL or ng/L; unknown units stay blank. AF history uses coded Conditions and encounter diagnoses first (specific AF ICD codes, excluding flutter), then historical EKG reports. A positive AF history is not cleared by a newer sinus tracing. With no AF code or positive EKG and an interpretable sinus tracing, “no” is a labelled inference from available records. Uncertain AF or missing/uninterpretable EKGs stay blank. HFA-PEFF rhythm uses the latest EKG independently of history.

Current antihypertensive use is seeded from unexpired, non-stopped/non-held prescriptions and named active ingredients (with a limited explicit single-agent ATC fallback). Duplicate doses/brands and combination overlap are deduplicated; ARNI counts as one therapeutic agent. Topical/ophthalmic and injection preparations are excluded. Unresolved ingredients/combinations cannot establish fewer than two agents. The source line displays the recognized ingredients and a source link; all inferred selections remain editable. During loading/refetch/error, clinical selections are suppressed so an incomplete chart cannot imply absence.

## Verification

- 34 dedicated tests plus 42 autofill/index/loading regression tests passed (76 total).
- Existing calculator regression run: 259 passed, 3 failed; all three failures are existing KFRE calls to the missing `calculateKfre` export in the locally linked personalized-care package.
- Calculator lint passed. Type checking reported existing KFRE/CKD export errors, with none in the added calculator files.
- Standard production build attempted; Turbopack cannot resolve the existing first-party packages symlinked outside this project's root (43 module-resolution errors). No dependency links or unrelated work were changed to work around it.
- Real-browser checks: local HFA-PEFF 3/6 result, demo echo RWT/wall autofill, source navigation; 320, 390, 430, 768, 1024 and 1440 pixel layouts checked. No horizontal document overflow at the measured widths.

Visible behaviour changes: two new calculator entries. No existing clinical surface or route gate removed or changed.

Follow-up verification: 107 calculator/clinical-autofill regression tests passed before the final uncertain-AF safeguard. No new calculator type errors; existing KFRE/CKD failures remain.
