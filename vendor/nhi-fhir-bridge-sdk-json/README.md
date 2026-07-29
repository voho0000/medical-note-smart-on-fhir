# NHI-FHIR-Bridge SDK JSON browser artifact

This directory contains the browser-only bundle generated from
`@nhi-fhir-bridge/sdk-json/browser` in the sibling NHI-FHIR-BRIDGE repository.
It is checked in so the static MediPrisma build can convert a Health Bank SDK
JSON file locally without a server, a package-registry dependency, or runtime
network access.

The source of truth remains NHI-FHIR-BRIDGE. Regenerate `browser.js` there with
`npm run build:browser --workspace @nhi-fhir-bridge/sdk-json`, then update this
artifact and its declaration together.

The artifact intentionally excludes the SDK CLI and fixture helpers, which use
Node.js file-system and crypto APIs.
