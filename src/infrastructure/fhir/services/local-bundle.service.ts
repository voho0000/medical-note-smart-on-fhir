// LocalBundleService
// Stores a FHIR Bundle and parses it into domain entities.
// When a bundle is present, query hooks use it instead of the live FHIR server.
// Encounter grouping: resources without encounter reference are matched by same-day date.
//
// Storage layout (changed in v0.5.x for imaging support):
//   - The full bundle JSON lives in IndexedDB (large quota — bundles with
//     inlined base64 imaging can be 16MB+, well over localStorage's ~5MB cap
//     which throws QuotaExceededError on setItem).
//   - A tiny presence marker stays in localStorage so `hasData()` can remain
//     synchronous (it gates the whole data-source decision during render and
//     must not become a promise).
//   - The bundle is also cached in a module-level variable for the session so
//     repeated reads don't hit IndexedDB.
//   - Bundles written by older builds (full JSON under the same localStorage
//     key) are migrated to IndexedDB transparently on first read.
//
// Encryption at rest (audit B1, v0.12): everything in IndexedDB — bundle JSON
// and image Blobs — is AES-GCM ciphertext under a tab-session key (see
// bundle-crypto.ts). A new tab session that cannot decrypt what it finds
// purges it, and records older than MAX_BUNDLE_AGE_MS are purged even within
// a session, so an imported chart never lingers on a shared workstation.
// Plaintext data written by older builds is re-encrypted on first read.

import { FhirMapper } from '../mappers/fhir.mapper'
import { PatientMapper } from '../mappers/patient.mapper'
import { expandClaimResources } from './claim-expander'
import { referenceId } from '@/src/core/utils/observation-selectors'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import {
  getSessionBundleKey,
  clearSessionBundleKey,
  isEncryptedRecord,
  encryptBytes,
  decryptBytes,
  encryptJson,
  decryptJson,
} from './bundle-crypto'

// localStorage key. Holds the small marker `'1'` in the current scheme, but may
// still hold a full bundle JSON written by an older build (migrated on read).
const STORAGE_KEY = 'fhir_bundle_override'
const MARKER = '1'

// IndexedDB coordinates for the bundle payload.
const DB_NAME = 'mediprisma'
const DB_VERSION = 2
const STORE = 'bundles'
const BUNDLE_KEY = 'current'
// Separate store for inline imaging. At import we move each base64 image out of
// the bundle into a Blob here (off-heap, disk-backed) and leave only a reference
// (`_imageRef`) behind. This keeps hundreds of MB of imaging off the JS heap —
// the bundle/entities stay small and the bytes are fetched on demand (when the
// user opens the viewer). See ReportImageDialog.
const IMG_STORE = 'images'

// Session cache: avoids re-reading IndexedDB on every query. Module-level so it
// is shared across all hook instances in the same tab.
let memBundle: object | null = null

// Even within a live tab session, a bundle older than this is purged on read —
// a workstation left logged-in overnight shouldn't still expose yesterday's
// patient.
const MAX_BUNDLE_AGE_MS = 12 * 60 * 60 * 1000

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(IMG_STORE)) db.createObjectStore(IMG_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Decode raw base64 → binary Blob. Tolerates a stray `data:<mime>;base64,`
 *  prefix even though the bridge omits it. The intermediate Uint8Array is
 *  per-image and short-lived; the resulting Blob is off-heap (disk-backed). */
function base64ToBlob(base64: string, contentType: string): Blob {
  const raw = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binary = atob(raw)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: contentType || 'image/jpeg' })
}

async function idbPut(value: unknown): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, BUNDLE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function idbGet<T = unknown>(): Promise<T | null> {
  const db = await openDb()
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(BUNDLE_KEY)
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

async function idbDelete(): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(BUNDLE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

// --- Image Blob store ---------------------------------------------------------

async function idbClearImages(): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readwrite')
      tx.objectStore(IMG_STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

// Persist all extracted image records in a single transaction (one DB open for
// the whole import, not one per image). Values are EncryptedRecords.
async function idbPutImages(items: Array<{ id: string; record: unknown }>): Promise<void> {
  if (!items.length) return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readwrite')
      const store = tx.objectStore(IMG_STORE)
      for (const { id, record } of items) store.put(record, id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

// Raw read — value may be an EncryptedRecord (current) or a plaintext Blob
// (written by older builds); getImage() handles both.
async function idbGetImage(id: string): Promise<unknown> {
  const db = await openDb()
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readonly')
      const req = tx.objectStore(IMG_STORE).get(id)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

// Pure (no IndexedDB): walk a bundle's DiagnosticReports and move every inline
// base64 image out of `presentedForm[].data`, leaving a `_imageRef` pointer
// behind. Mutates `bundle` in place so the retained copy (memBundle + the JSON
// persisted to IndexedDB) carries references, not megabytes of base64. Returns
// the decoded Blobs (keyed by the assigned ref) for the caller to persist.
// Non-image attachments and reports without images are untouched. If a base64
// payload fails to decode it is LEFT INLINE (the viewer falls back to decoding
// `data` directly) rather than dropped — we never silently lose data.
export function prepareImagesForStorage(bundle: any): Array<{ id: string; blob: Blob }> {
  const entries: any[] = Array.isArray(bundle?.entry) ? bundle.entry : []
  const toStore: Array<{ id: string; blob: Blob }> = []
  let counter = 0

  for (const e of entries) {
    const res = e?.resource
    if (res?.resourceType !== 'DiagnosticReport' || !Array.isArray(res.presentedForm)) continue
    for (const form of res.presentedForm) {
      const data = form?.data
      const ct: string = form?.contentType || ''
      if (typeof data !== 'string' || data.length === 0 || !ct.startsWith('image/')) continue
      let blob: Blob
      try {
        blob = base64ToBlob(data, ct)
      } catch {
        continue // malformed base64 — leave inline for the viewer to attempt
      }
      const id = `img_${counter++}`
      toStore.push({ id, blob })
      delete form.data
      form._imageRef = id
      if (form.size == null) form.size = blob.size
    }
  }
  return toStore
}

// Strip images out of the bundle (in place), encrypt each one, and persist to
// the IndexedDB image store. Always clears the previous import's images first
// (even when this import has none) so stale Blobs don't accumulate. When no
// session key is available the bundle is left untouched (images stay inline);
// the caller will then also skip persisting the bundle itself.
async function extractAndStoreImages(bundle: any): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const key = await getSessionBundleKey({ create: true })
  if (!key) {
    await idbClearImages()
    return
  }
  const toStore = prepareImagesForStorage(bundle)
  const encrypted: Array<{ id: string; record: unknown }> = []
  for (const { id, blob } of toStore) {
    const bytes = await blob.arrayBuffer()
    encrypted.push({ id, record: await encryptBytes(key, bytes, blob.type) })
  }
  await idbClearImages()
  await idbPutImages(encrypted)
}

// --- Bundle identity canonicalisation -----------------------------------------

interface RefTarget {
  resourceType: string
  id: string
}

/**
 * Reduce a bundle entry's `fullUrl` to the bare id that internal references
 * should resolve against. Kept symmetric with `referenceId` (which parses the
 * reference side) so a stamped id and a rewritten reference always agree:
 *   - urn:uuid:<id>                       -> <id>
 *   - urn:oid:<id>                        -> <id>
 *   - http://host/base/Type/<id>[/_hist]  -> <id>
 *   - Type/<id>                           -> <id>
 */
export function idFromFullUrl(fullUrl?: string): string | undefined {
  if (!fullUrl) return undefined
  if (fullUrl.startsWith('urn:uuid:')) return fullUrl.slice('urn:uuid:'.length) || undefined
  if (fullUrl.startsWith('urn:oid:')) return fullUrl.slice('urn:oid:'.length) || undefined
  const noHistory = fullUrl.replace(/\/_history\/[^/]+$/, '')
  return noHistory.split('/').pop() || undefined
}

/** Deep-copy a single FHIR resource (plain JSON — no functions/Dates). */
function cloneResource<T>(resource: T): T {
  if (typeof structuredClone === 'function') return structuredClone(resource)
  return JSON.parse(JSON.stringify(resource))
}

/** Rewrite every internal `reference` string in-place to `ResourceType/id`. */
function rewriteReferences(node: unknown, targets: Map<string, RefTarget>): void {
  if (Array.isArray(node)) {
    for (const item of node) rewriteReferences(item, targets)
    return
  }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (typeof obj.reference === 'string') {
    const target = targets.get(obj.reference)
    if (target) obj.reference = `${target.resourceType}/${target.id}`
  }
  for (const key of Object.keys(obj)) {
    if (key === 'reference') continue
    rewriteReferences(obj[key], targets)
  }
}

/**
 * Canonicalise a bundle's resource identity at the ingestion boundary so the
 * rest of the app never has to understand bundle-specific reference forms.
 *
 * Why this exists: IPS / TW-Core (and any transaction/collection/document)
 * bundles identify resources by `entry.fullUrl` (e.g. `urn:uuid:…`), leave
 * `resource.id` absent, and point every internal reference at those fullUrls.
 * The app, by contrast, assumes each resource has an `id` and that references
 * are the relative `ResourceType/id` form — both the `patient.id`-gated
 * clinical-data query AND the ~11 `split('/').pop()` reference-resolution sites
 * depend on it. Without normalisation such a bundle loads only the Patient
 * demographics and silently drops everything else (the IPS "只讀得到年齡性別"
 * bug), and reports never link to their member observations.
 *
 * Returns a NEW array of resource clones (the cached raw bundle is never
 * mutated). Two passes:
 *   1. Every resource gets a stable `id` — existing `id`, else derived from its
 *      `fullUrl`, else a deterministic positional fallback (so the id is stable
 *      across the repeated parse() calls React Query makes).
 *   2. Every internal reference (one that resolves to a known fullUrl or the
 *      equivalent `ResourceType/id`) is rewritten to the relative form.
 * References to other servers / unknown targets are left untouched.
 */
export function canonicalizeBundleResources(bundle: any): any[] {
  const rawEntries: any[] = Array.isArray(bundle?.entry) ? bundle.entry : []
  const entries = rawEntries.filter((e) => e?.resource)

  // Pass 1 — assign ids; index every resolvable key to its canonical target.
  const targets = new Map<string, RefTarget>()
  const resources = entries.map((e, index) => {
    const res = cloneResource(e.resource)
    const resourceType: string = res.resourceType ?? 'Resource'
    const id = String(res.id || idFromFullUrl(e.fullUrl) || `${resourceType}-${index}`)
    res.id = id
    const target: RefTarget = { resourceType, id }
    if (e.fullUrl) targets.set(e.fullUrl, target)
    targets.set(`${resourceType}/${id}`, target)
    return res
  })

  // Pass 2 — rewrite internal references to the relative ResourceType/id form.
  for (const res of resources) rewriteReferences(res, targets)
  return resources
}

/** Best human-readable name for a person/place resource (display resolution). */
function resourceDisplayName(res: any): string | undefined {
  if (!res) return undefined
  // Organization / Location use a plain string `name`.
  if (typeof res.name === 'string') return res.name || undefined
  // Practitioner (and other HumanName[] holders): prefer `text`, else assemble.
  const n = Array.isArray(res.name) ? res.name[0] : undefined
  if (!n) return undefined
  if (n.text) return n.text
  const parts = [n.family, ...(n.given ?? [])].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}

/**
 * Display canonicalisation: stamp a human-readable `display` onto every
 * in-bundle reference that lacks one and whose target is a person/place
 * resource (Practitioner / PractitionerRole / Organization / Location).
 *
 * Why: TW-Core document bundles (e.g. 門診 scenario files) model the attending
 * physician as `Encounter.participant[].individual → Reference(Practitioner)`
 * and the institution as `serviceProvider → Reference(Organization)` with NO
 * display strings — the UI renders only `.display`, so both showed blank.
 * PractitionerRole references resolve through to the underlying practitioner's
 * name. Existing display strings are never overwritten. Mutates in place (the
 * canonicalised clones, never the cached raw bundle).
 */
export function attachReferenceDisplays(resources: any[]): void {
  const displayByRef = new Map<string, string>()
  for (const res of resources) {
    if (!['Practitioner', 'Organization', 'Location'].includes(res.resourceType)) continue
    const display = resourceDisplayName(res)
    if (display) displayByRef.set(`${res.resourceType}/${res.id}`, display)
  }
  // Second pass: PractitionerRole → its practitioner's resolved name.
  for (const res of resources) {
    if (res.resourceType !== 'PractitionerRole') continue
    const display = res.practitioner?.reference
      ? displayByRef.get(res.practitioner.reference)
      : undefined
    if (display) displayByRef.set(`PractitionerRole/${res.id}`, display)
  }
  if (!displayByRef.size) return

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if (typeof obj.reference === 'string' && !obj.display) {
      const display = displayByRef.get(obj.reference)
      if (display) obj.display = display
    }
    for (const key of Object.keys(obj)) walk(obj[key])
  }
  walk(resources)
}

export interface LocalBundleData {
  patient: PatientEntity
  collection: ClinicalDataCollection
}

function toDateStr(dateStr?: string): string | null {
  if (!dateStr) return null
  return dateStr.slice(0, 10)
}

// Attach encounter references for non-medication resources by same-day match.
// Used by Observation / Procedure / Condition / DiagnosticReport — these
// don't carry a "requester / provider" field, so date alone is the best we
// have. Multi-encounter same-day collisions take the first match (existing
// VGH behaviour).
function attachEncounterRefsByDate(resources: any[], encounterDateMap: Map<string, string>): any[] {
  return resources.map((r) => {
    if (r.encounter?.reference) return r // already has a reference

    const dateFields: string[] = [
      r.performedDateTime,    // Procedure
      r.performedPeriod?.start,
      r.recordedDate,         // Condition
      r.effectiveDateTime,    // Observation, DiagnosticReport
      r.period?.start,
    ]

    for (const d of dateFields) {
      const key = toDateStr(d)
      if (key && encounterDateMap.has(key)) {
        return { ...r, encounter: { reference: `Encounter/${encounterDateMap.get(key)}` } }
      }
    }

    return r
  })
}

// Attach encounter references for MedicationRequests. REQUIRES provider
// match in addition to same-day match — otherwise pharmacy-only refills get
// silently merged into an unrelated same-day clinic visit (e.g. an ENT
// outpatient encounter ends up "containing" the patient's BPH chronic
// refills). Unmatched meds remain orphans here; synthesizePharmacyEncounters()
// downstream gives each orphan group its own synthetic 藥局 Encounter.
function attachEncounterRefsForMeds(
  meds: any[],
  encounterByDateProvider: Map<string, string>,
): any[] {
  return meds.map((m) => {
    if (m.encounter?.reference) return m
    const date = toDateStr(m.authoredOn || m.effectiveDateTime)
    const requester = m.requester?.display?.trim() || ''
    if (!date || !requester) return m
    const id = encounterByDateProvider.get(`${date}|${requester}`)
    if (!id) return m
    return { ...m, encounter: { reference: `Encounter/${id}` } }
  })
}

export const LocalBundleService = {
  // Synchronous presence check. Reads the in-memory cache first (set the moment
  // a bundle is imported this session) then the localStorage marker. Stays sync
  // because `shouldUseLocalBundle()` / `hasAnyDataSource()` call it during render.
  hasData(): boolean {
    if (typeof window === 'undefined') return false
    if (memBundle !== null) return true
    return !!localStorage.getItem(STORAGE_KEY)
  },

  // Persist a bundle. Inline base64 images are first moved out to the IndexedDB
  // Blob store (off-heap) — `extractAndStoreImages` mutates `bundle` in place so
  // the retained copies (memBundle + the JSON in IndexedDB) stay small. Only a
  // tiny marker goes to localStorage. After save resolves, `memBundle` holds the
  // stripped bundle, so no image base64 lingers in the JS heap.
  // Everything persisted is ciphertext; if encryption is unavailable the bundle
  // lives in memory only for this session — never plaintext at rest.
  async save(bundle: object): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        await extractAndStoreImages(bundle)
      } catch {
        // IndexedDB image store unavailable — keep images inline; the bundle is
        // still usable and the viewer falls back to decoding `data` directly.
      }
    }
    memBundle = bundle
    if (typeof window === 'undefined') return
    try {
      const key = await getSessionBundleKey({ create: true })
      if (!key) throw new Error('bundle session key unavailable')
      await idbPut(await encryptJson(key, bundle))
      localStorage.setItem(STORAGE_KEY, MARKER)
    } catch {
      // Could not persist ciphertext — make sure no stale marker/payload from a
      // previous import survives pointing at the wrong data. The current import
      // still works from the in-memory cache for this session.
      try {
        localStorage.removeItem(STORAGE_KEY)
        await idbDelete()
      } catch {
        // Best-effort cleanup.
      }
    }
  },

  async clear(): Promise<void> {
    memBundle = null
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
    clearSessionBundleKey()
    try {
      await idbDelete()
    } catch {
      // Best-effort: the marker is already gone, so hasData() is false regardless.
    }
    try {
      await idbClearImages()
    } catch {
      // Best-effort image cleanup.
    }
  },

  // Fetch a stored image by its `_imageRef`. Used by the lazy viewer so the
  // bytes are only pulled into memory while the dialog is open. Handles both
  // encrypted records (current) and plaintext Blobs from older builds.
  async getImage(ref: string): Promise<Blob | null> {
    if (typeof window === 'undefined') return null
    try {
      const stored = await idbGetImage(ref)
      if (!stored) return null
      if (stored instanceof Blob) return stored // legacy plaintext (purged on next load/import)
      if (isEncryptedRecord(stored)) {
        const key = await getSessionBundleKey()
        if (!key) return null
        const plain = await decryptBytes(key, stored)
        return new Blob([plain], { type: stored.type || 'image/jpeg' })
      }
      return null
    } catch {
      return null
    }
  },

  async load(): Promise<object | null> {
    if (memBundle) return memBundle
    if (typeof window === 'undefined') return null

    // Primary path: IndexedDB.
    try {
      const fromIdb = await idbGet<unknown>()
      if (isEncryptedRecord(fromIdb)) {
        // Expired (workstation left open) or undecryptable (previous tab
        // session's data) → purge so the chart never outlives its session.
        if (Date.now() - fromIdb.savedAt > MAX_BUNDLE_AGE_MS) {
          await this.clear()
          return null
        }
        const key = await getSessionBundleKey()
        if (!key) {
          await this.clear()
          return null
        }
        try {
          const bundle = await decryptJson<object>(key, fromIdb)
          memBundle = bundle
          return bundle
        } catch {
          await this.clear()
          return null
        }
      }
      if (fromIdb) {
        // Plaintext bundle written by an older build — serve it this once and
        // immediately re-encrypt in place so it stops existing as plaintext.
        memBundle = fromIdb as object
        try {
          const key = await getSessionBundleKey({ create: true })
          if (key) await idbPut(await encryptJson(key, fromIdb))
          else await idbDelete()
        } catch {
          // Re-encryption failed — leave the in-memory copy serving this session.
        }
        return fromIdb as object
      }
    } catch {
      // IndexedDB unavailable (private mode, etc.) — fall through to migration.
    }

    // Migration path: older builds stored the full bundle JSON under STORAGE_KEY.
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && raw !== MARKER) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && (parsed.resourceType === 'Bundle' || Array.isArray(parsed.entry))) {
          memBundle = parsed
          // Move it (encrypted) to IndexedDB and shrink the marker so we don't
          // re-migrate.
          try {
            const key = await getSessionBundleKey({ create: true })
            if (key) {
              await idbPut(await encryptJson(key, parsed))
              localStorage.setItem(STORAGE_KEY, MARKER)
            }
          } catch {
            // Migration write failed — keep serving from the in-memory copy.
          }
          return parsed
        }
      } catch {
        // Corrupt JSON — treat as no data.
      }
    }
    return null
  },

  parse(bundle: any): LocalBundleData | null {
    // Canonicalise identity FIRST: stamp ids onto id-less resources and rewrite
    // urn:uuid / absolute references to the relative ResourceType/id form, so
    // every downstream step (patient-id gate, report-member linking, the inline
    // split('/').pop() resolvers) works regardless of the bundle's reference
    // style. See canonicalizeBundleResources.
    const entries: any[] = canonicalizeBundleResources(bundle)
    if (!entries.length) return null

    // TW-PAS support: unpack any Claim (事前審查申請) into the standard
    // Condition / Procedure / Observation / DocumentReference resources the rest
    // of the pipeline already renders. No-op for non-PAS bundles. Runs before the
    // byType() split below so the synthesised resources flow through unchanged.
    expandClaimResources(entries)

    // Display canonicalisation: resolve Practitioner / Organization / Location
    // references to human-readable display strings (attending physician,
    // institution) so the UI's `.display`-only renderers can show them.
    attachReferenceDisplays(entries)

    const byType = (type: string) => entries.filter((r) => r.resourceType === type)

    // Extract patient
    const patientRaw = byType('Patient')[0]
    if (!patientRaw) return null
    const patient = PatientMapper.toDomain(patientRaw)
    if (!patient) return null

    // Build encounter date map: { "YYYY-MM-DD" -> encounterId }
    // VGH data has one encounter per day per department; use first match if multiple same-day.
    const encounters = byType('Encounter')
    const encounterDateMap = new Map<string, string>()
    // Also build (date, provider) → encounterId so medication attachment can
    // disambiguate when multiple same-day encounters exist across providers
    // (e.g. ENT clinic + pharmacy refill on the same day).
    const encounterByDateProvider = new Map<string, string>()
    for (const enc of encounters) {
      const d = toDateStr(enc.period?.start)
      if (d && !encounterDateMap.has(d)) {
        encounterDateMap.set(d, enc.id)
      }
      const provider = enc.serviceProvider?.display?.trim() || ''
      if (d && provider && !encounterByDateProvider.has(`${d}|${provider}`)) {
        encounterByDateProvider.set(`${d}|${provider}`, enc.id)
      }
    }

    // Build Medication resource map for resolving medicationReference. BOTH
    // MedicationRequest and MedicationStatement can carry the drug as a
    // `medicationReference` to a contained/standalone Medication instead of an
    // inline `medicationCodeableConcept` — IPS / TW-Core bundles do exactly this
    // (12 MedicationRequests → 4 shared Medication resources in the sample). The
    // map is keyed by the (now-canonicalised) Medication id.
    const medicationResources = byType('Medication')
    const medicationMap = new Map(medicationResources.map((m: any) => [m.id, m]))

    // Promote a referenced Medication.code into medicationCodeableConcept so the
    // display helpers (which only look at medicationCodeableConcept) find a drug
    // name. References are already relative post-canonicalisation; referenceId
    // also tolerates urn-form as a second line of defence.
    const resolveMedicationCode = <T extends {
      medicationCodeableConcept?: unknown
      medicationReference?: { reference?: string }
    }>(m: T): T => {
      if (m.medicationCodeableConcept || !m.medicationReference?.reference) return m
      const refId = referenceId(m.medicationReference.reference)
      const medResource = refId ? medicationMap.get(refId) : null
      return medResource?.code ? { ...m, medicationCodeableConcept: medResource.code } : m
    }

    // Normalize MedicationStatements to a MedicationRequest-compatible shape so
    // the rest of the pipeline (FhirMapper, display components) can handle them
    // without needing to know which resource type they came from. The original
    // resource type is preserved as `_sourceResourceType` so the medications
    // panel can surface "目前服用中" when an IPS dataset is loaded.
    const medicationStatements = byType('MedicationStatement').map((ms: any) => {
      const resolved = resolveMedicationCode(ms)
      // Normalize field names that differ between MedicationRequest and MedicationStatement
      return {
        ...resolved,
        _sourceResourceType: 'MedicationStatement' as const,
        authoredOn: resolved.authoredOn
          ?? resolved.effectivePeriod?.start
          ?? resolved.effectiveDateTime,
        dosageInstruction: resolved.dosageInstruction ?? resolved.dosage,
      }
    })

    // Stamp MedicationRequest with its source type too so downstream code can
    // tell a mixed-source list from a pure one. Resolve its medicationReference
    // as well (IPS-style orders reference a Medication rather than inlining it).
    const medicationRequests = byType('MedicationRequest').map((m: any) => ({
      ...resolveMedicationCode(m),
      _sourceResourceType: 'MedicationRequest' as const,
    }))

    // Pre-process resources: attach encounter refs where missing.
    // Medications use provider-aware matching (date + requester); everything
    // else falls back to date-only matching as before. Orphan pharmacy
    // MedicationRequests that don't match any clinic encounter are LEFT
    // ORPHAN on purpose — per the bridge team's design (bridge bug report
    // 2026-05-20), 健保存摺 itself only surfaces pharmacy events as visits
    // in the IC-card section (≤6 most-recent rows, where bridge v0.7.1+
    // tags them with type.text='藥局'). The older "申報資料" channel never
    // shows pharmacy events as visits at all, so synthesising fake Encounter
    // resources for them would diverge from NHI's data model.
    const meds = attachEncounterRefsForMeds(
      [...medicationRequests, ...medicationStatements],
      encounterByDateProvider,
    )

    const obs    = attachEncounterRefsByDate(byType('Observation'), encounterDateMap)
    const reports = byType('DiagnosticReport')
    const procs  = attachEncounterRefsByDate(byType('Procedure'), encounterDateMap)
    const conds  = attachEncounterRefsByDate(byType('Condition'), encounterDateMap)
    const allerg = byType('AllergyIntolerance')
    const docRefs = byType('DocumentReference')
    const comps  = byType('Composition')
    const imms   = byType('Immunization')
    const consents = byType('Consent')
    const devices  = byType('Device')
    const carePlans = byType('CarePlan')

    // Build observation map for DiagnosticReport expansion
    const allObs = obs.map((r: any) => FhirMapper.toObservation(r))
    const obsMap = new Map(allObs.map((o: any) => [o.id, o]))

    // Attach encounter refs to DiagnosticReports using same-day strategy
    const processedReports = attachEncounterRefsByDate(reports, encounterDateMap).map((r: any) =>
      FhirMapper.toDiagnosticReport(r, allObs)
    )

    // Separate vital signs from other observations
    const observations = allObs
    const vitalSigns = allObs.filter((o: any) => {
      const cats = o.category ?? []
      return cats.some((c: any) => c.coding?.[0]?.code === 'vital-signs')
    })

    const collection: ClinicalDataCollection = {
      conditions:       conds.map((r: any) => FhirMapper.toCondition(r)),
      medications:      meds.map((r: any) => FhirMapper.toMedication(r)),
      allergies:        allerg.map((r: any) => FhirMapper.toAllergy(r)),
      observations,
      vitalSigns,
      diagnosticReports: processedReports,
      procedures:       procs.map((r: any) => FhirMapper.toProcedure(r)),
      encounters:       encounters.map((r: any) => FhirMapper.toEncounter(r)),
      documentReferences: docRefs.map((r: any) => FhirMapper.toDocumentReference(r)),
      compositions:     comps.map((r: any) => FhirMapper.toComposition(r)),
      immunizations:    imms.map((r: any) => FhirMapper.toImmunization(r)),
      consents:         consents.map((r: any) => FhirMapper.toConsent(r)),
      devices:          devices.map((r: any) => FhirMapper.toDevice(r)),
      carePlans:        carePlans.map((r: any) => FhirMapper.toCarePlan(r)),
    }

    return { patient, collection }
  },

  async parseStored(): Promise<LocalBundleData | null> {
    const bundle = await this.load()
    if (!bundle) return null
    return this.parse(bundle)
  },
}
