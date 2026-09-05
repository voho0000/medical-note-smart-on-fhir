/**
 * Firebase proxies can fail after an SSE response has already started. In that
 * case the HTTP status remains 200, and some proxy runtimes emit a bare
 * `{ "error": "..." }` data event. The OpenAI Responses provider expects a
 * typed Responses event, so normalize only that known proxy envelope.
 */

interface SseBoundary {
  index: number
  length: number
}

function findSseBoundary(value: string): SseBoundary | null {
  const lfIndex = value.indexOf('\n\n')
  const crlfIndex = value.indexOf('\r\n\r\n')

  if (lfIndex < 0 && crlfIndex < 0) return null
  if (crlfIndex >= 0 && (lfIndex < 0 || crlfIndex < lfIndex)) {
    return { index: crlfIndex, length: 4 }
  }
  return { index: lfIndex, length: 2 }
}

function extractDataPayload(event: string): string | null {
  const dataLines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))

  return dataLines.length > 0 ? dataLines.join('\n').trim() : null
}

function extractProxyErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null

  const value = payload as { type?: unknown; error?: unknown }
  // A typed Responses event already belongs to the provider protocol. Preserve
  // it exactly, including provider-specific code and sequence metadata.
  if (typeof value.type === 'string') return null

  if (typeof value.error === 'string') return value.error.trim() || null
  if (value.error && typeof value.error === 'object') {
    const message = (value.error as { message?: unknown }).message
    if (typeof message === 'string') return message.trim() || null
  }

  return null
}

function normalizeSseEvent(event: string): string {
  const data = extractDataPayload(event)
  if (!data || data === '[DONE]') return event

  try {
    const message = extractProxyErrorMessage(JSON.parse(data))
    if (!message) return event

    const normalized = {
      type: 'error',
      sequence_number: 0,
      error: {
        type: 'upstream_error',
        code: 'upstream_error',
        message,
        param: null,
      },
    }
    const lineEnding = event.includes('\r\n') ? '\r\n' : '\n'
    return `data: ${JSON.stringify(normalized)}${lineEnding}${lineEnding}`
  } catch {
    return event
  }
}

export function guardOpenAiResponsesProxyStream(response: Response): Response {
  if (
    !response.ok
    || !response.body
    || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')
  ) {
    return response
  }

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let pending = ''

  const guardedBody = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })

      let boundary = findSseBoundary(pending)
      while (boundary) {
        const eventEnd = boundary.index + boundary.length
        const event = pending.slice(0, eventEnd)
        pending = pending.slice(eventEnd)
        controller.enqueue(encoder.encode(normalizeSseEvent(event)))
        boundary = findSseBoundary(pending)
      }
    },
    flush(controller) {
      pending += decoder.decode()
      if (pending) controller.enqueue(encoder.encode(normalizeSseEvent(pending)))
    },
  }))
  const headers = new Headers(response.headers)
  headers.delete('content-length')

  return new Response(guardedBody, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
