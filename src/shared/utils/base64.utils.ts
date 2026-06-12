// base64.ts
// Decode an attachment.data (RFC 4648 base64, optionally with a `data:<mime>;base64,`
// prefix) to a JS string. Bridge v0.17.0+ omits the prefix; legacy / non-bridge
// sources sometimes include it, so we tolerate both.
//
// We assume UTF-8 content (true for 健保存摺 HTML which embeds Chinese — bridge
// emits UTF-8 base64 directly per FHIR R4 §Attachment).

/**
 * Decode base64 attachment payload to a UTF-8 string. Returns '' on failure
 * so the renderer can show a placeholder instead of crashing.
 */
export function decodeBase64Utf8(base64?: string): string {
  if (!base64) return ''
  if (typeof window === 'undefined') return ''
  const raw = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  try {
    // atob → binary string → UTF-8 decode. The TextDecoder path correctly
    // handles multi-byte sequences (Chinese, accents, em-dash…); the naive
    // `atob` + escape pipeline drops them silently.
    const binary = atob(raw)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}
