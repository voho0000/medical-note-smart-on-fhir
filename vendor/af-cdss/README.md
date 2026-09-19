# AF branch packages

These are local review builds of `codex/af-hmc-integration` in
`voho0000/mediprisma-cdss`, from the fresh post-rewrite clone. They use `file:`
dependencies and are not published. The source changes are committed on the AF integration branch.
`manifest.json` records the source commit, source state, SHA-256 of sorted package
source paths plus file bytes, and artifact SHA-512 integrity matching the lockfile.
The source commit contains the changes used for these packages.

Build the rules repository, run its verification suite, then pack the two packages:

```sh
npm run build
npm test -- --runInBand
npm pack --workspace @voho0000/personalized-care --ignore-scripts --pack-destination /path/to/host/vendor/af-cdss
npm pack --workspace @voho0000/personalized-care-fhir --ignore-scripts --pack-destination /path/to/host/vendor/af-cdss
```

Update the two `file:` dependencies and their matching version/integrity lock
entries; retain all unrelated platform entries (`npm run check:lockfile`).
The other first-party dependencies still use the project's normal authenticated
package installation workflow. No registry release was made for this branch.
