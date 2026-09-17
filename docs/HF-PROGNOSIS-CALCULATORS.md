# HF prognosis and medical calculators

The three-section CDSS and the medical calculator catalog share
`features/medical-calculator/prognosis/HfPrognosisModels.tsx` and its detail view.
MAGGIC, SHFM and GWTG-HF are reference/data-review entries, **not operational
formulas**. No mortality percentages are generated. The AI-SaMD entry explicitly
states that it is not connected. External links contain no patient parameters.

## Model evidence

- MAGGIC: Pocock et al., 2013, doi:10.1093/eurheartj/ehs337. Thirteen predictors;
  1- and 3-year all-cause mortality. https://pubmed.ncbi.nlm.nih.gov/23095984/
- SHFM: Levy et al., 2006, doi:10.1161/CIRCULATIONAHA.105.584102 and UW updates.
  Original publication described 1–3 years; the updated model includes 5 years.
  https://depts.washington.edu/shfm/update.php
  Verify the exact implementation/version and integration license before enabling.
- GWTG-HF: Peterson et al., 2010, doi:10.1161/CIRCOUTCOMES.109.854877.
  Seven admission predictors; mortality during the index HF admission.
  https://pubmed.ncbi.nlm.nih.gov/20123668/

The CDSS passes original fact text, dates and resource identifiers for review.
The standalone calculator uses its existing autofill resolver. These previews
are not normalized model inputs and do not imply eligibility or completeness.
Missing history/medication data remain unknown. GWTG-HF receives no automatic
preview values until an admission-specific selection is implemented. No race
value is inferred from locale, name, nationality or site.

## Formula and AI-SaMD integration boundary

`PrognosisCalculatorAdapter` takes an explicit patient, request ID, immutable
input revision, model/version, setting, endpoint, horizons and verified inputs
with units, timestamps and provenance. A hospitalization calculation also needs
an encounter ID. A response preserves identity/version/revision and identifies
each horizon and probability (0–1). `matchesPrognosisRequest` rejects mismatched
patients, stale inputs, wrong endpoints/horizons and invalid probabilities.
This is a typed boundary, not a deployed endpoint or runtime adapter registry.

Next implementation steps:

1. Implement and independently validate each formula against its primary
   specification and reference calculator. Verify point tables, unit conversion,
   boundary values and missing-input behavior. Do not estimate unpublished
   coefficients or derive death risk from an unrelated risk category.
2. Add structured editors and reuse shared CDSS/medical-calculator inputs;
   rebuild input revisions when any input changes. Confirm medication mapping
   (including ARNI versus original ACEI/ARB definitions) explicitly.
3. Register an approved adapter; accept its output only while patient and input
   revision still match. Display model version, endpoint, horizon, calculation
   time and evidence; never average different model predictions.
4. Connect AI-SaMD after its endpoint, intended population, version, deployment
   method and data requirements are supplied. No remote inference is called by
   the current implementation.

Changes remain local for physician review; no commit or push is part of this work.
