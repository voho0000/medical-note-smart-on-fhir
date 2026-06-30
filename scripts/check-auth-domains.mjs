#!/usr/bin/env node
// Live guard for the "Google login silently broke because a deploy domain fell
// out of Firebase's Authorized domains" outage class — the exact break a real
// user had to report on 2026-06-30 because nothing automated caught it.
//
// Firebase's getProjectConfig is readable with the PUBLIC web API key (the same
// value shipped in the client bundle — NOT a secret), so this needs no service
// account. It asserts every production domain the app is served from is still in
// the project's authorizedDomains list; a missing one means Google / OAuth
// sign-in is broken on that domain. Exits non-zero on a miss → red CI run →
// GitHub emails the repo owner, so the break is caught without a user report.
//
// Note: this covers the AUTHORIZED-DOMAINS class only. It can't see whether the
// Google / Anonymous providers are enabled (no public endpoint), nor real OAuth
// completion — those stay out of scope.

const ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/projects'

// Domains the app is actually served from and must be able to sign in on.
// localhost + *.firebaseapp.com / *.web.app are Firebase defaults we don't police.
// Override with AUTH_REQUIRED_DOMAINS="a.com,b.com" if the deploy targets change.
const DEFAULT_REQUIRED = 'mediprisma.tw,voho0000.github.io'

/** Pure: which required domains are absent from the project's authorized list. */
export function missingDomains(authorizedDomains, required) {
  const set = new Set(authorizedDomains || [])
  return (required || []).filter((d) => !set.has(d))
}

async function main() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const required = (process.env.AUTH_REQUIRED_DOMAINS || DEFAULT_REQUIRED)
    .split(',').map((d) => d.trim()).filter(Boolean)

  if (!apiKey) {
    console.error('✗ NEXT_PUBLIC_FIREBASE_API_KEY is not set — cannot query Firebase.')
    process.exit(2)
  }

  let res, body
  try {
    res = await fetch(`${ENDPOINT}?key=${apiKey}`)
    body = await res.json()
  } catch (e) {
    console.error('✗ Could not reach Firebase getProjectConfig:', e?.message || e)
    process.exit(2)
  }
  if (!res.ok) {
    console.error(`✗ getProjectConfig HTTP ${res.status}:`, JSON.stringify(body))
    process.exit(2)
  }

  const authorized = body.authorizedDomains || []
  console.log('Authorized domains :', authorized.join(', ') || '(none)')
  console.log('Required domains   :', required.join(', '))

  const missing = missingDomains(authorized, required)
  if (missing.length) {
    console.error(`\n✗ MISSING from Firebase Authorized domains: ${missing.join(', ')}`)
    console.error('  → Google / OAuth sign-in is BROKEN on these domains.')
    console.error('  → Fix: Firebase Console → Authentication → Settings → Authorized domains → Add domain.')
    process.exit(1)
  }
  console.log('\n✓ All required deploy domains are authorized — Google sign-in config OK.')
}

// Run unconditionally — a guard script must NEVER silently no-op (that would be
// green-forever while checking nothing). `missingDomains` is still exported above
// for reuse; there is no importer, so running main() here is safe.
main()
