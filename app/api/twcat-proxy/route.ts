// Server-side proxy for TWCAT 2026 connectathon hosts.
//
// Why this exists
// ---------------
// Several TWCAT vendors return CORS headers on real responses (POST /token,
// GET /Patient) but do NOT return Access-Control-Allow-Origin on OPTIONS
// preflight responses. Browsers therefore block any cross-origin request that
// would have triggered a preflight (i.e. anything with an Authorization
// header, anything with a non-simple Content-Type). POST /token works because
// `application/x-www-form-urlencoded` is a "simple" request — but the very
// next call (GET /Patient with Bearer) gets blocked.
//
// This route runs server-side, where CORS does not apply. The browser calls
// our same-origin /api/twcat-proxy?upstream=…, we forward to the upstream
// host, and return the response.
//
// Only available when running `npm run dev` (or on Vercel without the
// static-export flag). Not available on GitHub Pages — TWCAT demo must run
// against the local dev server.
//
// Security: only proxies hostnames on dicom.org.tw's twcat-* subdomains.
// Never proxies arbitrary URLs — that would turn this app into an open
// relay.

import { NextRequest, NextResponse } from 'next/server'

// next.config.ts pins `output: "export"` for GH Pages builds, which forces
// every route to declare its render mode explicitly. This proxy is
// intentionally dynamic — each call goes to a live upstream. It will not be
// included in the GH-Pages static build (run `npm run dev` for TWCAT demo).
export const dynamic = 'force-dynamic'

const ALLOWED_HOSTS = new Set([
  'twcat-services.dicom.org.tw',
  'twcat-fhirsrv.dicom.org.tw',
  'twcat-oauthsrv.dicom.org.tw',
])

// Headers that must not be forwarded from the client request — Node's
// undici fetch refuses to set some of them, and forwarding others breaks
// the upstream (e.g. host, content-length is re-computed).
const HOP_BY_HOP_REQ = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'accept-encoding',
  // next.js adds these
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
])

const HOP_BY_HOP_RES = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
])

function isAllowed(upstream: string): boolean {
  try {
    const u = new URL(upstream)
    if (u.protocol !== 'https:') return false
    return ALLOWED_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

async function handle(req: NextRequest) {
  const upstream = req.nextUrl.searchParams.get('upstream')
  if (!upstream || !isAllowed(upstream)) {
    return NextResponse.json(
      { error: 'upstream missing or not in allowlist', allowed: [...ALLOWED_HOSTS] },
      { status: 400 }
    )
  }

  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQ.has(key.toLowerCase())) {
      headers[key] = value
    }
  })

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer()
  }

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstream, init)
  } catch (e) {
    return NextResponse.json(
      { error: 'upstream fetch failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }

  const outHeaders = new Headers()
  upstreamRes.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_RES.has(key.toLowerCase())) {
      outHeaders.set(key, value)
    }
  })

  const body = await upstreamRes.arrayBuffer()
  return new NextResponse(body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: outHeaders,
  })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const PATCH = handle
export const OPTIONS = handle
