# Feature request pool

Cloud-only shared feature requests. Everyone can read visible requests; a real Firebase account is required to publish or vote.

## Product contract

- Fields: title, optional description, category (`ai`, `feature`, `ui`), public-name preference.
- Statuses: `evaluating`, `planned`, `in-progress`, `completed`.
- Requests publish immediately. The form requires a no-patient-information confirmation and accepts no attachments or comments.
- One reversible vote per account per request.
- Authors can edit for 30 minutes while a request is still evaluating, and can withdraw without deleting it.
- The verified `voho0000@gmail.com` account can change status, add an official update, and hide or restore requests.
- Public request documents do not contain the author's uid or email. Ownership and votes are stored in private collections.

## Firestore collections

```text
featureRequests/{requestId}
featureRequestOwners/{requestId}
featureRequestVotes/{userId}/requests/{requestId}
```

Security rules and emulator tests live in the sibling `firebase-smart-on-fhir` repository. Deploy those rules before releasing the UI; undeployed rules intentionally produce the feature's error state.

The on-prem build aliases `service.ts` to `service.onprem.ts` and does not render the entry point.
