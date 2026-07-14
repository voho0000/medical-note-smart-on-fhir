# Feedback feature

> Developer reference｜v0.40.0｜Reviewed 2026-07-14

This feature renders the in-app issue-report form. Deployment and email setup live in [`docs/FEEDBACK_SETUP.md`](../../docs/FEEDBACK_SETUP.md).

## Files

```text
features/feedback/
├── components/
│   ├── FeedbackButton.tsx
│   └── FeedbackDialog.tsx
├── index.ts
└── README.md
```

- `FeedbackButton` owns dialog open state and is mounted from `HeaderOverflowMenu`.
- `FeedbackDialog` validates input, collects non-patient system metadata, chooses the endpoint, submits JSON, and shows success/error state.
- `app/api/feedback/route.ts` is the optional same-repo Node endpoint; it is not part of static exports.

## Endpoint selection

```ts
const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL || '/api/feedback'
```

When `NEXT_PUBLIC_PROXY_KEY` is present the client also sends `X-Client-Key`. This is a public marker, not authentication. Production functions should validate Firebase ID tokens and App Check independently.

## Form contract

Required fields: Email, issue type, description. Description must be at least 20 characters in the UI. Severity defaults to `medium`; reproduction steps are optional.

Automatically collected fields are timestamp, user agent, screen resolution, browser language, current path, and FHIR server URL. `patientId` is intentionally excluded. Do not add patient name, id, Bundle fragments, chat content, tokens, or API keys to the payload.

## i18n

Labels come from `t.feedback` in:

- `src/shared/i18n/locales/zh-TW.ts`
- `src/shared/i18n/locales/en.ts`

Fallback strings exist for resilience, but new copy must be added to both locales.

## Changes checklist

- Keep the client and external Function schemas compatible.
- Update `app/api/feedback/route.ts` validation when adding a field.
- Treat every string as attacker-controlled; escape HTML and cap length server-side.
- Explain any newly collected metadata in `PRIVACY_POLICY.md`.
- Verify Node-host and static-host behavior separately.
- Add tests for validation, no-PHI payload, endpoint selection and failed submission.

## Local integration

```tsx
import { FeedbackButton } from '@/features/feedback'

<FeedbackButton />
```

The normal app entry is the header overflow menu; avoid mounting duplicate buttons unless a separate context requires one.

## Security notes

The built-in route has origin checks, a per-instance rate limit, input allowlists, size caps, HTML escaping and generic errors. It has no durable distributed rate limit or account authentication. For production static hosting, use the Firebase Function from the backend repo and follow the deployment guide.
