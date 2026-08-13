# On-prem model evaluation

This opt-in experiment measures the hospital OpenAI-compatible models through
the same Medical Summary prompts and Chat Agent/tool loop used by the app. It
runs directly on Node's Web Fetch implementation so streamed SSE responses use
the same Web Stream contract as the browser. Normal tests never contact the
endpoint.

## Scope

- Medical Summary: six documented text models × five synthetic clinical cases.
- Custom Summary: six documented text models × four hallucination-focused
  prompts, with legacy-vs-grounded prompt comparison.
- Chat: five documented candidates × seventeen gold questions, including
  native tool calls, deterministic local prefetch, and tool-less questions.
- Metrics: parse/completeness, grounding, scenario semantics, tool selection,
  arguments, retrieval, final-answer correctness, Taiwan Traditional Chinese,
  leaked tool-protocol markers, latency, and reported tokens.

The default result does not retain the clinical prompt or complete model output.
It stores only scores, safe failure categories, tool names, usage, and an output
hash. `--include-output` is intended only for synthetic-fixture debugging.

## Run

Set these variables in the current shell without committing them:

```powershell
$env:ONPREM_LLM_ENDPOINT = 'https://hospital.example/v1/chat/completions'
$env:ONPREM_LLM_API_KEY = '<secret>'
npm.cmd run eval:onprem-models
```

Useful filters:

```powershell
npm.cmd run eval:onprem-models -- --phase summary --models tvghbrain3.5
npm.cmd run eval:onprem-models -- --phase custom-summary --models tvghbrain3.5,gpt-oss:20b --custom-summary-strategies legacy,grounded
npm.cmd run eval:onprem-models -- --phase chat --models gemma4:31b --chat-cases hba1c-trend,penicillin-allergy
npm.cmd run eval:onprem-models -- --phase chat --models gpt-oss:120b
npm.cmd run eval:onprem-models -- --phase summary --models tvghbrain3.5 --summary-cases cross-hospital-current-medications --summary-strategies single,single-retry-missing,split-3-2 --repeat 10
npm.cmd run eval:onprem-models -- --phase summary --models gpt-oss:120b --summary-strategies registered-batch-3-attempts --repeat 6
npm.cmd run eval:onprem-models -- --phase chat --models tvghbrain3.5 --chat-cases broad-health-summary --repeat 10
npm.cmd run eval:onprem-models -- --phase chat --models tvghbrain3.5 --chat-cases current-guideline-no-patient-data --repeat 10
```

`--repeat` repeats each selected case without retaining full outputs. The
default `registered-batch-3-attempts` strategy mirrors production: all six
registered cards (including Safety) start in one request, every remaining
invalid card shares one progressively smaller retry request, and the run stops
after at most three total attempts. The older `single`,
`single-retry-missing`, and `split-3-2` strategies remain available only for
historical comparisons. A parsed card that cites a source key absent from the
supplied catalog is rejected before scoring and enters the same limited retry
path. The report records card completion after each attempt, whether attempt 3
was required, latency, parsing/grounding scores, language and safety failures,
and provider-reported tokens.

The six-card prompt-fit release gate uses whole runs, not the average of six
independent card scores. A run passes prompt-fit only when all six cards pass
parsing, grounding, and scenario checks by the end of attempt 2. Attempt 3 is a
production fallback; it may recover the visible result but does not retroactively
pass that run. A model verdict requires at least 30 runs, at least 90% prompt-fit
success, and 100% final completion after attempt 3. With the five built-in
summary cases, `--repeat 6` supplies the minimum 30-run sample.

The evaluator treats the data-scope selector as an authorization boundary:
fixtures that require FHIR tools run in patient scope, while tool-less general
medical questions run in general scope. It does not infer this authorization
from question keywords. This mirrors the product architecture: frontier
models retain autonomous `auto` tool routing, while custom/on-prem models use
the explicit scope and a small deterministic prefetch allowlist.

`gpt-oss:120b` is intentionally included in the Chat matrix even when a
particular deployment does not expose native tool calls. This lets the report
separate questions completed through safe deterministic prefetch from questions
that require the upstream server to return OpenAI-compatible `tool_calls`.

For explicitly authorized local patient files, use the headless import-to-agent
integration runner. It uses the same SDK conversion, `LocalBundleService`, FHIR
tools, router, prompt, and deep-mode agent as the app, but does not validate the
browser UI:

```powershell
$env:ONPREM_PATIENT_FILES = 'C:\path\patient-1.json;C:\path\patient-2.json'
$env:ONPREM_LLM_MODEL = 'tvghbrain3.5'
npm.cmd run eval:onprem-patients -- --repeat 10
```

Its JSONL records contain only patient sequence number, resource counts, tool
names, tool-call count, tool-result character count, snapshot count/truncation
metadata, answer checks, token usage, latency, and an answer hash. Complete
answers and patient identifiers are not retained. Broad health-summary cases
must use the compact snapshot tool (or, for a legacy run without that tool, all
three required condition/medication/laboratory tool groups).

Reports and JSONL run records are written under
`scripts/experiments/onprem-model-eval/results/`, which is gitignored.

## Clinical correctness and usefulness audit

The automatic evaluator does not establish clinical correctness or practical
usefulness. For that decision, generate a model-blinded review packet from
synthetic `--include-output` runs and collect at least two independent clinical
reviews per answer:

```powershell
npm.cmd run audit:onprem-content -- --mode generate `
  --inputs scripts/experiments/onprem-model-eval/results/runs-a.jsonl,scripts/experiments/onprem-model-eval/results/runs-b.jsonl `
  --models tvghbrain3.5 `
  --reviewers physician-a:physician,physician-b:physician

npm.cmd run audit:onprem-content -- --mode score `
  --key scripts/experiments/onprem-model-eval/results/content-review-key-<stamp>.json `
  --reviews scripts/experiments/onprem-model-eval/results/content-review-physician-a-<stamp>.csv,scripts/experiments/onprem-model-eval/results/content-review-physician-b-<stamp>.csv
```

The score command checks fact accuracy, required-fact coverage, usefulness,
major-edit rate, critical errors, fabricated facts, two-reviewer coverage, and
reviewer agreement. Binary disagreements require an explicit adjudicator.
Model identity is stored only in the private key, and immutable review content
is hash-checked before scoring. See [ONPREM-CONTENT-AUDIT.md](./ONPREM-CONTENT-AUDIT.md)
for the rubric, release gates, and operational workflow.
