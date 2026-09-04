import { test, expect } from '../fixtures/test'
import { importBundle } from '../fixtures/import'

/**
 * A guard on the guard. The anonymous-session stub is invisible when it works,
 * so if it ever stops applying — a new spec importing `test` from
 * `@playwright/test`, a route pattern that stops matching — the suite would go
 * back to creating real accounts in the production Firebase project and nobody
 * would notice until the sign-up quota tripped and every AI spec went red at
 * once. Assert the isolation directly instead.
 */
test.describe('firebase isolation', () => {
  test('serves the anonymous session locally instead of the real project', async ({ page }) => {
    const identityBodies: string[] = []
    const firestoreCalls: string[] = []
    page.on('response', async (response) => {
      const url = response.url()
      if (!url.includes('identitytoolkit.googleapis.com')) return
      identityBodies.push(await response.text().catch(() => ''))
    })
    page.on('request', (request) => {
      if (request.url().includes('firestore.googleapis.com')) firestoreCalls.push(request.url())
    })

    await importBundle(page)

    // Poll rather than assert once: sign-in is async, and a stubbed response
    // lands so much faster than a real one that a bare assertion here would
    // fail for the wrong reason (nothing seen yet) instead of the right one
    // (something real came back).
    await expect.poll(() => identityBodies.length, {
      message: 'the app should still mint an anonymous session on load',
    }).toBeGreaterThan(0)

    // Every one of those was answered from the fixture, not from Google.
    for (const body of identityBodies) {
      expect(body).toContain('e2e-anonymous-uid')
    }

    // Firestore stays uninitialized in the main suite. This is stronger than
    // aborting the first request: the SDK never starts a WebChannel and cannot
    // enter its background retry loop.
    expect(firestoreCalls, 'the main E2E suite must not start Firestore').toEqual([])
  })
})
