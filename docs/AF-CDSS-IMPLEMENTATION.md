# AF outpatient CDSS

The AF view has three sections, all collapsed initially: **診斷／追蹤**, **治療**, **預後**.
Expanding a section reveals its questions and module rows; expanding a module shows
its recommendation, evidence, citations and physician decision. High-priority safety
alerts remain visible and open the corresponding section. Each module appears once.
Treatment uses AF-CARE C/A/R/E grouping supplied from rule outputs.

Established AF (including historical resolved diagnoses) enters follow-up. An explicit
clinician rejection reopens diagnostic assessment. Narrative AF mentions alone do
not establish a diagnosis. Switching patients resets expanded sections.

## Calculation ownership

`features/medical-calculator/calculators/af-stroke.ts` owns CHA₂DS₂-VA and
CHA₂DS₂-VASc. VA is new to the calculator list; VASc now retains unknown histories
and returns a possible score range. The existing Cockcroft–Gault calculator
returns an unrounded numeric value for medication decisions.

`utils/af-calculators.ts` passes the same calculator outputs to the rules package.
The pack neither adds points nor implements calculator formulas. `af-followup.ts` owns HAS-BLED and Rosendaal TTR. Each handoff records
calculator id/version, missing inputs and the input snapshot. Changed clinic
answers, measurements or evidence switches invalidate an older result before
recomputation. Missing history never becomes a negative answer.

AF answers live in memory for the current patient and clear on patient change.
Measurements and treatment decisions use the existing encrypted session stores.
Recording a decision does not suppress a finding or modify a prescription.

## Branch and preview

- Host branch: `codex/af-followup-sections`, from `origin/codex/af-cdss-ui`.
- Rules branch: `codex/af-followup-sections`, from `origin/codex/af-cdss-complete`.
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
hepatic staging and interrupted/variable-target TTR require dedicated pathways. This is a
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

## Follow-up implementation (2026-09-19)

- Scans all supplied Condition/Encounter I48 diagnoses and textual DiagnosticReport /
  DocumentReference AF/AFL mentions. Retains dates, source IDs, negation and uncertainty;
  excludes invalid/future resources. External attachment URLs and image-only PDFs are
  not downloaded/OCRed; source completeness depends on loaded FHIR data.
- PAC >76 per explicitly documented 24 hours is an observational signal; >500/24 h
  prompts assessment for longer monitoring. Other durations are not extrapolated.
- Symptoms, actual adherence, bleeding and new drugs use current-session answers.
- OAC BP target is strictly <130/80. Historical values remain dated and cannot establish
  control today. BAT 130/81 is an observational cut point; TSOC/THS 2022 supports the target.
- TTR: INR 2–3, linear time interpolation, latest 180 days, no extrapolation, excludes
  gaps >56 days (explicit local analysis policy). Confirm uninterrupted treatment first.
  Unconfirmed prosthetic-valve targets and conflicting same-day INRs block output.
  Shows therapeutic/below/above time and excluded days; no invented warfarin dose adjustment.
- HAS-BLED is an incomplete range until all inputs are known. Isolated TIA/embolism is
  not treated as its stroke component; H uses SBP >160, L uses TTR <60. A score never
  independently cancels anticoagulation. Evidence exclusions invalidate/recompute results.
- Named systemic DDI pairs cover all four DOACs; local labeling must be verified.
  No alert is not proof of safety. NHI dronedarone checks are dated 2023-12-01 and
  require manual clinical criteria; no automatic reimbursement eligibility claim.
- Class Ic/CAD avoidance is explicit. Class Ia is a specialist, drug-specific review;
  the implementation does not impose a blanket class Ia contraindication unsupported
  by an agent-specific source.

## Verification

Use `/dev/af` synthetic cases for untreated AF, DOAC dosing, valve/LVEF safety,
warfarin/TTR/BP, PAC without AF, and DDI. The route is unavailable in production.
Focused tests cover collapsed sections, score recomputation, session isolation,
Rosendaal interpolation and its exclusions, historical/negated records and DDI pairs.

## Local review environment

Run `npm run dev:af` and open http://localhost:3001/. The AF, HF and lipid packs are bundled together; AF is a development extra and the existing Beta visibility gate remains in force. The synthetic cases are at http://localhost:3001/dev/af. The review branch is `codex/af-localhost-3001`; the clinical source is `mediprisma-cdss-af-integrated` on `codex/af-hmc-integration`. Do not resume the older 3002 preview.

AF-CARE reading order: diagnosis confirmation, C comorbidity management, A shared anticoagulation with CHA2DS2-VA evidence, R primary rate/rhythm strategy, and E ongoing response/adverse-effect reassessment in follow-up. Amiodarone and dronedarone remain under rhythm control. Follow-up questions depend on recorded current medication and remain unknown until answered; symptoms alone do not establish drug toxicity. Detailed amiodarone monitoring intervals retain their ACC/AHA reference, rather than being relabeled as ESC rules.
