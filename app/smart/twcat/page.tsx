"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  TWCAT_PRESET_VENDORS,
  CustomVendorStore,
  VendorOverrideStore,
  ActiveVendorStore,
  ParticipantTokenStore,
  DiscoveryBearerStore,
  FlowLogStore,
  getAllVendors,
  twcatProxyUrl,
  installParticipantTokenFetch,
  synthesizeSmartSession,
  extractTenantId,
  discoverEndpoints,
  type TwcatVendor,
  type FlowLogEntry,
} from "@/src/infrastructure/fhir/profiles/twcat-profile"

type EditableVendor = TwcatVendor

const EMPTY_CUSTOM: EditableVendor = {
  id: "",
  name: "",
  iss: "",
  clientId: "",
  clientSecret: "",
  scope: "",
  notes: "",
}

// ---------------------------------------------------------------------------
// Quick test state
// ---------------------------------------------------------------------------

type StepStatus = "pending" | "running" | "ok" | "fail"

type StepRecord = {
  status: StepStatus
  detail: string
  // The actual request made to the *vendor* (not the local proxy URL — that's
  // an implementation detail to dodge CORS). Captured so users can copy a
  // direct curl for terminal verification / sharing with judges.
  request?: {
    method: string
    url: string
    headers: Record<string, string>
    body?: string
  }
  responseStatus?: number
  responseBody?: string
}

type QuickTestResult = {
  running: boolean
  steps: {
    token: StepRecord
    metadata: StepRecord
    patient: StepRecord
    observation: StepRecord
  }
  bearer: string | null
  bearerExpiresAt: number | null // epoch ms
}

const EMPTY_TEST: QuickTestResult = {
  running: false,
  steps: {
    token: { status: "pending", detail: "" },
    metadata: { status: "pending", detail: "" },
    patient: { status: "pending", detail: "" },
    observation: { status: "pending", detail: "" },
  },
  bearer: null,
  bearerExpiresAt: null,
}

/**
 * Render a request record as a copy-pasteable curl command. Mirrors what the
 * Quick Test sent to the vendor (not the local proxy). Booleans on
 * `showSecrets` redact long values when off — useful for screenshots.
 */
function toCurl(req: NonNullable<StepRecord["request"]>, showSecrets = true): string {
  const lines: string[] = [`curl -X ${req.method} \\`]
  for (const [k, v] of Object.entries(req.headers)) {
    const val = showSecrets || v.length < 60 ? v : `${v.slice(0, 12)}…${v.slice(-6)}`
    lines.push(`  -H "${k}: ${val}" \\`)
  }
  if (req.body) {
    const body = showSecrets ? req.body : req.body.replace(/(client_secret=)[^&]+/g, "$1***")
    lines.push(`  -d '${body}' \\`)
  }
  lines.push(`  "${req.url}"`)
  return lines.join("\n")
}

// Upload status per vendor — tracks progress of POSTing a sample IPS bundle
// (or any FHIR Bundle) to the vendor's FHIR root.
type UploadStatus = {
  running: boolean
  fileName?: string
  resourceCount?: number
  results: Array<{ status: number; location?: string; outcome?: string }>
  error?: string
}

// fhirclient writes its session state under sessionStorage[SMART_KEY] →
// pointer to another key with the actual tokenResponse JSON. We only want
// to display, not call fhirclient API just for inspection.
type SmartSessionState = {
  serverUrl: string
  scope: string
  accessToken: string
  expiresAt?: number
  patientId?: string
}

function readSmartSession(): SmartSessionState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem("SMART_KEY")
    if (!raw) return null
    const stateKey = raw.replace(/^"|"$/g, "")
    if (!stateKey) return null
    const stateJson = window.sessionStorage.getItem(stateKey)
    if (!stateJson) return null
    const parsed = JSON.parse(stateJson)
    const tr = parsed?.tokenResponse
    if (!tr?.access_token) return null
    return {
      serverUrl: parsed.serverUrl || "",
      scope: tr.scope || "",
      accessToken: tr.access_token,
      expiresAt: tr.expires_in
        ? Date.now() + Number(tr.expires_in) * 1000
        : undefined,
      patientId: tr.patient || parsed.patient || undefined,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TwcatPickerPage() {
  const router = useRouter()
  const [tokenInput, setTokenInput] = useState("")
  const [tokenStatus, setTokenStatus] = useState<"missing" | "present">("missing")
  const [custom, setCustom] = useState<EditableVendor>(EMPTY_CUSTOM)
  const [customList, setCustomList] = useState<TwcatVendor[]>([])
  const [launchInputs, setLaunchInputs] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>("")
  const [tests, setTests] = useState<Record<string, QuickTestResult>>({})
  const [smartSession, setSmartSession] = useState<SmartSessionState | null>(null)
  const [smartFetchResult, setSmartFetchResult] = useState<string>("")
  const [flowLog, setFlowLog] = useState<FlowLogEntry[]>([])
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadStatus>>({})
  // Per-vendor edit form state. Map[vendorId] = working draft; key absent =
  // form closed. Both preset overrides and custom-vendor in-place edits go
  // through this. Saving applies the diff and closes the form.
  const [edits, setEdits] = useState<Record<string, EditableVendor>>({})

  useEffect(() => {
    setTokenStatus(ParticipantTokenStore.get() ? "present" : "missing")
    setCustomList(CustomVendorStore.list())
    // Detect fresh SMART session from sessionStorage (set by fhirclient
    // after our /smart/twcat/callback completes successfully).
    setSmartSession(readSmartSession())
    setFlowLog(FlowLogStore.getAll())
    // Auto-fetch /Patient when we land back from a successful SMART login.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      if (url.searchParams.get("launched") === "1") {
        void autoFetchPatient()
      } else if (url.searchParams.get("launched") === "error") {
        setError(`SMART callback error: ${url.searchParams.get("msg") || "unknown"}`)
      }
    }
  }, [])

  /** After the SMART dance lands us back here, prove the token works. */
  const autoFetchPatient = async () => {
    installParticipantTokenFetch()
    try {
      const FHIR = (await import("fhirclient")).default
      const client = await FHIR.oauth2.ready()
      const bundle = await client.request("Patient?_count=5")
      setSmartFetchResult(JSON.stringify(bundle, null, 2))
    } catch (e) {
      setSmartFetchResult(
        `Error: ${e instanceof Error ? e.message : String(e)}`
      )
    } finally {
      // FlowLogStore was updated by the wrapper as fhirclient ran — refresh
      // so the SmartFlowPanel below shows the new entries.
      setFlowLog(FlowLogStore.getAll())
    }
  }

  const clearSmartSession = () => {
    if (typeof window === "undefined") return
    // fhirclient stores tokenResponse under a key pointed at by SMART_KEY.
    const ptr = window.sessionStorage.getItem("SMART_KEY")
    if (ptr) {
      const stateKey = ptr.replace(/^"|"$/g, "")
      window.sessionStorage.removeItem(stateKey)
    }
    window.sessionStorage.removeItem("SMART_KEY")
    FlowLogStore.clear()
    setSmartSession(null)
    setSmartFetchResult("")
    setFlowLog([])
  }

  // Re-computes whenever customList changes OR `edits` changes (so an in-progress
  // override save shows up immediately). overrideCount is a tiny "dependency"
  // that bumps when VendorOverrideStore is mutated below.
  const [overrideCount, setOverrideCount] = useState(0)
  const allVendors = useMemo(() => {
    void overrideCount
    return getAllVendors()
  }, [customList, overrideCount])

  const saveToken = () => {
    if (!tokenInput.trim()) return
    ParticipantTokenStore.set(tokenInput.trim())
    setTokenStatus("present")
    setTokenInput("")
  }
  const clearToken = () => {
    ParticipantTokenStore.clear()
    setTokenStatus("missing")
  }

  const repoBaseRedirect = () => {
    const repoBase = "/medical-note-smart-on-fhir"
    const onRepoBase = window.location.pathname.startsWith(`${repoBase}/`)
    const prefix = onRepoBase ? repoBase : ""
    return `${window.location.origin}${prefix}`.replace(/\/+$/, "")
  }

  /**
   * Standalone SMART launch — runs the OAuth authorization_code dance
   * directly via fhirclient. Uses our own /smart/twcat/callback so we don't
   * touch the main /smart/callback (which a sibling agent owns).
   */
  const launchStandalone = async (vendor: TwcatVendor) => {
    if (!vendor.smartScope) {
      setError(`${vendor.name}: no smartScope configured — set it on the vendor preset.`)
      return
    }
    if (!vendor.clientId) {
      setError(`${vendor.name}: no client_id configured.`)
      return
    }
    setError("")
    ActiveVendorStore.set(vendor)
    // Fresh trace for this launch attempt — discards anything stale from
    // earlier runs so the post-callback panel reads cleanly.
    FlowLogStore.clear()
    installParticipantTokenFetch()
    const base = repoBaseRedirect()
    const redirectUri = `${base}/smart/twcat/callback`

    // Pre-flight: vendors like Daikon gate /fhir/metadata behind OAuth, so
    // fhirclient's discovery fetch needs a service-account Bearer. Fetch one
    // via client_credentials and stash it — the fetch wrapper will attach it
    // to discovery requests only (skipped once fhirclient has its own token).
    if (vendor.tokenEndpoint && vendor.clientId) {
      const requestHeaders = { "Content-Type": "application/x-www-form-urlencoded" }
      const bodyParams: Record<string, string> = {
        grant_type: "client_credentials",
        client_id: vendor.clientId,
        ...(vendor.clientSecret ? { client_secret: vendor.clientSecret } : {}),
      }
      const body = new URLSearchParams(bodyParams)
      try {
        const res = await fetch(twcatProxyUrl(vendor.tokenEndpoint), {
          method: "POST",
          headers: requestHeaders,
          body,
        })
        const text = await res.text().catch(() => "")
        FlowLogStore.append({
          ts: Date.now(),
          label: "[1] Pre-flight discovery bearer (client_credentials)",
          method: "POST",
          url: vendor.tokenEndpoint,
          requestHeaders,
          requestBody: body.toString(),
          responseStatus: res.status,
          responseBody: text,
        })
        if (res.ok) {
          try {
            const json = JSON.parse(text)
            if (json.access_token) DiscoveryBearerStore.set(json.access_token)
          } catch {
            // not JSON — skip
          }
        }
      } catch (e) {
        console.warn("discovery bearer pre-fetch failed", e)
      }
    }

    try {
      const FHIR = (await import("fhirclient")).default
      // noRedirect: true → fhirclient builds and returns the URL instead of
      // navigating itself. We log it into FlowLog, then drive the navigation
      // by hand so the post-callback panel can show exactly what we sent.
      const authorizeUrl = (await (FHIR.oauth2 as any).authorize({
        iss: vendor.iss,
        clientId: vendor.clientId,
        ...(vendor.clientSecret ? { clientSecret: vendor.clientSecret } : {}),
        scope: vendor.smartScope,
        redirectUri,
        completeInTarget: true,
        pkceMode: "required",
        noRedirect: true,
      })) as string
      try {
        const u = new URL(authorizeUrl)
        const params: Record<string, string> = {}
        u.searchParams.forEach((v, k) => {
          params[k] = v
        })
        FlowLogStore.append({
          ts: Date.now(),
          label: "[3] Browser navigates to /authorize (user logs in here)",
          method: "GET (browser navigation)",
          url: authorizeUrl,
          requestHeaders: { Accept: "text/html" },
          requestBody:
            `# Query parameters\n` +
            Object.entries(params)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n"),
        })
      } catch {
        // ignore malformed URLs — still try the navigation
      }
      window.location.href = authorizeUrl
    } catch (e) {
      setError(`SMART launch failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const launchFromUrl = (vendor: TwcatVendor) => {
    const raw = (launchInputs[vendor.id] || "").trim()
    if (!raw) {
      setError("Paste the vendor's launch URL (with ?iss=…&launch=… params).")
      return
    }
    if (tokenStatus === "missing") {
      setError("Set the Participant Token first.")
      return
    }
    setError("")
    ActiveVendorStore.set(vendor)
    window.location.href = raw
  }

  const updateTest = (id: string, patch: Partial<QuickTestResult>) => {
    setTests((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? EMPTY_TEST), ...patch },
    }))
  }
  const updateStep = (
    id: string,
    step: keyof QuickTestResult["steps"],
    patch: Partial<QuickTestResult["steps"][keyof QuickTestResult["steps"]]>
  ) => {
    setTests((prev) => {
      const cur = prev[id] ?? EMPTY_TEST
      return {
        ...prev,
        [id]: {
          ...cur,
          steps: { ...cur.steps, [step]: { ...cur.steps[step], ...patch } },
        },
      }
    })
  }

  /** Run the full client_credentials → read sequence through the API proxy. */
  const runQuickTest = async (vendor: TwcatVendor) => {
    if (!vendor.clientId) {
      setError(`${vendor.name}: no client_id configured.`)
      return
    }
    // Auto-discover tokenEndpoint from .well-known/smart-configuration if
    // not pre-configured. Keeps the custom-vendor form simpler — users only
    // need to know the iss; the form doesn't even need to ask for token URL.
    let tokenEndpoint = vendor.tokenEndpoint
    if (!tokenEndpoint) {
      const disc = await discoverEndpoints(vendor.iss)
      tokenEndpoint = disc?.tokenEndpoint
    }
    if (!tokenEndpoint) {
      setError(
        `${vendor.name}: no tokenEndpoint configured and discovery from ${vendor.iss}/.well-known/smart-configuration failed.`
      )
      return
    }
    setError("")
    setTests((prev) => ({ ...prev, [vendor.id]: { ...EMPTY_TEST, running: true } }))

    // Step 1: token
    updateStep(vendor.id, "token", { status: "running", detail: "POST /token …" })
    let bearer: string
    let expiresIn = 300
    {
      const bodyParams: Record<string, string> = {
        grant_type: "client_credentials",
        client_id: vendor.clientId,
        ...(vendor.clientSecret ? { client_secret: vendor.clientSecret } : {}),
        ...(vendor.scope ? { scope: vendor.scope } : {}),
      }
      const body = new URLSearchParams(bodyParams)
      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      }
      const pt = ParticipantTokenStore.get()
      if (pt) requestHeaders["X-Participant-Token"] = pt
      const requestRecord = {
        method: "POST",
        url: tokenEndpoint,
        headers: requestHeaders,
        body: body.toString(),
      }
      try {
        const res = await fetch(twcatProxyUrl(tokenEndpoint), {
          method: "POST",
          headers: requestHeaders,
          body,
        })
        const text = await res.text()
        if (!res.ok) {
          updateStep(vendor.id, "token", {
            status: "fail",
            detail: `HTTP ${res.status}: ${text.slice(0, 200)}`,
            request: requestRecord,
            responseStatus: res.status,
            responseBody: text,
          })
          updateTest(vendor.id, { running: false })
          return
        }
        const json = JSON.parse(text)
        bearer = json.access_token
        expiresIn = json.expires_in ?? 300
        if (!bearer) throw new Error(`no access_token in response`)
        const expiresAt = Date.now() + expiresIn * 1000
        updateStep(vendor.id, "token", {
          status: "ok",
          detail: `got bearer (${json.token_type ?? "Bearer"}, ${expiresIn}s, scope: ${json.scope ?? "—"})`,
          request: requestRecord,
          responseStatus: res.status,
          responseBody: text,
        })
        updateTest(vendor.id, { bearer, bearerExpiresAt: expiresAt })
      } catch (e) {
        updateStep(vendor.id, "token", {
          status: "fail",
          detail: e instanceof Error ? e.message : String(e),
          request: requestRecord,
        })
        updateTest(vendor.id, { running: false })
        return
      }
    }

    // Helper for subsequent FHIR GETs
    const fhirGet = async (path: string, stepKey: keyof QuickTestResult["steps"]) => {
      const url = `${vendor.iss.replace(/\/+$/, "")}/${path}`
      updateStep(vendor.id, stepKey, { status: "running", detail: `GET /${path} …` })
      const requestHeaders: Record<string, string> = {
        Authorization: `Bearer ${bearer}`,
        Accept: "application/fhir+json",
      }
      const pt = ParticipantTokenStore.get()
      if (pt) requestHeaders["X-Participant-Token"] = pt
      // HAPI Partitioning auto-route (智群 OCTOFLOW): the bearer carries
      // tenant_id; copy it into X-Partition-ID. Other vendors' bearers don't
      // have the claim, so this is a no-op for them.
      const tid = extractTenantId(`Bearer ${bearer}`)
      if (tid) requestHeaders["X-Partition-ID"] = tid
      const requestRecord = {
        method: "GET",
        url,
        headers: requestHeaders,
      }
      try {
        const res = await fetch(twcatProxyUrl(url), { method: "GET", headers: requestHeaders })
        const text = await res.text()
        if (!res.ok) {
          updateStep(vendor.id, stepKey, {
            status: "fail",
            detail: `HTTP ${res.status}: ${text.slice(0, 200)}`,
            request: requestRecord,
            responseStatus: res.status,
            responseBody: text,
          })
          return
        }
        let detail = `HTTP ${res.status}`
        try {
          const json = JSON.parse(text)
          if (json.resourceType === "Bundle") {
            detail = `Bundle: total=${json.total ?? "?"}, entries=${json.entry?.length ?? 0}`
          } else if (json.resourceType === "CapabilityStatement") {
            detail = `CapabilityStatement (FHIR ${json.fhirVersion ?? "?"}, ${json.rest?.[0]?.resource?.length ?? 0} resource types)`
          } else {
            detail = `${json.resourceType ?? "OK"} (${text.length} bytes)`
          }
        } catch {
          // not JSON
        }
        updateStep(vendor.id, stepKey, {
          status: "ok",
          detail,
          request: requestRecord,
          responseStatus: res.status,
          responseBody: text,
        })
      } catch (e) {
        updateStep(vendor.id, stepKey, {
          status: "fail",
          detail: e instanceof Error ? e.message : String(e),
          request: requestRecord,
        })
      }
    }

    await fhirGet("metadata", "metadata")
    await fhirGet("Patient?_count=5", "patient")
    await fhirGet("Observation?_count=5", "observation")
    updateTest(vendor.id, { running: false })
  }

  /**
   * Bridge: take the Quick Test bearer + first patient ID we saw in the
   * Patient bundle, write them as a synthetic SMART session, and navigate to
   * the main app. fhirclient.oauth2.ready() then accepts the session as if
   * the user came through the full OAuth flow.
   */
  const openInMainApp = (vendor: TwcatVendor, t: QuickTestResult) => {
    if (!t.bearer) {
      setError(`${vendor.name}: no bearer yet — run Quick Test first.`)
      return
    }
    // Mine the Patient bundle for an id to seed patient context. Optional —
    // works without one (the main app will fall back to a Bundle query).
    let patientId: string | undefined
    try {
      const text = t.steps.patient.responseBody
      if (text) {
        const j = JSON.parse(text)
        patientId = j?.entry?.[0]?.resource?.id
      }
    } catch {
      // Patient step might not have responded with JSON — ignore.
    }
    const expiresIn = t.bearerExpiresAt
      ? Math.max(0, Math.floor((t.bearerExpiresAt - Date.now()) / 1000))
      : 300
    synthesizeSmartSession({
      vendor: { iss: vendor.iss, clientId: vendor.clientId },
      accessToken: t.bearer,
      expiresIn,
      scope: vendor.scope,
      patientId,
    })
    installParticipantTokenFetch()
    const base = repoBaseRedirect()
    window.location.href = `${base}/`
  }

  /**
   * Upload a FHIR Bundle / array of resources / single resource to a vendor's
   * FHIR root. Fetches a fresh client_credentials bearer first (the 5-minute
   * one from Quick Test may have expired by now). Posts each entry
   * individually — Doorman doesn't advertise transaction support, so we
   * don't risk a 400 by sending Bundle.type=transaction blindly.
   */
  const uploadBundle = async (vendor: TwcatVendor, file: File) => {
    setUploadStatus((prev) => ({
      ...prev,
      [vendor.id]: { running: true, fileName: file.name, results: [] },
    }))
    setError("")

    // Fresh bearer — independent of Quick Test's state.
    let bearer: string | null = null
    if (vendor.tokenEndpoint && vendor.clientId) {
      try {
        const body = new URLSearchParams({
          grant_type: "client_credentials",
          client_id: vendor.clientId,
          ...(vendor.clientSecret ? { client_secret: vendor.clientSecret } : {}),
        })
        const res = await fetch(twcatProxyUrl(vendor.tokenEndpoint), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        })
        if (res.ok) {
          const j = await res.json()
          bearer = j.access_token
        }
      } catch (e) {
        console.warn("upload: token fetch failed", e)
      }
    }
    if (!bearer) {
      setUploadStatus((prev) => ({
        ...prev,
        [vendor.id]: { running: false, results: [], error: "Could not obtain bearer." },
      }))
      return
    }

    // Parse file → list of resources to send.
    let resources: Array<{ resourceType: string; [k: string]: unknown }>
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (parsed?.resourceType === "Bundle" && Array.isArray(parsed.entry)) {
        resources = parsed.entry
          .map((e: { resource?: { resourceType?: string } }) => e?.resource)
          .filter((r: unknown): r is { resourceType: string } =>
            typeof r === "object" && r !== null && typeof (r as { resourceType?: unknown }).resourceType === "string"
          )
      } else if (Array.isArray(parsed)) {
        resources = parsed.filter(
          (r: unknown): r is { resourceType: string } =>
            typeof r === "object" && r !== null && typeof (r as { resourceType?: unknown }).resourceType === "string"
        )
      } else if (parsed?.resourceType) {
        resources = [parsed]
      } else {
        throw new Error("File is not a FHIR Bundle, resource, or array of resources")
      }
    } catch (e) {
      setUploadStatus((prev) => ({
        ...prev,
        [vendor.id]: {
          running: false,
          results: [],
          error: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
        },
      }))
      return
    }

    if (resources.length === 0) {
      setUploadStatus((prev) => ({
        ...prev,
        [vendor.id]: {
          running: false,
          fileName: file.name,
          results: [],
          error: "No resources found in file.",
        },
      }))
      return
    }

    setUploadStatus((prev) => ({
      ...prev,
      [vendor.id]: {
        running: true,
        fileName: file.name,
        resourceCount: resources.length,
        results: [],
      },
    }))

    const base = vendor.iss.replace(/\/+$/, "")
    const ptHeader: Record<string, string> = {}
    const pt = ParticipantTokenStore.get()
    if (pt) ptHeader["X-Participant-Token"] = pt

    // Same HAPI Partitioning auto-route as runQuickTest. Vendors without
    // tenant_id in the bearer get nothing added.
    const partitionTid = extractTenantId(`Bearer ${bearer}`)
    const partitionHeader: Record<string, string> = partitionTid
      ? { "X-Partition-ID": partitionTid }
      : {}

    const results: Array<{ status: number; location?: string; outcome?: string }> = []
    for (const r of resources) {
      const url = `${base}/${r.resourceType}`
      try {
        const res = await fetch(twcatProxyUrl(url), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/fhir+json",
            Accept: "application/fhir+json",
            ...ptHeader,
            ...partitionHeader,
          },
          body: JSON.stringify(r),
        })
        const location = res.headers.get("location") ?? undefined
        let outcome: string | undefined
        if (!res.ok) {
          const body = await res.text()
          try {
            const j = JSON.parse(body)
            outcome = j?.issue?.[0]?.diagnostics ?? body.slice(0, 200)
          } catch {
            outcome = body.slice(0, 200)
          }
        }
        results.push({ status: res.status, location, outcome })
        setUploadStatus((prev) => ({
          ...prev,
          [vendor.id]: { ...(prev[vendor.id] as UploadStatus), results: [...results] },
        }))
      } catch (e) {
        results.push({
          status: 0,
          outcome: e instanceof Error ? e.message : String(e),
        })
        setUploadStatus((prev) => ({
          ...prev,
          [vendor.id]: { ...(prev[vendor.id] as UploadStatus), results: [...results] },
        }))
      }
    }

    setUploadStatus((prev) => ({
      ...prev,
      [vendor.id]: { ...(prev[vendor.id] as UploadStatus), running: false },
    }))
  }

  /**
   * Open the inline edit form for `vendor`. Pre-fills with the currently
   * effective values (preset + override merged for presets, or the custom
   * vendor's own values).
   */
  const startEdit = (vendor: TwcatVendor) => {
    setEdits((prev) => ({ ...prev, [vendor.id]: { ...vendor } }))
  }
  const cancelEdit = (id: string) => {
    setEdits((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }
  const updateEditField = <K extends keyof TwcatVendor>(
    id: string,
    key: K,
    value: TwcatVendor[K]
  ) => {
    setEdits((prev) => {
      const cur = prev[id]
      if (!cur) return prev
      return { ...prev, [id]: { ...cur, [key]: value } }
    })
  }
  /**
   * Persist the draft. For preset vendors, only the fields that diverge from
   * the preset get stored (small footprint in localStorage; resetting one
   * field doesn't drag the others with it). Custom vendors save the whole
   * record back to CustomVendorStore.
   */
  const saveEdit = (vendor: TwcatVendor) => {
    const draft = edits[vendor.id]
    if (!draft) return
    const isCustom = customList.some((c) => c.id === vendor.id)
    if (isCustom) {
      CustomVendorStore.add(draft) // add() replaces by id
      setCustomList(CustomVendorStore.list())
    } else {
      const preset = TWCAT_PRESET_VENDORS.find((p) => p.id === vendor.id)
      if (preset) {
        const patch: Partial<TwcatVendor> = {}
        const fields: (keyof TwcatVendor)[] = [
          'name', 'iss', 'clientId', 'clientSecret', 'authMethod',
          'tokenEndpoint', 'scope', 'smartScope', 'notes',
        ]
        for (const f of fields) {
          if (draft[f] !== preset[f]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(patch as any)[f] = draft[f]
          }
        }
        if (Object.keys(patch).length === 0) {
          VendorOverrideStore.clear(vendor.id)
        } else {
          VendorOverrideStore.set(vendor.id, patch)
        }
      }
      setOverrideCount((n) => n + 1)
    }
    cancelEdit(vendor.id)
  }
  /** Drop a preset vendor's override, returning it to factory defaults. */
  const resetOverride = (id: string) => {
    VendorOverrideStore.clear(id)
    setOverrideCount((n) => n + 1)
    cancelEdit(id)
  }

  const addCustom = () => {
    if (!custom.id || !custom.name || !custom.iss) {
      setError("Custom vendor needs id, name, iss.")
      return
    }
    setError("")
    CustomVendorStore.add(custom)
    setCustomList(CustomVendorStore.list())
    setCustom(EMPTY_CUSTOM)
  }
  const removeCustom = (id: string) => {
    CustomVendorStore.remove(id)
    setCustomList(CustomVendorStore.list())
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">TWCAT 2026 — Track #4 vendor test</h1>
        <p className="text-sm text-muted-foreground">
          Each card runs a one-click client_credentials → /metadata → /Patient
          → /Observation sequence through{" "}
          <code>/api/twcat-proxy</code> (no CORS). SMART launch buttons stay
          available for vendors that support full SMART flow.
        </p>
      </header>

      <ProxyAvailabilityBanner />


      <section className="rounded border p-4 space-y-3">
        <h2 className="font-semibold">Participant Token</h2>
        <p className="text-xs text-muted-foreground">
          From Prism &rarr; My Token (header <code>X-Participant-Token</code>).
          Some vendors don&apos;t check it, but it&apos;s safe to set anyway —
          we only attach it when present.
        </p>
        <div className="flex items-center gap-2 text-sm">
          Status:&nbsp;
          {tokenStatus === "present" ? (
            <span className="text-green-600 font-mono">set ✓</span>
          ) : (
            <span className="text-amber-600 font-mono">missing</span>
          )}
          {tokenStatus === "present" && (
            <button
              onClick={clearToken}
              className="ml-2 text-xs underline text-muted-foreground"
            >
              clear
            </button>
          )}
        </div>
        <textarea
          className="w-full h-24 rounded border p-2 font-mono text-xs"
          placeholder="eyJhbGciOiJIUzI1NiI..."
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
        />
        <button
          onClick={saveToken}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm"
        >
          Save token
        </button>
      </section>

      {error && (
        <div className="rounded border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {smartSession && (
        <section className="rounded border border-green-500 bg-green-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-green-800">
              ✓ SMART session active
            </h2>
            <button
              onClick={clearSmartSession}
              className="text-xs underline text-muted-foreground"
            >
              clear session
            </button>
          </div>
          <ul className="text-xs font-mono space-y-1">
            <li>
              <span className="text-muted-foreground">server: </span>
              {smartSession.serverUrl}
            </li>
            <li>
              <span className="text-muted-foreground">scope:  </span>
              {smartSession.scope || "(none)"}
            </li>
            {smartSession.patientId && (
              <li>
                <span className="text-muted-foreground">patient: </span>
                {smartSession.patientId}
              </li>
            )}
            <li>
              <span className="text-muted-foreground">token:  </span>
              {smartSession.accessToken.slice(0, 24)}…
            </li>
          </ul>
          <button
            onClick={autoFetchPatient}
            className="px-3 py-1.5 rounded bg-green-600 text-white text-sm"
          >
            ▶ GET /Patient?_count=5
          </button>
          {smartFetchResult && (
            <details open className="text-xs">
              <summary className="cursor-pointer">FHIR response</summary>
              <pre className="mt-1 max-h-80 overflow-auto bg-background border rounded p-2 text-[10px]">
                {smartFetchResult.length > 6000
                  ? smartFetchResult.slice(0, 6000) + "\n…(truncated)"
                  : smartFetchResult}
              </pre>
            </details>
          )}
        </section>
      )}

      {flowLog.length > 0 && <SmartFlowPanel entries={flowLog} />}

      <section className="space-y-3">
        <h2 className="font-semibold">Vendors</h2>
        {allVendors.map((v) => {
          const isCustom = customList.some((c) => c.id === v.id)
          const isOverridden = !isCustom && VendorOverrideStore.has(v.id)
          const test = tests[v.id]
          const editing = edits[v.id]
          return (
            <article key={v.id} className="rounded border p-4 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold flex items-center gap-2">
                    {v.name}
                    {isOverridden && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-normal"
                        title="One or more fields differ from the hard-coded preset"
                      >
                        modified
                      </span>
                    )}
                  </h3>
                  <p className="font-mono text-xs text-muted-foreground break-all">
                    iss: {v.iss}
                  </p>
                  {v.tokenEndpoint && (
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      token: {v.tokenEndpoint}
                    </p>
                  )}
                  {v.clientId ? (
                    <p className="text-xs">
                      client_id: <code>{v.clientId}</code>{" "}
                      <span className="text-muted-foreground">
                        ({v.clientSecret ? "confidential" : "public"},{" "}
                        {v.authMethod ?? "smart"})
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600">
                      client_id missing — on-site only
                    </p>
                  )}
                  {v.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{v.notes}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 text-xs">
                  {!editing && (
                    <button
                      onClick={() => startEdit(v)}
                      className="underline text-muted-foreground hover:text-foreground"
                    >
                      ✎ edit
                    </button>
                  )}
                  {isOverridden && !editing && (
                    <button
                      onClick={() => resetOverride(v.id)}
                      className="underline text-amber-700"
                      title="Drop the override; revert to the hard-coded preset"
                    >
                      reset to default
                    </button>
                  )}
                  {isCustom && !editing && (
                    <button
                      onClick={() => removeCustom(v.id)}
                      className="underline text-destructive"
                    >
                      remove
                    </button>
                  )}
                </div>
              </div>

              {editing && (
                <VendorEditForm
                  draft={editing}
                  onChange={(k, val) => updateEditField(v.id, k, val)}
                  onSave={() => saveEdit(v)}
                  onCancel={() => cancelEdit(v.id)}
                />
              )}

              {/* Primary actions — both visible so users don't have to discover
                  the SMART path behind a disclosure. A button inside a closed
                  <details> is in the DOM but can't be clicked by a human
                  (pointer-events). Bit us during testing. */}
              <div className="flex flex-wrap gap-2 items-center pt-1">
                <button
                  onClick={() => runQuickTest(v)}
                  disabled={!v.clientId || test?.running}
                  title={
                    !v.tokenEndpoint
                      ? "tokenEndpoint not set — Quick Test will auto-discover from iss/.well-known/smart-configuration"
                      : undefined
                  }
                  className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
                >
                  {test?.running ? "Running…" : "▶ Run quick test"}
                </button>
                <button
                  onClick={() => launchStandalone(v)}
                  disabled={!v.clientId || !v.smartScope}
                  title={
                    !v.smartScope
                      ? "smartScope not configured for this vendor"
                      : "Browser redirects to vendor's Keycloak login"
                  }
                  className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
                >
                  ▶ SMART launch (user login)
                </button>
                {test?.bearer && (
                  <button
                    onClick={() => openInMainApp(v, test)}
                    title="Inject Quick Test bearer as a synthetic SMART session, then go to the main app"
                    className="px-3 py-1.5 rounded bg-green-600 text-white text-sm"
                  >
                    ▶ Open in main app
                  </button>
                )}
                {test?.bearer && test.bearerExpiresAt && (
                  <BearerCountdown expiresAt={test.bearerExpiresAt} />
                )}
                <UploadButton
                  vendor={v}
                  status={uploadStatus[v.id]}
                  onSelect={(f) => void uploadBundle(v, f)}
                />
              </div>

              {test && <QuickTestPanel test={test} />}
              {uploadStatus[v.id] && <UploadResultPanel status={uploadStatus[v.id]} /> }

              {/* EHR-launched paste URL — kept in details since it's rarer. */}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Or: paste an EHR launch URL (with ?iss=…&launch=…)
                </summary>
                <div className="flex flex-wrap gap-2 items-center pt-2">
                  <input
                    className="flex-1 min-w-[200px] rounded border p-1.5 font-mono"
                    placeholder="paste EHR launch URL (?iss=…&launch=…)"
                    value={launchInputs[v.id] || ""}
                    onChange={(e) =>
                      setLaunchInputs({ ...launchInputs, [v.id]: e.target.value })
                    }
                  />
                  <button
                    onClick={() => launchFromUrl(v)}
                    className="px-3 py-1.5 rounded border"
                  >
                    Go
                  </button>
                </div>
              </details>
            </article>
          )
        })}
      </section>

      <section className="rounded border p-4 space-y-3">
        <h2 className="font-semibold">Add a custom vendor</h2>
        <p className="text-xs text-muted-foreground">
          For on-site additions. Saved to localStorage (persists across sessions).
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <input
            className="rounded border p-1.5"
            placeholder="id (e.g. 'tcu')"
            value={custom.id}
            onChange={(e) => setCustom({ ...custom, id: e.target.value })}
          />
          <input
            className="rounded border p-1.5"
            placeholder="name (e.g. '慈濟大學')"
            value={custom.name}
            onChange={(e) => setCustom({ ...custom, name: e.target.value })}
          />
          <input
            className="rounded border p-1.5 col-span-2 font-mono text-xs"
            placeholder="iss e.g. https://twcat-services.dicom.org.tw:10016/fhir"
            value={custom.iss}
            onChange={(e) => setCustom({ ...custom, iss: e.target.value })}
          />
          <div className="col-span-2 flex gap-1">
            <input
              className="flex-1 rounded border p-1.5 font-mono text-xs"
              placeholder="tokenEndpoint (auto-discoverable from iss)"
              value={custom.tokenEndpoint || ""}
              onChange={(e) => setCustom({ ...custom, tokenEndpoint: e.target.value })}
            />
            <button
              type="button"
              onClick={async () => {
                if (!custom.iss) {
                  setError("Need iss before discovery.")
                  return
                }
                setError("")
                const disc = await discoverEndpoints(custom.iss)
                if (disc?.tokenEndpoint) {
                  setCustom({ ...custom, tokenEndpoint: disc.tokenEndpoint })
                } else {
                  setError(
                    `Discovery from ${custom.iss}/.well-known/smart-configuration failed.`
                  )
                }
              }}
              className="px-2 py-1 rounded border text-xs whitespace-nowrap"
              title="GET ${iss}/.well-known/smart-configuration and pre-fill token_endpoint"
            >
              🔍 discover
            </button>
          </div>
          <input
            className="rounded border p-1.5 font-mono text-xs"
            placeholder="client_id"
            value={custom.clientId}
            onChange={(e) => setCustom({ ...custom, clientId: e.target.value })}
          />
          <input
            className="rounded border p-1.5 font-mono text-xs"
            placeholder="client_secret (optional)"
            value={custom.clientSecret || ""}
            onChange={(e) => setCustom({ ...custom, clientSecret: e.target.value })}
          />
          <input
            className="rounded border p-1.5 col-span-2 text-xs"
            placeholder="scope override (optional)"
            value={custom.scope || ""}
            onChange={(e) => setCustom({ ...custom, scope: e.target.value })}
          />
        </div>
        <button
          onClick={addCustom}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm"
        >
          Add vendor
        </button>
      </section>

      <footer className="text-xs text-muted-foreground pt-2">
        <button
          onClick={() => router.push("/")}
          className="underline"
        >
          ← back to app
        </button>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: StepStatus }) {
  const c =
    status === "ok"
      ? "bg-green-500"
      : status === "fail"
      ? "bg-red-500"
      : status === "running"
      ? "bg-amber-500 animate-pulse"
      : "bg-muted-foreground/30"
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />
}

function QuickTestPanel({ test }: { test: QuickTestResult }) {
  const [showSecrets, setShowSecrets] = useState(true)
  const rows: Array<{ label: string; step: StepRecord }> = [
    { label: "1. POST /token", step: test.steps.token },
    { label: "2. GET /metadata", step: test.steps.metadata },
    { label: "3. GET /Patient?_count=5", step: test.steps.patient },
    { label: "4. GET /Observation?_count=5", step: test.steps.observation },
  ]
  return (
    <div className="rounded bg-muted/30 p-3 space-y-2">
      <ul className="space-y-2 text-xs font-mono">
        {rows.map((r) => (
          <li key={r.label} className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusDot status={r.step.status} />
              <span className="min-w-[180px]">{r.label}</span>
              <span className="text-muted-foreground truncate">{r.step.detail}</span>
            </div>
            {r.step.request && (
              <details className="ml-5">
                <summary className="cursor-pointer text-[10px] text-muted-foreground select-none">
                  ▸ curl + response
                </summary>
                <div className="mt-1 space-y-1">
                  <pre className="bg-background border rounded p-2 text-[10px] whitespace-pre-wrap break-all">
                    {toCurl(r.step.request, showSecrets)}
                  </pre>
                  {r.step.responseBody !== undefined && (
                    <>
                      <div className="text-[10px] text-muted-foreground">
                        Response (HTTP {r.step.responseStatus ?? "?"})
                      </div>
                      <pre className="bg-background border rounded p-2 text-[10px] max-h-60 overflow-auto">
                        {r.step.responseBody.length > 3000
                          ? r.step.responseBody.slice(0, 3000) + "\n…(truncated)"
                          : r.step.responseBody}
                      </pre>
                    </>
                  )}
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-1 text-[10px] text-muted-foreground select-none">
        <input
          type="checkbox"
          checked={showSecrets}
          onChange={(e) => setShowSecrets(e.target.checked)}
        />
        show secrets (uncheck for screenshots)
      </label>
    </div>
  )
}

/**
 * Full SMART OAuth dance trace. Reads from FlowLogStore which was populated
 * by the fetch wrapper + explicit logs in launchStandalone, callback, and
 * autoFetchPatient. Spans the three page loads of the SMART flow.
 */
function SmartFlowPanel({ entries }: { entries: FlowLogEntry[] }) {
  const [showSecrets, setShowSecrets] = useState(true)
  if (!entries.length) return null
  return (
    <section className="rounded border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">
          SMART flow trace — {entries.length} steps
        </h2>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={showSecrets}
            onChange={(e) => setShowSecrets(e.target.checked)}
          />
          show secrets
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Every HTTP request the app made + every browser navigation, captured
        across the three pages of the SMART flow. The token-exchange POST and
        the /Patient GET both come from inside fhirclient — we never call
        them directly, but the wrapper sees them and logs here.
      </p>
      <ol className="space-y-2 text-xs font-mono">
        {entries.map((e, i) => {
          const isNav = e.method.startsWith("GET (browser")
          return (
            <li key={i} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-muted-foreground">#{i + 1}</span>
                <span className={isNav ? "text-blue-700" : ""}>
                  {e.label ?? `${e.method} ${tryPath(e.url)}`}
                </span>
                {e.responseStatus !== undefined && (
                  <span
                    className={
                      e.responseStatus >= 400
                        ? "text-red-600"
                        : "text-green-700"
                    }
                  >
                    → {e.responseStatus}
                  </span>
                )}
              </div>
              <details className="ml-4">
                <summary className="cursor-pointer text-[10px] text-muted-foreground select-none">
                  ▸ details
                </summary>
                <div className="mt-1 space-y-1">
                  <pre className="bg-background border rounded p-2 text-[10px] whitespace-pre-wrap break-all">
                    {entryToCurl(e, showSecrets)}
                  </pre>
                  {e.responseBody && (
                    <>
                      <div className="text-[10px] text-muted-foreground">
                        Response body
                      </div>
                      <pre className="bg-background border rounded p-2 text-[10px] max-h-60 overflow-auto">
                        {e.responseBody}
                      </pre>
                    </>
                  )}
                </div>
              </details>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function tryPath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

/** FlowLog entry → curl-or-equivalent rendering. */
function entryToCurl(entry: FlowLogEntry, showSecrets: boolean): string {
  // Navigation entries don't translate to curl — describe them directly.
  if (entry.method.startsWith("GET (browser")) {
    const lines = [`# ${entry.method}`, `# URL:`, entry.url]
    if (entry.requestBody) lines.push("", entry.requestBody)
    return lines.join("\n")
  }
  return toCurl(
    {
      method: entry.method,
      url: entry.url,
      headers: entry.requestHeaders,
      body: entry.requestBody,
    },
    showSecrets
  )
}

/**
 * File picker masquerading as a button. Opens the OS file dialog and forwards
 * the chosen .json file to `onSelect`. Disabled while an upload is in flight.
 */
function UploadButton({
  vendor,
  status,
  onSelect,
}: {
  vendor: TwcatVendor
  status: UploadStatus | undefined
  onSelect: (file: File) => void
}) {
  const inputId = `twcat-upload-${vendor.id}`
  return (
    <>
      <input
        id={inputId}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onSelect(f)
          // Reset so the same file can be re-picked back-to-back.
          e.target.value = ""
        }}
      />
      <label
        htmlFor={inputId}
        title="Upload a FHIR Bundle / array / single resource as JSON — POSTed to this vendor's FHIR base, one resource per request."
        className={`px-3 py-1.5 rounded border text-sm cursor-pointer ${
          status?.running ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        📤 Upload FHIR JSON
      </label>
    </>
  )
}

function UploadResultPanel({ status }: { status: UploadStatus }) {
  return (
    <div className="rounded bg-muted/30 p-3 space-y-2 text-xs font-mono">
      <div>
        <span className="text-muted-foreground">file: </span>
        {status.fileName ?? "(none)"}
        {status.resourceCount !== undefined && (
          <span className="text-muted-foreground"> · {status.resourceCount} resources</span>
        )}
        {status.running && <span className="text-amber-600"> · uploading…</span>}
      </div>
      {status.error && <div className="text-destructive">⚠ {status.error}</div>}
      {status.results.length > 0 && (
        <ul className="space-y-0.5">
          {status.results.map((r, i) => {
            const ok = r.status >= 200 && r.status < 300
            return (
              <li key={i} className="flex items-baseline gap-2">
                <span className="text-muted-foreground w-6 text-right">{i + 1}.</span>
                <span className={ok ? "text-green-700" : "text-red-600"}>
                  HTTP {r.status}
                </span>
                {r.location && (
                  <span className="text-muted-foreground truncate">{r.location}</span>
                )}
                {r.outcome && !ok && (
                  <span className="text-red-700 truncate">{r.outcome}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {status.results.length > 0 && !status.running && (
        <div className="pt-1">
          <span className="text-muted-foreground">summary: </span>
          <span className="text-green-700">
            {status.results.filter((r) => r.status >= 200 && r.status < 300).length} ok
          </span>
          {" · "}
          <span className="text-red-600">
            {status.results.filter((r) => !(r.status >= 200 && r.status < 300)).length} failed
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Top-of-page banner that adapts to where the user landed:
 *   - GH Pages (static export) → red banner: TWCAT proxy unreachable. Link
 *     to the Vercel deployment if NEXT_PUBLIC_TWCAT_VERCEL_URL is set,
 *     else suggest `npm run dev`.
 *   - Vercel / local dev → green banner: proxy ready, full functionality.
 *
 * Detection happens at runtime via window.location.host (so the same bundle
 * works on both hosts) plus a build-time fallback to NEXT_PUBLIC_BASE_PATH
 * which is only set on the GH Pages build. We avoid round-tripping to the
 * proxy at mount because (a) it adds latency on every load and (b) a 404
 * from a missing route is indistinguishable from a real outage.
 */
function ProxyAvailabilityBanner() {
  const [isStatic, setIsStatic] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const host = window.location.host
    const looksStatic =
      host.endsWith(".github.io") ||
      // Build-time hint set by next.config.ts when GITHUB_PAGES=true. Empty
      // string in any other build (dev, Vercel).
      Boolean(process.env.NEXT_PUBLIC_BASE_PATH)
    setIsStatic(looksStatic)
  }, [])

  const vercelUrl = (process.env.NEXT_PUBLIC_TWCAT_VERCEL_URL || "").trim()

  if (!isStatic) {
    return (
      <div className="rounded border border-green-600 bg-green-50 px-3 py-2 text-xs text-green-800">
        ✓ <code>/api/twcat-proxy</code> available — Quick Test, Open in main
        app, and Upload work end-to-end here.
      </div>
    )
  }

  return (
    <div className="rounded border border-amber-600 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
      <div className="font-semibold">
        ⚠ TWCAT proxy not available on this deployment.
      </div>
      <p>
        This page is hosted on a static file server (GitHub Pages). The{" "}
        <code>/api/twcat-proxy</code> route only exists on Vercel / local dev.
        Quick Test, Open in main app, and Upload will all fail with 404.
      </p>
      {vercelUrl ? (
        <p>
          <strong>Open the same page on the Vercel build:</strong>{" "}
          <a
            href={`${vercelUrl.replace(/\/+$/, "")}/smart/twcat`}
            className="underline font-mono"
          >
            {vercelUrl.replace(/\/+$/, "")}/smart/twcat
          </a>
        </p>
      ) : (
        <p>
          For local demo, run <code>npm run dev</code> and visit{" "}
          <code>http://localhost:3001/smart/twcat</code>. Set
          <code> NEXT_PUBLIC_TWCAT_VERCEL_URL</code> at build time to surface a
          remote demo URL here.
        </p>
      )}
      <p>
        The <strong>SMART launch (user login)</strong> button still kicks off
        the OAuth dance (browser navigation isn&apos;t CORS-blocked), but
        anything that needs to fetch FHIR data afterwards will fail here.
      </p>
    </div>
  )
}

/**
 * Inline form for editing vendor fields. Used both for preset overrides and
 * in-place edits of custom vendors. Save handler decides where to persist.
 *
 * Layout note: kept tight (single-row grid) so it doesn't shove the action
 * buttons off-screen when expanded. All fields optional except iss.
 */
function VendorEditForm({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: EditableVendor
  onChange: <K extends keyof TwcatVendor>(key: K, value: TwcatVendor[K]) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50/40 p-3 space-y-2 text-xs">
      <div className="font-semibold text-amber-800">
        Editing — values stored in localStorage, persist across reloads
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Labelled label="display name">
          <input
            className="rounded border p-1.5"
            value={draft.name}
            onChange={(e) => onChange("name", e.target.value)}
          />
        </Labelled>
        <Labelled label="authMethod">
          <select
            className="rounded border p-1.5"
            value={draft.authMethod ?? "client_credentials"}
            onChange={(e) =>
              onChange(
                "authMethod",
                e.target.value as "client_credentials" | "smart"
              )
            }
          >
            <option value="client_credentials">client_credentials</option>
            <option value="smart">smart (authorization_code)</option>
          </select>
        </Labelled>
        <Labelled label="iss (FHIR base URL)" className="col-span-2">
          <input
            className="rounded border p-1.5 font-mono"
            value={draft.iss}
            onChange={(e) => onChange("iss", e.target.value)}
          />
        </Labelled>
        <Labelled
          label="tokenEndpoint (auto-discoverable from iss)"
          className="col-span-2"
        >
          <div className="flex gap-1">
            <input
              className="flex-1 rounded border p-1.5 font-mono"
              value={draft.tokenEndpoint ?? ""}
              onChange={(e) => onChange("tokenEndpoint", e.target.value)}
            />
            <button
              type="button"
              onClick={async () => {
                if (!draft.iss) return
                const disc = await discoverEndpoints(draft.iss)
                if (disc?.tokenEndpoint) {
                  onChange("tokenEndpoint", disc.tokenEndpoint)
                }
              }}
              className="px-2 py-1 rounded border text-xs whitespace-nowrap"
              title="GET ${iss}/.well-known/smart-configuration and pre-fill"
            >
              🔍 discover
            </button>
          </div>
        </Labelled>
        <Labelled label="client_id">
          <input
            className="rounded border p-1.5 font-mono"
            value={draft.clientId}
            onChange={(e) => onChange("clientId", e.target.value)}
          />
        </Labelled>
        <Labelled label="client_secret (blank = public)">
          <input
            className="rounded border p-1.5 font-mono"
            value={draft.clientSecret ?? ""}
            onChange={(e) =>
              onChange("clientSecret", e.target.value || undefined)
            }
          />
        </Labelled>
        <Labelled label="scope (client_credentials grant)">
          <input
            className="rounded border p-1.5 font-mono"
            value={draft.scope ?? ""}
            onChange={(e) => onChange("scope", e.target.value)}
          />
        </Labelled>
        <Labelled label="smartScope (authorization_code grant)">
          <input
            className="rounded border p-1.5 font-mono"
            value={draft.smartScope ?? ""}
            onChange={(e) => onChange("smartScope", e.target.value)}
          />
        </Labelled>
        <Labelled label="notes (free text)" className="col-span-2">
          <input
            className="rounded border p-1.5"
            value={draft.notes ?? ""}
            onChange={(e) => onChange("notes", e.target.value)}
          />
        </Labelled>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          className="px-3 py-1.5 rounded bg-primary text-primary-foreground"
        >
          Save
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded border">
          Cancel
        </button>
      </div>
    </div>
  )
}

function Labelled({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}

function BearerCountdown({ expiresAt }: { expiresAt: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  const m = Math.floor(left / 60)
  const s = left % 60
  return (
    <span className={`text-xs font-mono ${left === 0 ? "text-destructive" : "text-muted-foreground"}`}>
      bearer: {left === 0 ? "EXPIRED" : `${m}:${s.toString().padStart(2, "0")} left`}
    </span>
  )
}
