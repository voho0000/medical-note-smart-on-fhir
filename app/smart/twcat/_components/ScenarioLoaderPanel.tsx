"use client"

// FHIRfox scenario loader — paste a session URL or ID, fetch the scenario,
// transform into an IPS document Bundle, then act on it (preview, download,
// load into main app, or hand off to the IPS Creator submitter directly
// below this panel).
//
// Why a separate panel from the existing IpsCreatorPanel: the Creator
// expects you've already built an IPS Bundle somewhere else (main app's
// IPS export, manual edit, etc). This panel covers the "I just got assigned
// scenario X, generate the Bundle for me" flow that drives Track #4 Level
// III testing.

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  transformScenarioToBundle,
  bundleFromFhirfoxSession,
} from '@/features/twcat-scenario/transform-ips'
import type {
  DocumentBundle,
  FhirfoxSessionPayload,
} from '@/features/twcat-scenario/types'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

const FHIRFOX_BASE = 'https://twcat-fhirfox.dicom.org.tw'

interface FetchStatus {
  loading: boolean
  payload?: FhirfoxSessionPayload
  bundle?: DocumentBundle
  error?: string
  sessionUrl?: string
}

/**
 * Extracts the session ID from a full FHIRfox URL or returns the raw input
 * if it already looks like a bare ID. Accepts:
 *   https://twcat-fhirfox.dicom.org.tw/sessions/cwgtcaq
 *   /sessions/cwgtcaq
 *   cwgtcaq
 */
function parseSessionId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const urlMatch = trimmed.match(/\/sessions\/([a-z0-9_-]+)/i)
  if (urlMatch) return urlMatch[1]
  // Bare ID — accept letters/digits/dash/underscore, reject anything with
  // protocol or whitespace so typos surface as errors.
  if (/^[a-z0-9_-]+$/i.test(trimmed)) return trimmed
  return null
}

export function ScenarioLoaderPanel({
  // Lets the parent (smart/twcat page) auto-populate the existing IpsCreatorPanel's
  // textarea with the freshly built bundle, so the user can POST it without copy/paste.
  // The sessionUrl is also forwarded so the "Run IPS Validator" button knows
  // which scenario to diff the bundle against — server side it becomes the
  // `fhirfoxUrl` param of /ips-validator/api/validate.
  onBundleReady,
}: {
  onBundleReady?: (bundleJson: string, vendorId: string, sessionUrl: string) => void
}) {
  const [input, setInput] = useState('')
  const [flavor, setFlavor] = useState<'ips' | 'twcore'>('ips')
  const [status, setStatus] = useState<FetchStatus>({ loading: false })

  // Live parse the input — show what session ID we extracted (or error chip
  // if we can't extract one). Saves the user a round-trip if they pasted
  // something we can't grok.
  const parsedId = useMemo(() => parseSessionId(input), [input])

  const fetchAndTransform = async () => {
    if (!parsedId) {
      setStatus({ loading: false, error: 'Cannot parse session ID from input.' })
      return
    }
    const sessionUrl = `${FHIRFOX_BASE}/sessions/${parsedId}`
    setStatus({ loading: true, sessionUrl })
    try {
      // FHIRfox sends `access-control-allow-origin: *` — direct browser
      // fetch works without our /api/twcat-proxy. Verified via curl.
      const res = await fetch(`${FHIRFOX_BASE}/api/sessions/${parsedId}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} from FHIRfox`)
      const payload = (await res.json()) as FhirfoxSessionPayload
      const bundle = bundleFromFhirfoxSession(payload, flavor)
      setStatus({ loading: false, payload, bundle, sessionUrl })
    } catch (e) {
      setStatus({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
        sessionUrl,
      })
    }
  }

  // Re-run transform if the user toggles flavor after fetching (avoids
  // another network round-trip for what is a pure local function).
  const rebuild = (next: 'ips' | 'twcore') => {
    setFlavor(next)
    if (status.payload) {
      const bundle = bundleFromFhirfoxSession(status.payload, next)
      setStatus((prev) => ({ ...prev, bundle }))
    }
  }

  const downloadBundle = () => {
    if (!status.bundle) return
    const json = JSON.stringify(status.bundle, null, 2)
    const blob = new Blob([json], { type: 'application/fhir+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${status.bundle.id ?? 'scenario'}-${flavor}-bundle.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  // Prism-shape wrapped download. The IPS Validator's /api/fetch-gazelle
  // looks for `res_body` or `req_body` in whatever JSON its target URL
  // returns; raw FHIR Bundle JSON fails with "找不到 res_body 或 req_body".
  // By pre-wrapping into {req_body, res_body: <bundle as escaped JSON
  // string>} we can upload the file straight to Gazelle's Test Instance
  // attachments, copy its globe-icon URL, paste that into validator step
  // 2 — and the validator parses out res_body to get the bundle. End
  // result is the official validator UI "通過" without needing a real
  // Prism share URL.
  const downloadWrappedForValidator = () => {
    if (!status.bundle) return
    const bundleJson = JSON.stringify(status.bundle)
    const wrapped = { req_body: '', res_body: bundleJson }
    const json = JSON.stringify(wrapped)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${status.bundle.id ?? 'scenario'}-wrapped.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const openInMainApp = async () => {
    if (!status.bundle) return
    try {
      await LocalBundleService.save(status.bundle)
      window.location.href = '/'
    } catch (e) {
      setStatus((prev) => ({
        ...prev,
        error: `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      }))
    }
  }

  const sendToCreator = () => {
    if (!status.bundle || !onBundleReady) return
    onBundleReady(
      JSON.stringify(status.bundle, null, 2),
      'conference',
      status.sessionUrl ?? '',
    )
  }

  return (
    <section className="rounded border border-violet-200 bg-violet-50/40 p-4 space-y-3 dark:border-violet-900 dark:bg-violet-950/20">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          🧬 大會題目轉檔 (FHIRfox → FHIR Bundle)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          貼大會給你的 session URL（或 ID），自動抓 FHIRfox API → 轉成
          FHIR R4 document Bundle → 可預覽 / 下載 / 直接帶到下方 IPS Creator 送驗。
        </p>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 items-center text-sm">
        <label className="text-muted-foreground">Session URL / ID</label>
        <input
          type="text"
          className="rounded border p-1.5 font-mono text-xs bg-background"
          placeholder="https://twcat-fhirfox.dicom.org.tw/sessions/cwgtcaq  或  cwgtcaq"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && parsedId && !status.loading) void fetchAndTransform()
          }}
        />
        <button
          onClick={() => void fetchAndTransform()}
          disabled={!parsedId || status.loading}
          className="px-3 py-1.5 rounded bg-violet-600 text-white text-sm disabled:opacity-50"
        >
          {status.loading ? 'Fetching…' : '抓題目'}
        </button>

        <label className="text-muted-foreground">Flavor</label>
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={flavor === 'ips'}
              onChange={() => rebuild('ips')}
            />
            <span>
              <strong>IPS</strong> (Composition-uv-ips, 60591-5, required sections + emptyReason)
            </span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={flavor === 'twcore'}
              onChange={() => rebuild('twcore')}
            />
            <span>
              <strong>TWCore</strong> (Consult note 11488-4 — legacy)
            </span>
          </label>
        </div>
        <span />

        {input && !parsedId && (
          <>
            <span />
            <span className="text-amber-700 dark:text-amber-400 text-[11px]">
              無法解析 session ID — 用 URL 或乾的 ID（如 <code>cwgtcaq</code>）
            </span>
            <span />
          </>
        )}
      </div>

      {status.error && (
        <div className="rounded bg-destructive/10 text-destructive p-2 text-xs">
          ⚠ {status.error}
          {status.sessionUrl && (
            <div className="mt-1 text-muted-foreground">
              tried: <code>{status.sessionUrl}</code>
            </div>
          )}
        </div>
      )}

      {status.payload && status.bundle && (
        <ScenarioPreview
          payload={status.payload}
          bundle={status.bundle}
          flavor={flavor}
          onDownload={downloadBundle}
          onDownloadWrapped={downloadWrappedForValidator}
          onOpenInMainApp={() => void openInMainApp()}
          onSendToCreator={onBundleReady ? sendToCreator : undefined}
        />
      )}
    </section>
  )
}

function ScenarioPreview({
  payload,
  bundle,
  flavor,
  onDownload,
  onDownloadWrapped,
  onOpenInMainApp,
  onSendToCreator,
}: {
  payload: FhirfoxSessionPayload
  bundle: DocumentBundle
  flavor: 'ips' | 'twcore'
  onDownload: () => void
  onDownloadWrapped: () => void
  onOpenInMainApp: () => void
  onSendToCreator?: () => void
}) {
  // Per-resourceType count from the Bundle entries — gives a quick eyeball
  // check that what came out matches scenario expectations.
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of bundle.entry) {
      const t = (e.resource.resourceType as string) || 'unknown'
      counts[t] = (counts[t] ?? 0) + 1
    }
    return counts
  }, [bundle])

  // Composition.section overview — title, code, entry count, emptyReason.
  // The emptyReason chip is the IPS Validator's "did you remember to mark
  // this section as intentionally empty" check.
  const sectionRows = useMemo(() => {
    const comp = bundle.entry[0]?.resource as
      | {
          section?: Array<{
            title?: string
            code?: { coding?: Array<{ code?: string }> }
            entry?: unknown[]
            emptyReason?: { coding?: Array<{ code?: string }> }
          }>
        }
      | undefined
    return (comp?.section ?? []).map((s) => ({
      title: s.title ?? '?',
      code: s.code?.coding?.[0]?.code ?? '?',
      entryCount: Array.isArray(s.entry) ? s.entry.length : 0,
      emptyReason: s.emptyReason?.coding?.[0]?.code,
    }))
  }, [bundle])

  return (
    <div className="rounded bg-background border p-3 space-y-3 text-xs">
      <div className="font-sans">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-sm">{payload.scenario.displayName}</span>
          <span className="text-muted-foreground">
            {payload.scenario.trackName} · Level {payload.scenario.level} · ID:{' '}
            <code>{payload.scenario.id}</code>
          </span>
        </div>
        {payload.scenario.summary && (
          <p className="text-muted-foreground mt-1">{payload.scenario.summary}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Per-resource counts */}
        <div className="rounded border p-2 space-y-1 font-mono">
          <div className="font-sans font-semibold text-muted-foreground">
            Bundle entries ({bundle.entry.length})
          </div>
          {Object.entries(typeCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([type, n]) => (
              <div key={type} className="flex justify-between">
                <span>{type}</span>
                <span className="text-muted-foreground">{n}</span>
              </div>
            ))}
        </div>

        {/* Composition sections */}
        <div className="rounded border p-2 space-y-1 font-mono">
          <div className="font-sans font-semibold text-muted-foreground">
            Composition sections ({sectionRows.length})
          </div>
          {sectionRows.map((s) => (
            <div key={s.code} className="flex justify-between items-baseline gap-2">
              <span className="truncate" title={s.title}>
                {s.code}
              </span>
              <span className={s.emptyReason ? 'text-amber-700' : 'text-muted-foreground'}>
                {s.entryCount}
                {s.emptyReason && ` (${s.emptyReason})`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="font-sans">
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground">Composition.type:</span>
          <code>
            {flavor === 'ips' ? '60591-5 Patient summary Document' : '11488-4 Consult note'}
          </code>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground">Composition.profile:</span>
          <code className="text-[10px] break-all">
            {(bundle.entry[0]?.resource as { meta?: { profile?: string[] } })?.meta?.profile?.[0]}
          </code>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={onDownload}
          className="px-3 py-1.5 rounded border text-xs"
          title="Download as .json (same shape as your converter's output/ files)"
        >
          📥 下載 .json
        </button>
        <button
          onClick={onDownloadWrapped}
          className="px-3 py-1.5 rounded bg-violet-600 text-white text-xs"
          title='Download {req_body, res_body} wrapped JSON for the IPS Validator. Upload it to your Gazelle Test Instance, copy the file URL, paste into validator step 2.'
        >
          📦 下載 wrapped (validator 用)
        </button>
        <button
          onClick={onOpenInMainApp}
          className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs"
          title="Save to LocalBundleService and redirect to main app"
        >
          ▶ Open in main app
        </button>
        {onSendToCreator && (
          <button
            onClick={onSendToCreator}
            className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs"
            title="Drop this Bundle into the IPS Creator panel below — ready to POST"
          >
            ↓ Send to IPS Creator (below)
          </button>
        )}
      </div>
    </div>
  )
}

// Re-export the setter type so the parent can pass through state setters cleanly.
export type ScenarioLoaderSetter = Dispatch<SetStateAction<Record<string, string>>>
