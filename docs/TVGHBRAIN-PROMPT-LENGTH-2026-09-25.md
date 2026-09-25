# Tvghbrain 3.5 custom-summary prompt length experiment (2026-09-25)

## Question and setup

The question was whether the HMC SOAP failures begin above a measurable
character count for the **user-authored custom-summary prompt**. Authorized
MedCloud2 captures were converted to FHIR Bundles and passed through the same
drug enrichment, clinical data selection, message builder, and preflight used
by the application. Patient text, requests, and responses stayed in the
gitignored local experiment results directory. No clinical content is in this
report.

For each of two cases, the same 2,375-character compact HMC-format SOAP prompt
was sent once or repeated verbatim 4, 7, or 10 times. Only the user-authored
prompt changed; the selected clinical context, system message, model
(tvghbrain3.5), temperature (0), and non-streaming transport were fixed within
each case. The selected context had 5,232 characters for patient 1 and 15,081
for patient 7. Each variant ran twice. Repetition controls character count but is
not a natural prompt rewrite; it can itself affect model behavior.

These diagnostic calls used `max_tokens: 4096` to bound loops and obtain a
finish reason. The current application omits that field for custom models.
Thus, a `length` result here identifies a repeated Assessment that exhausted
the diagnostic budget; it does not mean the current uncapped UI would stop at
4,096 tokens. Earlier uncapped full-HMC streaming diagnostics showed that the
Assessment loop persisted for 15 minutes and 192,358 response characters
without a Plan or server finish reason. These experiments do not identify a
hospital server-side output limit.

## Results

| Prompt characters | Total request input tokens, patient 1 / 7 | Patient 1: runs with repeated Assessment | Patient 7: runs with repeated Assessment | Patient 7: completed with Plan |
| ---: | ---: | ---: | ---: | ---: |
| 2,375 | 3,061 / 7,334 | 0 / 2 | 2 / 2 | 0 / 2 |
| 9,506 | 4,603 / 8,876 | 0 / 2 | 1 / 2 | 1 / 2 |
| 16,637 | 6,145 / 10,418 | 0 / 2 | 1 / 2 | 1 / 2 |
| 23,768 | 7,687 / 11,960 | 0 / 2 | 1 / 2 | 1 / 2 |

All eight patient-1 runs reported `finish_reason: stop`; seven of the eight
had a recognizable Plan heading. The 23,768-character variant did not cause
the repeated-diagnosis pattern in this case. For patient 7, both shortest
prompt runs ended at `length` with hundreds of Assessment lines and no Plan.
At each longer prompt length, one run stopped with a Plan and the other
repeated diagnoses until `length`. The repeated lines often changed codes
while reusing the same diagnosis description. Some completed answers also
included codes not present in the selected clinical context, so `stop` and
section completeness are not proof of clinical grounding.

## Conclusion and UI decision

There is **no defensible character count above which Tvghbrain 3.5 starts to
fail reliably** in these tests. Failure appeared at 2,375 characters, while
23,768 characters could complete, including with the same patient chart.
Clinical context and instruction behavior matter beyond prompt length
alone. The observations do not support a deterministic character cutoff.
Two repeats per cell cannot establish a failure-rate curve or estimate a
population error probability. These data do not
measure the incidence of hallucinations or mainland-Chinese terms.

The UI therefore uses **2,000 prompt characters as a conservative review cue**,
just below the shortest problematic prompt observed here. It applies to
custom-model custom summaries in the editor and beside generation. Its wording
explicitly says that character count is not a safety boundary and asks users
to review repeated or conflicting rules and examples and verify generated
diagnoses. It does not block generation and does not imply shorter prompts are
safe. Output-truncation and long-running-request handling remain separate
runtime safeguards.
