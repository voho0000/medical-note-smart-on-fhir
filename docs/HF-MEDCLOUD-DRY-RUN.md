# HF medcloud2 calculator integration

Scope: the two outpatient claims P1_CD_mortality_1m and P1_CD_mortality_3m.
Manual input checks and a separate manual prediction action are implemented. No automatic clinical upload, result persistence or clinical database write is introduced.

## Clinical meaning

The upstream service is a research pilot without a medical device license. Its outcome is death during hospitalization at TVGH; outside-hospital and other-hospital deaths are not included. Applicability to medcloud2 and other institutions remains unvalidated. Results require physician interpretation and cannot be the sole basis for treatment.

An accepted input check is not a risk result and does not establish complete history. Missing labs and coverage warnings remain visible. A 422 refusal says unable to assess, never low risk. Prediction shows the returned calibrated probability, risk tier, notes, index date and model horizon. Optional observed incidence is labelled a group rate, not individual probability. Model name, versions, calibration, model/manifest hashes, computation time, adapter version and matching request ID remain available with the result. Three-month model hashes can be a two-member m1/m2 ensemble.

## Browser data path

The calculator reads the original tab-scoped LocalBundleService Bundle only after an explicit preparation action, only in local-import mode and for a single-patient medcloud2 source. SMART mode never falls back to a leftover local Bundle. Demographic overlays are not used.

Choose a dated AMB encounter with recognized ICD diagnosis and a resolvable Organization identifier in https://cloud-wildcatch.invalid/fhir/sid/medcloud-provider. The visit supplies indexDate and hospital scope. Explicit case type 08 is excluded. Route names and acquisition-platform labels do not establish hospital source.

The adapter:
- Uses a fresh UUID namespace and strips names, identifiers, raw source IDs and narratives.
- Includes only selected-hospital records linked to the same patient, omitting conflicting or unknown sources, future or void records.
- Preserves exact recognized ICD system URLs/editions, validates code syntax, deduplicates the same ICD family/code and reports unsupported diagnoses. WHO ICD-10 is not relabelled as ICD-10-CM.
- Collapses identical inpatient episodes but retains separate outpatient visits. Excludes future discharge dates and discharge-derived diagnoses of ongoing admissions.
- Uses only audited LOINC assays, supported units and actual collection/effective dates. Never substitutes a report date or normal/zero lab value.
- Reports unavailable modules, unverified longitudinal coverage and missing inpatient ranks without inventing them.
- Accepts only exact recognized ICD procedure systems and formats; NHI order codes are not relabelled.

Complete birth date and recorded male/female sex are required by the model; a masked birth year is not expanded. Historical feature BNP maps ONLY to NT-proBNP LOINC 33762-6. Departments are not guessed. Service transport validation independently enforces the projected privacy contract, department AB/AD/22 and two-digit case codes.

## HTTPS SaMD contract

Build-time public settings:
```
NEXT_PUBLIC_HF_GATEWAY_ORIGIN=https://samd.mediprisma.tw
NEXT_PUBLIC_HF_AUTH_POLICY=intranet
```
Unset policy retains Firebase mode; no origin default, URL override, direct HTTP fallback or model token is embedded in the browser.

Both policies must target the standalone mediprisma-samd-service for prediction. Its legacy integrations/hf-gateway/dry-run-handler.ts handoff supports input checks only and is not a prediction endpoint. A Firebase deployment verifies the signed current caller and explicit operation authorization. Intranet mode, approved by the owner, omits Firebase credentials and relies on protected local HTTPS ingress attestation and approved client CIDRs. Origin/CORS, browser IP headers and site names never grant access.

The service requires explicit prediction activation; old configurations remain dry-run only. Firebase model-hf grants alone do not grant prediction. See the service's HF-PREDICTION-CONTRACT.md and configuration examples for activation and operation grants.

Request body: projected application/fhir+json Bundle, maximum 2 MiB; X-Request-ID is a fresh UUIDv4.
- POST /hf/v1/dry-run?claim=...&indexDate=YYYY-MM-DD&dryRun=true returns checked OperationOutcome with 200/422.
- POST /hf/v1/predict?claim=...&indexDate=YYYY-MM-DD&dryRun=false returns application/json schemaVersion1 scored/refused DTO with 200/422.

The server owns the HF token and fixed upstream URL. It validates input, forces the operation, bounds requests/responses and concurrency, uses a deadline and never retries or forwards caller credentials. Scoring validates subject, claim, mortality outcome, time horizon, Device association, probability, risk tier and required versions, then returns only a narrow DTO. Malformed scoring is distinct from transport outage.

The browser requires an accepted check of the same prepared input before enabling prediction. Nothing submits automatically. Import, source, patient, visit, horizon and Firebase identity changes clear old responses; stale replies are discarded. Responses are held in memory only. Requests omit cookies/cache/referrer and reject redirects. Reads are bounded while streaming. Returned request IDs appear only when correlated with the sent UUID.

CORS must allow the actual HTTPS frontend Origin, POST/OPTIONS and Authorization, Content-Type, Accept, X-Request-ID. Expose X-Request-ID and X-SaMD-Adapter-Version. The current production Origin is https://mediprisma.tw; normal HTTP localhost is not approved. Browser CORS and Local Network Access must be validated independently of server-side API tests.

## Local synthetic preview

Only in development, NEXT_PUBLIC_HF_LOCAL_PREVIEW_RELAY=synthetic activates exact /__hf-local-preview/hf/v1/dry-run and /predict rewrites to loopback 127.0.0.1:3004. Before any network request, the client validates a SHA256 fingerprint of the full projected Bundle with UUIDs normalized. Only two pinned synthetic fixtures are accepted; changing birth date or clinical values is rejected. Production builds with the flag fail closed on submission.

The local test tool separately validates loopback peer, Origin, query, content type, request ID, body size and canonical fixture equality. Input checks use the deployed HTTPS service. Prediction uses the staged new service's full authorization/parser path and the same real HF upstream. This temporary tool is not a general clinical proxy or production Gateway, and is outside the app artifact. Production services and TLS/CORS settings are not changed by this preview.

## Validation and deployment boundary

Only synthetic fixtures are used in tests, screenshots and model calls. No credentials, real patient records or raw clinical responses belong in version control or logs.

Focused frontend tests cover projection, transport, manual actions, refused/malformed results, source and identity invalidation, launch visibility and the traditional HF prognosis entry. Run relevant lint and production build with the preview flag unset. Service checks cover operation authorization, response sanitization, contract provenance, timeouts, size and concurrency.

Real synthetic calls on 2026-10-05 returned scored 200 for both horizons, with laboratory-day coverage warnings. Model versions and calibration are taken from the response, not adapter version. Production app/service publication is separate; the current deployed SaMD remains dry-run until the reviewed release and explicit prediction setting are activated.
