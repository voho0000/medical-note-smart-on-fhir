"use client"

import { useCallback, useState } from 'react'
import { usePatientQuery } from '@/src/application/hooks/patient/use-patient-query.hook'
import { getPatientDisplayName } from '@/src/core/entities/patient.entity'
import { dateStampForFilename } from '../utils/ips-helpers'
import type { IpsBundle } from '../utils/ips-types'

export interface UseIpsExportResult {
  /** Trigger a browser download of the IPS Bundle as a .json file. */
  download: (bundle: IpsBundle) => void
  /** Copy the pretty-printed IPS Bundle JSON to the clipboard. */
  copy: (bundle: IpsBundle) => Promise<void>
  /** True briefly after a successful copy (for UI feedback). */
  copied: boolean
  /** Set when the last copy failed (e.g. clipboard unavailable). */
  copyError: string | null
}

function sanitizeForFilename(name: string): string {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'patient'
}

export function useIpsExport(): UseIpsExportResult {
  const { data: patient } = usePatientQuery()
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const filename = useCallback(() => {
    const name = sanitizeForFilename(getPatientDisplayName(patient ?? null))
    return `IPS_${name}_${dateStampForFilename()}.json`
  }, [patient])

  const download = useCallback(
    (bundle: IpsBundle) => {
      const json = JSON.stringify(bundle, null, 2)
      const blob = new Blob([json], { type: 'application/fhir+json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename()
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Revoke on the next tick so the download has a chance to start.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    },
    [filename],
  )

  const copy = useCallback(async (bundle: IpsBundle) => {
    setCopyError(null)
    const json = JSON.stringify(bundle, null, 2)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json)
      } else {
        throw new Error('Clipboard API unavailable')
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Copy failed')
    }
  }, [])

  return { download, copy, copied, copyError }
}
