# Feedback feature

> Developer reference｜v0.51.0｜Entry-point review 2026-09-08

This feature renders the in-app issue-report form. Deployment and email setup live in [`docs/FEEDBACK_SETUP.md`](../../docs/FEEDBACK_SETUP.md).

## Files

```text
features/feedback/
├── components/
│   └── FeedbackDialog.tsx
├── image-attachments.ts
├── index.ts
└── README.md
```

- `features/settings/components/DisplaySettings.tsx` owns the app entry and dialog open state, and renders `FeedbackDialog` directly.
- `FeedbackDialog` validates input, previews optional screenshots, collects non-patient system metadata, chooses the endpoint, submits JSON, and keeps an explicit delivered/error state. Feature ideas remain in the separate feature-request pool rather than this issue form.
- `image-attachments.ts` enforces the browser-side attachment contract, re-encodes pixels to remove embedded metadata, and serializes images without sending their local filenames.
- `app/api/feedback/route.ts` is the optional same-repo Node endpoint; it is not part of static exports.

## Endpoint selection

```ts
const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL || '/api/feedback'
```

The client sends a Firebase ID token, an App Check token when available, and `x-proxy-key` when configured. The client key is a public marker, not authentication; production Functions validate Firebase Auth and App Check independently.

## Form contract

Required fields for issue reports are Email, issue type, and description. Description must be at least 20 characters. `ai` covers AI response or clinical interpretation problems and changes the description guidance to request the problematic answer, expected content, or supporting reference without adding another form field. Impact defaults to `medium`; reproduction steps are optional and collapsed by default. Selecting a possible patient-safety or privacy incident does not add a warning or confirmation step. Feature ideas use the separate `features/feature-request-pool` contract.

Users may attach up to three JPG, PNG, or WebP images with a combined decoded size of 8 MB. Images remain in memory for preview, are re-encoded to remove EXIF/embedded metadata, and are serialized only when the report is submitted. Local filenames are not included in the request, and attaching images does not add a confirmation checkbox. The endpoint validates canonical base64, MIME allowlists, decoded size, and image signatures before forwarding attachments to Resend. Images are not written to app storage or a database.

Automatically collected fields are timestamp, user agent, screen and viewport dimensions, pixel ratio, root font size, theme, time zone, browser language, current path/view, app version, launch source/site, and the FHIR server origin. `patientId`, the full FHIR URL, workstation, and query values are intentionally excluded. Do not add patient name, id, Bundle fragments, chat content, tokens, or API keys to the payload.

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
import { FeedbackDialog } from '@/features/feedback/components/FeedbackDialog'

// The caller owns feedbackOpen and setFeedbackOpen.
<FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
```

The normal app entry is DisplaySettings; avoid mounting duplicate dialogs unless a separate context requires one.

## Security notes

The built-in route has origin checks, a per-instance rate limit, input allowlists, size caps, image signature checks, HTML escaping and generic errors. A report is successful only when the endpoint confirms delivery and returns a report ID; retries reuse that ID as Resend's idempotency key. Missing mail configuration returns `503` and preserves the browser draft. The route has no durable distributed rate limit or account authentication. For production static hosting, use the Firebase Function from the backend repo and follow the deployment guide.
