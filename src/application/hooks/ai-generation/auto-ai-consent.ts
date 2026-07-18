'use client'

// Source-aware authorization for automatic cloud-AI analysis.
//
// The long-lived localStorage decision remains the preference used by SMART
// and other non-local real-data sources. A locally imported Bundle is more
// sensitive: each import gets a separate, short-lived sessionStorage record,
// so an earlier opt-in can never silently authorize the next imported patient.

import { useMemo, useSyncExternalStore } from 'react'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { BUNDLE_CHANGED_EVENT } from '@/src/shared/utils/reset-on-bundle-change'

export type AutoAiRealDataDecision = 'auto' | 'manual'
export type LocalImportAiDecision = 'preparing' | 'pending' | AutoAiRealDataDecision
export type AiConsentSource = 'demo' | 'local' | 'other'

export interface LocalImportAiConsentRecord {
  importId: string
  decision: LocalImportAiDecision
  startedAt: number
  decidedAt?: number
  version: 1
}

export interface AutoAiConsentState {
  source: AiConsentSource
  decision: LocalImportAiDecision | null
  importId: string | null
}

export const AUTO_AI_REAL_DATA_DECISION_KEY = 'mediprisma:auto-ai-real-data-decision-v1'
export const LOCAL_IMPORT_AI_CONSENT_KEY = 'mediprisma:local-import-ai-consent-v1'
export const LOCAL_IMPORT_AI_CONSENT_EVENT = 'mediprisma:local-import-ai-consent-changed'
export const LOCAL_IMPORT_AI_CONSENT_MAX_AGE_MS = 12 * 60 * 60 * 1000
export const LOCAL_IMPORT_AI_CONSENT_VERSION = 1 as const

// `undefined` delegates to sessionStorage. A record/null value is a synchronous
// fail-closed override used when sessionStorage could not persist a transition.
// In particular, starting import B must hide import A's stored `auto` decision
// even when both setItem and removeItem fail.
let volatileLocalImportConsent: LocalImportAiConsentRecord | null | undefined
// Tracks imports whose new Bundle has not finished publishing in this runtime.
// It deliberately is not persisted: after a reload, an encrypted Bundle that
// successfully loads is already the published data and `ensure…` may advance
// its stranded `preparing` receipt to the user-facing prompt.
const activePreparingLocalImportIds = new Set<string>()

function notifyConsentChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(LOCAL_IMPORT_AI_CONSENT_EVENT))
}

export function getAutoAiRealDataDecision(): AutoAiRealDataDecision | null {
  if (typeof window === 'undefined') return null
  try {
    const value = localStorage.getItem(AUTO_AI_REAL_DATA_DECISION_KEY)
    return value === 'auto' || value === 'manual' ? value : null
  } catch {
    return null
  }
}

export function recordAutoAiRealDataDecision(decision: AutoAiRealDataDecision): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(AUTO_AI_REAL_DATA_DECISION_KEY, decision)
    // A StorageEvent is not fired in the window that performed the write.
    notifyConsentChanged()
  } catch {
    // Best-effort. If storage is unavailable, automatic cloud analysis stays
    // gated on the next render because no durable authorization can be read.
  }
}

function isValidTimestamp(value: unknown, now: number): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= now
}

function parseLocalImportAiConsent(
  raw: string | null,
  now: number,
): LocalImportAiConsentRecord | null {
  if (!raw || !Number.isFinite(now) || now < 0) return null

  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null

    const candidate = value as Partial<LocalImportAiConsentRecord>
    if (candidate.version !== LOCAL_IMPORT_AI_CONSENT_VERSION) return null
    if (typeof candidate.importId !== 'string' || candidate.importId.trim().length === 0) return null
    if (
      candidate.decision !== 'preparing'
      && candidate.decision !== 'pending'
      && candidate.decision !== 'auto'
      && candidate.decision !== 'manual'
    ) return null
    if (!isValidTimestamp(candidate.startedAt, now)) return null
    if (now - candidate.startedAt >= LOCAL_IMPORT_AI_CONSENT_MAX_AGE_MS) return null

    if (candidate.decision === 'preparing' || candidate.decision === 'pending') {
      // An unresolved record must not carry a stale decision timestamp.
      if (candidate.decidedAt !== undefined) return null
    } else {
      if (!isValidTimestamp(candidate.decidedAt, now)) return null
      if (candidate.decidedAt < candidate.startedAt) return null
    }

    return {
      importId: candidate.importId,
      decision: candidate.decision,
      startedAt: candidate.startedAt,
      ...(candidate.decidedAt === undefined ? {} : { decidedAt: candidate.decidedAt }),
      version: LOCAL_IMPORT_AI_CONSENT_VERSION,
    }
  } catch {
    return null
  }
}

/** Read the current import-scoped decision. Invalid, corrupt, future-dated, or
 * expired records all fail closed and are indistinguishable from no record. */
export function getLocalImportAiConsent(
  now: number = Date.now(),
): LocalImportAiConsentRecord | null {
  if (typeof window === 'undefined') return null
  if (volatileLocalImportConsent !== undefined) {
    if (volatileLocalImportConsent === null) return null
    return parseLocalImportAiConsent(JSON.stringify(volatileLocalImportConsent), now)
  }
  try {
    return parseLocalImportAiConsent(
      sessionStorage.getItem(LOCAL_IMPORT_AI_CONSENT_KEY),
      now,
    )
  } catch {
    return null
  }
}

/** Begin a new local-import authorization scope. `preparing` closes the AI gate
 * before the new Bundle is published, but does not show an answerable prompt
 * while the previous patient's React Query data may still be on screen. */
export function startLocalImportAiConsent(
  importId: string,
  now: number = Date.now(),
): LocalImportAiConsentRecord | null {
  if (
    typeof window === 'undefined'
    || typeof importId !== 'string'
    || importId.trim().length === 0
    || !Number.isFinite(now)
    || now < 0
  ) return null

  const record: LocalImportAiConsentRecord = {
    importId,
    decision: 'preparing',
    startedAt: now,
    version: LOCAL_IMPORT_AI_CONSENT_VERSION,
  }
  activePreparingLocalImportIds.clear()
  activePreparingLocalImportIds.add(importId)
  // Publish the closed scope before touching storage. Storage can throw while an old
  // `auto` record remains readable; this override keeps the new import locked.
  volatileLocalImportConsent = record
  // Removing first gives us the best chance of destroying the old grant even
  // if writing the new preparing record subsequently fails.
  removePersistedLocalImportAiConsent()
  if (persistLocalImportAiConsent(record, now)) {
    volatileLocalImportConsent = undefined
  } else {
    removePersistedLocalImportAiConsent()
  }
  notifyConsentChanged()
  return record
}

/** Publish the question only after this exact Bundle has finished loading into
 * the UI. The compare-and-set guard prevents an older import from making a
 * newer scope answerable. `pending` is safe to retain in memory when storage
 * fails because it never authorizes an automatic request. */
export function markLocalImportAiConsentReady(
  expectedImportId: string,
  now: number = Date.now(),
): boolean {
  if (typeof window === 'undefined') return false
  const current = getLocalImportAiConsent(now)
  if (!current || current.importId !== expectedImportId) return false
  const activeBundleImportId = LocalBundleService.getActiveImportId()
  if (activeBundleImportId && activeBundleImportId !== expectedImportId) return false
  if (current.decision !== 'preparing') {
    activePreparingLocalImportIds.delete(expectedImportId)
    return current.decision === 'pending'
  }

  const next: LocalImportAiConsentRecord = {
    ...current,
    decision: 'pending',
  }
  activePreparingLocalImportIds.delete(expectedImportId)
  volatileLocalImportConsent = next
  if (persistLocalImportAiConsent(next, now)) {
    volatileLocalImportConsent = undefined
  } else {
    removePersistedLocalImportAiConsent()
  }
  notifyConsentChanged()
  return true
}

/** Clear the active import scope. With a local Bundle still active, the
 * source-aware state consequently becomes `pending` (fail closed). */
export function clearLocalImportAiConsent(): void {
  if (typeof window === 'undefined') return
  activePreparingLocalImportIds.clear()
  volatileLocalImportConsent = null
  if (removePersistedLocalImportAiConsent()) {
    // Removal succeeded, so the empty persistent state can be authoritative.
    volatileLocalImportConsent = undefined
  }
  notifyConsentChanged()
}

/** Resolve one import's prompt. `expectedImportId` is a compare-and-set guard:
 * a late click from an old dialog cannot authorize a newer imported Bundle. */
export function recordLocalImportAiDecision(
  expectedImportId: string,
  decision: AutoAiRealDataDecision,
  now: number = Date.now(),
): boolean {
  if (
    typeof window === 'undefined'
    || (decision !== 'auto' && decision !== 'manual')
  ) return false
  const current = getLocalImportAiConsent(now)
  if (
    !current
    || current.importId !== expectedImportId
    || current.decision !== 'pending'
  ) return false

  const next: LocalImportAiConsentRecord = {
    ...current,
    decision,
    decidedAt: now,
  }

  if (decision === 'manual') {
    // Manual is safe to retain in memory: the dialog can close even when
    // storage is unavailable while cloud auto-run remains locked.
    volatileLocalImportConsent = next
  }
  if (persistLocalImportAiConsent(next, now)) {
    volatileLocalImportConsent = undefined
    notifyConsentChanged()
    return true
  }

  // Do not leave a previously persisted grant available after a failed write.
  removePersistedLocalImportAiConsent()
  if (decision !== 'manual') volatileLocalImportConsent = current
  notifyConsentChanged()
  return decision === 'manual'
}

function persistLocalImportAiConsent(
  record: LocalImportAiConsentRecord,
  now: number,
): boolean {
  try {
    sessionStorage.setItem(LOCAL_IMPORT_AI_CONSENT_KEY, JSON.stringify(record))
    const persisted = parseLocalImportAiConsent(
      sessionStorage.getItem(LOCAL_IMPORT_AI_CONSENT_KEY),
      now,
    )
    return !!persisted
      && persisted.importId === record.importId
      && persisted.decision === record.decision
      && persisted.startedAt === record.startedAt
      && persisted.decidedAt === record.decidedAt
  } catch {
    return false
  }
}

function removePersistedLocalImportAiConsent(): boolean {
  try {
    sessionStorage.removeItem(LOCAL_IMPORT_AI_CONSENT_KEY)
    return sessionStorage.getItem(LOCAL_IMPORT_AI_CONSENT_KEY) === null
  } catch {
    return false
  }
}

function createLocalImportConsentId(now: number): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.()
    if (uuid) return `local-${uuid}`
  } catch {
    // A random suffix below is sufficient for this in-tab race guard.
  }
  return `local-${now.toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** Recover a usable pending scope for a local Bundle loaded before this consent
 * model, or after its record became invalid/expired. Demo and non-local sources
 * are left untouched. Safe to call from a dialog effect. */
export function ensureLocalImportAiConsent(
  now: number = Date.now(),
): LocalImportAiConsentRecord | null {
  if (typeof window === 'undefined' || !Number.isFinite(now) || now < 0) return null
  if (isDemoDataActive()) return null
  try {
    if (!shouldUseLocalBundle()) return null
  } catch {
    return null
  }

  const current = getLocalImportAiConsent(now)
  if (
    current?.decision === 'preparing'
    && activePreparingLocalImportIds.has(current.importId)
  ) return current

  const activeBundleImportId = LocalBundleService.getActiveImportId()
  if (activeBundleImportId && current?.importId !== activeBundleImportId) {
    const replacement = startLocalImportAiConsent(activeBundleImportId, now)
    if (!replacement) return null
    markLocalImportAiConsentReady(replacement.importId, now)
    return getLocalImportAiConsent(now)
  }
  if (current) {
    if (
      current.decision === 'preparing'
      && !activePreparingLocalImportIds.has(current.importId)
    ) {
      markLocalImportAiConsentReady(current.importId, now)
      return getLocalImportAiConsent(now)
    }
    return current
  }
  const created = startLocalImportAiConsent(
    activeBundleImportId ?? createLocalImportConsentId(now),
    now,
  )
  if (!created) return null
  markLocalImportAiConsentReady(created.importId, now)
  return getLocalImportAiConsent(now)
}

/** True only when the currently active source is the bundled demo. A leftover
 * demo flag must not win over a live SMART launch, which takes source priority. */
export function isDemoDataActive(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return shouldUseLocalBundle() && LocalBundleService.isDemoData()
  } catch {
    return false
  }
}

/** Automatic cloud analysis of SMART/other real data requires an explicit
 * global opt-in. Local imports must use their import-scoped decision instead. */
export function hasAutoAiRealDataConsent(): boolean {
  return getAutoAiRealDataDecision() === 'auto'
}

/** Snapshot the effective decision for the active data source.
 *
 * - demo: no cloud-AI authorization is implied; callers may use demo snapshots
 * - local: only the current import record counts; absent/invalid means pending
 * - other: preserves the existing SMART/general global preference
 */
export function getAutoAiConsentState(now: number = Date.now()): AutoAiConsentState {
  let localBundleActive = false
  try {
    localBundleActive = shouldUseLocalBundle()
  } catch {
    // If source storage cannot be inspected, keep cloud AI locked below.
    return { source: 'other', decision: null, importId: null }
  }
  if (localBundleActive) {
    const local = getLocalImportAiConsent(now)
    const activeBundleImportId = LocalBundleService.getActiveImportId()
    // A real import beginning from the demo must close the demo's automatic
    // path immediately, before LocalBundleService replaces its in-memory data.
    // `preparing` therefore takes precedence over the still-present demo flag.
    if (
      local?.decision === 'preparing'
      && activePreparingLocalImportIds.has(local.importId)
    ) {
      return { source: 'local', decision: local.decision, importId: local.importId }
    }
    if (isDemoDataActive()) {
      return { source: 'demo', decision: null, importId: null }
    }
    const scopedLocal = !activeBundleImportId || local?.importId === activeBundleImportId
      ? local
      : null
    return scopedLocal
      ? { source: 'local', decision: scopedLocal.decision, importId: scopedLocal.importId }
      : { source: 'local', decision: 'pending', importId: null }
  }
  return {
    source: 'other',
    decision: getAutoAiRealDataDecision(),
    importId: null,
  }
}

/** Shared auto-run predicate for summary, safety, and custom insight callers.
 * Demo may auto-load its audited snapshots; every real source requires `auto`. */
export function canAutoRunAi(state: AutoAiConsentState = getAutoAiConsentState()): boolean {
  return state.source === 'demo' || state.decision === 'auto'
}

/** Resolve the effective summary/safety auto setting without letting a local
 * import overwrite the browser-wide SMART preference. Demo snapshots are
 * always prepared; a local Bundle is driven only by its own receipt; SMART and
 * other sources require both the persisted preference and global consent. */
export function isAutoAiEnabledForSource(
  persistedPreference: boolean,
  state: AutoAiConsentState = getAutoAiConsentState(),
): boolean {
  if (state.source === 'demo') return true
  if (state.source === 'local') return state.decision === 'auto'
  return persistedPreference && state.decision === 'auto'
}

type AutoAiConsentSnapshot = readonly [
  source: AiConsentSource,
  decision: LocalImportAiDecision | null,
  importId: string | null,
]

const SERVER_SNAPSHOT = JSON.stringify(['other', null, null] satisfies AutoAiConsentSnapshot)

function getAutoAiConsentSnapshot(): string {
  const state = getAutoAiConsentState()
  return JSON.stringify([state.source, state.decision, state.importId] satisfies AutoAiConsentSnapshot)
}

function subscribeToAutoAiConsent(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  let expiryTimer: number | undefined
  const scheduleExpiry = () => {
    if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
    expiryTimer = undefined

    const local = getLocalImportAiConsent()
    if (!local) return
    const remaining = LOCAL_IMPORT_AI_CONSENT_MAX_AGE_MS - (Date.now() - local.startedAt)
    expiryTimer = window.setTimeout(() => {
      expiryTimer = undefined
      onStoreChange()
    }, Math.max(1, remaining))
  }
  const refresh = () => {
    scheduleExpiry()
    onStoreChange()
  }
  // Subscribe to cross-document changes, but never discard a volatile
  // fail-closed override merely because stale storage changed underneath it.
  const onStorage = () => refresh()

  window.addEventListener(LOCAL_IMPORT_AI_CONSENT_EVENT, refresh)
  window.addEventListener(BUNDLE_CHANGED_EVENT, refresh)
  window.addEventListener('storage', onStorage)
  scheduleExpiry()

  return () => {
    if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
    window.removeEventListener(LOCAL_IMPORT_AI_CONSENT_EVENT, refresh)
    window.removeEventListener(BUNDLE_CHANGED_EVENT, refresh)
    window.removeEventListener('storage', onStorage)
  }
}

/** Reactive source-aware decision. Same-window writes use the custom event;
 * cross-document writes use `storage`; source changes use the Bundle event. */
export function useAutoAiConsentState(): AutoAiConsentState {
  const snapshot = useSyncExternalStore(
    subscribeToAutoAiConsent,
    getAutoAiConsentSnapshot,
    () => SERVER_SNAPSHOT,
  )

  return useMemo(() => {
    const [source, decision, importId] = JSON.parse(snapshot) as AutoAiConsentSnapshot
    return { source, decision, importId }
  }, [snapshot])
}
