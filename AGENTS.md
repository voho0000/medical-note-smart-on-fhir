# Repository agent instructions

## GitHub authentication checks

- Never conclude that the user's GitHub token is invalid from a sandboxed or network-restricted `gh auth status` failure.
- Check authentication in a network-enabled execution context with `gh auth status -h github.com`.
- Confirm the live identity with the read-only command `gh api user --jq .login` before reporting that authentication is valid or invalid.
- If the network-enabled checks cannot run, report that authentication could not be verified; do not report that the token expired or is invalid.
- Never print, copy, persist, or expose the GitHub token itself.
