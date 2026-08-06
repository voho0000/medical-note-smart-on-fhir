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

## Remaining limitation

## Authorized real-patient headless integration (10 runs per patient)

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

## Remaining limitation

Chrome UI E2E remains incomplete because the Chrome native control connection
and detected Chrome profile were absent during this session. The headless pass
validates real import conversion, patient-scoped tools, and model orchestration,
but does not validate file-chooser UI, browser persistence, or visual patient
switching. The browser pass should be rerun after the Browser plugin is
reinstalled or repaired through the Codex plugin UI.
