// Compact version-link for the header. Shows "v0.1.0 ↗" and opens the
// matching GitHub release page in a new tab.
//
// Version source: fetched at runtime from `${basePath}/version.json`, which
// is regenerated from package.json by `scripts/write-version.mjs` whenever
// `npm version` runs (wired via the "version" npm-script hook). Runtime
// fetch — instead of build-time env inlining — means the chip auto-updates
// during `next dev` without needing to restart the dev server: Next.js
// serves `public/` files fresh on every request.
'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

const REPO = 'voho0000/medical-note-smart-on-fhir'
const VERSION_JSON_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/version.json`

interface VersionPayload {
  version: string
}

export function VersionLink() {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // `cache: 'no-store'` — version.json is tiny and we want bumps to show
    // up immediately on hard refresh; without this the browser's HTTP cache
    // could serve a stale copy for the lifetime of the cache header.
    fetch(VERSION_JSON_PATH, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<VersionPayload>) : null))
      .then((payload) => {
        if (!cancelled && payload?.version) setVersion(payload.version)
      })
      .catch(() => {
        // Silent fail — better to hide the chip than show a broken state.
        // Could happen offline, behind a proxy, or before version.json exists.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!version) return null

  // Link to the specific release tag. If the release isn't published yet
  // (rare race: tag pushed but `gh release create` hasn't run), GitHub
  // shows a "release not found" page — still better than a generic
  // releases-list link because it tells the user exactly which version
  // they're missing notes for.
  const href = `https://github.com/${REPO}/releases/tag/v${version}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      title={`MediPrisma v${version} — 查看更新內容`}
    >
      v{version}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  )
}
