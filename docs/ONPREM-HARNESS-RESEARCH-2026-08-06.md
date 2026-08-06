# On-prem harness research — 2026-08-06

## Decision

For `tvghbrain3.5`, use one complete modular summary request and retry only the
cards that failed independent parsing. Limit automatic retries to two cards.
Do not permanently split every summary into two requests.

## Cross-hospital medication summary (10 runs per strategy)

The synthetic fixture contains multiple facilities, current and historical
medicines, an abnormal HbA1c result, and source-key grounding requirements.
Complete model text and clinical prompts were not retained.

| Strategy | Complete runs | Parsed modules | Avg requests | Avg latency | Total tokens | Avg tokens/run |
|---|---:|---:|---:|---:|---:|---:|
| One full batch | 3/10 | 43/50 | 1.0 | 6,412 ms | 73,567 | 7,357 |
| Fixed 3+2 split | 9/10 | 50/50 | 2.0 | 7,276 ms | 131,789 | 13,179 |
| Full batch + missing-card retry | 10/10 | 50/50 | 1.6 | 7,864 ms | 110,488 | 11,049 |

The targeted-retry strategy used about 16% fewer tokens than the fixed split
and achieved 10/10 rather than 9/10. Seven of the ten one-batch failures were a
malformed `priorities` JSON block, most often a full-width colon inside a JSON
property. The fixed split's one failure cited a nonexistent source key.

## Broad health-summary Chat (10 runs)

The question required conditions, active medication, abnormal laboratory data,
and a doctor-discussion reminder. All ten runs retrieved every required domain,
passed final-answer checks, and did not ask the user to re-import data.

The initial automated report showed 9/10 because one run used the additional
relevant `searchObservationByName` tool, which the first rubric omitted from its
allow-list. After correcting the rubric, the observed functional result is
10/10. Provider-reported usage was 95,015 tokens total and average latency was
10,928 ms.

## Authorized real-patient headless integration baseline (10 runs per patient)

Both supplied local files were converted with the app's SDK converter, parsed
with `LocalBundleService`, exposed through the production FHIR tools, and sent
through the same local-model router, prompt, and deep-mode agent. Full answers
and identifiers were not retained.

| Patient sequence | Complete runs | Avg latency | Total tokens | Avg tokens/run |
|---|---:|---:|---:|---:|
| 1 | 10/10 | 21,434 ms | 244,662 | 24,466 |
| 2 | 10/10 | 34,117 ms | 377,055 | 37,706 |

Every run called tools covering conditions, current medication, and laboratory
results; produced a non-empty answer with the doctor-discussion reminder; and
did not ask the user to re-import data. Patient 2 required about 54% more tokens
and 59% more latency, so context/result compaction is the next efficiency target.

## FHIR context compaction (10 runs per patient)

Broad health-summary questions now route to one `getHealthSummarySnapshot`
tool. The browser executes this deterministic no-argument tool locally, then
sends one compact, deduplicated result to the model for synthesis. The snapshot
contains conditions, current medications, latest abnormal laboratory results,
and recent vital signs; it excludes identifiers and repeated refill/history
rows. Current medication candidates are active records plus prescriptions in
the 180 days preceding the latest prescription in the imported chart.

| Patient sequence | Complete runs | Avg latency | Total tokens | Avg tokens/run | Avg tool-result chars |
|---|---:|---:|---:|---:|---:|
| 1 | 10/10 | 10,702 ms | 50,889 | 5,089 | 3,950 |
| 2 | 10/10 | 23,766 ms | 131,073 | 13,107 | 13,405 |

Compared with the baseline, the two 10-run series used 181,962 rather than
621,717 provider-reported tokens: 70.7% fewer (439,755 saved). Average latency
fell from 27,776 ms to 17,234 ms, a 38.0% reduction. Patient 1 used 79.2% fewer
tokens and patient 2 used 65.2% fewer.

Every accepted run used exactly one local snapshot tool execution; covered
condition/diagnosis, medication, and laboratory sections; included a physician
discussion reminder; and did not instruct the user to import patient data. No
snapshot domain was truncated in these final series. Patient 2's 10-run series
was completed immediately before a wording-only guard was added to explicitly
forbid import/re-import prompts; its data selection and orchestration were
unchanged. Patient 1 was then rerun 10/10 with that final wording.

The optimized synthesis request retries once only when the endpoint produces no
answer text. The FHIR tool is not rerun. External/user cancellation now interrupts
a stalled iterator immediately instead of waiting for the idle watchdog.

These checks validate retrieval, response structure, and required safety
language. They do not replace clinician review of the medical correctness of
each generated statement.

## General medical-question data isolation

Custom/local-model routing now requires an explicit or unambiguous
patient-record intent before exposing any FHIR schema. General questions such
as guideline updates, drug side effects, or basic test explanations receive no
FHIR tools. They also receive only the current user message, so patient-derived
text from earlier turns in the same chat is not carried into the general turn.

An explicitly personalized evidence question may receive the compact patient
snapshot. When the local endpoint has no literature-search tool and the user
asks for current/latest evidence, the prompt requires the model to say that it
cannot verify the current version and to recommend an official guideline or a
literature-enabled model.

A live `tvghbrain3.5` check of `current-guideline-no-patient-data` passed: zero
tool calls, no FHIR retrieval, required freshness limitation present, and
4,857 ms latency. The permanent fixture supports repeated regression runs.

## Remaining limitation

Chrome UI E2E remains incomplete because the Chrome native control connection
and detected Chrome profile were absent during this session. The headless pass
validates real import conversion, patient-scoped tools, and model orchestration,
but does not validate file-chooser UI, browser persistence, or visual patient
switching. The browser pass should be rerun after the Browser plugin is
reinstalled or repaired through the Codex plugin UI.
