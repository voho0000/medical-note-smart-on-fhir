# Dyslipidemia review

The HF-style visit flow covers risk/targets, laboratory data, treatment reconciliation, separate NHI criteria, and follow-up/visit records. The optional Beta pathway preserves HF as default and preserves generic layouts. PREVENT is provided by Medical Calculator, with one implementation and shared encrypted manual inputs; its implementation/source notes are in PREVENT.md.

Validation on the paired snapshots:

- Core: 984 tests covered by the complete regression plus final targeted reruns (40 lipid tests pass); test types and all four workspace builds pass. 75 governed evidence entries verified. Source-linked clinical document is 23 pages and clinical figures 4 pages, visually reviewed.
- App: 43 calculator/CDSS suites run: 608 pass, 13 fail. All 13 are unchanged baseline encrypted-cache test failures, reproduced on unmodified origin/master (clinic vitals, phenotype, physician decisions, HFpEF input stores, and clinic-vitals hydration wiring). New PREVENT/flow/catalog tests pass. Final typecheck, lint of affected features and production Webpack build pass.
- Browser: 320, 390, 768, 1280 and 1440 px show no horizontal overflow; light/dark and Chinese/English reviewed. Shared PREVENT edits update both surfaces and the pack's risk band. Diagnosis-derived ASCVD/HF blocks PREVENT. Severe TG retains the safety alert; HF uses its own renderer. Visit decisions survive reload in the same tab. The ASCVD citation links to guideline PDF page 55.

The local review uses synthetic data at /dev-lipid-review; this route returns not-found outside development. PREVENT is the published US base model (not Taiwan-recalibrated); UACR/HbA1c/SDI variants are not included. Formal clinical activation and package publication are separate from this review branch.
