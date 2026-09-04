# Context reduction measurement (per tier)

Measures what the model-capacity-aware reduction ladder
(`full → trimmed → compact → tight → prioritized`) actually costs on a large
synthetic chart. No AI call is made; only local formatting + `estimateTokens`.

## Run

```powershell
$env:TZ = 'Asia/Taipei'
$env:CONTEXT_REDUCTION_REPORT = '1'
$env:NODE_OPTIONS = '--max-old-space-size=12288'
npx jest --runInBand __tests__/scripts/context-reduction-report.test.ts --silent=false
```

Skipped unless `CONTEXT_REDUCTION_REPORT=1`, so `npm test` is unaffected.
`CONTEXT_REDUCTION_FIXTURE` names the bundle: a bare filename still resolves
inside `artifacts/synthetic-oncology/` (default: the cloud-record v2 fixture),
an **absolute path** loads any Bundle JSON, and several may be joined with `;`
(one report each). An absolute path counts as *external* — it may be a real
chart, so its report is aggregates only and the "facts lost" list degrades from
labels to counts. Pair it with `CONTEXT_REDUCTION_OUT_DIR=<dir>` to write the
report outside the repo, and note that an external fixture pins the clock to
`CONTEXT_REDUCTION_AS_OF=<ISO date>`, or to the latest clinical record date in
that bundle — measured against today, a chart captured months ago would have
every relative window (6m labs, 1y imaging) come up empty.
`CONTEXT_REDUCTION_WIDEN=1` adds a second **section cost** table for a widened
throwaway view (labDepth 16, labs over 3y, every imaging version over 3y) — the
"what does more history actually cost" control used when a formatter changes.
It never touches the saved profile and does not move the tier ladder, so its
report is written alongside the plain one as `<fixture>-widened.md`.
Output: `artifacts/context-reduction/<fixture>.md` (gitignored) or
`CONTEXT_REDUCTION_OUT_DIR`, plus a stdout table.

## What the columns mean

- **Original context** — `all-data` is the unreduced ceiling (every category,
  all time, all documents); `full` is tier 0, the saved default profile
  (`DEFAULT_DATA_SELECTION` + `DEFAULT_DATA_FILTERS`, documentMode
  `deduplicatedAdmissions`), which is what the hook starts from.
- **Tokens** — `estimateTokens(getFullClinicalContext())`, the exact value the
  hook compares against the target. **vs target** is that share of the budget.
- **ms** — wall clock for candidate build + prioritization + format + PII scrub.
- **Category columns / Dropped vs `full`** — records that actually reach the
  formatters, per tier, and the per-category count removed relative to `full`.
- **Key-fact retention** — facts derived automatically from the `full` tier
  (allergy displays, active problems, currently-in-use meds, abnormal labs,
  latest lab per analyte, discharge-summary headers, dated procedures), scored
  by literal presence in the tier text. Lab facts accept the analyte's raw label
  or its canonical pivot label, and raw or unit-normalized values.
- **Section cost** — per-section tokens of the untruncated `full` tier, i.e.
  what the context is spending its budget *on*. The tier table answers "does it
  fit"; this is what a formatting change is judged by. Section tokens are
  `estimateTokens(formatClinicalContext([section]))`, so they include the
  section title and bullet prefixes and sum to slightly less than the whole.
- **Chosen tier** — the rung the app would actually send. The harness calls the
  hook's own `selectBestClinicalContextFitTier`: `full` short-circuits when it
  already fits, otherwise the *largest* reduced rung that still fits wins, with
  `prioritized` as the terminal fallback when nothing fits. It is deliberately
  not the first tier that happens to fit — the ladder is not monotone in tokens,
  so `trimmed` can land far under the target while `prioritized` fills it.
- **Selector-vs-renderer mismatch** — records a tier kept that
  `filterAiExcludedClinicalDomains` then removed inside `useClinicalContext`.
  Documents are not domain-filtered: their discharge-deduplication key is
  carried across the filter, so both sides resolve the same document list.
- **Text truncation** — head/tail characters kept when the last-resort
  `fitClinicalContextTextToTokenBudget` engages (prioritized tier only).

Clock pinned to 2026-09-03 (the synthetic fixture `asOf`) — or, for an external
fixture, to `CONTEXT_REDUCTION_AS_OF` or its latest record date — so relative
windows repeat.
