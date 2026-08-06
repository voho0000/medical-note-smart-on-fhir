# On-prem model evaluation

This opt-in experiment measures the hospital OpenAI-compatible models through
the same Medical Summary prompts and Chat Agent/tool loop used by the app. It
runs directly on Node's Web Fetch implementation so streamed SSE responses use
the same Web Stream contract as the browser. Normal tests never contact the
endpoint.

## Scope

- Medical Summary: six documented text models × five synthetic clinical cases.
- Chat Agent: four documented tool-calling models × twelve gold questions.
- Metrics: parse/completeness, grounding, scenario semantics, tool selection,
  arguments, retrieval, final-answer correctness, latency, and reported tokens.

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
npm.cmd run eval:onprem-models -- --phase chat --models gemma4:31b --chat-cases hba1c-trend,penicillin-allergy
npm.cmd run eval:onprem-models -- --phase summary --models tvghbrain3.5 --summary-cases cross-hospital-current-medications --summary-strategies single,single-retry-missing,split-3-2 --repeat 10
npm.cmd run eval:onprem-models -- --phase chat --models tvghbrain3.5 --chat-cases broad-health-summary --repeat 10
```

`--repeat` repeats each selected case without retaining full outputs. Summary
strategies compare one full batch, one full batch followed by retries for only
missing modules, and a fixed 3+2 split. The report records request count,
latency, parsing/grounding scores, and provider-reported tokens.

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
