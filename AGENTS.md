# Repository agent instructions

## Dependency versions and the lockfile

`npm install` on macOS rewrites `package-lock.json` from the tree it just built
here, and that tree has no room for the optional entries and platform fields
only Linux installs — `@emnapi/*`, `react-native`, `libc` on the lightningcss
and oxide builds. They disappear, Linux CI runs `npm ci`, and the build goes
red on a two-line version bump.

- To move a first-party package forward, do not install: `npm run bump:dep -- <package> <version>` edits `package.json` and the one lockfile entry from the registry's own tarball and integrity values. Follow with `npm ci` if `node_modules` needs to match.
- When an install is genuinely needed (adding or removing a package, a changed dependency graph), run it through `npm run packages:install`, which repairs the lockfile straight afterwards.
- `npm run check:lockfile` reports what a rewrite dropped; `npm run fix:lockfile` puts it back. The pre-commit hook runs the check whenever the lockfile is staged, and CI runs it against the previous commit.
- The hook needs `git config core.hooksPath .githooks` once per clone; the `prepare` script does it on `npm install`.
- No npm flag avoids the pruning: `--include=optional`, `--package-lock-only`, and `--install-strategy=nested` each drop the same five entries. Do not go looking for one.

## GitHub authentication checks

- Never conclude that the user's GitHub token is invalid from a sandboxed or network-restricted `gh auth status` failure.
- Check authentication in a network-enabled execution context with `gh auth status -h github.com`.
- Confirm the live identity with the read-only command `gh api user --jq .login` before reporting that authentication is valid or invalid.
- If the network-enabled checks cannot run, report that authentication could not be verified; do not report that the token expired or is invalid.
- Never print, copy, persist, or expose the GitHub token itself.

## UI design guidance

- Before creating, changing, or reviewing rendered UI, read the repository root `DESIGN.md`.
- Use the repository skill in `.agents/skills/design-mediprisma-ui/`.
- Prefer existing tokens and shared primitives over one-off values.
- Verify material UI changes with relevant tests, lint, a production build, and real browser checks.
