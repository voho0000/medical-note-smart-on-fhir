// Compact version-link. Shows "v0.1.0 ↗" and opens the matching GitHub
// release page in a new tab.
//
// As of v0.4.0 the header no longer mounts this — DisplaySettings inside
// Settings → 顯示 owns the version display. Kept as a small reusable
// component for any other place that wants the "compact chip" form.
'use client'

import { ExternalLink } from 'lucide-react'
import { useAppVersion } from '@/src/shared/hooks/use-app-version.hook'

const REPO = 'voho0000/medical-note-smart-on-fhir'

export function VersionLink() {
  const version = useAppVersion()
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
      className="hidden sm:inline-flex items-center gap-0.5 text-[0.6875rem] text-muted-foreground hover:text-foreground transition-colors"
      title={`MediPrisma v${version} — 查看更新內容`}
    >
      v{version}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  )
}
