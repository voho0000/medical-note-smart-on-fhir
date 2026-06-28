# Loop engineering — workstream A scaffold

The verifier gate + goal contract that lets the app **self-iterate**: an agent
runs `reason → act → observe → verify` against a written `/goal` until a real
gate says done. Background and the three-workstream split live in
[`docs/LOOP-ENGINEERING-APP-ITERATION.md`](../../docs/LOOP-ENGINEERING-APP-ITERATION.md).

This folder is the **gate the loop calls** — not the loop driver itself. The
orchestration (spawn agent → run gate → check stop conditions → repeat) is
provided by the harness (`/loop`). What was missing, and is built here, is the
unified verifier and the goal/gate contract.

## Pieces

| File | Role |
|------|------|
| `gate.mjs` | Runs the project gates as one chained verifier, emits a structured verdict. |
| `log.mjs` | Records loop progress events (goal / start / done / note / stop) to the journal. |
| `dashboard.mjs` | Local web console: goal, what's done, what's in progress now, latest result. |
| `goal.example.md` | The `/goal` spec format — copy to `goal.md` per iteration. |
| `.loop/last-gate.json` | Latest verdict (gitignored). The loop reads this to decide pass/retry/abort. |
| `.loop/history.jsonl` | One verdict per line (gitignored). The console reads this. |
| `.loop/journal.jsonl` | One progress event per line (gitignored). The console reads this. |

## The gate

```bash
npm run loop:gate                      # fast: typecheck, lint, test
npm run loop:gate -- --with-build      # also the GH-Pages build (slow)
npm run loop:gate -- --checks=typecheck,test
npm run loop:gate -- --json            # verdict JSON only, to stdout
```

Exit `0` = all gates passed, `1` = at least one failed. Verdict shape:

```json
{
  "ok": false,
  "timestamp": "2026-06-28T...Z",
  "gates": [
    { "name": "typecheck", "ok": true,  "durationMs": 4200, "summary": "…tail…" },
    { "name": "test",      "ok": false, "exitCode": 1, "summary": "…failing tests…" }
  ],
  "failureSignature": "9f2a…"
}
```

`failureSignature` is a hash of *what is failing*. The loop compares it across
iterations: **unchanged twice = no progress → abort** (the agent is stuck
retrying the same broken approach).

## Monitoring console

```bash
npm run loop:dashboard           # http://localhost:4555
```

A local, zero-dependency web page that merges two streams and refreshes every
couple of seconds:

- **`.loop/journal.jsonl`** — progress events the loop writes via `log.mjs`.
- **`.loop/history.jsonl`** — gate verdicts.

It shows, live: the current **goal** and status (running / stopped / waiting),
**what's being done right now**, the **latest gate result** (each check's
status + a no-progress warning when the same failure repeats), and an
**activity timeline** of everything that happened. Dev tool only — never wired
into the shipped app.

### Reporting progress during a loop

So the console can show what the loop is doing, the loop writes events as it goes:

```bash
node scripts/loop/log.mjs goal  "make eGFR aliases merge into one series"
node scripts/loop/log.mjs start "editing fhir-tools.ts"
node scripts/loop/log.mjs done  "editing fhir-tools.ts"
node scripts/loop/log.mjs note  "LOINC 33914-3 is the canonical code"
node scripts/loop/log.mjs stop  "gate passed"
```

A `start` opens an in-progress step (shown pulsing as "now doing"); the matching
`done` (same text) closes it. `gate.mjs` results appear on the timeline
automatically — no need to log those.

To reset the console between runs: `rm -f .loop/journal.jsonl .loop/history.jsonl`.

## Stop conditions (layered exits)

The loop must never spin forever. In priority order:

1. **Gate pass** — verdict `ok: true`. Done. ✅
2. **Max iterations** — hard cap from the goal (`max-iterations`). Abort + report.
3. **Time / token budget** — `time-budget-min` exceeded. Abort + report.
4. **No-progress** — `failureSignature` identical two iterations running. Abort;
   escalate to a human rather than burning budget.

## Optional external gate

The gate has one pluggable hook so a loop can include a verifier that lives
**outside this repo** without that verifier's internals ever appearing here.
Point it at any command:

```bash
export LOOP_EXTERNAL_GATE_CMD="…command that exits 0 on pass, non-zero on fail…"
export LOOP_EXTERNAL_GATE_NAME="external"   # optional label for the verdict
npm run loop:gate
```

When set, the gate runs it as one more gate, keeps its stdout tail as the
summary, and folds its pass/fail into the verdict. When unset, it's skipped
(reported as such), so local loops aren't blocked on it. The gate only ever sees
the command's **exit code and output tail** — by design it knows nothing about
what the command does. Enable it per goal with `external-gate: true`.

## Workstream B — telemetry seeds (later, not now)

B (runtime self-improvement) needs usage signal as fuel and a **human review
gate** for safety. It's premature while users are few. Start collecting now so
there's data to learn from later. Minimum fields worth capturing (storage TBD —
keep PHI out):

- `event`: feature invoked / result shown / result dismissed
- `outcome`: adopted / edited / rejected by the clinician (proxy for usefulness)
- `error`: timeouts, tool failures, empty results
- `feedback`: thumbs / free-text from the existing feedback flow
- `ts`, anonymised session id — **no PHI, no raw note content**

These map onto the verdict-style structured logging the gate already models.
