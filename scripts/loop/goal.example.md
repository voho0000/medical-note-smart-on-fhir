# /goal — loop iteration spec (example)

Copy this to `scripts/loop/goal.md` (gitignored working file) or pass it to the
agent at the start of a loop. One goal = one loop run. Keep it small and
verifiable; the gate decides done, not vibes.

---

## goal
<!-- One sentence. What does "done" look like to a user? -->
Make the clinical-insights panel remember its collapsed/expanded state across
page reloads.

## acceptance criteria
<!-- Concrete, observable. Each should be checkable by a gate or an e2e test. -->
- [ ] Collapsed state persists after a full reload (covered by a new e2e test).
- [ ] No regression in existing panel behaviour (existing suites stay green).
- [ ] State is stored client-side only (no PHI leaves the browser).

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
- No refactors outside the clinical-insights feature.
- Don't touch package-lock.json unless a dependency genuinely changed.
