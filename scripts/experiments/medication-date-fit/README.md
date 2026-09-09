# Medication end-date fitting benchmark

This is a synthetic, local-only rendering stress test. It does not import patient data, contact a FHIR server, or run AI generation.

Latest optimized results: [RESULTS-OPTIMIZED.md](./RESULTS-OPTIMIZED.md). Original baseline: [RESULTS.md](./RESULTS.md). All per-trial CSVs are kept alongside these reports.

## Method

- Uses the current production `MedicationItem` source, copied by `prepare.mjs` with only import-path changes and a measurement-enable wrapper.
- The wrapper invokes the actual `useMedicationEndDateFit` hook. The control passes `enabled=false`; other row rendering remains identical. The control therefore retains the full end date.
- All rows are mounted simultaneously. This is deliberately more demanding than a patient with 1,000 prescription records that are grouped or collapsed into fewer visible rows.
- Runs 100 and 1,000 rows, five paired trials each, with on/off ordering alternated by trial. One 100-row warmup per mode is excluded.
- The synthetic data varies name length, frequency, dose, chronic status and total quantity. Every row has dates, a duration, institution, category and ICD.
- Initial render: synchronous React mount time and time through three animation frames (a paint opportunity, not an instrumented pixel-paint completion).
- Resize: 36 successive animation-frame changes between 700px and 480px panel widths.
- Font resize: 12 successive animation-frame changes between 16px and 20px root font sizes.
- Scroll: 24 animation-frame scroll position changes within a 450px-high list viewport.
- Records frame intervals and browser long tasks (>50ms). The stress sequences are much faster than typical repeated user clicks on the font settings.
- Uses a production Next/React build, not development mode. Build-time TypeScript checking is disabled only for this isolated benchmark because its imports reach the shared project; this does not change React's runtime production mode.

## Reproduce

From the repository root, using the already installed dependencies:

```sh
node scripts/experiments/medication-date-fit/prepare.mjs
./node_modules/.bin/next build tmp/medication-perf-app
./node_modules/.bin/next start tmp/medication-perf-app -H 127.0.0.1 -p 3019
```

Open `http://localhost:3019`, click **Run benchmark**, and keep the tab foreground. Wait for **Complete**. Results are emitted as JSON in the page's `#results` element. Do not compare foreground runs against background-tab runs. Stop the local server after testing.

For the supplemental scroll-only comparison, click **Run scroll check**: it mounts 1,000 rows, waits for the initial layout to settle plus 500 ms, and runs the same 24 scroll changes, five paired trials, without a preceding font/width stress phase. Results replace the page JSON.

Open `/visual` for a 50-row responsive fixture with 16/20/32px root font controls and an unmount/remount toggle. This is a separate correctness check, not a benchmark measurement.

## Limits

This measures row rendering and end-date fitting, not FHIR ingestion, parsing, medication grouping, network latency or the entire clinical workspace. Absolute timings depend on hardware, browser extensions and other work running on the machine. Measurements taken on a live workstation are not a controlled hardware benchmark.
