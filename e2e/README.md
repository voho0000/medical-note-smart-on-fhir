# E2E tests (Playwright)

End-to-end tests that drive the real app in Chromium. They exercise
**client-only** flows by importing a synthetic FHIR bundle through the header
file input — **no SMART OAuth, no live FHIR server, no Firebase/AI needed**.

## Run

```bash
npm run test:e2e        # headless
npm run test:e2e:ui     # Playwright UI mode (watch / debug)
```

The config (`playwright.config.ts`) starts `next dev` on :3001 automatically.
First run also needs the browser: `npx playwright install chromium`.

## Test data

- `fixtures/synthetic-bundle.json` — fully fictional patient (王小明). Committed,
  used by CI and by default. Covers BP (SBP/DBP components, 2 dates), Albumin
  (3 dates incl. an abnormal one), an imaging report with a `conclusion`
  narrative, a medication, an encounter — i.e. the data the recent search /
  trend-chart features need.
- Real data (optional, local only): set `E2E_LOCAL_BUNDLE=/path/to/bundle.json`
  to run against one of your own exports. Never committed; CI always uses the
  synthetic bundle.

## Mocking the AI stream

`ai-chat-stream.spec.ts` exercises the chat **streaming render path** without a
real model — deterministic, no network, no key, no flakiness. See
`fixtures/mock-stream.ts`:

- `playwright.config.ts` pins the AI proxy URLs to `https://e2e-proxy.test/*`
  via `webServer.env`, so `hasChatProxy` is true (a no-user-key model like
  GPT-Nano routes through the proxy) and the test knows the exact host to
  intercept. (When a local `next dev` with a *real* proxy is reused, real
  Firebase-function hosts — `*.cloudfunctions.net` / `*.run.app` — are matched
  too.)
- The proxy fetch always POSTs to exactly the proxy URL; the test intercepts it
  (identified by a marker in the prompt) and fulfills it with a canned **OpenAI
  Chat Completions SSE** built from a fixed multi-block markdown reply.
- Assertions prove the streamed reply renders as **formatted markdown** (table /
  heading / code), not raw text, and finishes promptly — the regression guard
  for the block-memoized `MarkdownRenderer`.
- A `stallAfter` option makes the mock emit a few tokens then **stall** (never
  close), exercising the streaming **idle-timeout watchdog**: the chat must
  surface a 逾時 error instead of hanging forever (the GPT-Nano "10 min, never
  finishes" hang). The client idle-timeout is pinned per-page via
  `window.__streamIdleTimeoutMs` (a test seam; prod uses
  `ENV_CONFIG.streamIdleTimeoutMs`, default 60s).

Both are model-agnostic. Extending to the Gemini / Anthropic wire formats (to
assert each provider's parsing) would be a separate, follow-up addition.

## Scope

Phase 1+ covers reports search (name / institution / content, result count,
`<mark>` highlight, empty state), trend charts (SBP/DBP, value labels), other
client-side search, and AI chat streaming (mocked — see above). Auth-gated flows
(chat-history search) and *real* AI generation are intentionally out of scope.
