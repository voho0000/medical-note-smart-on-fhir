'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { BUNDLE_CHANGED_EVENT } from '@/src/shared/utils/reset-on-bundle-change'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { captureHfCallerAuth } from '@/src/infrastructure/hf-risk/caller-auth'
import { hfRecordSource, type HfRecordSource } from '@/src/core/hf-risk/record-source'
import { buildMedcloudHfInput, medcloudHfVisits, type HfVisit } from '@/src/core/hf-risk/medcloud-input'
import { type HfInput, type HfSelection, type HfDryRunResult } from '@/src/core/hf-risk/contract'
import { emptyHfDiagnosisDraft, withPhysicianHfDiagnosis, type HfPhysicianDiagnosisDraft } from '@/src/core/hf-risk/physician-diagnosis'
import type { HfPredictionResult } from '@/src/core/hf-risk/prediction-result'
import { hfAuthPolicy, hfGatewayUrl, requestHfDryRun, requestHfPrediction, type HfRequestOptions } from '@/src/infrastructure/hf-risk/dry-run-client'

function subscribeToRecordChange(onChange: () => void) {
  window.addEventListener(BUNDLE_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(BUNDLE_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}
function recordSnapshot() {
  return JSON.stringify([shouldUseLocalBundle(), LocalBundleService.getActiveImportId()])
}
const serverRecordSnapshot = () => '[false,null]'
interface Context {
  importId: string
  source: HfRecordSource
  bundle: object
  visits: HfVisit[]
  selection: HfSelection
  input: HfInput
  baseInput: HfInput
  diagnosisDraft: HfPhysicianDiagnosisDraft
}
export function useMedcloudHfDryRun() {
  const origin = process.env.NEXT_PUBLIC_HF_GATEWAY_ORIGIN ?? ''
  let configured = false
  const policySetting = process.env.NEXT_PUBLIC_HF_AUTH_POLICY
  try { configured = !!origin && !!hfGatewayUrl(origin) && !!hfAuthPolicy(policySetting) } catch { /* Render a configuration notice; no network fallback. */ }
  const snapshot = useSyncExternalStore(subscribeToRecordChange, recordSnapshot, serverRecordSnapshot)
  const [localMode, activeImportId] = JSON.parse(snapshot) as [boolean, string | null]
  const [context, setContext] = useState<Context | null>(null)
  const [result, setResult] = useState<{ importId: string; input: HfInput; value: HfDryRunResult } | null>(null)
  const [prediction, setPrediction] = useState<{ importId: string; input: HfInput; value: HfPredictionResult } | null>(null)
  const [message, setMessage] = useState<{ importId: string | null; code: string } | null>(null)
  const [busyImportId, setBusyImportId] = useState<string | null>(null)
  const busy = busyImportId !== null && busyImportId === activeImportId
  const controller = useRef<AbortController | null>(null)
  const unsubscribeAuth = useRef<(() => void) | null>(null)
  const [observedSnapshot, setObservedSnapshot] = useState(snapshot)
  // Reset during a scope-changing render so old attestations cannot reappear on a return to the same import.
  if (observedSnapshot !== snapshot) {
    setObservedSnapshot(snapshot)
    setContext(null)
    setResult(null)
    setPrediction(null)
    setMessage(null)
    setBusyImportId(null)
  }
  const current = localMode && context?.importId === activeImportId ? context : null
  const visibleResult = result?.importId === activeImportId && result.input === current?.input ? result.value : null
  const visiblePrediction = prediction?.importId === activeImportId && prediction.input === current?.input ? prediction.value : null
  const visibleMessage = (localMode || message?.code === 'source-unsupported') && message && message.importId === activeImportId ? message.code : null
  useEffect(() => () => { controller.current?.abort(); controller.current = null; unsubscribeAuth.current?.(); unsubscribeAuth.current = null }, [activeImportId, localMode])

  async function prepare() {
    controller.current?.abort()
    unsubscribeAuth.current?.()
    unsubscribeAuth.current = null
    setBusyImportId(null)
    setResult(null)
    setPrediction(null)
    setMessage(null)
    const importId = LocalBundleService.getActiveImportId()
    try {
      if (!shouldUseLocalBundle() || !importId) throw new Error('source-unsupported')
      const bundle = await LocalBundleService.load()
      if (LocalBundleService.getActiveImportId() !== importId || !shouldUseLocalBundle()) throw new Error('source-changed')
      const visits = medcloudHfVisits(bundle)
      if (!visits.length) throw new Error('no-visit')
      const selection: HfSelection = { provider: visits[0].provider, encounter: visits[0].reference, claim: 'P1_CD_mortality_1m' }
      const input = buildMedcloudHfInput(bundle, selection)
      setContext({ importId, source: hfRecordSource(bundle!), bundle: bundle!, visits, selection, input, baseInput: input, diagnosisDraft: emptyHfDiagnosisDraft() })
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
    setPrediction(null)
    setMessage(null)
    try {
      const input = buildMedcloudHfInput(current.bundle, selection)
      setContext({ ...current, selection, input, baseInput: input, diagnosisDraft: emptyHfDiagnosisDraft() })
    }
    catch { setMessage({ importId: current.importId, code: 'source-changed' }) }
  }
  function supplementDiagnosis(draft: HfPhysicianDiagnosisDraft) {
    if (!current || busy) return
    controller.current?.abort()
    unsubscribeAuth.current?.()
    unsubscribeAuth.current = null
    setResult(null)
    setPrediction(null)
    setMessage(null)
    try {
      setContext({ ...current, diagnosisDraft: draft, input: withPhysicianHfDiagnosis(current.baseInput, draft) })
    } catch (error) {
      setContext({ ...current, diagnosisDraft: { ...draft, confirmed: false }, input: current.baseInput })
      setMessage({ importId: current.importId, code: error instanceof Error ? error.message : 'physician-diagnosis-invalid' })
    }
  }
  async function submit(operation: 'dry-run' | 'predict') {
    if (!current || !configured || busy || current.input.gaps.some(gap => gap.code === 'index-diagnosis-missing')) return
    const snapshot = current
    const abort = new AbortController()
    controller.current?.abort()
    unsubscribeAuth.current?.()
    unsubscribeAuth.current = null
    controller.current = abort
    setBusyImportId(snapshot.importId)
    setResult(null)
    setPrediction(null)
    setMessage(null)
    const storeResult = (value: HfDryRunResult | HfPredictionResult) => {
      if (operation === 'dry-run') setResult({ importId: snapshot.importId, input: snapshot.input, value: value as HfDryRunResult })
      else setPrediction({ importId: snapshot.importId, input: snapshot.input, value: value as HfPredictionResult })
    }
    const stillCurrent = () => !abort.signal.aborted && shouldUseLocalBundle() && LocalBundleService.getActiveImportId() === snapshot.importId
    const request = async (options: HfRequestOptions, checkAuthorization: () => Promise<void>) => {
      const validation = await requestHfDryRun(snapshot.input, options)
      await checkAuthorization()
      if (!stillCurrent()) return
      setResult({ importId: snapshot.importId, input: snapshot.input, value: validation })
      if (operation === 'dry-run' || validation.verdict !== 'accepted') return
      const value = await requestHfPrediction(snapshot.input, options)
      await checkAuthorization()
      if (stillCurrent()) storeResult(value)
    }
    try {
      const authPolicy = hfAuthPolicy(policySetting)
      if (authPolicy === 'intranet') {
        await request({ origin, authPolicy, signal: abort.signal }, async () => {})
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
        setPrediction(null)
        setMessage({ importId: snapshot.importId, code: 'gateway-unauthorized' })
      })
      await request({ origin, token, signal: abort.signal }, async () => {
        // Check authorization between validation and prediction as well as after prediction.
        if (!await auth.getToken()) throw new Error('gateway-unauthorized')
      })
    } catch (error) {
      if (stillCurrent()) setMessage({ importId: snapshot.importId, code: error instanceof Error ? error.message : 'gateway-unavailable' })
    } finally {
      if (controller.current === abort) setBusyImportId(null)
    }
  }
  return { current, configured, intranet: policySetting === 'intranet', busy, result: visibleResult, prediction: visiblePrediction, message: visibleMessage, prepare, select, supplementDiagnosis, validate: () => submit('dry-run'), predict: () => submit('predict') }
}
