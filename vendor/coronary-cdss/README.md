# Coronary review packages

These tarballs are built from `mediprisma-personalization` on
`codex/coronary-cdss-hf-style`. The matching versions include the current HF
rules and the existing coronary pack. They make this review branch installable
without publishing a package or changing the production application's pins.

`manifest.json` records the source commit and integrity of each package.
The application lockfile references the same tarballs and integrity strings.
Do not replace them with the HF-only `2.0.0`/`1.6.0` registry builds.

To rebuild after a rules change: build and verify the rules repository, bump
the two prerelease versions and the adapter's care pin, run `npm pack` for
each workspace into this folder, and update this manifest plus the app's two
dependency/lockfile entries. Preserve all platform-specific lockfile entries
and run `npm run check:lockfile` afterwards.
