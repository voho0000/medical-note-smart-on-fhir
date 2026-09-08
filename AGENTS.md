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

## Visibility gates

- A change that hides, disables, or removes a clinical surface — a tab, a care
  pack, a card, a switch — for a route, a site, a role, or a sign-in state is
  never a side effect of another change. Ask the owner first, in the chat, with
  the surface and the route named; do not infer it from a neighbouring rule
  such as "this route must stay silent".
- Every commit that touches such a gate carries a `Visible behaviour changes:`
  section listing, one line per surface, what a user on which route can no
  longer see or do — or `Visible behaviour changes: none`.
- The gates in force are listed in `docs/LAUNCH-ROUTE-GATES.md`; update the
  table in the same commit, and test the route where the surface is kept, not
  only the one where it is hidden.

## UI design guidance

- Before creating, changing, or reviewing rendered UI, read the repository root `DESIGN.md`.
- Use the repository skill in `.agents/skills/design-mediprisma-ui/`.
- For a disease's at-a-glance CDSS view (status board), use `.agents/skills/cdss-status-board/`.
- Prefer existing tokens and shared primitives over one-off values.
- Verify material UI changes with relevant tests, lint, a production build, and real browser checks.
