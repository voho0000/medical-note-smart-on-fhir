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
- Host CDSS and medical-calculator checks: all 45 suites / 613 tests passed
  against the packaged dependencies, including HF regression coverage.
- Production build, TypeScript, focused ESLint and both dependency lock checks passed.
- Citation checks matched all 169 quoted occurrences to the two guideline PDFs;
  the generated module document passed the 32-page budget and visual review.
- Browser checks covered 320–1440 px, both languages, case changes, physician
  answers, clinic measurements, evidence switches and treatment decisions.
- The initial broader host run reproduced 13 encrypted-store hydration failures
  on pristine `origin/master`. Diagnosis isolated Node 22 WebCrypto rejecting
  jsdom's ArrayBuffer realm when reading serialized ciphertext. The test helper
  now passes that ciphertext as a Node Buffer to the real decrypt implementation;
  encryption and authentication remain real, with tamper/session regression cases.
  No production cryptography was changed.
- The synthetic preview now hydrates measurements, evidence choices and treatment
  decisions, and waits for encrypted reads just as the live feature does. AF
  clinical answers remain memory-only. Reload and patient isolation are covered.
- The host was verified against the two vendored tarballs (152 files checked
  against the committed source build and SHA-512 manifests) plus released SDK
  and lab-normalization dependencies, without source-worktree package links.
