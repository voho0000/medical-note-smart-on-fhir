// Compact version-link for the header. Shows "v0.1.0 ↗" and opens the
// matching GitHub release page in a new tab. The version is injected at
// build time from package.json (see next.config.ts → env.NEXT_PUBLIC_APP_VERSION),
// so the deployed link always matches the live code as long as the release
// flow uses `npm version <bump> && git push --follow-tags` and a release
// is published from that tag on GitHub.
'use client'

import { ExternalLink } from 'lucide-react'

const REPO = 'voho0000/medical-note-smart-on-fhir'
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION

export function VersionLink() {
  // Guard against missing env (e.g. running before the next.config inject
  // is wired up). Hiding is the right default — better than rendering a
  // broken `v↗` chip.
  if (!VERSION) return null

  // Link to the specific release. If the tag doesn't exist yet on GitHub
  // (e.g. user pushed code but hasn't published the release), GitHub
  // gracefully shows a "release not found" page — still better than a
  // generic releases-page link because it tells the user exactly which
  // version they're missing notes for.
  const href = `https://github.com/${REPO}/releases/tag/v${VERSION}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      title={`MediPrisma v${VERSION} — 查看更新內容`}
    >
      v{VERSION}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  )
}
