// Streaming idle-timeout watchdog (shared by normal-mode and agent-mode chat).
//
// Why: a stalled or never-closing upstream stream (the proxy holds the
// connection open, or the model stops emitting without a finish event) leaves
// `for await` hanging forever — the UI stuck in "loading" with no way out but
// the stop button (the GPT-Nano "10 min, never finishes" hang). We race each
// iterator step against an idle timer so the timeout fires EVEN IF the SDK
// doesn't react to the abort (aborting a stalled body doesn't always reject the
// pending read). On timeout we call onTimeout() (to abort the underlying
// request, best-effort) and throw StreamIdleTimeoutError.

import { ENV_CONFIG } from "@/src/shared/config/env.config"

/**
 * Thrown when a stream produces no new item within the idle window. The message
 * contains "timed out" so getUserErrorMessage's /timeout|timed out/ rule maps it
 * to a friendly localized message.
 */
export class StreamIdleTimeoutError extends Error {
  constructor() {
    super("AI response timed out: the model stopped responding")
    this.name = "StreamIdleTimeoutError"
  }
}

/**
 * Wrap an async iterable so it aborts if no item arrives for `idleMs`. Idle-
 * based: a reply that keeps streaming (text, or tool events in agent mode)
 * never trips it; only a genuine stall does.
 */
export async function* withIdleTimeout<T>(
  source: AsyncIterable<T>,
  idleMs: number,
  onTimeout: () => void,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]()
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | null = null
      const idle = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout()
          reject(new StreamIdleTimeoutError())
        }, idleMs)
      })
      let step: IteratorResult<T>
      try {
        step = await Promise.race([iterator.next(), idle])
      } finally {
        if (timer) clearTimeout(timer)
      }
      if (step.done) return
      yield step.value
    }
  } finally {
    // Best-effort, non-blocking: release the underlying stream. NOT awaited — on
    // a stalled stream return() could itself hang.
    iterator.return?.().catch(() => { /* ignore cleanup errors */ })
  }
}

/**
 * Idle-timeout (ms) for the watchdog. Defaults to ENV_CONFIG; an E2E test may
 * pin a short value via `window.__streamIdleTimeoutMs` (a test seam — never set
 * in production) so the anti-hang test trips fast even against a reused dev
 * server.
 */
export function resolveStreamIdleTimeoutMs(): number {
  if (typeof window !== "undefined") {
    const override = (window as { __streamIdleTimeoutMs?: number }).__streamIdleTimeoutMs
    if (typeof override === "number" && override > 0) return override
  }
  return ENV_CONFIG.streamIdleTimeoutMs
}
