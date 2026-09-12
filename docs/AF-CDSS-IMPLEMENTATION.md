# AF outpatient CDSS

The AF flow follows the current HF visit layout from `origin/master` (`1c17761f`):
visit progress, record data, today's assessment, decisions, and follow-up.
Thirteen clinical modules remain available, including collapsed no-action rows.
Only high-priority safety findings appear in the safety-first section.

## Calculation ownership

`features/medical-calculator/calculators/af-stroke.ts` owns CHA₂DS₂-VA and
CHA₂DS₂-VASc. VA is new to the calculator list; VASc now retains unknown histories
and returns a possible score range. The existing Cockcroft–Gault calculator
returns an unrounded numeric value for medication decisions.

`utils/af-calculators.ts` passes the same calculator outputs to the rules package.
The pack neither adds points nor implements the CrCl formula. Each handoff records
calculator id/version, missing inputs and the input snapshot. Changed clinic
answers, measurements or evidence switches invalidate an older result before
recomputation. Missing history never becomes a negative answer.

AF answers live in memory for the current patient and clear on patient change.
Measurements and treatment decisions use the existing encrypted session stores.
Recording a decision does not suppress a finding or modify a prescription.

## Branch and preview

- Host branch: `codex/af-cdss-ui`, based on `origin/master`.
- Rules branch: `codex/af-cdss-complete`, based on `origin/main`.
- Development preview: `/dev/af`, synthetic patients only; unavailable in production.
- The host lists HF first, then AF. HF remains the released default. AF retains the
  existing Beta/pilot and launch-route rules; see `LAUNCH-ROUTE-GATES.md`.
- `vendor/af-cdss` contains the unpublished package builds and integrity manifest.

## Scope

Diagnosis review, VA/VASc risk, OAC indication and valve/dual-OAC safety, DOAC dose
and renal review, bleeding factors, antiplatelet co-therapy, rate/LVEF safety,
antiarrhythmics, amiodarone follow-up, anticoagulation follow-up, comorbidities,
and rhythm/ablation shared decisions. ESC/AHA differences remain explicit.

Acute cardioversion, device-detected AHRE, bridging, exhaustive interactions,
hepatic staging and interpolated TTR require dedicated pathways. This is a
clinician review branch, not automatic prescribing. Clinical source citations
and the 32-page module document are in the rules repository.

## Verification

- Rules repository: all 35 suites / 963 tests passed, including a synthetic AF
  capture converted through the real MedCloud-to-FHIR bridge.
- Host AF, calculator, registry and display checks: all 6 suites / 191 tests passed.
- Production build, TypeScript, focused ESLint and both dependency lock checks passed.
- Citation checks matched all 169 quoted occurrences to the two guideline PDFs;
  the generated module document passed the 32-page budget and visual review.
- Browser checks covered 320–1440 px, both languages, case changes, physician
  answers, clinic measurements, evidence switches and treatment decisions.
- The broader host suite has 13 existing encrypted-store hydration failures in
  five suites. The same failures were reproduced on pristine `origin/master`;
  these are outside the AF changes.
