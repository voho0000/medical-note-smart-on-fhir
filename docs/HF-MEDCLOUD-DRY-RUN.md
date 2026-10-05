# HF medcloud2 input-validation integration

Status: implementation for review in codex/hf-medcloud-dry-run; not deployed.
Scope: two outpatient claims, P1_CD_mortality_1m and P1_CD_mortality_3m.
No scoring route, risk estimate, automatic clinical upload or clinical database write is implemented.
Visible behaviour changes: existing calculators and their gates are unchanged; the AI-SaMD placeholder gains a manual input-validation section.

## Browser data path

The existing HF prognosis surface offers a local preparation action. It reads the original tab-scoped LocalBundleService Bundle, only when local import mode is active, and only for a single-patient medcloud2 source. SMART mode never falls back to a leftover local Bundle. User-entered demographic overlays are not used.

Choose a dated AMB encounter with ICD diagnosis and a resolvable Organization identifier in:
https://cloud-wildcatch.invalid/fhir/sid/medcloud-provider
The chosen encounter supplies indexDate and provider scope. Case type 08 is excluded when explicitly coded. Route/site labels and acquisition-platform names are not hospital evidence. All provider scopes remain unvalidated for model applicability; even a dryRun 200 does not establish clinical validity.

The adapter:
- projects Patient, Encounter, Condition, Procedure and Observation into a fresh UUID namespace;
- includes only the selected hospital's linked or performer-identified records; conflicting or unknown sources are omitted;
- excludes future, void, foreign-patient and unsupported records;
- normalizes explicitly coded ICD diagnoses and reports missing inpatient ranks without inventing them;
- collapses exact inpatient duplicates and preserves separate same-day outpatient visits;
- excludes future discharge dates and claims diagnoses from admissions ongoing at indexDate;
- accepts only audited LOINC assays and explicit supported units, preserving comparators;
- uses collection/effective dates, never report/Bundle timestamp as a collection date;
- excludes NHI order codes rather than relabeling them as ICD procedures;
- reports module capture statuses separately from unknown longitudinal coverage.

Full birth date is never synthesized from a masked birth year. Only directly recorded male/female sex and full valid date are projected when present. Missing inputs remain missing for the service's dry-run rejection checks.

The model's historical feature name BNP maps ONLY to NT-proBNP LOINC 33762-6, not BNP assays. Department names are not guessed; only existing HF nhi-func-type coding is mapped. This intentionally exposes incomplete feature mappings rather than hiding them.

## HTTPS Gateway contract

Build-time public configuration:
NEXT_PUBLIC_HF_GATEWAY_ORIGIN=https://<approved-intranet-host>
No default origin, token, direct HTTP fallback or arbitrary launch-URL override.

POST /hf/v1/dry-run?claim=P1_CD_mortality_1m&indexDate=YYYY-MM-DD&dryRun=true
Content-Type: application/fhir+json
Accept: application/fhir+json
Authorization: Bearer <existing Firebase caller ID token>
X-Request-ID: <fresh UUIDv4>
Body: projected single-patient Bundle, maximum 2 MiB.

The existing Firebase user is captured only on the explicit submit action. No sign-in prompt/account creation is triggered. Answers are dropped after import, selection, source-mode or sign-in identity changes. Raw Bundle, tokens and responses are not stored in a new log/cache. Network requests omit cookies/cache/referrer and reject redirects.

## Gateway module handoff

integrations/hf-gateway/dry-run-handler.ts exports createHfDryRunHandler.
It is a tested host integration module, not a running Gateway endpoint. It deliberately has no listener, Firebase policy, secret files, telemetry database or deployment side effects.

Copy this module AND its relative src/core/hf-risk/contract.ts, transport-bundle.ts and labs.ts dependencies into an isolated Gateway feature branch, adapting relative imports. Register it using the host's existing Fastify instance:

~~~ts
app.post('/hf/v1/dry-run', {
  bodyLimit: 2 * 1024 * 1024,
  // FHIR JSON is parsed by an explicitly registered application/fhir+json parser.
}, createHfDryRunHandler({
  upstreamOrigin: configuredIntranetHfOrigin, // e.g. http://10.121.12.179:8088
  upstreamToken: serverHeldHfCallerToken,
  authorize: async request => {
    // Strict signed Firebase verification is required.
    // Also require a reviewed HF clinical caller allowlist/role policy.
    // Collector anonymous-caller acceptance alone is insufficient.
    return await authorizedHfClinicalCaller(request.headers.authorization)
  },
}))
~~~

Mandatory host wiring before enabling the browser origin:
1. Register application/fhir+json as JSON with a 2 MiB parser/body limit; invalid JSON returns OperationOutcome without echoed body.
2. Restrict CORS to the reviewed MediPrisma origin, allow POST/OPTIONS and Authorization, Content-Type, Accept, X-Request-ID; expose X-Request-ID.
3. Apply verified clinical caller authorization, host UID/IP rate limits, and intranet-only TLS/reverse-proxy/network policy. Origin checks are independent of identity authorization.
4. Set the dedicated HF upstream Bearer token on the server. Never use the viewer's X-Demo-Key/X-Demo-Case headers.
5. Disable access/body logging of FHIR contents and credentials. Keep only reviewed request-ID/claim/status/duration metadata if auditing is required. Do not reuse Collector event/save body storage.
6. Register no scoring route. Client query dryRun=false, admission/discharge claims, arbitrary destinations, nested narrative/identifiers or dangling references must be rejected.
7. Perform real-workstation HTTPS/CORS/Chrome Local Network Access tests. Public cloud execution cannot directly reach the private HF origin.
8. Verify authenticated Device/v2 capabilities. The older OperationDefinition lists six claims while current service metadata lists eight; do not infer deployed capabilities from the Swagger example alone.

The handler enforces the two claims, strict parameter/date/resource projection checks, fresh request IDs, max eight concurrent upstream calls, 12-second deadline, no redirects, no credentials forwarding and dryRun=true. It bounds upstream reads, accepts 200/422 OperationOutcome only, rejects risk data even in embedded strings, and returns only checked issues. The browser has a 15-second deadline and never offers a scoring mode.

## Deployment and clinical validation boundary

The existing tvgh-mediprisma-gateway AGENTS.md restricts cross-repository changes. No existing Gateway source/config/DB/listener, DNS or production application was changed by this feature. This handoff is ready for the Gateway owner to integrate and review.

After the endpoint and its caller policy are ready, build MediPrisma with the approved HTTPS origin. Before enabling any risk display, pair native EHR and medcloud2 records at the same patient/indexDate and compare extracted model features, missingness, hospital/time coverage and rejected cases with the model team. Admission/discharge adaptation requires separate timing/procedure/rank validation; it is outside this initial outpatient dryRun stage.

## Validation

Run the focused HF input, transport, UI and existing prognosis tests, targeted lint, typecheck and production build.
Only synthetic fixtures may be used. No genuine patient data or production credentials belong in tests, screenshots or version control.


Verified 2026-10-04 in the isolated worktree:
- 49 focused tests passed (input projection, Gateway/client protocol, UI/session invalidation, existing prognosis calculators).
- Targeted ESLint and full-project TypeScript checks passed after installing the repository lockfile dependencies in this worktree.
- Production static export passed. Existing static-export custom-header warnings remain; HTTPS/CORS policy belongs at the actual Gateway/CDN.
- Real Chrome local preview checked at 320, 390, 430, 768, 1024 and 1440 CSS pixels. New controls are 44 px high; the input section had no horizontal overflow. Narrow desktop/tablet panels use a single-column form.
- Browser file upload was unavailable without changing extension file-access permissions. A temporary synthetic demo served by the isolated local app was used instead; the original demo file was restored.
- Only synthetic data was used. No authenticated live HF API submission or real-workstation Gateway acceptance test was performed.


## Calculator integration update (2026-10-05)

The calculator prepares a projected single-hospital input on an explicit action, then shows hospital, index date, resource counts, lab collection dates, missing lab items and source gaps before submission. Missing labs are never replaced with normal or zero values. A 200 with warnings is shown as accepted WITH warnings, not a clinical risk result. Results include checked-at time, validated response request ID and adapter version when present. Adapter version is not the upstream model/calibration version. Patient, source or selection changes clear stale results.

The owner explicitly authorized hospital network users without Firebase UID enrollment. Build the intranet frontend with NEXT_PUBLIC_HF_AUTH_POLICY=intranet and NEXT_PUBLIC_HF_GATEWAY_ORIGIN=https://samd.mediprisma.tw. This sends no Firebase bearer token; the protected SaMD HTTPS ingress and service verify network authorization. Unset policy retains Firebase mode; unknown values disable submission. No browser setting, URL parameter or CORS rule grants network authorization.

No scoring route or mortality probability is provided by this update. Only outpatient 1- and 3-month dry-run contracts are wired. The endpoint must permit the actual frontend HTTPS origin in CORS. Plain HTTP localhost is not on the deployed service's allowed origin list. Frontend rendering tests and real synthetic service API tests do not by themselves establish browser CORS/Local Network Access acceptance.

For the isolated localhost:3003 preview only, NEXT_PUBLIC_HF_LOCAL_PREVIEW_RELAY=synthetic activates a development-only exact rewrite to loopback 127.0.0.1:3004. The local validation tool accepts only canonical projections of the generated synthetic fixture, validates method/origin/body/claim/index/request ID, and forwards to the fixed SaMD HTTPS origin without tokens or body logging. It is not a general patient-data proxy and is not enabled in production. A production build with the preview flag fails closed on submission; leave the flag unset when building/deploying.

Verification: 54 focused tests across input projection, browser transport, HF calculator UI and traditional prognosis entry passed; targeted ESLint and the final production build passed. Real Chrome at localhost:3003 used the generated synthetic fixture through the existing demo import flow (original demo SHA256 restored). Explicit submissions for both outpatient horizons returned real HF API accepted OperationOutcome with the laboratory-day warning. Switching horizon cleared the previous response. Input controls and section widths were checked at 320, 390, 430, 768, 1024 and 1440 CSS pixels; all had no horizontal overflow and controls were 44px tall. The live loopback relay rejected other Origin, dryRun=false and changed synthetic patient content with 403/400. No production publication or normal-browser direct HTTPS CORS acceptance is claimed.
