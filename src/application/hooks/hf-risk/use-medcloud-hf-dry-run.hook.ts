'use client'

import { useEffect, useRef, useState } from 'react'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { captureHfCallerAuth } from '@/src/infrastructure/hf-risk/caller-auth'
import { buildMedcloudHfInput, medcloudHfVisits, type HfVisit } from '@/src/core/hf-risk/medcloud-input'
import { type HfInput, type HfSelection, type HfDryRunResult } from '@/src/core/hf-risk/contract'
import { hfAuthPolicy, hfGatewayUrl, requestHfDryRun } from '@/src/infrastructure/hf-risk/dry-run-client'

interface Context {
  importId: string
  bundle: object
  visits: HfVisit[]
  selection: HfSelection
  input: HfInput
}
export function useMedcloudHfDryRun() {
  const origin = process.env.NEXT_PUBLIC_HF_GATEWAY_ORIGIN ?? ''
  let configured = false
  const policySetting = process.env.NEXT_PUBLIC_HF_AUTH_POLICY
  try { configured = !!origin && !!hfGatewayUrl(origin) && !!hfAuthPolicy(policySetting) } catch { /* Render a configuration notice; no network fallback. */ }
  const activeImportId = LocalBundleService.getActiveImportId()
  const [context, setContext] = useState<Context | null>(null)
  const [result, setResult] = useState<{ importId: string; input: HfInput; value: HfDryRunResult } | null>(null)
  const [message, setMessage] = useState<{ importId: string | null; code: string } | null>(null)
  const [busyImportId, setBusyImportId] = useState<string | null>(null)
  const busy = busyImportId !== null && busyImportId === activeImportId
  const controller = useRef<AbortController | null>(null)
  const unsubscribeAuth = useRef<(() => void) | null>(null)
  const localMode = shouldUseLocalBundle()
  const current = localMode && context?.importId === activeImportId ? context : null
  const visibleResult = result?.importId === activeImportId && result.input === current?.input ? result.value : null
  const visibleMessage = message?.importId === activeImportId ? message.code : null
  useEffect(() => () => { controller.current?.abort(); controller.current = null; unsubscribeAuth.current?.(); unsubscribeAuth.current = null }, [activeImportId, localMode])

  async function prepare() {
    controller.current?.abort()
    unsubscribeAuth.current?.()
    unsubscribeAuth.current = null
    setBusyImportId(null)
    setResult(null)
    setMessage(null)
    const importId = LocalBundleService.getActiveImportId()
    try {
      if (!shouldUseLocalBundle() || !importId) throw new Error('source-not-medcloud')
      const bundle = await LocalBundleService.load()
      if (LocalBundleService.getActiveImportId() !== importId || !shouldUseLocalBundle()) throw new Error('source-changed')
      const visits = medcloudHfVisits(bundle)
      if (!visits.length) throw new Error('no-visit')
      const selection: HfSelection = { provider: visits[0].provider, encounter: visits[0].reference, claim: 'P1_CD_mortality_1m' }
      setContext({ importId, bundle: bundle!, visits, selection, input: buildMedcloudHfInput(bundle, selection) })
    } catch (error) {
      setContext(null)
      setMessage({ importId, code: error instanceof Error ? error.message : 'bundle-invalid' })
    }
  }
  function select(selection: HfSelection) {
    if (!current) return
    controller.current?.abort()
    unsubscribeAuth.current?.()
    unsubscribeAuth.current = null
    setBusyImportId(null)
    setResult(null)
    setMessage(null)
    try { setContext({ ...current, selection, input: buildMedcloudHfInput(current.bundle, selection) }) }
    catch { setMessage({ importId: current.importId, code: 'source-changed' }) }
  }
  async function validate() {
    if (!current || !configured || busy) return
    const snapshot = current
    const abort = new AbortController()
    controller.current?.abort()
    unsubscribeAuth.current?.()
    unsubscribeAuth.current = null
    controller.current = abort
    setBusyImportId(snapshot.importId)
    setResult(null)
    setMessage(null)
    const stillCurrent = () => !abort.signal.aborted && shouldUseLocalBundle() && LocalBundleService.getActiveImportId() === snapshot.importId
    try {
      const authPolicy = hfAuthPolicy(policySetting)
      if (authPolicy === 'intranet') {
        const value = await requestHfDryRun(snapshot.input, { origin, authPolicy, signal: abort.signal })
        if (stillCurrent()) setResult({ importId: snapshot.importId, input: snapshot.input, value })
        return
      }
      const auth = await captureHfCallerAuth()
      const token = await auth?.getToken()
      if (!stillCurrent()) return
      if (!token || !auth) throw new Error('gateway-unauthorized')
      unsubscribeAuth.current = auth.onIdentityChanged(() => {
        abort.abort()
        setBusyImportId(null)
        setResult(null)
        setMessage({ importId: snapshot.importId, code: 'gateway-unauthorized' })
      })
      const value = await requestHfDryRun(snapshot.input, { origin, token, signal: abort.signal })
      // Discard answers after patient/import change or sign-out.
      const remainsAuthorized = await auth.getToken()
      if (!remainsAuthorized) throw new Error('gateway-unauthorized')
      if (stillCurrent()) setResult({ importId: snapshot.importId, input: snapshot.input, value })
    } catch (error) {
      if (stillCurrent()) setMessage({ importId: snapshot.importId, code: error instanceof Error ? error.message : 'gateway-unavailable' })
    } finally {
      if (controller.current === abort) setBusyImportId(null)
    }
  }
  return { current, configured, intranet: policySetting === 'intranet', busy, result: visibleResult, message: visibleMessage, prepare, select, validate }
}
