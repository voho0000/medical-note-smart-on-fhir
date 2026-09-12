# Paired CDSS package snapshots

These local npm archives make the dyslipidemia branch installable without publishing a registry release. They were packed with scripts disabled after the workspace build and validation. Every archived dist file was compared byte-for-byte with the built source; package-lock.json pins the archive integrity. The FHIR package resolves the same personalized-care version (no duplicate runtime).

Source: https://github.com/voho0000/mediprisma-personalization/tree/f2567caeeeffaa2c310bdc22cc6859b4990b7e3a (branch codex/dyslipidemia-complete). Original app base: origin/master 1c17761f. HF remains the default enabled pack; lipid is optional Beta.

| Archive | Integrity |
| --- | --- |
| `voho0000-personalized-care-2.1.0.tgz` | `sha512-7idrrotthDUEbCeEYx2oE9TywJvlqdMMK007pGUV5ucRl13IUs4hlPtKT8ZNJNOeJ06o8Mg5Hs8lsp6kIiMyXA==` |
| `voho0000-personalized-care-fhir-1.7.0.tgz` | `sha512-u4LyEbIYmg8ujNhdZ6aQkepYiOq6SvYoT1xGJncNOL8jW7SoYI1MvGonDSQch0UZHeX6VLdpXGIYDigC4Px8Sg==` |

Normal `npm ci` installs these artifacts. Once these exact versions are released, replace the file pins with registry pins and update the lock in a separate release change. To iterate against a newer local core checkout, `npm run dev:lipid -- /path/to/mediprisma-personalization` builds and overlays its packages in this worktree; repack and refresh the lock hashes before committing changed snapshots.
