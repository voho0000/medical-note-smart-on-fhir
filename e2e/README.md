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

## Scope

Phase 1+ covers reports search (name / institution / content, result count,
`<mark>` highlight, empty state), trend charts (SBP/DBP, value labels), and
other client-side search. Auth-gated flows (chat-history search) and AI
generation are intentionally out of scope for now.
