# /goal — loop iteration spec (example)

> Format baseline: v0.40.0｜Reviewed 2026-07-14

Copy this to `scripts/loop/goal.md` (gitignored working file) or pass it to the
agent at the start of a loop. One goal = one loop run. Keep it small and
verifiable; the gate decides done, not vibes.

---

## goal
<!-- One sentence. What does "done" look like to a user? -->
Make the Medical Summary card navigator focus the correct cumulative lab
analyte when a user opens a cited investigation trend.

## acceptance criteria
<!-- Concrete, observable. Each should be checkable by a gate or an e2e test. -->
- [ ] Clicking a resolvable lab trend opens Reports in cumulative mode and focuses the analyte.
- [ ] Ambiguous or non-lab trends do not guess a target.
- [ ] Pure resolver tests and the existing report-navigation E2E coverage stay green.

## required gates
<!-- Which gate(s) in scripts/loop/gate.mjs must pass. external-gate is the
     optional out-of-repo verifier hook (see README); enable it when the loop
     should also run a verifier that lives outside this repo. -->
checks: typecheck, lint, test
with-build: false        # set true for build/export-affecting changes
external-gate: false     # set true to also run LOOP_EXTERNAL_GATE_CMD

## stop conditions
max-iterations: 6        # hard cap — abort and report if exceeded
time-budget-min: 30      # wall-clock budget for the whole loop
no-progress: abort       # if gate's failureSignature is unchanged 2 iters → abort

## out of scope
<!-- Guardrails so the loop doesn't wander. -->
- No changes to the AI prompt or generated summary schema.
- Don't touch package-lock.json unless a dependency genuinely changed.
