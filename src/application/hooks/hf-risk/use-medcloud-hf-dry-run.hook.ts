'use client'

import { useEffect, useRef, useState } from 'react'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { shouldUseLocalBundle } from '@/src/infrastructure/fhir/client/fhir-client.service'
import { captureHfCallerAuth } from '@/src/infrastructure/hf-risk/caller-auth'
import { hfRecordSource, type HfRecordSource } from '@/src/core/hf-risk/record-source'
import { buildMedcloudHfInput, medcloudHfVisits, type HfVisit } from '@/src/core/hf-risk/medcloud-input'
import { type HfInput, type HfSelection, type HfDryRunResult } from '@/src/core/hf-risk/contract'
import type { HfPredictionResult } from '@/src/core/hf-risk/prediction-result'
import { hfAuthPolicy, hfGatewayUrl, requestHfDryRun, requestHfPrediction } from '@/src/infrastructure/hf-risk/dry-run-client'

interface Context {
  importId: string
  source: HfRecordSource
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
  const [prediction, setPrediction] = useState<{ importId: string; input: HfInput; value: HfPredictionResult } | null>(null)
  const [message, setMessage] = useState<{ importId: string | null; code: string } | null>(null)
  const [busyImportId, setBusyImportId] = useState<string | null>(null)
  const busy = busyImportId !== null && busyImportId === activeImportId
  const controller = useRef<AbortController | null>(null)
  const unsubscribeAuth = useRef<(() => void) | null>(null)
  const localMode = shouldUseLocalBundle()
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
      setContext({ importId, source: hfRecordSource(bundle!), bundle: bundle!, visits, selection, input: buildMedcloudHfInput(bundle, selection) })
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
    try { setContext({ ...current, selection, input: buildMedcloudHfInput(current.bundle, selection) }) }
    catch { setMessage({ importId: current.importId, code: 'source-changed' }) }
  }
  async function submit(operation: 'dry-run' | 'predict') {
    if (!current || !configured || busy || current.input.gaps.some(gap => gap.code === 'index-diagnosis-missing') || (operation === 'predict' && visibleResult?.verdict !== 'accepted')) return
    const snapshot = current
    const abort = new AbortController()
    controller.current?.abort()
    unsubscribeAuth.current?.()
    unsubscribeAuth.current = null
    controller.current = abort
    setBusyImportId(snapshot.importId)
    if (operation === 'dry-run') setResult(null)
    setPrediction(null)
    setMessage(null)
    const request = operation === 'dry-run' ? requestHfDryRun : requestHfPrediction
    const storeResult = (value: HfDryRunResult | HfPredictionResult) => {
      if (operation === 'dry-run') setResult({ importId: snapshot.importId, input: snapshot.input, value: value as HfDryRunResult })
      else setPrediction({ importId: snapshot.importId, input: snapshot.input, value: value as HfPredictionResult })
    }
    const stillCurrent = () => !abort.signal.aborted && shouldUseLocalBundle() && LocalBundleService.getActiveImportId() === snapshot.importId
    try {
      const authPolicy = hfAuthPolicy(policySetting)
      if (authPolicy === 'intranet') {
        const value = await request(snapshot.input, { origin, authPolicy, signal: abort.signal })
        if (stillCurrent()) storeResult(value)
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
      const value = await request(snapshot.input, { origin, token, signal: abort.signal })
      // Discard answers after patient/import change or sign-out.
      const remainsAuthorized = await auth.getToken()
      if (!remainsAuthorized) throw new Error('gateway-unauthorized')
      if (stillCurrent()) storeResult(value)
    } catch (error) {
      if (stillCurrent()) setMessage({ importId: snapshot.importId, code: error instanceof Error ? error.message : 'gateway-unavailable' })
    } finally {
      if (controller.current === abort) setBusyImportId(null)
    }
  }
  return { current, configured, intranet: policySetting === 'intranet', busy, result: visibleResult, prediction: visiblePrediction, message: visibleMessage, prepare, select, validate: () => submit('dry-run'), predict: () => submit('predict') }
}
