# E2E tests (Playwright)

> Current test guide｜v0.40.0｜Reviewed 2026-07-14

The main Playwright suite drives the real app in Chromium, imports a committed fictional FHIR Bundle through the real file input, and mocks only the external AI stream when a test needs generation. It does not require SMART OAuth, a live FHIR server, or real model calls.

## Run

```bash
npx playwright install chromium   # first run
npm run test:e2e                  # headless, starts :3001
npm run test:e2e:ui               # Playwright UI
```

`playwright.config.ts` starts `npm run dev` on port 3001. Local runs use two workers; CI is serial and retries failed tests twice. Set `CI=true` to reproduce CI worker/retry behavior.

## Test data

- `fixtures/synthetic-bundle.json`: committed, fully fictional data used by CI. It includes encounters, conditions, resolved diagnoses, medications, observations, blood-pressure components, multi-date albumin, diagnostic reports and imaging text.
- `fixtures/import.ts`: presets zh-TW／medical audience, imports the Bundle, waits for the patient, and exposes chat-scoped helpers.
- `E2E_LOCAL_BUNDLE=/absolute/path/bundle.json`: optional local override. The file must remain gitignored; assertions that depend on 王小明 still use the synthetic fixture.
- `public/demo/demo-bundle.json`: built-in product demo, tested separately through the Welcome flow.

Never commit real patient exports, Playwright traces, screenshots or report artifacts that contain clinical data.

## Main suite coverage

| Spec | Behavior |
|---|---|
| `smoke.spec.ts` | Import Bundle and render patient |
| `demo-data.spec.ts` | Load／identify／exit built-in demo |
| `problem-list.spec.ts` | Encounter diagnoses and resolved-status filter |
| `reports-search.spec.ts` | Search report content, institution and numeric result; highlight and empty state |
| `trend-charts.spec.ts` | BP SBP／DBP and single-analyte labels／normal band |
| `list-search.spec.ts` | Medication and visit list search／empty state |
| `data-selection-preview.spec.ts` | Medical Summary data-scope entry and assembled-context preview |
| `medical-summary-model-picker.spec.ts` | Summary picker remains available in patient audience |
| `safety-alerts.spec.ts` | Unified summary + safety, model sync, auto-run and encrypted cache reuse |
| `slash-template.spec.ts` | `/` menu, shortcut filtering, Enter insertion and Escape |
| `ai-chat-agent-only.spec.ts` | Single Agent path and locked-model settings route |
| `ai-chat-stream.spec.ts` | Markdown streaming, large-block responsiveness and idle timeout |

Auth-gated Firestore history, real SMART redirects and real provider answers are not part of the main suite.

## Deterministic AI stream

`fixtures/mock-stream.ts` installs a pre-navigation `window.fetch` shim. Requests to sentinel proxy hosts receive OpenAI Chat Completions SSE frames emitted over time; all unrelated requests pass through.

The helper supports:

- model selection;
- custom Markdown reply;
- chunk size and delay;
- prompt-specific replies for concurrent summary／safety calls;
- a stream that emits some frames and then never closes;
- per-page idle-timeout override;
- request count and Long Tasks observation.

Tests therefore cover the app's streaming renderer, throttling, Markdown blocks, timeout and cache behavior without testing a provider's current model quality or wire compatibility.

`playwright.config.ts` injects sentinel OpenAI／Gemini／Claude proxy URLs so proxy routing is enabled. The mock recognizes `e2e-proxy.test` and, when reusing a local server with real env, common Functions hosts.

## Firebase emulator chain

`playwright.emulated.config.ts` runs `e2e/emulated/firebase-emulator.spec.ts` on port 3002. It verifies:

```text
anonymous Firebase sign-in -> ID token -> AI proxy Authorization: Bearer header
```

This config expects Auth on 9099 and Firestore on 8080 under project `demo-mediprisma`. It is normally orchestrated by the backend `firebase-smart-on-fhir` repo:

```bash
npm run test:e2e:emulated
```

Running this command in the app repo alone requires the emulators to already be available.

## Writing a test

1. Reuse `importBundle(page)` unless the test specifically covers Welcome／Demo.
2. Prefer roles, accessible names and `data-testid` over CSS structure.
3. Scope chat messages to `chatPanel(page)`; several other features render `.prose`.
4. Call `mockAiStream()` before the first navigation or Bundle import.
5. Avoid arbitrary sleeps; wait for user-visible state or a request count.
6. Keep tests independent and safe for full parallelism.
7. Update this scope table when adding a new spec.

## CI

`.github/workflows/e2e.yml` runs the main suite on pushes to `master`, installs Chromium with system dependencies, and uploads `playwright-report/` for seven days. It is currently independent of the GitHub Pages deploy gate.

The normal CI workflow already runs typecheck, lint, Jest and static build. A change that affects an E2E flow should pass both workflows locally when practical.

## Troubleshooting

### First load times out

Cold Turbopack compilation may take time; the web server timeout is 180 seconds. Verify port 3001 is not occupied by a stale server with different env.

### AI request reaches the network

Ensure `mockAiStream()` ran before `page.goto()`／`importBundle()` and the request is a POST to a recognized proxy host.

### Tests pass alone but fail together

Do not depend on localStorage, Bundle state, request count or Firestore state from another test. Each Playwright test gets a fresh context but a reused dev server.
