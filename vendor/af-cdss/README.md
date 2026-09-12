# AF branch packages

These are local builds of `codex/af-cdss-complete` in
`voho0000/mediprisma-personalization`, based on `origin/main` (`bd8220d`). They
are intentionally referenced with `file:` dependencies so this review branch
can be installed without publishing unreleased clinical guidance. `manifest.json`
records the exact files, versions and SHA-512 integrity values also in the lockfile.
Source commit: `3d525c72d3593ba7ecf691788687fe443033d4ea`.

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
