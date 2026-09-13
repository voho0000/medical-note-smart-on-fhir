# Paired CDSS package snapshots

These local npm archives make the dyslipidemia branch installable without publishing a registry release. They were packed with scripts disabled after the workspace build and validation. Every archived dist file was compared byte-for-byte with the built source; package-lock.json pins the archive integrity. The FHIR package resolves the same personalized-care version (no duplicate runtime).

Source: branch `codex/lipid-visit-flow-pack`, commit dafc82f (not yet pushed; based on `codex/dyslipidemia-complete` @ f2567ca). Original app base: origin/master 064987c5. HF remains the default enabled pack; lipid is optional Beta.

| Archive | Integrity |
| --- | --- |
| `voho0000-personalized-care-2.2.0.tgz` | `sha512-yPZGmlOaB1TtfM1yUanu/P0F28N2D8sdaYG97nwe53IFfcqp+nICXffaCDx8czZnE/hMTKgLGisqIThzrR72vA==` |
| `voho0000-personalized-care-fhir-1.8.0.tgz` | `sha512-vC/DLYPNnYO30Re+hpYUk+eIDluIuHD5uS6mZdjHBFwMYITyW7GbWH2Y5PL5uUbwYvrg0A0kIcZF6OQBeTBUAQ==` |

Normal `npm ci` installs these artifacts. Once these exact versions are released, replace the file pins with registry pins and update the lock in a separate release change. To iterate against a newer local core checkout, `npm run dev:lipid -- /path/to/mediprisma-personalization` builds and overlays its packages in this worktree; repack and refresh the lock hashes before committing changed snapshots.
