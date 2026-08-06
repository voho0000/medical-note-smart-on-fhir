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

The two supplied local patient files have not yet completed Chrome UI E2E runs.
Chrome was unavailable to the browser controller during this test session. The
UI pass remains required to validate import, patient switching, browser-bound
FHIR tools, and retry behaviour with those two records.
